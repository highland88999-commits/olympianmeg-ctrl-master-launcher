// Fortress of Solitude — server-side quota accounting.
//
// used_bytes lives on the fortress_quotas row and is the source of truth for
// how much vault space a user holds. It moves in exactly two ways:
//   - up on every successful store (the client reports bytes after its GCS PUT lands)
//   - down on every delete (clamped at 0 — a counter never goes negative)
// Purchases only ever change quota_bytes; used_bytes is never reset by the
// webhook (a new tier keeps what you already stored).
//
// Users with no row yet get Merlin's free allowance (1 GB) on first use;
// legacy files already in the crystal matrix seed used_bytes so nothing is
// double-counted or lost.

import { FREE_TIER_ID, FREE_QUOTA_BYTES, sumMatrixBytes } from './tiers.js';

const QUOTAS = 'fortress_quotas';

/** Read the user's quota row. Null when there is none (not an error). */
export async function getQuotaRow(db, userId) {
  const { data, error } = await db.from(QUOTAS).select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Ensure a quota row exists. First creation grants the free allowance and
 * seeds used_bytes from the crystal matrix (legacy stored files).
 * Never overwrites an existing row.
 */
export async function ensureQuotaRow(db, userId, seedUsedBytes = 0) {
  const existing = await getQuotaRow(db, userId);
  if (existing) return { row: existing, created: false };

  const seed = Math.max(0, Number(seedUsedBytes) || 0);
  const fresh = {
    user_id: userId,
    tier: FREE_TIER_ID,
    quota_bytes: FREE_QUOTA_BYTES,
    used_bytes: seed,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from(QUOTAS).insert([fresh]).select('*').single();
  if (error) throw error;
  return { row: data, created: true };
}

/** Add stored bytes after a successful upload. */
export async function addUsedBytes(db, userId, bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n === 0) return getQuotaRow(db, userId);
  const row = (await ensureQuotaRow(db, userId)).row;
  const next = (Number(row.used_bytes) || 0) + n;
  const { data, error } = await db
    .from(QUOTAS)
    .update({ used_bytes: next, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Remove stored bytes after a delete. Clamped at 0. */
export async function removeUsedBytes(db, userId, bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  const row = (await ensureQuotaRow(db, userId)).row;
  const next = Math.max(0, (Number(row.used_bytes) || 0) - n);
  const { data, error } = await db
    .from(QUOTAS)
    .update({ used_bytes: next, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Apply a completed subscription purchase. Sets tier, quota_bytes, and the
 * Stripe customer/subscription ids for later reconciliation. used_bytes is
 * deliberately untouched — buying a bigger vault keeps what you stored.
 */
export async function applyPurchase(db, { userId, tierId, quotaBytes, stripeCustomerId, stripeSubscriptionId }) {
  const patch = {
    user_id: userId,
    tier: tierId,
    quota_bytes: quotaBytes,
    stripe_customer_id: stripeCustomerId || null,
    stripe_subscription_id: stripeSubscriptionId || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db
    .from(QUOTAS)
    .upsert([patch], { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** A cancelled subscription falls back to the free allowance (used_bytes kept). */
export async function applyCancellation(db, userId) {
  const row = (await ensureQuotaRow(db, userId)).row;
  const { data, error } = await db
    .from(QUOTAS)
    .update({
      tier: FREE_TIER_ID,
      quota_bytes: FREE_QUOTA_BYTES,
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data || row;
}

/** Convenience: read a user's crystal matrix and seed their row from it. */
export async function ensureQuotaFromMatrix(db, userId) {
  let seed = 0;
  try {
    const { data } = await db.from('fortresses_').select('crystal_matrix').eq('id', userId).maybeSingle();
    seed = sumMatrixBytes(data?.crystal_matrix);
  } catch {
    seed = 0; // Never fail quota setup over the matrix read.
  }
  return ensureQuotaRow(db, userId, seed);
}
