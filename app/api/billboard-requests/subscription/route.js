// app/api/billboard-requests/subscription/route.js
// GET the signed-in user's billboard subscriptions + CAD wallet
// credit + the satellites they already hold (for the ownership cap).
// Missing tables answer with ready:false flags, never an error page:
// the UI then honestly says the service is being set up.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { serviceClient, authedUser, isMissingTable, publicSubscription } from '@/lib/billboards/request-server';
import { getOrCreateCreditBalance } from '@/lib/billboards/credit';
import { satelliteIndexForBillboard, satelliteNameForBillboard } from '@/lib/billboards/subscriptions';
import { getPriceState } from '@/lib/billboards/price-check';
import { noticeThresholdReached } from '@/lib/billboards/pricing';

export async function GET(req) {
  const admin = await serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'The billboard service is not connected yet.' }, { status: 503 });
  let user;
  try {
    user = await authedUser(req, admin);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Sign in to see your subscriptions.' }, { status: e.status || 401 });
  }

  let subscriptions = [];
  let subscriptionsReady = true;
  const { data: subs, error: subErr } = await admin.from('billboard_subscriptions')
    .select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (subErr) {
    if (isMissingTable(subErr)) subscriptionsReady = false;
    else return NextResponse.json({ ok: false, error: 'Could not read your subscriptions.' }, { status: 502 });
  } else {
    subscriptions = (subs || []).map(publicSubscription);
  }

  let credit = { balance_cents: 0, currency: 'cad', ready: false };
  try {
    const row = await getOrCreateCreditBalance(admin, user.id);
    credit = { balance_cents: Math.round(Number(row.balance_cents) || 0), currency: 'cad', ready: true };
  } catch (e) {
    if (!isMissingTable(e)) return NextResponse.json({ ok: false, error: 'Could not read your wallet credit.' }, { status: 502 });
  }

  const holdings = [];
  for (const s of subscriptions) {
    if (s.status !== 'active' && s.status !== 'paused') continue;
    const idx = satelliteIndexForBillboard(s.billboardNumber);
    if (idx === null) continue;
    holdings.push({
      satelliteIndex: idx,
      satelliteName: satelliteNameForBillboard(s.billboardNumber),
      billboardNumber: s.billboardNumber,
      plan: s.plan,
      status: s.status,
    });
  }

  // Price state + advance notice (drives the pop-up). The notice
  // shows while the row exists and is unacknowledged AND the user
  // still holds a paying subscription — cancelling ends it, since
  // there is nothing left to opt out of.
  const priceState = await getPriceState(admin);
  let priceNotice = null;
  try {
    const { data: notice } = await admin.from('billboard_price_notices')
      .select('*').eq('user_id', user.id).maybeSingle();
    if (notice && !notice.acknowledged_at && holdings.length > 0) {
      priceNotice = {
        sentAt: notice.sent_at,
        userCountAtNotice: notice.user_count_at_notice,
        emailStatus: notice.email_status,
      };
    }
  } catch {
    // Missing notices table: no pop-up, never an error page.
  }

  return NextResponse.json({
    ok: true,
    subscriptions,
    subscriptionsReady,
    credit,
    holdings,
    priceState: {
      tier: priceState.tier,
      registeredUsers: priceState.registeredUsers,
      checkedAt: priceState.checkedAt,
      ready: priceState.ready,
      noticeThresholdReached: noticeThresholdReached(priceState.registeredUsers ?? 0),
    },
    priceNotice,
  });
}
