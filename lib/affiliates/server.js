// lib/affiliates/server.js
// Server-only affiliate helpers. Never import from client components.
//
// accrueAffiliateCommission(admin, {...}) is the single hook every Stripe
// webhook fulfillment point calls. It:
//   1. resolves the buyer's referrer (buyer_user_id, then buyer_email
//      fallback for logged-out purchases),
//   2. rejects self-referral and zero-commission surfaces,
//   3. inserts exactly one commission row per (source, source_id) —
//      unique constraint + ignoreDuplicates makes webhook redelivery safe.

import {
  computeAffiliateCommission,
  purchaseNet,
  shouldAccrueCommission,
} from '../affiliates.js';

/** Merlin-only gate for affiliate admin surfaces (the no-leak rule). */
export const AFF_OWNER_EMAIL = 'olympiannexus@gmail.com';
export function isAffiliateOwner(user) {
  return String(user?.email || '').toLowerCase() === AFF_OWNER_EMAIL;
}

/**
 * Best-effort Stripe processing fee for a checkout session, from the
 * charge's balance transaction. 0 when it can't be read — the accrual
 * still happens on gross (flagged per surface in the build report).
 */
export async function stripeFeeCents(stripe, session) {
  try {
    const piId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!piId) return 0;
    const pi = await stripe.paymentIntents.retrieve(piId, {
      expand: ['charges.data.balance_transaction'],
    });
    const charge = pi?.charges?.data?.[0];
    const bt = charge?.balance_transaction;
    const fee = bt && typeof bt === 'object' ? bt.fee : null;
    return typeof fee === 'number' && fee >= 0 ? Math.round(fee) : 0;
  } catch (err) {
    console.error('Affiliate fee lookup failed:', err?.message || err);
    return 0;
  }
}

/**
 * Resolve the affiliate for a buyer. Primary: buyer_user_id -> aff_referrals.
 * Fallback: buyer_email -> aff_referrals.referred_email (logged-out buys).
 * Returns { affiliate_user_id } or { affiliate_user_id: null }.
 */
export async function resolveReferrer(admin, { buyer_user_id, buyer_email }) {
  if (buyer_user_id) {
    const { data, error } = await admin
      .from('aff_referrals')
      .select('affiliate_user_id')
      .eq('referred_user_id', buyer_user_id)
      .maybeSingle();
    if (error) throw error;
    if (data?.affiliate_user_id) return { affiliate_user_id: data.affiliate_user_id };
  }
  const email = String(buyer_email || '').trim().toLowerCase();
  if (email) {
    const { data, error } = await admin
      .from('aff_referrals')
      .select('affiliate_user_id')
      .eq('referred_email', email)
      .maybeSingle();
    if (error) throw error;
    if (data?.affiliate_user_id) return { affiliate_user_id: data.affiliate_user_id };
  }
  return { affiliate_user_id: null };
}

/**
 * Accrue one commission. Idempotent on (source, source_id).
 * Never throws for "no commission" outcomes — those are normal.
 *
 * Cost handling: pass cogs_cents when the cost is known inline. For
 * surfaces with real per-unit costs resolved elsewhere (store/Printful),
 * pass resolve_cogs — an async () => cents|null. When it resolves to null
 * the cost is genuinely unknowable right now: the commission is recorded
 * as 'pending_cost' (purchase_net_cents holds gross - fees provisionally;
 * commission stays 0) instead of silently accruing on the inflated base.
 * POST /api/affiliates/finalize-costs flips it to 'accrued' when the cost
 * lands. product_key ties the row to its cost row (e.g. 'pf:474601990:L').
 */
export async function accrueAffiliateCommission(
  admin,
  { source, source_id, buyer_user_id = null, buyer_email = '', gross_cents, stripe_fee_cents = 0, cogs_cents = 0, product_key = null, resolve_cogs = null }
) {
  if (!source || !source_id) return { ok: false, accrued: false, reason: 'missing_source' };
  let referrer;
  try {
    referrer = await resolveReferrer(admin, { buyer_user_id, buyer_email });
  } catch (err) {
    // aff tables not provisioned yet (or DB down): never fail the purchase
    // fulfillment for the affiliate hook. Log and move on.
    console.error(`Affiliate hook (${source}): referrer lookup failed:`, err?.message || err);
    return { ok: false, accrued: false, reason: 'lookup_failed' };
  }
  const affiliate_user_id = referrer.affiliate_user_id;
  if (!affiliate_user_id) return { ok: true, accrued: false, reason: 'no_referrer' };
  if (buyer_user_id && affiliate_user_id === buyer_user_id) {
    return { ok: true, accrued: false, reason: 'self_referral' };
  }

  const fee = Math.max(0, Math.round(Number(stripe_fee_cents) || 0));
  const gross = Math.max(0, Math.round(Number(gross_cents) || 0));

  // True COGS: inline when known, resolved when it lives elsewhere.
  let cogs = Math.max(0, Math.round(Number(cogs_cents) || 0));
  if (typeof resolve_cogs === 'function') {
    let resolved = null;
    try {
      resolved = await resolve_cogs();
    } catch (err) {
      console.error(`Affiliate hook (${source}): cost resolution failed:`, err?.message || err);
      resolved = null;
    }
    if (resolved == null || !(resolved >= 0)) {
      // Cost genuinely unknowable right now: park as pending_cost.
      // Idempotent: the (source, source_id) unique constraint absorbs
      // webhook redelivery — a duplicate is ignored, never double-parked.
      const { error } = await admin.from('aff_commissions').upsert(
        {
          affiliate_user_id,
          source,
          source_id: String(source_id),
          product_key,
          purchase_net_cents: Math.max(0, gross - fee), // provisional: gross - fees
          house_margin_cents: 0,
          commission_cents: 0,
          status: 'pending_cost',
        },
        { onConflict: 'source,source_id', ignoreDuplicates: true }
      );
      if (error) {
        if (error.code === '42P01') {
          console.error(`Affiliate hook (${source}): aff tables not provisioned yet.`);
          return { ok: false, accrued: false, reason: 'tables_missing' };
        }
        throw error;
      }
      console.log(
        `Affiliate: pending_cost for ${affiliate_user_id} ` +
          `(source ${source}:${source_id}, key ${product_key || 'n/a'}).`
      );
      return { ok: true, accrued: false, reason: 'pending_cost', product_key };
    }
    cogs = Math.round(resolved);
  }

  const net = purchaseNet({ gross_cents: gross, stripe_fee_cents: fee, cogs_cents: cogs });
  const split = computeAffiliateCommission({ net_cents: net, surface: source });
  if (!shouldAccrueCommission({ affiliate_user_id, buyer_user_id, commission_cents: split.commission_cents })) {
    return { ok: true, accrued: false, reason: 'zero_commission', split };
  }

  // Idempotent: the (source, source_id) unique constraint absorbs webhook
  // redelivery — a duplicate insert is ignored, never double-accrued.
  const { error } = await admin.from('aff_commissions').upsert(
    {
      affiliate_user_id,
      source,
      source_id: String(source_id),
      product_key,
      purchase_net_cents: split.net_cents,
      house_margin_cents: split.house_margin_cents,
      commission_cents: split.commission_cents,
      status: 'accrued',
    },
    { onConflict: 'source,source_id', ignoreDuplicates: true }
  );
  if (error) {
    // 42P01 = tables not provisioned yet: the purchase already fulfilled;
    // never fail it for the affiliate hook.
    if (error.code === '42P01') {
      console.error(`Affiliate hook (${source}): aff tables not provisioned yet.`);
      return { ok: false, accrued: false, reason: 'tables_missing' };
    }
    throw error;
  }
  console.log(
    `Affiliate: accrued ${split.commission_cents}c to ${affiliate_user_id} ` +
      `(source ${source}:${source_id}, net ${split.net_cents}c).`
  );
  return { ok: true, accrued: true, split };
}

/**
 * Flip 'pending_cost' rows to 'accrued' once their cost is known.
 * getCost: async () => cents|null for the product_key.
 * Only touches rows still pending (concurrency-safe); returns the count.
 */
export async function finalizePendingCosts(admin, { product_key, getCost }) {
  let cost = null;
  try {
    cost = await getCost();
  } catch (err) {
    console.error('Affiliate finalize: cost lookup failed:', err?.message || err);
    cost = null;
  }
  if (cost == null || !(cost >= 0)) {
    return { ok: false, finalized: 0, reason: 'cost_unavailable' };
  }
  const cogs = Math.round(cost);
  let rows = null;
  try {
    const res = await admin
      .from('aff_commissions')
      .select('id, source, purchase_net_cents')
      .eq('status', 'pending_cost')
      .eq('product_key', product_key)
      .limit(500);
    if (res.error) throw res.error;
    rows = res.data || [];
  } catch (err) {
    if (err?.code === '42P01') return { ok: false, finalized: 0, reason: 'tables_missing' };
    throw err;
  }
  let finalized = 0;
  for (const r of rows) {
    // purchase_net_cents provisionally holds gross - fees; subtract the cost now.
    const net = Math.max(0, (Number(r.purchase_net_cents) || 0) - cogs);
    const split = computeAffiliateCommission({ net_cents: net, surface: r.source });
    const { error: uErr } = await admin
      .from('aff_commissions')
      .update({
        purchase_net_cents: split.net_cents,
        house_margin_cents: split.house_margin_cents,
        commission_cents: split.commission_cents,
        status: 'accrued',
      })
      .eq('id', r.id)
      .eq('status', 'pending_cost');
    if (!uErr) finalized++;
  }
  return { ok: true, finalized };
}
