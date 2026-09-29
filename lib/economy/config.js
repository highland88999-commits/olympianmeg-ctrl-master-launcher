// lib/economy/config.js
// GOLD — the in-house credit economy. ALL tunables live here; nothing else
// in the codebase hard-codes a gold rate, cap, or conversion.
//
// Merlin's rules (locked):
// - Gold is in-house store credit ("gold" is Merlin's own name — use it in UI).
// - Gold can NEVER be bought, cashed out, transferred, or converted to crypto.
// - Gold is dollars-off at checkout only, up to 100% of a bill, never more.
// - Earned gold is server-validated, append-only, idempotent, rate-limited.

export const ECONOMY = {
  // Conversion: 100 gold = $1.00. Redemption is whole cents only;
  // any fractional remainder stays as gold on the balance.
  GOLD_PER_DOLLAR: 100,

  // Engagement: gold earned per active minute in the app (heartbeat).
  ENGAGEMENT_GOLD_PER_MINUTE: 1,
  // Engagement: max gold per user per UTC day from heartbeats.
  ENGAGEMENT_DAILY_CAP: 60,

  // Mining: gold earned per Liquid Gold bar sold (server-verified via replay).
  MINE_GOLD_PER_BAR: 25,
  // Mining: max gold per user per UTC day from mining claims.
  MINING_DAILY_CAP: 2000,
  // Mining: a single claim may cover at most this many game ticks (1 hour).
  MINE_MAX_TICKS_PER_CLAIM: 36000,
  // Mining: a single claim may carry at most this many logged actions.
  MINE_MAX_ACTIONS_PER_CLAIM: 5000,

  // Stripe will not charge less than this (US cents). If gold would leave a
  // remainder below the minimum, we apply slightly less gold so the card
  // charge lands exactly on the minimum instead of failing.
  STRIPE_MIN_CHARGE_CENTS: 50,

  // Heartbeat: client posts at most this often; the server additionally
  // enforces one accrual per 60-second window per user.
  HEARTBEAT_INTERVAL_MS: 60000,
  // Heartbeat: only count the user as active if input happened within this window.
  HEARTBEAT_ACTIVE_WINDOW_MS: 5 * 60000,
};

// --- Derived helpers (pure; unit-tested) ---------------------------------

/** Whole gold units needed to cover `cents` at the current rate. */
export function goldForCents(cents) {
  return Math.ceil(cents * ECONOMY.GOLD_PER_DOLLAR / 100);
}

/** Whole-cent value of `gold` units (fractional remainder is dropped — it stays as gold). */
export function centsForGold(gold) {
  return Math.floor(gold * 100 / ECONOMY.GOLD_PER_DOLLAR);
}

/**
 * Work out a gold discount for a bill. Pure math, no I/O.
 * Returns { discountCents, goldToSpend, chargeCents, paidByGold }.
 */
export function computeGoldDiscount(balanceGold, totalCents) {
  const balance = Math.max(0, Math.floor(balanceGold || 0));
  const total = Math.max(0, Math.floor(totalCents || 0));
  if (total === 0 || balance === 0) {
    return { discountCents: 0, goldToSpend: 0, chargeCents: total, paidByGold: false };
  }
  let discountCents = Math.min(centsForGold(balance), total);
  let goldToSpend = discountCents * ECONOMY.GOLD_PER_DOLLAR / 100;
  // Keep goldToSpend an integer number of gold units (whole cents only).
  goldToSpend = Math.floor(goldToSpend);
  discountCents = centsForGold(goldToSpend);
  let chargeCents = total - discountCents;
  if (chargeCents === 0) {
    return { discountCents, goldToSpend, chargeCents: 0, paidByGold: true };
  }
  // Never leave a card remainder below Stripe's minimum: apply a little less
  // gold so the card charge lands exactly on the minimum. (Catalog prices are
  // all >= $2.00, so a total at/below the minimum only arises in theory —
  // guard it so the discount can never go negative.)
  if (chargeCents < ECONOMY.STRIPE_MIN_CHARGE_CENTS) {
    if (total <= ECONOMY.STRIPE_MIN_CHARGE_CENTS) {
      return { discountCents: 0, goldToSpend: 0, chargeCents: total, paidByGold: false };
    }
    discountCents = total - ECONOMY.STRIPE_MIN_CHARGE_CENTS;
    goldToSpend = Math.floor(discountCents * ECONOMY.GOLD_PER_DOLLAR / 100);
    discountCents = centsForGold(goldToSpend);
    chargeCents = total - discountCents;
  }
  return { discountCents, goldToSpend, chargeCents, paidByGold: false };
}

/** Plain-English "X gold (≈ $Y.YY)". */
export function formatGold(gold) {
  const g = Math.max(0, Math.floor(gold || 0));
  const dollars = (centsForGold(g) / 100).toFixed(2);
  return `${g.toLocaleString('en-US')} gold (≈ $${dollars})`;
}
