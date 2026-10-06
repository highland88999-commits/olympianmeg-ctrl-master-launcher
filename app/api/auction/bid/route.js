// app/api/auction/bid/route.js
// POST /api/auction/bid
//   Place a bid on a live auction. Body: { listing_id, amount_cents,
//   pay_method ('wallet'|'stripe') }.
//
//   - Minimum bid: opening bid >= starting_bid_cents; later bids >=
//     current bid + max($1.00, 5% of current bid).
//   - Wallet: the bid amount is HELD (not spent) until the auction settles.
//     Funds already held for this auction count toward a raised bid.
//   - Card: a manual-capture PaymentIntent authorizes the amount; it is
//     captured only if the bid wins, cancelled when outbid.
//   - The previous high bid is marked 'outbid' and its hold released.
//   - Idempotent: the same bidder + amount + still active returns the
//     existing bid instead of double-holding.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';
import { getStripe } from '@/lib/connect/server';
import {
  getOrCreateWallet,
  availableCents,
  holdForWithdrawal,
} from '@/lib/wallet/ledger.js';
import { validateBidAmount } from '@/lib/auction/helpers';
import { releaseBidHold } from '@/lib/auction/settle';

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user } = auth;

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const listing_id = String(body.listing_id || '').trim();
  const amount_cents = Math.round(Number(body.amount_cents));
  const pay_method = String(body.pay_method || '').trim().toLowerCase();
  if (!listing_id) return NextResponse.json({ error: 'Choose a listing to bid on.' }, { status: 400 });
  if (!['wallet', 'stripe'].includes(pay_method)) {
    return NextResponse.json({ error: 'Choose wallet or card as the payment method.' }, { status: 400 });
  }

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  const { data: listing, error: loadErr } = await admin
    .from('auction_listings')
    .select('*')
    .eq('id', listing_id)
    .maybeSingle();
  if (loadErr || !listing) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });

  const check = validateBidAmount(listing, amount_cents, user.id);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status || 400 });

  // Idempotency: same bidder, same amount, still active — return it.
  const { data: dup } = await admin
    .from('auction_bids')
    .select('*')
    .eq('listing_id', listing_id)
    .eq('bidder_id', user.id)
    .eq('amount_cents', amount_cents)
    .eq('status', 'active')
    .maybeSingle();
  if (dup) {
    return NextResponse.json({
      ok: true,
      bid: dup,
      duplicate: true,
      current_bid_cents: listing.current_bid_cents,
      current_bidder_id: listing.current_bidder_id,
    });
  }

  // Collect the payment (hold or authorization) BEFORE writing the bid row.
  let stripeIntentId = null;
  if (pay_method === 'wallet') {
    const wallet = await getOrCreateWallet(admin, user.id);
    // Funds already held for this auction count toward a raised bid.
    const { data: myActive } = await admin
      .from('auction_bids')
      .select('amount_cents')
      .eq('listing_id', listing_id)
      .eq('bidder_id', user.id)
      .eq('status', 'active');
    const alreadyHeld = (myActive || []).reduce(
      (s, b) => s + Math.max(0, Math.round(Number(b.amount_cents) || 0)),
      0
    );
    if (availableCents(wallet) + alreadyHeld < amount_cents) {
      return NextResponse.json(
        { error: 'Insufficient available balance for this bid.' },
        { status: 402 }
      );
    }
    await holdForWithdrawal(admin, user.id, amount_cents);
  } else {
    const stripe = await getStripe();
    if (!stripe) {
      return NextResponse.json({ error: 'Card payments are not connected yet.' }, { status: 503 });
    }
    try {
      const intent = await stripe.paymentIntents.create({
        amount: amount_cents,
        currency: 'usd',
        capture_method: 'manual',
        description: `Auction bid hold — ${listing.title || 'item'}`,
        metadata: { listing_id: String(listing_id), bidder_id: String(user.id) },
      });
      stripeIntentId = intent.id;
    } catch (err) {
      console.error('Bid authorization failed:', err?.message || err);
      return NextResponse.json(
        { error: 'The card could not be authorized. Check the card and try again.' },
        { status: 402 }
      );
    }
  }

  const { data: bid, error: bidErr } = await admin
    .from('auction_bids')
    .insert({
      listing_id,
      bidder_id: user.id,
      amount_cents,
      pay_method,
      stripe_payment_intent_id: stripeIntentId,
      status: 'active',
    })
    .select('*')
    .single();
  if (bidErr) {
    // Unwind the hold/authorization so funds are never stuck.
    await releaseBidHold(admin, await getStripe(), {
      bidder_id: user.id,
      amount_cents,
      pay_method,
      stripe_payment_intent_id: stripeIntentId,
    });
    return NextResponse.json({ error: 'Could not place the bid. Please try again.' }, { status: 500 });
  }

  // Outbid every other active bid on this listing and release their holds.
  const stripeForRelease = await getStripe();
  const { data: others } = await admin
    .from('auction_bids')
    .select('*')
    .eq('listing_id', listing_id)
    .eq('status', 'active')
    .neq('id', bid.id);
  for (const other of others || []) {
    await releaseBidHold(admin, stripeForRelease, other);
    await admin.from('auction_bids').update({ status: 'outbid' }).eq('id', other.id);
  }

  await admin
    .from('auction_listings')
    .update({ current_bid_cents: amount_cents, current_bidder_id: user.id })
    .eq('id', listing_id);

  return NextResponse.json({
    ok: true,
    bid,
    current_bid_cents: amount_cents,
    current_bidder_id: user.id,
  });
});
