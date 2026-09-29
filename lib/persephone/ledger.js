// lib/persephone/ledger.js
// The PERSEPHONE house-cut ledger.
//
// MERLIN'S BUSINESS RULE: the house takes 10% of NET profit —
// net = ticket revenue MINUS card fees MINUS costs.
// NOT 10% of gross. This is encoded here, tested in
// tests/persephone-ledger.test.js, and shown itemized in the UI.
//
// All money is whole integer cents. Rounding: the house cut rounds to the
// nearest cent and the artist gets the remainder, so
// houseCutCents + artistPayoutCents === netCents ALWAYS.
//
// If net is zero or negative there is no profit, so the house takes nothing
// and the artist's share carries the loss honestly (it can be negative).
//
// Stripe fee estimates: US card-present-online pricing is 2.9% + 30c per
// charge. These are ESTIMATES for the on-page calculator. Real payouts use
// the actual fee from Stripe (balance transaction) once the webhook SQL is
// live; the estimate label travels with every estimate so nobody mistakes
// it for a settled number.

export const HOUSE_CUT_RATE = 0.1;

/** US Stripe online card pricing: 2.9% + 30c per successful charge. */
export const STRIPE_FEE_RATE = 0.029;
export const STRIPE_FEE_FIXED_CENTS = 30;

/** Coerce anything to a non-negative integer number of cents. */
export function toCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

/**
 * Estimate the Stripe fee for one card charge of `chargeCents`.
 * Labeled estimate — real fee comes from Stripe's balance transaction.
 */
export function estimateStripeFeeCents(chargeCents) {
  const c = toCents(chargeCents);
  if (c === 0) return 0;
  return Math.round(c * STRIPE_FEE_RATE) + STRIPE_FEE_FIXED_CENTS;
}

/**
 * Split one event's money per Merlin's rule.
 *
 * @param {object} opts
 * @param {number} opts.grossCents        total ticket revenue collected
 * @param {number} opts.stripeFeesCents   card fees (estimated or actual)
 * @param {number} opts.costsCents        everything else: venue, sound, staff…
 * @returns {{ revenueCents, feesCents, costsCents, netCents, houseCutCents, artistPayoutCents }}
 */
export function splitLedger({ grossCents: gross = 0, stripeFeesCents: fees = 0, costsCents: costs = 0 } = {}) {
  const revenueCents = toCents(gross);
  const feesCents = toCents(fees);
  const costsCents = toCents(costs);

  const netCents = revenueCents - feesCents - costsCents;

  // 10% of NET. No profit, no cut — the house never takes a cut of a loss.
  const houseCutCents = netCents > 0 ? Math.round(netCents * HOUSE_CUT_RATE) : 0;
  const artistPayoutCents = netCents - houseCutCents;

  return { revenueCents, feesCents, costsCents, netCents, houseCutCents, artistPayoutCents };
}

/** $1,234.56 style formatting; negative amounts keep their minus sign. */
export function formatCents(cents) {
  const c = Math.round(Number(cents) || 0);
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  const dollars = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars.toLocaleString('en-US')}.${rem}`;
}

/** One-line plain-English summary of a split. */
export function describeSplit(split) {
  const s = splitLedger(split);
  return (
    `Revenue ${formatCents(s.revenueCents)} − fees ${formatCents(s.feesCents)} ` +
    `− costs ${formatCents(s.costsCents)} = net ${formatCents(s.netCents)}. ` +
    `House (10% of net): ${formatCents(s.houseCutCents)}. ` +
    `Artist: ${formatCents(s.artistPayoutCents)}.`
  );
}
