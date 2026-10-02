/**
 * lib/gold/monthly.js — monthly-respawn gold sources
 * Worker D (economy-skins), Tron batch, 2026-10-02
 *
 * Pure helpers (Node + browser safe, no imports). Every gold source
 * respawns MONTHLY per user: a user collects a given source once per
 * calendar month; collecting removes it until the next month.
 *
 * Gold tiers (v2, Merlin's call, LOCKED):
 *   1,000 liquid gold = 1 gold bar; 100 gold bars = $1  =>  $1 = 100,000 liquid
 */

// ---------------------------------------------------------------- constants
export const LIQUID_PER_BAR = 1000;
export const BARS_PER_DOLLAR = 100;
export const LIQUID_PER_DOLLAR = LIQUID_PER_BAR * BARS_PER_DOLLAR; // 100,000

/**
 * Registry of monthly-respawn sources.
 * Each entry: { id, label, creditLiquid } — creditLiquid is the flat
 * one-time credit awarded on collect (idempotent per user+source+month).
 *
 * NOTE: recurring/day-based streams (engagement $1/day, miner $1/day,
 * slider accrual) are NOT monthly collect gates — they have their own
 * once-per-UTC-day idempotent accrual. See the reconciliation section
 * of the worker report for how each source is handled.
 */
export const MONTHLY_SOURCES = {
  'guillotine-gold-piece': {
    label: 'Guillotine gold piece',
    creditLiquid: 25_000, // 25 gold bars = $0.25
  },
  'olympus-cache': {
    label: 'Olympus vault cache',
    creditLiquid: 50_000, // 50 gold bars = $0.50
  },
  'ares-war-chest': {
    label: "Ares' war chest",
    creditLiquid: 50_000,
  },
  'plutus-tithe': {
    label: "Plutus' monthly tithe",
    creditLiquid: 100_000, // 100 gold bars = $1.00
  },
};

// ---------------------------------------------------------------- monthKey

/**
 * monthKey(dateLike) -> 'YYYY-MM' in UTC.
 * Accepts a Date, a timestamp (ms), or an ISO string. Defaults to now.
 * Month boundary: UTC calendar month — the same bucket for every user
 * regardless of timezone, so sources roll over simultaneously.
 */
export function monthKey(dateLike) {
  const d = dateLike === undefined || dateLike === null ? new Date() : new Date(dateLike);
  if (Number.isNaN(d.getTime())) throw new Error('monthKey: invalid date');
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// ---------------------------------------------------------------- row key helpers

/** Row identity for the gold_collect table. */
export function collectKey(userId, sourceId, month) {
  return { user_id: userId, source_id: sourceId, month };
}

/** Idempotency key for gold_apply(): same for the user+source+month so a
 *  retried POST never double-credits. */
export function collectIdempotencyKey(userId, sourceId, month) {
  return `gold-collect:${userId}:${sourceId}:${month}`;
}

// ---------------------------------------------------------------- source registry helpers

/** All known source ids. */
export function monthlySourceIds() {
  return Object.keys(MONTHLY_SOURCES);
}

/** True if the source id is registered (unknown ids are rejected by the API). */
export function isKnownMonthlySource(sourceId) {
  return Object.prototype.hasOwnProperty.call(MONTHLY_SOURCES, sourceId);
}

/** Credit for a source, in liquid gold. Throws on unknown source. */
export function sourceCreditLiquid(sourceId) {
  const s = MONTHLY_SOURCES[sourceId];
  if (!s) throw new Error(`unknown monthly source: ${sourceId}`);
  return s.creditLiquid;
}

/**
 * Pure gate logic (testable without a DB):
 *   collectedRows — array of {source_id, month} already on record for the user
 *   -> list of sources collectible THIS month ({id, label, creditLiquid}[])
 */
export function availableThisMonth(collectedRows, month) {
  const done = new Set(
    (collectedRows || [])
      .filter((r) => r && r.month === month)
      .map((r) => r.source_id)
  );
  return monthlySourceIds()
    .filter((id) => !done.has(id))
    .map((id) => ({ id, ...MONTHLY_SOURCES[id] }));
}

/** True if this source was already collected by the user in this month. */
export function alreadyCollected(collectedRows, sourceId, month) {
  return (collectedRows || []).some(
    (r) => r && r.source_id === sourceId && r.month === month
  );
}

// ---------------------------------------------------------------- conversions

export const liquidToBars = (liquid) => Math.floor(liquid / LIQUID_PER_BAR);
export const liquidToDollars = (liquid) => liquid / LIQUID_PER_DOLLAR;
export const dollarsToLiquid = (dollars) => Math.round(dollars * LIQUID_PER_DOLLAR);

// ---------------------------------------------------------------- ledger-unit bridge
//
// The live ledger (supabase/gold.sql + lib/economy/config.js) currently
// credits in v1 "gold units" (1000 gold units = $1) while v2 prices
// everything in liquid gold (100,000 liquid = $1). Until lib/economy/config.js
// migrates to liquid, a single constant maps between them:
//
//   1 ledger gold unit = 100 liquid gold
//
// MONTHLY_SOURCES stays in v2 liquid (the future source of truth); the
// collect route converts at write time via ledgerUnitsForLiquid(). When
// the config migrates, flip LEDGER_UNITS_PER_LIQUID to 1 — nothing else moves.
export const LEDGER_UNITS_PER_LIQUID = 1 / 100;

/** v2 liquid gold -> live ledger gold units (floored, never negative). */
export function ledgerUnitsForLiquid(liquid) {
  const l = Math.floor(liquid || 0);
  if (l <= 0) return 0;
  return Math.max(0, Math.floor(l * LEDGER_UNITS_PER_LIQUID));
}

// ---------------------------------------------------------------- exports (CJS compat for tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LIQUID_PER_BAR,
    BARS_PER_DOLLAR,
    LIQUID_PER_DOLLAR,
    MONTHLY_SOURCES,
    LEDGER_UNITS_PER_LIQUID,
    ledgerUnitsForLiquid,
    monthKey,
    collectKey,
    collectIdempotencyKey,
    monthlySourceIds,
    isKnownMonthlySource,
    sourceCreditLiquid,
    availableThisMonth,
    alreadyCollected,
    liquidToBars,
    liquidToDollars,
    dollarsToLiquid,
  };
}
