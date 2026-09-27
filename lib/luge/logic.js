// lib/luge/logic.js
// Pure business logic for the LUGE Complete Arsenal store + hoodie claims.
// No I/O, no framework dependencies — fully headless-testable.
// The API routes (checkout, webhook, claim) and the client page all derive
// from these helpers and from LUGE_PREMIUM_IDS so counts can never drift.
import { LUGE_PREMIUM_IDS, LUGE_PREMIUM_COUNT } from '../luge_data.js';

export { LUGE_PREMIUM_IDS, LUGE_PREMIUM_COUNT };

// Server-set price for the Complete Arsenal pack. The client never sends a
// price — the checkout route charges exactly this. Confirmed by Merlin
// 2026-09-27: $129 USD. Hoodie lands at $72 CAD; the rest covers shipping +
// Stripe fees with healthy margin left over.
export const LUGE_ARSENAL_PRICE_USD = 129;
export const LUGE_ARSENAL_PRODUCT_NAME = 'Luge Complete Arsenal';

/** True when the owned sled-id collection contains every premium sled. */
export function ownsArsenal(ownedSledIds) {
  const set = new Set(ownedSledIds || []);
  return LUGE_PREMIUM_IDS.every((id) => set.has(id));
}

/** True when a sled should show as locked in the selector. */
export function isSledLocked(sled, ownedSledIds) {
  if (!sled || sled.type !== 'premium') return false;
  return !new Set(ownedSledIds || []).has(sled.id);
}

/** Rows the Stripe webhook grants on a completed Arsenal purchase. */
export function arsenalGrantRows(userId) {
  return LUGE_PREMIUM_IDS.map((sled_id) => ({ user_id: userId, sled_id }));
}

/**
 * Pure claim decision. Returns { ok: true } or
 * { ok: false, status, error } mirroring the claim API's responses.
 */
export function decideClaim({ ownedSledIds, alreadyRedeemed }) {
  const owned = new Set(ownedSledIds || []);
  if (!ownsArsenal(owned)) {
    return {
      ok: false,
      status: 403,
      error: `The hoodie is reserved for Complete Arsenal owners. You have ${owned.size} of ${LUGE_PREMIUM_COUNT} premium sleds.`,
    };
  }
  if (alreadyRedeemed) {
    return {
      ok: false,
      status: 409,
      error: 'This hoodie has already been claimed on your account. One per rider.',
    };
  }
  return { ok: true };
}

/**
 * Webhook event bookkeeping decision. `seenEventIds` is the set of already-
 * processed stripe_event_ids (backed by luge_stripe_events). Returns
 * { duplicate: true } when this delivery must be acknowledged without
 * granting anything again.
 */
export function decideWebhookEvent(seenEventIds, eventId) {
  if (!eventId) return { ok: false, error: 'Missing event id.' };
  if (new Set(seenEventIds || []).has(eventId)) return { ok: true, duplicate: true };
  return { ok: true, duplicate: false };
}
