// app/api/billboard-requests/resume/route.js
// POST { subscriptionId } — resume a paused subscription right now
// by paying the next month from wallet credit. The subscription must
// belong to the caller and be `paused`. Short credit → 402 +
// shortfall (Load Wallet prompt), never a card charge. On success the
// subscription is active for one month from now at the LIVE tier price
// for its plan (base $10/$25; million tier $50/$200 after 1,000,000
// registered users, from the cached price state).

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { serviceClient, authedUser, isMissingTable, publicSubscription } from '@/lib/billboards/request-server';
import { getOrCreateCreditBalance, debitCadBalance } from '@/lib/billboards/credit';
import { priceForPlan } from '@/lib/billboards/pricing';
import { getPriceState } from '@/lib/billboards/price-check';
import { addOneMonth } from '@/lib/billboards/subscriptions';

export async function POST(req) {
  const admin = await serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'The billboard service is not connected yet.' }, { status: 503 });
  let user;
  try {
    user = await authedUser(req, admin);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Sign in to resume.' }, { status: e.status || 401 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }
  const { data: sub, error: readErr } = await admin.from('billboard_subscriptions')
    .select('*').eq('id', body?.subscriptionId).maybeSingle();
  if (readErr) {
    if (isMissingTable(readErr)) return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
    return NextResponse.json({ ok: false, error: 'Could not read that subscription.' }, { status: 502 });
  }
  if (!sub || sub.user_id !== user.id) return NextResponse.json({ ok: false, error: 'Subscription not found.' }, { status: 404 });
  if (sub.status !== 'paused') {
    return NextResponse.json({ ok: false, error: `That subscription is ${sub.status}, not paused.` }, { status: 409 });
  }
  const priceState = await getPriceState(admin);
  const price = priceForPlan(sub.plan, priceState.tier);
  if (price === null) return NextResponse.json({ ok: false, error: 'That subscription has an unknown plan.' }, { status: 409 });
  let creditRow;
  try {
    creditRow = await getOrCreateCreditBalance(admin, user.id);
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
    return NextResponse.json({ ok: false, error: 'Could not read your wallet credit.' }, { status: 502 });
  }
  const balance = Math.round(Number(creditRow.balance_cents) || 0);
  if (balance < price) {
    return NextResponse.json({
      ok: false, error: 'Not enough wallet credit to resume.',
      needTopUp: true, priceCents: price, balanceCents: balance, shortfallCents: price - balance,
    }, { status: 402 });
  }
  const now = new Date();
  try {
    await debitCadBalance(admin, user.id, {
      amountCents: price,
      reference: `billboard-resume:${sub.id}:${sub.period_end}`,
      reason: `Billboard ${sub.plan} subscription resumed, billboard ${sub.billboard_number}`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Could not charge wallet credit.' }, { status: 502 });
  }
  const { data: updated, error: upErr } = await admin.from('billboard_subscriptions').update({
    status: 'active',
    period_start: now.toISOString(),
    period_end: addOneMonth(now).toISOString(),
    updated_at: now.toISOString(),
  }).eq('id', sub.id).select('*').single();
  if (upErr) return NextResponse.json({ ok: false, error: 'Could not resume that subscription.' }, { status: 502 });
  return NextResponse.json({ ok: true, subscription: publicSubscription(updated) });
}
