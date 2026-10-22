// lib/earth2/forge.js
// EARTH 2 — THE GOLD FORGE (Phase 2 foundation, owner test build).
//
// The forge is where time in the world turns into gold: while it
// burns, gold accrues at a steady rate and the owner claims it with
// one tap. The numbers ride the existing economy's rails (see
// lib/economy/config.js): 25 gold an hour matches mining's flavour
// (25 gold per Liquid Gold bar), and the 1000-gold daily ceiling is
// the economy's engagement-group cap (ECONOMY.ENGAGEMENT_DAILY_CAP_USD1
// — $1.00/day at 1000 gold = $1). The API route additionally enforces
// that cap through the gold ledger's cap group; the cap inside
// forgeAccrued keeps the pure preview math honest on its own.
//
// Pure: no imports, no clock reads — timestamps arrive as arguments
// (milliseconds since epoch), so the client preview, the server
// claim and the tests all compute the identical number.

// Gold forged per hour of burn.
export const FORGE_RATE_GOLD_PER_HOUR = 25;

// Daily ceiling on forged gold (the engagement-group cap).
export const FORGE_DAILY_CAP_GOLD = 1000;

const MS_PER_HOUR = 3600000;

/**
 * Whole gold accrued between a last-claim timestamp and now.
 * No last claim (forge never lit) or a clock that ran backwards
 * accrues nothing. The result never exceeds FORGE_DAILY_CAP_GOLD.
 */
export function forgeAccrued(lastClaimTs, nowTs) {
  const last = Number(lastClaimTs) || 0;
  const now = Number(nowTs) || 0;
  if (!last || now <= last) return 0;
  const gold = Math.floor(((now - last) / MS_PER_HOUR) * FORGE_RATE_GOLD_PER_HOUR);
  return Math.min(gold, FORGE_DAILY_CAP_GOLD);
}
