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
  // Conversion: 1000 gold = $1.00 (Merlin's call, 2026-09-29).
  // Redemption is whole cents only; any fractional remainder stays as gold
  // on the balance.
  GOLD_PER_DOLLAR: 1000,

  // Engagement: gold earned per active minute in the app (heartbeat).
  ENGAGEMENT_GOLD_PER_MINUTE: 1,
  // Engagement: max gold per user per UTC day from heartbeats.
  ENGAGEMENT_DAILY_CAP: 60,

  // Mining: gold earned per Liquid Gold bar sold (server-verified via replay).
  MINE_GOLD_PER_BAR: 25,
  // Mining: max gold per user per UTC day from mining claims.
  // Merlin's call, 2026-09-29: 1000 coins generated per day = $1.00/day.
  MINING_DAILY_CAP: 1000,
  // Mining: a single claim may cover at most this many game ticks (1 hour).
  MINE_MAX_TICKS_PER_CLAIM: 36000,
  // Mining: a single claim may carry at most this many logged actions.
  MINE_MAX_ACTIONS_PER_CLAIM: 5000,

  // Refinery conversions (Merlin's corrected model, 2026-10-22): the
  // refinery's molten gold converts to GOLD BARS (its upgrade currency —
  // an internal loop, uncapped) or to AETHER, the platform's true
  // currency (server balance, lib/economy/aether.js). The AETHER leg is
  // capped at 1000 gold-value converted per user per UTC day, enforced
  // server-side from the refinery conversion diary. The cap is the
  // aether leg's alone: the bars path, the gold scattered through the
  // universe, mining, engagement and the forge all keep their own rules.
  REFINERY_DAILY_CAP: 1000,
  // Aether yield per converted bar-equivalent batch. Deliberately 1:
  // every other aether surface uses small integers (Earth interior
  // pickups, Dracula's +1/+3 gifts, the +10 jackpot), so aether stays
  // scarce. Merlin-ratifiable; the daily cap above is denominated in
  // gold value, so changing this changes yield, never the cap's worth.
  AETHER_PER_BAR: 1,
  // The aether ledger's own backstop cap for the 'refinery' reason
  // group, in AETHER units — derived from the two values above:
  // (1000 gold-value / 25 gold-value per bar) * 1 aether per bar = 40.
  REFINERY_AETHER_DAILY_CAP: 40,
  // Refinery claims replay from a server checkpoint, so a claim segment
  // only spans play since the last seal: at most 10 hours of game ticks
  // and 5000 actions per segment.
  REFINERY_MAX_SEGMENT_TICKS: 360000,
  REFINERY_MAX_ACTIONS_PER_CLAIM: 5000,

  // Seasonal pumpkin harvest (Halloween, Merlin's call 2026-10-09):
  // one gold piece per pumpkin = 100 gold = 1/10 of a gold bar.
  PUMPKIN_GOLD_PER_PIECE: 100,
  // Engagement: hard daily ceiling for ALL engagement-sourced gold per user
  // (gold economy v2, Merlin's call 2026-09-29): $1/day = 1000 gold units.
  // Pumpkin harvests credit with reason 'engagement:pumpkin-harvest' under
  // capGroup 'engagement', so the SQL sums them together with heartbeats —
  // harvests eat into the same $1/day budget, never on top of it.
  // (Heartbeats keep their own tighter 60/day sub-cap via the same group.)
  ENGAGEMENT_DAILY_CAP_USD1: 1000,

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
 *
 * opts.maxDiscountCents (optional): a server-derived ceiling on the gold
 * discount for this order (used by the store's $15-per-hoodie-line rule).
 * The discount is min(what the balance allows, the bill, the cap).
 * Non-positive or missing cap = uncapped (existing behavior, unchanged).
 */
export function computeGoldDiscount(balanceGold, totalCents, opts = {}) {
  const balance = Math.max(0, Math.floor(balanceGold || 0));
  const total = Math.max(0, Math.floor(totalCents || 0));
  const rawCap = Number.isFinite(opts?.maxDiscountCents) ? Math.floor(opts.maxDiscountCents) : Infinity;
  const cap = rawCap > 0 ? rawCap : Infinity;
  if (total === 0 || balance === 0) {
    return { discountCents: 0, goldToSpend: 0, chargeCents: total, paidByGold: false };
  }
  let discountCents = Math.min(centsForGold(balance), total, cap);
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
