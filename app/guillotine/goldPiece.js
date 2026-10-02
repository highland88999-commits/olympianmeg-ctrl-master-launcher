// goldPiece.js — pure client-side helpers for the collectible gold piece
// in the Guillotine realm. No DOM, no network: fully unit-testable in Node.
//
// IMPORTANT (payment-bypass ban): the SERVER is the authority on gold.
// POST /api/gold/collect with { source_id: 'guillotine-gold-piece' } and let
// the response decide. This module only shapes the UI around that contract:
// hiding the piece, "returns next month" messaging, and an account-scoped
// localStorage key so the client remembers a collection until the calendar
// month rolls over. It never credits gold itself.
export const GOLD_PIECE_SOURCE_ID = 'guillotine-gold-piece';

/** 'YYYY-MM' for a Date (local time). The piece returns on the 1st. */
export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Account-scoped localStorage key — never shared across users. */
export function storageKeyFor(userId) {
  return `guillotine-gold-piece:${userId || 'anon'}`;
}

/** True when `stored` is this calendar month's collection record. */
export function collectedThisMonth(stored, now = new Date()) {
  return stored === monthKey(now);
}

/**
 * Interpret a POST /api/gold/collect response. Contract:
 *   { ok: true, credited: <int> }              -> collect it, hide the piece
 *   { ok: false, reason: 'already_collected' }  -> hide, "returns next month"
 *   { ok: false, reason: 'not_signed_in' }     -> keep visible, prompt sign-in
 * Anything else -> keep visible, show a retry message.
 */
export function interpretCollectResponse(data) {
  if (data && data.ok === true) {
    const credited = Number.isFinite(data.credited) ? Math.max(0, Math.floor(data.credited)) : 0;
    return { action: 'collected', credited };
  }
  const reason = data && data.reason;
  if (reason === 'already_collected') return { action: 'already_collected' };
  if (reason === 'not_signed_in') return { action: 'not_signed_in' };
  return { action: 'error' };
}
