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

import { FREE_TIER_ID, FREE_QUOTA_BYTES, sumMatrixBytes, getTier } from './tiers.js';

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
 *
 * STACKING PRESERVATION (custom tiers, 2026-10-26): room stacked on top
 * of a base tier via custom purchases survives a fixed-tier change. The
 * stacked excess (quota above the old tier's bytes) carries over, so a
 * stacked user ascending tiers keeps every GB they paid for. Users with
 * no stacked room see exactly the old behaviour (excess 0).
 */
export async function applyPurchase(db, { userId, tierId, quotaBytes, stripeCustomerId, stripeSubscriptionId }) {
  const oldRow = await getQuotaRow(db, userId);
  let excess = 0;
  if (oldRow) {
    const oldTier = getTier(oldRow.tier);
    // Unknown old tier: assume no stacked excess (never inflate on a guess).
    const oldTierBytes = oldTier ? Number(oldTier.bytes) || 0 : Number(oldRow.quota_bytes) || 0;
    excess = Math.max(0, (Number(oldRow.quota_bytes) || 0) - oldTierBytes);
  }
  const patch = {
    user_id: userId,
    tier: tierId,
    quota_bytes: (Number(quotaBytes) || 0) + excess,
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

/**
 * Apply a completed CUSTOM-tier purchase (stacking). ADDS the purchased
 * bytes to the existing allowance — it never replaces it, never touches
 * used_bytes, and never changes the tier id. Buying twice doubles the
 * added room: quota_bytes grows by addedBytes on every custom purchase.
 * Custom subscriptions are separate Stripe subscriptions; their ids are
 * deliberately NOT written to the row (the row keeps the base tier's
 * subscription id, and the custom amount rides in the subscription's own
 * Stripe metadata for cancellation handling).
 */
export async function applyStackPurchase(db, { userId, addedBytes }) {
  const { row } = await ensureQuotaRow(db, userId);
  const next = (Number(row.quota_bytes) || 0) + Math.max(0, Number(addedBytes) || 0);
  const { data, error } = await db
    .from(QUOTAS)
    .update({ quota_bytes: next, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * A cancelled CUSTOM subscription removes only its own added room.
 * The allowance never drops below the free allowance, and used_bytes is
 * never touched (stored files stay stored; new uploads just block until
 * the vault has room again).
 */
export async function applyStackCancellation(db, { userId, removedBytes }) {
  const { row } = await ensureQuotaRow(db, userId);
  const next = Math.max(
    FREE_QUOTA_BYTES,
    (Number(row.quota_bytes) || 0) - Math.max(0, Number(removedBytes) || 0)
  );
  const { data, error } = await db
    .from(QUOTAS)
    .update({ quota_bytes: next, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** A cancelled subscription falls back to the free allowance (used_bytes kept). */
export async function applyCancellation(db, userId) {
  const row = (await ensureQuotaRow(db, userId)).row;
  // Stacked custom room survives a base-tier cancellation: the free
  // allowance plus whatever custom purchases are still standing. With no
  // stacked room this is exactly the old behaviour (free allowance).
  const oldTier = getTier(row.tier);
  const oldTierBytes = oldTier ? Number(oldTier.bytes) || 0 : Number(row.quota_bytes) || 0;
  const excess = Math.max(0, (Number(row.quota_bytes) || 0) - oldTierBytes);
  const { data, error } = await db
    .from(QUOTAS)
    .update({
      tier: FREE_TIER_ID,
      quota_bytes: FREE_QUOTA_BYTES + excess,
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
