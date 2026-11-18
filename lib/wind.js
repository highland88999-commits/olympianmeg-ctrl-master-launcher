/**
 * lib/wind.js — the shared wind law (Merlin, Nov 18, 2026).
 *
 * One wind scale for every world that has weather: the wind reads
 * 10–80 km/h. Below 10 km/h the wind is BECALMED; at 80 km/h it is
 * a STORM. Ships sail at those speeds — the ship's speed tracks the
 * wind by its point of sail, wind behind = faster (toward 80), wind
 * against = slower, but NEVER less than 10 km/h under way, even
 * beating into the wind.
 *
 * Pure functions of their inputs — no clock, no state, no DOM —
 * so the law is node-testable and both worlds read the same numbers.
 *
 * Conventions:
 * - Wind speed is km/h everywhere the user sees it. Internally the
 *   Dutchman engine still sails in m/s; convert at the boundary.
 * - `windAngleRad` is the engine's windAngle(): 0 = wind dead ahead
 *   (in irons), PI = wind dead astern (running). The point-of-sail
 *   table is the Dutchman engine's, verbatim — one source of truth.
 * - The 10 km/h floor applies to a ship UNDER WAY forward (sails
 *   set, throttle >= 0). It does NOT apply to a deliberate stop:
 *   anchored and full-astern are the helm's choice, not the wind's.
 */

export const WIND_MIN_KMH = 10;
export const WIND_MAX_KMH = 80;
export const MS_TO_KMH = 3.6;

/** Dutchman wind strength 1.5 reads 80 km/h (strength 0 reads 0). */
export const WIND_STRENGTH_TO_KMH = WIND_MAX_KMH / 1.5;

export function msToKmh(ms) {
  return Number(ms) * MS_TO_KMH;
}

export function kmhToMs(kmh) {
  return Number(kmh) / MS_TO_KMH;
}

/** Dutchman wind strength (0–1.5, breathing) as km/h on the gauge. */
export function windKmhFromStrength(strength) {
  const s = Number(strength);
  if (!Number.isFinite(s)) return 0;
  return Math.max(0, Math.min(1.5, s)) * WIND_STRENGTH_TO_KMH;
}

/** True while the wind is under the 10 km/h floor — becalmed. */
export function isBecalmed(windKmh) {
  return Number(windKmh) < WIND_MIN_KMH;
}

/** True at the 80 km/h ceiling — full storm. */
export function isStorm(windKmh) {
  return Number(windKmh) >= WIND_MAX_KMH;
}

/**
 * Point-of-sail factor for a relative wind angle (radians, 0 = dead
 * ahead/in irons, PI = dead astern/running). The Dutchman engine's
 * table, verbatim: a ship close-hauled makes about a fifth of the
 * wind, running before it makes all of it.
 */
export function pointOfSailFactor(windAngleRad) {
  const wa = Math.abs(Number(windAngleRad) || 0);
  if (wa < 0.5) return 0.22; // in irons
  if (wa < 1.1) return 0.55 + 0.2 * (wa - 0.5);
  if (wa < 2.2) return 0.72 + 0.18 * (wa - 1.1);
  return 1.0; // running
}

/**
 * The ship's speed in km/h for a wind and a point of sail:
 * the wind's speed, trimmed by point of sail, sail plan and crew,
 * clamped to the 10–80 law. The floor holds even beating into the
 * wind — a headwind in a light breeze still reads 10, never 0.
 * `sailFactor`: 1.0 full sails, 0.62 battle, 0.25 furled.
 * `crewFactor`: 1 + crew * 0.005 (the engine's crew bonus, max 1.12).
 */
export function shipSpeedKmh(windKmh, windAngleRad, sailFactor = 1, crewFactor = 1) {
  const kmh = Number(windKmh) || 0;
  const speed = kmh * pointOfSailFactor(windAngleRad)
    * (Number(sailFactor) || 0) * (Number(crewFactor) || 0);
  return Math.max(WIND_MIN_KMH, Math.min(WIND_MAX_KMH, speed));
}

/**
 * The gauge state for a wind speed in km/h: { kmh, becalmed, storm,
 * label }. label is 'BECALMED' below 10, 'STORM' at 80, else null —
 * the gauge shows the word instead of a number at the bottom, and
 * the storm word at the top.
 */
export function windGaugeState(windKmh) {
  const kmh = Number(windKmh) || 0;
  const becalmed = isBecalmed(kmh);
  const storm = isStorm(kmh);
  return { kmh, becalmed, storm, label: becalmed ? 'BECALMED' : storm ? 'STORM' : null };
}

/**
 * Where the needle sits on the 10–80 gauge scale: 0 at/below 10,
 * 1 at/above 80. Below the floor the bar reads empty (becalmed).
 */
export function gaugeFill01(windKmh) {
  const kmh = Number(windKmh) || 0;
  return Math.max(0, Math.min(1, (kmh - WIND_MIN_KMH) / (WIND_MAX_KMH - WIND_MIN_KMH)));
}
