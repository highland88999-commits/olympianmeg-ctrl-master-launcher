// lib/affiliates.js
// Pure, headless-testable core for the in-house affiliate program.
// No DOM, no network, no secrets — safe to import from API routes and tests.
//
// Business model (Merlin):
//   - Any signed-in user can become an affiliate and gets a referral link.
//   - Attribution is by NEW USER SIGNUP: ?ref=CODE binds server-side at
//     account creation, permanently. All future in-house purchases by the
//     referred user attribute to that affiliate.
//   - Commission = 10% of whatever the HOUSE earns on the purchase
//     (the affiliate never touches the performer/seller share):
//       tickets        -> house earns 10% of net -> affiliate 1% of net
//       store/hermes/  -> house earns 100% of net -> affiliate 10% of net
//       luge/gallery/fortress/world-engine/persephone
//       art            -> house earns 0% today -> no commission (hook ready)
//   - Net per surface: tickets = revenue - Stripe fees;
//     store = revenue - Printful COGS - Stripe fees (COGS pending until
//     Printful fulfillment is wired; until then revenue - fees, flagged);
//     everything else digital = revenue - Stripe fees.
//   - No self-referral commission. $20 minimum payout threshold.
//   - v1: LEDGER ONLY. No payouts are created anywhere here.

export const AFF_CODE_PREFIX = 'AFF';
export const AFF_CODE_LEN = 6;
// Unambiguous alphabet: no 0/O, no 1/I/L — readable on a phone screen.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** The affiliate's cut: 10% of the house's margin on the purchase. */
export const AFFILIATE_RATE = 0.10;

/**
 * Fraction of net the HOUSE keeps per surface. The affiliate earns
 * AFFILIATE_RATE of that. `art` is 0 — the full sale goes to the seller
 * today, so there is no house margin to share (flagged, hook in place).
 */
export const HOUSE_MARGIN_RATE = {
  tickets: 0.10,
  store: 1.0,
  hermes: 1.0,
  luge: 1.0,
  persephone: 1.0,
  gallery: 1.0,
  fortress: 1.0,
  'world-engine': 1.0,
  art: 0,
};

/** Minimum accrued balance before a payout can happen (cents). Configurable. */
export const AFF_MIN_PAYOUT_CENTS = 2000; // $20.00

/** Generate a code like AFF-7KQ2M9. rand is injectable for tests. */
export function makeAffiliateCode(rand = Math.random) {
  let code = '';
  for (let i = 0; i < AFF_CODE_LEN; i++) {
    code += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  }
  return `${AFF_CODE_PREFIX}-${code}`;
}

/** Normalize user input: accepts "aff-7kq2m9", "AFF7KQ2M9", "aff 7kq2m9". */
export function normalizeAffiliateCode(input) {
  const t = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.startsWith(AFF_CODE_PREFIX) && t.length === AFF_CODE_PREFIX.length + AFF_CODE_LEN) {
    return `${AFF_CODE_PREFIX}-${t.slice(AFF_CODE_PREFIX.length)}`;
  }
  return t;
}

export function isWellFormedAffiliateCode(input) {
  return new RegExp(`^${AFF_CODE_PREFIX}-[${ALPHABET}]{${AFF_CODE_LEN}}$`).test(
    normalizeAffiliateCode(input)
  );
}

/**
 * Commission math. All values in cents (integers).
 * net = gross - fees - cogs (per surface); house keeps its margin rate of
 * net; affiliate earns 10% of the house margin; house keeps the rest.
 * Returns the full split for an auditable ledger row.
 */
export function computeAffiliateCommission({ net_cents, surface }) {
  const net = Math.max(0, Math.round(Number(net_cents) || 0));
  const rate = Object.prototype.hasOwnProperty.call(HOUSE_MARGIN_RATE, surface)
    ? HOUSE_MARGIN_RATE[surface]
    : 1.0;
  const house_margin_cents = Math.round(net * rate);
  const commission_cents = Math.round(house_margin_cents * AFFILIATE_RATE);
  return {
    net_cents: net,
    surface,
    house_margin_rate: rate,
    house_margin_cents,
    commission_cents,
    house_keeps_cents: house_margin_cents - commission_cents,
  };
}

/** Net for a purchase: gross - Stripe fees - COGS (COGS 0 unless known). */
export function purchaseNet({ gross_cents, stripe_fee_cents = 0, cogs_cents = 0 }) {
  const gross = Math.max(0, Math.round(Number(gross_cents) || 0));
  const fee = Math.max(0, Math.round(Number(stripe_fee_cents) || 0));
  const cogs = Math.max(0, Math.round(Number(cogs_cents) || 0));
  return Math.max(0, gross - fee - cogs);
}

/**
 * Anti-abuse gate: no commission when there is no affiliate, when the
 * affiliate IS the buyer (self-referral), or when the commission is zero.
 */
export function shouldAccrueCommission({ affiliate_user_id, buyer_user_id, commission_cents }) {
  if (!affiliate_user_id) return false;
  if (buyer_user_id && affiliate_user_id === buyer_user_id) return false;
  if (!commission_cents || commission_cents <= 0) return false;
  return true;
}

/** Payout threshold progress for the dashboard. */
export function payoutProgress({ balance_cents }) {
  const balance = Math.max(0, Math.round(Number(balance_cents) || 0));
  const pct = Math.min(100, Math.round((balance / AFF_MIN_PAYOUT_CENTS) * 100));
  return {
    balance_cents: balance,
    threshold_cents: AFF_MIN_PAYOUT_CENTS,
    percent: pct,
    reached: balance >= AFF_MIN_PAYOUT_CENTS,
  };
}

export function formatCents(cents) {
  return `$${(Math.max(0, Math.round(Number(cents) || 0)) / 100).toFixed(2)}`;
}
