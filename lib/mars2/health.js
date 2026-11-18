/**
 * lib/mars2/health.js — walker health on Mars 2 (Merlin, Nov 17, 2026).
 *
 * Mars 2 had no walker HP model: a sandstorm was weather, not a
 * threat. Merlin's order: being exposed to a sandstorm drains
 * health. House pattern is HP 100 (lib/lightning-aura.js
 * WALKER_MAX_HP, Earth 2 / Hollow Earth PLAYER_MAX_HP).
 *
 * The numbers (mine — flag if Merlin wants them tuned):
 * - Max HP 100.
 * - Drain 2 HP/s at full storm intensity, scaled linearly by the
 *   storm's intensity (0..1 from sandstormAt) — so a half-risen
 *   storm drains 1 HP/s. At full storm, 50 s of exposure from
 *   full health; the 2-minute warning is the time to get inside.
 * - Shelter (inside the outpost, or in the ship's enclosed orb)
 *   stops the drain and recovers 5 HP/s — getting inside is how
 *   you recover, not a potion. The rover does NOT shelter: it is
 *   open, so driving through a storm still drains.
 * - At 0 HP the walker respawns on foot at the outpost (the
 *   walker spawn by the door), HP back to 100.
 *
 * Pure functions — the scene and the tests share them.
 */

export const MARS2_MAX_HP = 100;
// HP lost per second of exposure at full storm intensity (1.0).
export const MARS2_STORM_DRAIN_HP_PER_S = 2;
// HP recovered per second while sheltered (inside / in the ship).
export const MARS2_SHELTER_REGEN_HP_PER_S = 5;

/** HP/s lost while exposed to a storm of `intensity` (0..1). */
export function stormDrainPerSecond(intensity) {
  const i = Number(intensity);
  if (!Number.isFinite(i) || i <= 0) return 0;
  return MARS2_STORM_DRAIN_HP_PER_S * Math.max(0, Math.min(1, i));
}

/**
 * One health tick: { hp, died }.
 * - Exposed (not sheltered) in a storm: drain by intensity × dt.
 * - Sheltered: recover 5 HP/s, capped at max.
 * - No storm: no change.
 * `died` is true only on the tick the walker crosses 0 — the
 * caller respawns on that tick (walker to the outpost spawn, on
 * foot, HP back to 100).
 */
export function tickMars2Health(hp, { dt = 0, stormIntensity = 0, sheltered = false } = {}) {
  const cur = Number(hp);
  if (!Number.isFinite(cur)) return { hp: MARS2_MAX_HP, died: false };
  const step = Math.max(0, Number(dt) || 0);
  if (sheltered) {
    if (cur >= MARS2_MAX_HP) return { hp: MARS2_MAX_HP, died: false };
    return { hp: Math.min(MARS2_MAX_HP, cur + MARS2_SHELTER_REGEN_HP_PER_S * step), died: false };
  }
  const drain = stormDrainPerSecond(stormIntensity) * step;
  if (drain <= 0) return { hp: Math.max(0, cur), died: false };
  const next = cur - drain;
  if (next <= 0) return { hp: 0, died: true };
  return { hp: next, died: false };
}
