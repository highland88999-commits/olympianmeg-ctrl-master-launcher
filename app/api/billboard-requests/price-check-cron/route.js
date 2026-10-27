// app/api/billboard-requests/price-check-cron/route.js
// GET (CRON_SECRET Bearer, also wired in vercel.json: daily) — the
// settled price rule's trigger. Each run:
//   1. Counts registered users (Auth admin list, early exit at
//      1,000,000) and writes billboard_price_state. The tier flips
//      to 'million' ONLY here, on a verified count.
//   2. When the count is >= 990,000, sweeps paying advertisers
//      (active/paused subscriptions, distinct users) and, for each
//      one without a billboard_price_notices row, claims the row
//      FIRST (exactly once per advertiser, even across retries),
//      then sends the notice email (Resend; a failure leaves
//      email_status 'failed'/'not_configured' for the next run's
//      retry — the notice row itself is never duplicated).
//   3. Retries failed/not_configured email rows from earlier runs.
// The in-app pop-up needs no cron: the subscription API returns the
// notice row until the advertiser acknowledges or opts out.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { serviceClient, isMissingTable } from '@/lib/billboards/request-server';
import {
  countRegisteredUsers,
  updatePriceState,
  sendPriceNoticeEmail,
  usersNeedingNotice,
} from '@/lib/billboards/price-check';
import { PRICE_NOTICE_USER_THRESHOLD } from '@/lib/billboards/pricing';

function cronOk(req) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

export async function GET(req) {
  if (!cronOk(req)) return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
  const admin = await serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'The billboard service is not connected yet.' }, { status: 503 });

  let registeredUsers;
  try {
    registeredUsers = await countRegisteredUsers(admin);
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Could not count users: ${e.message}` }, { status: 502 });
  }
  let tier = 'base';
  try {
    tier = await updatePriceState(admin, registeredUsers);
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
    return NextResponse.json({ ok: false, error: 'Could not write price state.' }, { status: 502 });
  }

  // Below the notice threshold there is nothing to sweep.
  if (registeredUsers < PRICE_NOTICE_USER_THRESHOLD) {
    return NextResponse.json({
      ok: true, registeredUsers, tier, noticeThresholdReached: false,
      noticed: 0, emailed: 0, emailFailed: 0, retried: 0,
    });
  }

  // Paying advertisers + their emails (request row first, Auth fallback).
  const { data: subs, error: subErr } = await admin.from('billboard_subscriptions')
    .select('user_id, request_id').in('status', ['active', 'paused']);
  if (subErr) {
    if (isMissingTable(subErr)) return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
    return NextResponse.json({ ok: false, error: 'Could not read subscriptions.' }, { status: 502 });
  }
  const payingUserIds = [...new Set((subs || []).map((s) => s.user_id).filter(Boolean))];
  const { data: notices } = await admin.from('billboard_price_notices').select('user_id, email_status');
  const noticedIds = (notices || []).map((n) => n.user_id);
  const needNotice = usersNeedingNotice(payingUserIds, noticedIds);

  // Resolve an email per user needing a notice.
  const requestIds = [...new Set((subs || []).map((s) => s.request_id).filter(Boolean))];
  const emailByUser = new Map();
  if (requestIds.length > 0) {
    const { data: reqRows } = await admin.from('billboard_requests')
      .select('id, user_id, requester_email').in('id', requestIds);
    for (const r of reqRows || []) {
      if (r.requester_email) emailByUser.set(r.user_id, r.requester_email);
    }
  }
  for (const userId of needNotice) {
    if (emailByUser.has(userId)) continue;
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(userId);
      if (authUser?.user?.email) emailByUser.set(userId, authUser.user.email);
    } catch {
      // No email resolvable: the row is still claimed below so the
      // in-app pop-up fires; the email retry picks it up later.
    }
  }

  let noticed = 0;
  let emailed = 0;
  let emailFailed = 0;
  for (const userId of needNotice) {
    // Claim FIRST — exactly once per advertiser, crash-safe.
    const { error: claimErr } = await admin.from('billboard_price_notices').insert({
      user_id: userId,
      user_count_at_notice: registeredUsers,
      email_status: 'pending',
      email_error: '',
    });
    if (claimErr) continue; // Already claimed by a racing run — skip.
    noticed += 1;
    const to = emailByUser.get(userId);
    if (!to) {
      await admin.from('billboard_price_notices').update({
        email_status: 'failed', email_error: 'No registered email found.',
      }).eq('user_id', userId);
      emailFailed += 1;
      continue;
    }
    const result = await sendPriceNoticeEmail(to);
    await admin.from('billboard_price_notices').update({
      email_status: result.sent ? 'sent' : (process.env.RESEND_API_KEY ? 'failed' : 'not_configured'),
      email_error: result.sent ? '' : (result.error || ''),
    }).eq('user_id', userId);
    if (result.sent) emailed += 1;
    else emailFailed += 1;
  }

  // Retry previously failed / unconfigured emails (rows already exist).
  let retried = 0;
  const failedRows = (notices || []).filter((n) => n.email_status === 'failed' || n.email_status === 'not_configured');
  for (const row of failedRows) {
    let to = emailByUser.get(row.user_id);
    if (!to) {
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(row.user_id);
        if (authUser?.user?.email) to = authUser.user.email;
      } catch { /* keep retrying later */ }
    }
    if (!to) continue;
    const result = await sendPriceNoticeEmail(to);
    await admin.from('billboard_price_notices').update({
      email_status: result.sent ? 'sent' : (process.env.RESEND_API_KEY ? 'failed' : 'not_configured'),
      email_error: result.sent ? '' : (result.error || ''),
    }).eq('user_id', row.user_id);
    retried += 1;
    if (result.sent) emailed += 1;
    else emailFailed += 1;
  }

  return NextResponse.json({
    ok: true, registeredUsers, tier, noticeThresholdReached: true,
    noticed, emailed, emailFailed, retried,
  });
}
