// lib/creator/ledger.js
// Creator monetization ledger — server-only. Never import from client components.
//
// Users create worlds (and other content) on Olympus. When they sell a
// creation, the earnings land in their wallet as CAD CREDIT via
// lib/wallet/ledger.js creditWallet. This module holds the pure pricing
// math and the server-side sale settlement.
//
// Merlin's money rules (following the store creator-payouts precedent,
// lib/store/creator-payouts.js — same policy, new context):
//   * Creator sets a price in whole CAD cents. Minimum $1.00.
//   * On sale: creator is credited NET of the real Stripe fee and the
//     $1.00 platform fee (Merlin's, whole):
//       net = max(0, gross - stripeFee - platformFee)
//   * Credits NEVER go negative. Fees consuming the whole price = no
//     credit row (wallet schema forbids $0 rows).
//   * Every credit carries an idempotency `reference` on the Stripe
//     session id — a redelivered webhook can never pay twice.
//   * Earnings accumulate in-wallet under the Dec 11, 2027 lock
//     (lib/wallet/lock.js) like every other program's earnings.
//   * FINTRAC: earnings from sales -> wallet credit is fine.
//     Wallet-to-wallet transfers are NOT built here.
//
// Pure — no I/O, no THREE, no DOM: safe to unit-test in plain Node
// (tests/creator-ledger.test.mjs).

import {
  creditWallet,
  getOrCreateWallet,
  netFromBreakdown,
  toCents,
} from '../wallet/ledger.js';

export const CREATOR_SALE_PROGRAM = 'creator-sale';
export const CREATOR_PLATFORM_FEE_CENTS = 100; // $1.00, Merlin's, whole.
export const MIN_LISTING_PRICE_CENTS = 100; // $1.00 floor
export const MAX_LISTING_PRICE_CENTS = 100000000; // $1,000,000 ceiling (sanity)

/** Wallet-ledger idempotency reference for a creator sale's credit. */
export function creatorSaleReference(sessionId) {
  return `creator-sale:credit:${String(sessionId || '').trim()}`;
}

/**
 * Validate a listing price. Returns { ok, priceCents, error }.
 * Price must be whole cents, >= $1.00, <= $1,000,000.
 */
export function validateListingPrice(priceCents) {
  const c = toCents(priceCents);
  if (c < MIN_LISTING_PRICE_CENTS) {
    return { ok: false, priceCents: 0, error: `Price must be at least $1.00.` };
  }
  if (c > MAX_LISTING_PRICE_CENTS) {
    return { ok: false, priceCents: 0, error: `Price cannot exceed $1,000,000.` };
  }
  return { ok: true, priceCents: c, error: null };
}

/**
 * Split a sale into creator net, Stripe fee share, and platform fee.
 * Follows the store creator-payouts formula:
 *   net = max(0, gross - stripeFeeCents - platformFeeCents)
 * Returns { grossCents, stripeFeeCents, platformFeeCents, netCents }.
 */
export function splitCreatorSale(grossCents, stripeFeeCents = 0) {
  const gross = toCents(grossCents);
  const stripeFee = Math.max(0, Math.round(Number(stripeFeeCents) || 0));
  const platformFee = CREATOR_PLATFORM_FEE_CENTS;
  const net = netFromBreakdown(gross, stripeFee, platformFee);
  return { grossCents: gross, stripeFeeCents: stripeFee, platformFeeCents: platformFee, netCents: net };
}

/**
 * Is this checkout session a creator sale? Reads ONLY server-stamped
 * session metadata (POST /api/creator/buy stamps listing_id +
 * seller_user_id + price_cents — client input never reaches it).
 * Returns { listingId, sellerUserId, priceCents } or null.
 */
export function parseCreatorSale(meta) {
  if (!meta || typeof meta !== 'object') return null;
  if (meta.creator_sale !== 'true') return null;
  const listingId = String(meta.creator_listing_id || '').trim();
  const sellerUserId = String(meta.creator_seller_user_id || '').trim();
  const priceCents = toCents(meta.creator_price_cents);
  if (!listingId || !sellerUserId || priceCents <= 0) return null;
  return { listingId, sellerUserId, priceCents };
}

/**
 * Credit the seller's wallet for a completed creator sale.
 * Idempotent: the ledger's unique `reference` on the session id makes
 * redelivery safe. Returns { credited, netCents, breakdown }.
 *
 * `admin` is a Supabase admin client. `stripeFeeCents` should be the
 * REAL fee from the charge's balance_transaction — never estimated.
 */
export async function creditCreatorSale(
  admin,
  { sessionId, sellerUserId, listingId, grossCents, stripeFeeCents = 0, itemLabel = '' }
) {
  const session = String(sessionId || '').trim();
  const seller = String(sellerUserId || '').trim();
  if (!session || !seller) throw new Error('sessionId and sellerUserId are required.');
  const gross = toCents(grossCents);
  if (gross <= 0) throw new Error('grossCents must be positive.');

  const split = splitCreatorSale(gross, stripeFeeCents);
  await getOrCreateWallet(admin, seller, 'cad');

  const label = itemLabel ? ` — ${String(itemLabel).slice(0, 120)}` : '';
  if (split.netCents > 0) {
    await creditWallet(admin, seller, {
      program: CREATOR_SALE_PROGRAM,
      amountCents: split.netCents,
      reason: `Creator sale${label} (net of fees)`,
      reference: creatorSaleReference(session),
      currency: 'cad',
      grossCents: split.grossCents,
      stripeFeeCents: split.stripeFeeCents,
      platformFeeCents: split.platformFeeCents,
    });
  }
  // Record the sale row for the earnings dashboard.
  const { error: saleError } = await admin.from('creator_sales').insert({
    listing_id: listingId || null,
    buyer_user_id: null, // filled by the webhook from session metadata when known
    seller_user_id: seller,
    gross_cents: split.grossCents,
    stripe_fee_cents: split.stripeFeeCents,
    platform_fee_cents: split.platformFeeCents,
    net_cents: split.netCents,
    stripe_session_id: session,
    item_label: String(itemLabel || '').slice(0, 200),
  });
  // A duplicate sale row (redelivered webhook) is not fatal — the wallet
  // credit above is the money truth and it is idempotent. Log and continue.
  if (saleError && !String(saleError.message || '').includes('duplicate')) {
    throw new Error(`Sale record failed: ${saleError.message}`);
  }
  return { credited: split.netCents > 0, netCents: split.netCents, breakdown: split };
}
