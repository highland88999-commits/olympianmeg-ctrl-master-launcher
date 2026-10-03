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
 */
export async function accrueAffiliateCommission(
  admin,
  { source, source_id, buyer_user_id = null, buyer_email = '', gross_cents, stripe_fee_cents = 0, cogs_cents = 0 }
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

  const net = purchaseNet({ gross_cents, stripe_fee_cents, cogs_cents });
  const split = computeAffiliateCommission({ net_cents: net, surface: source });
  if (!shouldAccrueCommission({ affiliate_user_id, buyer_user_id, commission_cents: split.commission_cents })) {
    const reason =
      buyer_user_id && affiliate_user_id === buyer_user_id ? 'self_referral' : 'zero_commission';
    return { ok: true, accrued: false, reason, split };
  }

  // Idempotent: the (source, source_id) unique constraint absorbs webhook
  // redelivery — a duplicate insert is ignored, never double-accrued.
  const { error } = await admin.from('aff_commissions').upsert(
    {
      affiliate_user_id,
      source,
      source_id: String(source_id),
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
