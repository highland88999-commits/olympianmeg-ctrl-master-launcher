/**
 * lib/gold/store-discount.js — store hoodie gold-discount cap
 * Worker D (economy-skins), Tron batch, 2026-10-02
 *
 * Pure math, unit-agnostic: all money is whole CENTS. The cap is expressed
 * in cents so it survives the v1 (1000 gold units = $1) -> v2 (100,000
 * liquid = $1) conversion migration unchanged.
 *
 * RULE (Merlin's brief): max $15 off ONE hoodie when paying with gold;
 * the discount CAN apply to multiple hoodies in the same order ($15 off
 * EACH). The client may only send { useGold: true }; the server prices
 * every line and computes the cap from its own data — client input NEVER
 * self-asserts a discount (payment-bypass ban is standing law).
 *
 * Guarantees:
 *   - a hoodie line's discount <= $15 x units AND <= the line total
 *   - total discount <= order total (never-negative bills, structurally)
 *   - a non-hoodie line keeps the existing uncapped gold behavior
 */

// ---------------------------------------------------------------- constants

/** Max gold discount per hoodie line, in whole cents: $15.00. */
export const HOODIE_GOLD_DISCOUNT_CAP_CENTS = 1500;

/** Max units of a single line per checkout (sanity bound). */
export const MAX_QTY_PER_LINE = 9;

// ---------------------------------------------------------------- helpers

/** True when the server-priced product name is a hoodie line. */
export function isHoodieProduct(name) {
  return /hoodie/i.test(String(name || ''));
}

/** Whole-cents cap for one priced line { unitCents, qty }. */
export function hoodieLineCapCents(lineTotalCents, qty) {
  const line = Math.max(0, Math.floor(lineTotalCents || 0));
  const q = Math.max(0, Math.floor(qty || 0));
  if (line <= 0 || q <= 0) return 0;
  // $15 per hoodie unit, never more than the line's own total.
  return Math.min(HOODIE_GOLD_DISCOUNT_CAP_CENTS * q, line);
}

/**
 * Compute the gold-discount ceiling for a server-priced order.
 *
 * lines: [{ name, unitCents, qty }] — every field server-derived (Stripe
 * product price, validated qty). qty outside 1..MAX_QTY_PER_LINE is clamped;
 * non-positive prices are ignored.
 *
 * Returns { hoodieUnits, maxDiscountCents, totalCents } where
 * maxDiscountCents is the largest gold discount the order may take:
 *   - hoodie lines: min($15 x units, line total)
 *   - other lines: full line total (existing uncapped behavior)
 *   - always <= totalCents, always >= 0
 */
export function hoodieDiscountCapForOrder(lines) {
  let hoodieUnits = 0;
  let maxDiscountCents = 0;
  let totalCents = 0;

  for (const raw of lines || []) {
    const unitCents = Math.max(0, Math.floor(raw?.unitCents || 0));
    let qty = Math.max(0, Math.floor(raw?.qty || 0));
    qty = Math.min(qty, MAX_QTY_PER_LINE);
    if (unitCents <= 0 || qty <= 0) continue;

    const lineTotal = unitCents * qty;
    totalCents += lineTotal;

    if (isHoodieProduct(raw?.name)) {
      hoodieUnits += qty;
      maxDiscountCents += hoodieLineCapCents(lineTotal, qty);
    } else {
      maxDiscountCents += lineTotal; // unchanged: uncapped gold on non-hoodies
    }
  }

  // Structural guarantee: the cap can never exceed the order total.
  maxDiscountCents = Math.min(maxDiscountCents, totalCents);
  return { hoodieUnits, maxDiscountCents, totalCents };
}

// ---------------------------------------------------------------- exports (CJS compat for tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HOODIE_GOLD_DISCOUNT_CAP_CENTS,
    MAX_QTY_PER_LINE,
    isHoodieProduct,
    hoodieLineCapCents,
    hoodieDiscountCapForOrder,
  };
}
