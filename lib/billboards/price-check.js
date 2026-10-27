// lib/billboards/price-check.js — The settled price rule, enforced.
// Server-only.
//
// TRIGGER MECHANISM (periodic check, daily cron):
//   1. GET /api/billboard-requests/price-check-cron (CRON_SECRET
//      Bearer, wired in vercel.json) counts REGISTERED USERS via the
//      Supabase Auth admin list (paginated, 1000 per page, same
//      pattern as the affiliates overview). Below 1,000,000 the count
//      is exact; at/above 1,000,000 the count stops early — the tier
//      is already live, and the exact number above the line changes
//      nothing, so the snapshot records 1,000,000 as "at least".
//   2. The count is written to billboard_price_state (single row):
//      tier = 'million' at >= 1,000,000, else 'base'. The tier flips
//      ONLY here, on a verified count — never from a client claim,
//      never before the threshold.
//   3. When the count is >= 990,000, every paying advertiser (active
//      or paused subscription, distinct user) WITHOUT a row in
//      billboard_price_notices gets exactly one notice row (claimed
//      BEFORE sending, so a crash or retry never duplicates it).
//      The notice fires two channels: an in-app pop-up (the notice
//      row drives it — the subscription API returns it until the
//      advertiser acknowledges or opts out) and an email to their
//      registered email (Resend, same idiom as lib/trifold/notify.js).
//      A failed email leaves the row with email_status 'failed' and
//      the next cron run retries it — the notice itself is never
//      duplicated, because the row already exists.
//   4. Purchase/renewal/resume routes read the cached tier from
//      billboard_price_state (one row read, no user count inline).
//      Renewals charge the LIVE tier: after the flip, advertisers who
//      did not opt out renew at $50/$200; opted-out (cancelled)
//      subscriptions are never renewed at all.
//   5. New subscribers after 1,000,000 pay the million tier from the
//      start; the request page shows the live tier's prices, and once
//      the notice threshold is reached it also shows the upcoming
//      change, so nobody subscribes blind.
//
// Merlin's house/demo ads are exempt: the sweep reads only
// billboard_subscriptions, and house ads are manager-wired rows, not
// subscriptions.

import {
  BILLBOARD_BASE_PRICES,
  BILLBOARD_MILLION_PRICES,
  PRICE_RISE_USER_THRESHOLD,
  PRICE_NOTICE_USER_THRESHOLD,
  priceTierForUserCount,
} from './pricing.js';

const RESEND_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Default price state when the table is not set up yet (base tier). */
export function defaultPriceState() {
  return { tier: 'base', registeredUsers: null, checkedAt: null, ready: false };
}

/** Read the cached price state (single row, id 1). */
export async function getPriceState(admin) {
  try {
    const { data, error } = await admin.from('billboard_price_state')
      .select('*').eq('id', 1).maybeSingle();
    if (error || !data) return defaultPriceState();
    return {
      tier: data.tier === 'million' ? 'million' : 'base',
      registeredUsers: data.registered_users,
      checkedAt: data.checked_at,
      ready: true,
    };
  } catch {
    return defaultPriceState();
  }
}

/**
 * Count registered users via the Auth admin list. Exact below
 * 1,000,000; stops early at 1,000,000 (tier already live above it).
 */
export async function countRegisteredUsers(admin) {
  let count = 0;
  for (let page = 1; page <= 2000; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000, page });
    if (error || !data?.users?.length) break;
    count += data.users.length;
    if (count >= PRICE_RISE_USER_THRESHOLD) break;
    if (data.users.length < 1000) break;
  }
  return count;
}

/** Write the price state row for a verified count. Returns the tier. */
export async function updatePriceState(admin, count) {
  const tier = priceTierForUserCount(count);
  await admin.from('billboard_price_state').upsert({
    id: 1,
    registered_users: count,
    tier,
    checked_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  return tier;
}

/** The notice email copy (plain + HTML share one text). */
export function buildPriceNoticeEmail() {
  const base = BILLBOARD_BASE_PRICES;
  const million = BILLBOARD_MILLION_PRICES;
  const subject = 'Upcoming billboard price change on Olympus';
  const text = [
    'Your billboard ad on Olympus is about to change price.',
    '',
    `When registered users reach ${PRICE_RISE_USER_THRESHOLD.toLocaleString('en-US')}, billboard prices rise:`,
    `  Rotating face-slot: ${base.rotating.cad} CAD/month → ${million.rotating.cad} CAD/month`,
    `  Whole billboard, solo: ${base.solo.cad} CAD/month → ${million.solo.cad} CAD/month`,
    '',
    'This is your advance notice. The new price applies only if you keep your subscription —',
    'nobody is silently rolled into it.',
    '',
    'To OPT OUT: open your billboard requests at https://olympusverse.com/request-billboard',
    'and cancel your subscription. Your ad stops showing and you will not be charged again.',
    'The month you already paid for is not refunded.',
    '',
    'To keep your ad: do nothing, or tap "Keep my ads" on the notice in the app. Your next',
    'renewal after the change takes effect will be at the new price, paid from wallet credit as usual.',
    '',
    'Billboard revenue feeds the ecosystem, its users, and everything Olympus builds.',
  ].join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#e8e6df;background:#0b0e1a;padding:32px;border-radius:12px">
    <h1 style="margin:0 0 12px">Upcoming billboard price change</h1>
    <p>Your billboard ad on Olympus is about to change price.</p>
    <p>When registered users reach <strong>${PRICE_RISE_USER_THRESHOLD.toLocaleString('en-US')}</strong>, billboard prices rise:</p>
    <ul>
      <li>Rotating face-slot: <strong>${base.rotating.cad} CAD/month → ${million.rotating.cad} CAD/month</strong></li>
      <li>Whole billboard, solo: <strong>${base.solo.cad} CAD/month → ${million.solo.cad} CAD/month</strong></li>
    </ul>
    <p>This is your advance notice. The new price applies only if you keep your subscription — nobody is silently rolled into it.</p>
    <p><strong>To opt out:</strong> open <a href="https://olympusverse.com/request-billboard" style="color:#fbbf24">your billboard requests</a> and cancel your subscription. Your ad stops showing and you will not be charged again. The month you already paid for is not refunded.</p>
    <p><strong>To keep your ad:</strong> do nothing, or tap "Keep my ads" on the notice in the app. Your next renewal after the change takes effect will be at the new price, paid from wallet credit as usual.</p>
    <p style="color:#9aa0b5;font-size:12px;margin-top:24px">Billboard revenue feeds the ecosystem, its users, and everything Olympus builds.</p>
  </div>`;
  return { subject, text, html };
}

/**
 * Send one price-notice email via Resend. Returns { sent: true } or
 * { sent: false, error }. When RESEND_API_KEY is unset, the caller
 * records 'not_configured' and retries on a later run — never a
 * silent drop, never a duplicate notice row.
 */
export async function sendPriceNoticeEmail(to) {
  if (!process.env.RESEND_API_KEY) return { sent: false, error: 'Email is not connected yet (RESEND_API_KEY).' };
  const { subject, html, text } = buildPriceNoticeEmail();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': RESEND_UA,
    },
    body: JSON.stringify({
      from: 'Olympus <noreply@olympusverse.com>',
      to: [to],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    return { sent: false, error: `Email send failed: ${msg.slice(0, 200)}` };
  }
  return { sent: true };
}

/**
 * Pure helper for the notice sweep: which paying users still need a
 * notice? `payingUserIds` = distinct users with active/paused
 * subscriptions; `noticedUserIds` = users already holding a notice row.
 */
export function usersNeedingNotice(payingUserIds, noticedUserIds) {
  const noticed = new Set(noticedUserIds || []);
  return [...new Set(payingUserIds || [])].filter((id) => id && !noticed.has(id));
}

/** Pure helper: stopped triples = paused + cancelled subscriptions. */
export function stoppedTriples(subscriptions) {
  return (subscriptions || [])
    .filter((s) => s?.status === 'paused' || s?.status === 'cancelled')
    .map((s) => ({
      billboardNumber: s.billboard_number,
      company: s.company_name,
      link: s.link_url,
    }));
}

export { PRICE_NOTICE_USER_THRESHOLD };
