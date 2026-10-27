// lib/billboards/pricing.js — Billboard subscription prices (Merlin,
// 2026-10-27, FINAL settled rule — supersedes both the "launch price"
// note and the "no rise ever" note).
//
// BASE PRICES (permanent default): $10 CAD/month per rotating
// face-slot, $25 CAD/month to own a whole billboard solo (no
// rotation), paid from wallet credit.
//
// THE ONE OVERRIDE: when REGISTERED USERS reach 1,000,000, prices
// rise to $50 CAD/month rotating and $200 CAD/month solo. This is
// the ONLY override — no other price changes, no other triggers.
// The gate switches tiers only on a verified registered-user count
// (see lib/billboards/price-check.js), never before 1,000,000.
//
// ADVANCE NOTICE: at 990,000 registered users, every paying billboard
// advertiser gets an in-app pop-up AND an email, advising of the
// change and offering opt-out (cancel so the ad stops rather than
// renewing at the new price). The new price then applies only to
// advertisers who did not opt out, plus new subscribers after
// 1,000,000.
//
// PURPOSE (Merlin's words, for copy where appropriate): billboard
// revenue feeds the ecosystem, its users, and everything Olympus
// builds.
//
// Merlin's own house/demo ads are exempt from all of this: they are
// manager-wired, not subscriptions, so they never enter the notice
// sweep and never pay.
//
// Every price in the request flow, the wallet gate, and renewals reads
// from here, never from scattered literals. Change these numbers only
// on Merlin's explicit word, in this one file.

export const BILLBOARD_BASE_PRICES = {
  rotating: { cents: 1000, label: 'Rotating face-slot', cad: '$10' },
  solo: { cents: 2500, label: 'Whole billboard, solo', cad: '$25' },
};

export const BILLBOARD_MILLION_PRICES = {
  rotating: { cents: 5000, label: 'Rotating face-slot', cad: '$50' },
  solo: { cents: 20000, label: 'Whole billboard, solo', cad: '$200' },
};

/** Back-compat alias: the base tier is the live tier until 1M users. */
export const BILLBOARD_PRICES = BILLBOARD_BASE_PRICES;

export const BILLBOARD_PLANS = ['rotating', 'solo'];

/** Registered-user count at which the million tier goes live. */
export const PRICE_RISE_USER_THRESHOLD = 1000000;

/** Registered-user count at which the advance notice fires. */
export const PRICE_NOTICE_USER_THRESHOLD = 990000;

/** 'base' below 1,000,000 registered users, 'million' at or above. */
export function priceTierForUserCount(count) {
  const n = Number(count) || 0;
  return n >= PRICE_RISE_USER_THRESHOLD ? 'million' : 'base';
}

/** True when the advance-notice threshold has been reached. */
export function noticeThresholdReached(count) {
  return (Number(count) || 0) >= PRICE_NOTICE_USER_THRESHOLD;
}

/** True for 'rotating' or 'solo'. */
export function isValidPlan(plan) {
  return plan === 'rotating' || plan === 'solo';
}

function pricesForTier(tier) {
  return tier === 'million' ? BILLBOARD_MILLION_PRICES : BILLBOARD_BASE_PRICES;
}

/**
 * Monthly price in whole CAD cents for a plan at a tier ('base' or
 * 'million'), or null for unknown plans. Callers pass the LIVE tier
 * from the price state — never a client claim.
 */
export function priceForPlan(plan, tier = 'base') {
  if (plan !== 'rotating' && plan !== 'solo') return null;
  return pricesForTier(tier)[plan].cents;
}

/** "$10.00 CAD" style for a whole-cent amount. */
export function formatCad(cents) {
  const c = Math.round(Number(cents) || 0);
  return `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')} CAD`;
}

/** Plain-English price line for a plan at a tier, e.g. "$10 CAD per month". */
export function priceLineForPlan(plan, tier = 'base') {
  const cents = priceForPlan(plan, tier);
  if (cents === null) return '';
  return `${formatCad(cents)} per month`;
}

/** Purpose line for price copy (Merlin's words). */
export const BILLBOARD_PURPOSE_LINE =
  'Billboard revenue feeds the ecosystem, its users, and everything Olympus builds.';
