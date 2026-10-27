// app/api/billboard-requests/subscribe/route.js
// POST { requestId } — activate a billboard subscription from wallet
// credit. Order of gates (all server-side, all fail closed):
//   1. The request must exist, belong to the caller, and be `approved`
//      (Merlin assigned a billboard number at approval).
//   2. No existing subscription for this request (replays return the
//      existing one — never a double charge).
//   3. OWNERSHIP CAP: the caller must not already hold a billboard
//      (active or paused subscription, solo or rotating) on the
//      assigned billboard's satellite. Violation → 409 + plain message.
//   4. Wallet credit must cover one month at the LIVE tier price
//      (base $10 rotating / $25 solo CAD; million tier $50/$200 once
//      registered users reach 1,000,000 — the tier comes from the
//      cached price state, never from the client). Short → 402 +
//      shortfall, and the UI prompts Load Wallet. No card is ever
//      auto-charged.
// On success: first month debited from credit (idempotent), the
// subscription row created (active, one month, price snapshotted),
// the request marked subscribed, and the ad staged into the manager's
// billboard_queue for Merlin to Send (best-effort: a missing queue
// table never fails the purchase — the subscription still stands and
// the receipt says the queue is pending setup, so Merlin can wire the
// manifest directly on his word).

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { serviceClient, authedUser, isMissingTable, publicSubscription } from '@/lib/billboards/request-server';
import { getOrCreateCreditBalance, debitCadBalance } from '@/lib/billboards/credit';
import { priceForPlan, isValidPlan } from '@/lib/billboards/pricing';
import { getPriceState } from '@/lib/billboards/price-check';
import { capCheck, capMessage, addOneMonth } from '@/lib/billboards/subscriptions';
import { isValidBillboardNumber } from '@/lib/billboards/validate';

export async function POST(req) {
  const admin = await serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'The billboard service is not connected yet.' }, { status: 503 });
  let user;
  try {
    user = await authedUser(req, admin);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Sign in to subscribe.' }, { status: e.status || 401 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }

  const { data: requestRow, error: reqErr } = await admin.from('billboard_requests')
    .select('*').eq('id', body?.requestId).maybeSingle();
  if (reqErr) {
    if (isMissingTable(reqErr)) return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
    return NextResponse.json({ ok: false, error: 'Could not read that request.' }, { status: 502 });
  }
  if (!requestRow || requestRow.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: 'Request not found.' }, { status: 404 });
  }
  if (requestRow.status === 'subscribed') {
    const { data: existing } = await admin.from('billboard_subscriptions')
      .select('*').eq('request_id', requestRow.id).maybeSingle();
    if (existing) return NextResponse.json({ ok: true, subscription: publicSubscription(existing), queued: null, replay: true });
  }
  if (requestRow.status !== 'approved') {
    return NextResponse.json({ ok: false, error: `That request is ${requestRow.status} — only approved requests can be subscribed.` }, { status: 409 });
  }
  const billboardNumber = Number(requestRow.assigned_number);
  if (!isValidBillboardNumber(billboardNumber)) {
    return NextResponse.json({ ok: false, error: 'Merlin has not assigned a billboard number to this request yet.' }, { status: 409 });
  }
  if (!isValidPlan(requestRow.plan)) {
    return NextResponse.json({ ok: false, error: 'That request has an unknown plan.' }, { status: 409 });
  }
  // Live tier from the cached price state (base until 1,000,000
  // registered users, million tier after — never a client claim).
  const priceState = await getPriceState(admin);
  const price = priceForPlan(requestRow.plan, priceState.tier);

  // Existing holdings (active + paused count toward the cap).
  const { data: subs, error: subErr } = await admin.from('billboard_subscriptions')
    .select('*').eq('user_id', user.id);
  if (subErr) {
    if (isMissingTable(subErr)) return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
    return NextResponse.json({ ok: false, error: 'Could not read your subscriptions.' }, { status: 502 });
  }
  const violation = capCheck((subs || []).map((s) => ({
    billboardNumber: s.billboard_number, status: s.status,
  })), billboardNumber);
  if (violation) {
    return NextResponse.json({ ok: false, error: capMessage(violation) }, { status: 409 });
  }

  // Wallet credit must cover one month. No card fallback, ever.
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
      ok: false, error: 'Not enough wallet credit for the first month.',
      needTopUp: true, priceCents: price, balanceCents: balance, shortfallCents: price - balance,
    }, { status: 402 });
  }

  const now = new Date();
  const periodEnd = addOneMonth(now);
  let debit;
  try {
    debit = await debitCadBalance(admin, user.id, {
      amountCents: price,
      reference: `billboard-sub-first:${requestRow.id}`,
      reason: `Billboard ${requestRow.plan} subscription, first month, billboard ${billboardNumber}`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Could not charge wallet credit.' }, { status: 502 });
  }
  if (debit.duplicate) {
    const { data: existing } = await admin.from('billboard_subscriptions')
      .select('*').eq('request_id', requestRow.id).maybeSingle();
    if (existing) return NextResponse.json({ ok: true, subscription: publicSubscription(existing), queued: null, replay: true });
    return NextResponse.json({ ok: false, error: 'That subscription already exists.' }, { status: 409 });
  }

  const { data: sub, error: subInsertErr } = await admin.from('billboard_subscriptions').insert({
    user_id: user.id,
    request_id: requestRow.id,
    plan: requestRow.plan,
    billboard_number: billboardNumber,
    company_name: requestRow.company_name,
    link_url: requestRow.link_url,
    creative_type: requestRow.creative_type,
    creative_url: requestRow.creative_url,
    price_cents: price,
    status: 'active',
    period_start: now.toISOString(),
    period_end: periodEnd.toISOString(),
  }).select('*').single();
  if (subInsertErr) {
    return NextResponse.json({ ok: false, error: 'Could not create that subscription.' }, { status: 502 });
  }
  await admin.from('billboard_requests').update({ status: 'subscribed' }).eq('id', requestRow.id);

  // Stage into the manager queue for Merlin's Send (best-effort).
  let queued = false;
  let queuePending = false;
  try {
    const { error: qErr } = await admin.from('billboard_queue').insert({
      kind: 'ad',
      billboard_number: billboardNumber,
      company_name: requestRow.company_name,
      link_url: requestRow.link_url,
      creative_type: requestRow.creative_type,
      creative_url: requestRow.creative_url,
      rotation_interval_seconds: 15,
      status: 'staged',
    });
    if (qErr && isMissingTable(qErr)) queuePending = true;
    else if (!qErr) queued = true;
    else queuePending = true;
  } catch {
    queuePending = true;
  }

  return NextResponse.json({
    ok: true,
    subscription: publicSubscription(sub),
    queued,
    queuePending,
  });
}
