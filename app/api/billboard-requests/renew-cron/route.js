// app/api/billboard-requests/renew-cron/route.js
// GET (CRON_SECRET Bearer, also wired in vercel.json: daily) —
// monthly renewal processor for billboard subscriptions.
//   - Active + period ended + credit covers the LIVE tier price →
//     debit, extend one month from the old period end, and record
//     the charged price on the row.
//   - Active + period ended + credit short → status `paused`
//     (the hub panels skip paused ads; the owner sees a top-up prompt).
//   - Paused + credit now covers → debit, active for one month from now.
// No card is ever charged here: renewals come only from wallet credit.
// After the 1,000,000-user flip, renewals charge the million tier for
// advertisers who did not opt out; cancelled subscriptions are never
// touched here, so opting out truly ends the charges.
// A missing subscriptions table answers not_ready (never an error page).

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { serviceClient, isMissingTable } from '@/lib/billboards/request-server';
import { getOrCreateCreditBalance, debitCadBalance } from '@/lib/billboards/credit';
import { priceForPlan } from '@/lib/billboards/pricing';
import { getPriceState } from '@/lib/billboards/price-check';
import { addOneMonth, renewalDue } from '@/lib/billboards/subscriptions';

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
  const now = new Date();
  const priceState = await getPriceState(admin);
  const { data: subs, error } = await admin.from('billboard_subscriptions')
    .select('*').in('status', ['active', 'paused']);
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
    return NextResponse.json({ ok: false, error: 'Could not read subscriptions.' }, { status: 502 });
  }
  let renewed = 0;
  let paused = 0;
  let resumed = 0;
  let skipped = 0;
  for (const sub of subs || []) {
    try {
      const price = priceForPlan(sub.plan, priceState.tier);
      if (price === null) { skipped += 1; continue; }
      if (sub.status === 'active' && !renewalDue(sub, now)) continue;
      let creditRow;
      try {
        creditRow = await getOrCreateCreditBalance(admin, sub.user_id);
      } catch {
        skipped += 1;
        continue;
      }
      const balance = Math.round(Number(creditRow.balance_cents) || 0);
      if (balance < price) {
        if (sub.status === 'active') {
          await admin.from('billboard_subscriptions').update({
            status: 'paused', updated_at: now.toISOString(),
          }).eq('id', sub.id);
          paused += 1;
        }
        continue;
      }
      if (sub.status === 'active') {
        await debitCadBalance(admin, sub.user_id, {
          amountCents: price,
          reference: `billboard-renew:${sub.id}:${sub.period_end}`,
          reason: `Billboard ${sub.plan} subscription renewed, billboard ${sub.billboard_number}`,
        });
        await admin.from('billboard_subscriptions').update({
          period_end: addOneMonth(new Date(sub.period_end)).toISOString(),
          price_cents: price,
          updated_at: now.toISOString(),
        }).eq('id', sub.id);
        renewed += 1;
      } else {
        await debitCadBalance(admin, sub.user_id, {
          amountCents: price,
          reference: `billboard-resume-cron:${sub.id}:${sub.period_end}`,
          reason: `Billboard ${sub.plan} subscription resumed, billboard ${sub.billboard_number}`,
        });
        await admin.from('billboard_subscriptions').update({
          status: 'active',
          period_start: now.toISOString(),
          period_end: addOneMonth(now).toISOString(),
          price_cents: price,
          updated_at: now.toISOString(),
        }).eq('id', sub.id);
        resumed += 1;
      }
    } catch {
      skipped += 1;
    }
  }
  return NextResponse.json({ ok: true, renewed, paused, resumed, skipped });
}
