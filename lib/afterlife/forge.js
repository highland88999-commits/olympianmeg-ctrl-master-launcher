// lib/afterlife/forge.js
// THE LAKE OF FIRE — SOUL FORGE (Merlin, Nov 15 ~02:15, green-lit
// purposes list, tranche 1: the design spine).
//
// The Lake of Fire is the refinery: a Dutchman soul cast into the
// fire comes back as aether — the fire burns the damned part away.
// Rate APPROVED as the starting point: 1 soul -> 1 aether.
//
// THE CAP LAW (shared, not a second cap): the gold refinery's
// aether leg is capped at 40 aether/day (lib/economy/config.js:
// REFINERY_AETHER_DAILY_CAP 40, cap group 'refinery', reason
// 'refinery:conversion'). The forge honours the SAME law — its
// credits carry reason 'refinery:forge' in the same 'refinery'
// group, so gold-refined aether and soul-forged aether share one
// 40/day bucket. A separate group would have let a user take 40
// from gold and 40 from souls (80/day) and broken the law.
//
// The lake itself is visual-only today (lib/nether-realm/lava-glow.js:
// bright pool, flames, glow dome — no interaction). The forge is
// the first interaction it ever gets. Pure functions only; the
// money moves server-side (supabase/souls.sql: soul_forge() does
// the soul debit + aether credit atomically in one transaction).

// The lake: Hell's east region disc (lib/hell/world.js REGIONS).
export const LAKE_OF_FIRE = { x: 160, z: -70, regionR: 70, lakeR: 55 };

// 1 soul -> 1 aether (Merlin's approved starting point).
export const SOUL_FORGE_RATE_AETHER_PER_SOUL = 1;
// The forge's aether reason — same cap group as the gold refinery.
export const FORGE_AETHER_REASON = 'refinery:forge';
export const FORGE_AETHER_CAP_GROUP = 'refinery';
// The shared daily aether cap (lib/economy/config.js).
export const FORGE_AETHER_DAILY_CAP = 40;

/** Is (x, z) standing in the lake itself (the burnable surface)? */
export function inForgeRange(x, z) {
  if (typeof x !== 'number' || typeof z !== 'number') return false;
  return Math.hypot(x - LAKE_OF_FIRE.x, z - LAKE_OF_FIRE.z) <= LAKE_OF_FIRE.lakeR;
}

/** Aether a soul count forges into (the approved rate). */
export function aetherForSouls(souls) {
  const n = Math.floor(Number(souls));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n * SOUL_FORGE_RATE_AETHER_PER_SOUL;
}

/** Plain-English forge line for the HUD ("1 soul -> 1 aether"). */
export function forgeRateText() {
  return `${SOUL_FORGE_RATE_AETHER_PER_SOUL} soul -> ${SOUL_FORGE_RATE_AETHER_PER_SOUL} aether`;
}
