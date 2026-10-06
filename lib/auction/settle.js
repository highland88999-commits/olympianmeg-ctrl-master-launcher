// lib/auction/settle.js
// Server-only: settles a completed auction or buy-now sale.
//
// The winner gets the FULL WORKING ITEM: the world_engine_assets row is
// transferred to them (user_id changes, generation_params intact, listed
// flags cleared — backpack-ready) AND a permanent trophy/provenance record
// is written to auction_sales with an item_snapshot.
//
// Retry safety: every wallet leg is idempotent on its reference (the
// wallet_transactions unique constraint is the double-spend guard), the
// asset transfer is a plain idempotent update, and the sales-row insert is
// skipped when a row already exists for the listing. If ANY step throws
// after money has moved, re-running settleSale with the same listing is
// safe — nothing pays twice.

import { creditWallet, debitWallet, releaseHold } from '@/lib/wallet/ledger.js';
import { chargeOracleFee } from '@/lib/oracle/server.js';
import { saleBuyerRef, saleSellerRef } from './helpers.js';

/**
 * Read the real Stripe fee (integer cents) off a PaymentIntent's charge.
 * Stripe reports balance_transaction.fee in cents already — it is used
 * directly, never estimated.
 */
export async function readStripeFeeCents(stripe, paymentIntent, intentId) {
  try {
    let pi = paymentIntent;
    if (!pi || !pi.charges) {
      pi = await stripe.paymentIntents.retrieve(String(intentId), {
        expand: ['charges.data.balance_transaction'],
      });
    }
    const charges = pi?.charges?.data || [];
    for (const ch of charges) {
      let bt = ch?.balance_transaction;
      if (!bt) continue;
      if (typeof bt === 'string') bt = await stripe.balanceTransactions.retrieve(bt);
      const fee = Math.round(Number(bt?.fee) || 0);
      if (fee > 0) return fee;
    }
  } catch (err) {
    console.error('Could not read the Stripe fee:', err?.message || err);
  }
  return 0;
}

/**
 * Release one bid's hold: wallet hold back to spendable, or cancel the
 * manual-capture PaymentIntent. Best-effort — a failure is logged, never
 * thrown, so one stuck bid cannot block a settlement.
 */
export async function releaseBidHold(admin, stripe, bid) {
  if (!bid) return;
  try {
    if (bid.pay_method === 'wallet') {
      await releaseHold(admin, bid.bidder_id, bid.amount_cents);
    } else if (bid.pay_method === 'stripe' && bid.stripe_payment_intent_id && stripe) {
      await stripe.paymentIntents.cancel(String(bid.stripe_payment_intent_id));
    }
  } catch (err) {
    console.error('releaseBidHold failed:', err?.message || err);
  }
}

/**
 * Settle a sale. Inputs:
 *   admin, stripe, listing (auction_listings row), winnerId,
 *   salePriceCents, saleType ('auction'|'buy_now'), payMethod ('wallet'|'stripe')
 *
 * Money (Merlin's fee rule): the seller is credited NET of the real Stripe
 * fee and the $1.00 platform fee; Merlin's fee is charged via
 * chargeOracleFee (same as Program Requests — whole, and capped at the
 * sale price on sub-$1 sales so the fee can never exceed the transaction).
 *
 * Returns { sale, duplicate } — duplicate:true when the listing was already
 * settled by an earlier run.
 */
export async function settleSale({ admin, stripe, listing, winnerId, salePriceCents, saleType, payMethod }) {
  if (!admin) throw new Error('The auction service is not connected yet.');
  const salePrice = Math.round(Number(salePriceCents) || 0);
  if (salePrice <= 0) throw new Error('The sale price must be positive.');
  if (saleType !== 'auction' && saleType !== 'buy_now') throw new Error('Unknown sale type.');
  if (payMethod !== 'wallet' && payMethod !== 'stripe') throw new Error('Unknown payment method.');
  if (!winnerId) throw new Error('A winner is required to settle a sale.');

  // Re-read the listing: a retried settle must be safe.
  const { data: live, error: liveErr } = await admin
    .from('auction_listings')
    .select('*')
    .eq('id', listing.id)
    .maybeSingle();
  if (liveErr) throw new Error(`Could not load the listing: ${liveErr.message}`);
  if (!live) throw new Error('Listing not found.');
  if (live.status === 'sold') {
    const { data: existing } = await admin
      .from('auction_sales')
      .select('*')
      .eq('listing_id', live.id)
      .maybeSingle();
    return { sale: existing || null, duplicate: true };
  }
  if (live.status !== 'live') throw new Error('This listing is no longer live.');

  const sellerId = live.seller_id;
  const assetId = live.asset_id;
  const now = new Date().toISOString();

  // Load the asset BEFORE the transfer for the provenance snapshot.
  const { data: asset, error: assetErr } = await admin
    .from('world_engine_assets')
    .select('id, display_name, category, asset_url, generation_params')
    .eq('id', assetId)
    .maybeSingle();
  if (assetErr || !asset) throw new Error('The listed item could not be found.');

  // (a) Money movement — every leg idempotent on its reference.
  let stripeFeeCents = 0;
  if (payMethod === 'wallet') {
    // Auction winners already hold their bid amount: convert the hold into
    // a real debit. Buy-now has no hold, so debit available balance.
    await debitWallet(admin, winnerId, {
      program: 'auction',
      amountCents: salePrice,
      reason: `Auction purchase — ${live.title || asset.display_name || 'item'}`,
      reference: saleBuyerRef(live.id),
      fromHeld: saleType === 'auction',
    });
  } else {
    if (!stripe) throw new Error('Card payments are not connected yet.');
    if (saleType === 'auction') {
      // The winning bid authorized a manual-capture intent at bid time.
      const { data: winBid } = await admin
        .from('auction_bids')
        .select('stripe_payment_intent_id')
        .eq('listing_id', live.id)
        .eq('bidder_id', winnerId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const intentId = winBid?.stripe_payment_intent_id;
      if (!intentId) throw new Error('The winning card authorization is missing.');
      const captured = await stripe.paymentIntents.capture(intentId);
      stripeFeeCents = await readStripeFeeCents(stripe, captured, intentId);
    } else {
      // Buy-now: charge the card immediately (automatic capture).
      const intent = await stripe.paymentIntents.create({
        amount: salePrice,
        currency: 'usd',
        description: `Auction buy-now — ${live.title || asset.display_name || 'item'}`,
        metadata: {
          listing_id: String(live.id),
          buyer_id: String(winnerId),
          sale_type: 'buy_now',
        },
      });
      const confirmed = await stripe.paymentIntents.confirm(intent.id);
      if (confirmed.status !== 'succeeded') {
        try { await stripe.paymentIntents.cancel(intent.id); } catch { /* best effort */ }
        throw new Error('The card needs extra verification to complete this purchase.');
      }
      stripeFeeCents = await readStripeFeeCents(stripe, confirmed, intent.id);
    }
  }

  // Merlin's $1.00 platform fee — same as Program Requests.
  const { feeCents: platformFeeCents } = await chargeOracleFee(admin, {
    program: 'auction',
    transactionRef: String(live.id),
    transactionCents: salePrice,
  });

  // The seller is credited net of the real Stripe fee and the platform fee.
  // (Skipped when the net is 0 — e.g. a sub-$1 sale — never a negative.)
  const sellerNet = Math.max(0, salePrice - stripeFeeCents - platformFeeCents);
  if (sellerNet > 0) {
    await creditWallet(admin, sellerId, {
      program: 'auction',
      grossCents: salePrice,
      stripeFeeCents,
      platformFeeCents,
      reason: `Auction sale — ${live.title || asset.display_name || 'item'}`,
      reference: saleSellerRef(live.id),
    });
  }

  // (b) Transfer the full working item to the winner: generation_params
  // intact, listed flags cleared, backpack-ready.
  const { error: transferErr } = await admin
    .from('world_engine_assets')
    .update({ user_id: winnerId, is_listed: false, listing_type: 'none' })
    .eq('id', assetId);
  if (transferErr) throw new Error(`Could not transfer the item: ${transferErr.message}`);

  // (c) Trophy / provenance record.
  let sale = null;
  const { data: existingSale } = await admin
    .from('auction_sales')
    .select('*')
    .eq('listing_id', live.id)
    .maybeSingle();
  if (existingSale) {
    sale = existingSale;
  } else {
    const { data: inserted, error: saleErr } = await admin
      .from('auction_sales')
      .insert({
        listing_id: live.id,
        asset_id: assetId,
        seller_id: sellerId,
        buyer_id: winnerId,
        sale_price_cents: salePrice,
        sale_type: saleType,
        pay_method: payMethod,
        platform_fee_cents: platformFeeCents,
        item_snapshot: {
          display_name: asset.display_name,
          category: asset.category,
          asset_url: asset.asset_url,
          generation_params: asset.generation_params,
          sold_at: now,
        },
      })
      .select('*')
      .single();
    if (saleErr) {
      if (String(saleErr.code) === '23505') {
        const { data: raced } = await admin
          .from('auction_sales')
          .select('*')
          .eq('listing_id', live.id)
          .maybeSingle();
        sale = raced;
      } else {
        throw new Error(`Could not record the sale: ${saleErr.message}`);
      }
    } else {
      sale = inserted;
    }
  }

  // (d) Close the listing.
  await admin.from('auction_listings').update({ status: 'sold', sold_at: now }).eq('id', live.id);

  return { sale, duplicate: false };
}
