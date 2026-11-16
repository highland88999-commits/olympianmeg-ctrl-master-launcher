// lib/life-clock.js
// SHARED DEVICE-CLOCK HELPERS for the dino-realm operator agents
// (Earth 2, Earth 3, Middle-earth, Hollow Earth — Merlin, Nov 14).
// Mirrors lib/earth4/life-clock.js in shape, but holds only the
// pieces every realm shares; each realm's operators.js owns its
// own agents. TIME is the actual clock on each user's phone —
// not server time, not game time — so a creature's life is a
// pure function of (place, species, device clock).
//
// LIFESPAN CONVENTION: no dino realm in this repo carries
// lifespan data (Earth 4's lifespan.csv has no counterpart
// here), so lifespans are a STATED CONVENTION by body size,
// labelled 'convention' wherever they surface — never presented
// as listed data. They drive growth stages and (Earth 3 only)
// the age-only death default; they NEVER kill in Earth 2 or
// Middle-earth, where the coded death laws (predation / combat)
// rule instead. Hollow Earth kills by age from Nov 16 (the
// MonsterVerse agents workstream): birth + lifespan, the same
// 45 s next-generation path as every other death.

/** The device's now, as milliseconds since the epoch. */
export function nowMs(now = new Date()) {
  return now instanceof Date ? now.getTime() : Number(now);
}

/** The device's local hour as a decimal (0–24). */
export function localHour(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/** The UTC month (1–12) the device clock reads. */
export function utcMonth(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return d.getUTCMonth() + 1;
}

export const DAY_MS = 86400000;
export const YEAR_MS = 365.25 * DAY_MS;

/**
 * The spawner's own hash law (lib/earth4/operators.js) — the
 * same seeded arithmetic, so the same (place, species) always
 * draws the same life. Pure and bit-identical on every engine.
 */
export function hash01(str, seed) {
  let h = seed | 0;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/**
 * Lifespan in years, by body length (scaleM) — CONVENTION
 * (see the header): small dinos live short, giants live long.
 * Basis is always reported as 'convention' by callers.
 */
export function lifespanYearsFor(scaleM) {
  const s = Number(scaleM) || 1;
  if (s < 2) return 12;
  if (s < 6) return 25;
  if (s < 12) return 45;
  return 70;
}

/** True when the device clock reads night (20:00–06:00 local). */
export function isNightAt(now = new Date()) {
  const h = localHour(now);
  return h >= 20 || h < 6;
}
