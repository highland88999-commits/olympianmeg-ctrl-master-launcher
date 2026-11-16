// app/hollow-earth/elemental-rain.js — ELEMENTAL RAIN (visual system + data).
//
// MonsterVerse workstream 5, phase 2 (2026-11-16). Merlin ordered
// Nov 16 ~01:33-01:34: "elemental rains." Phase 1
// (~/workspace/monsterverse-round/ws5-elements-audit.md §3b) found
// no rain system anywhere in Hollow Earth — this is a new system,
// not a repair. NEW FILE ONLY — nothing here is wired in yet; the
// wiring worker renders these streaks in zone.js. Pure data + a
// step function: no THREE, no scene code, no DOM, no lights,
// no server, no SQL.
//
// THE RULE (audit §3b, worker's call on the numbers): rain is
// emitted by LIVING monsters only. There is no weather system, no
// random schedule, no sky that rains on its own. Every live,
// active monster rains its element inside its own aura radius:
// a cylinder of falling streaks centred on the monster, radius =
// the monster's aura radius (ELEMENT_AURA), ~40 visible streaks
// per monster, capped at 600 live streaks field-wide (nearest
// kept, farthest culled first), falling 22 m/s from ~25 m above
// the ground, tinted the element's PROJECTILE_STYLE colour.
// When the monster dies, its rain dies with it.
//
// EDGE CASES (audit §3b): flyers rain from flight height
// (rain falls from flyHeight + 25 m — a storm column); vortex-form
// monsters rain from their funnel top; no rain in The Haven
// (sanctuary); no rain from Korus or Ghorrum (exempt — see
// elemental-aura.js isExemptSource); mounted monsters rain
// nothing; streaks stop at the ground (they respawn at the top
// of their own cylinder on the next step).
//
// VISUAL ONLY — HELD, NOT BUILT: the ambient rain tick
// (1 HP / 2 s per element type present) is HELD for Merlin's
// word. This module carries NO damage or tick function for rain
// of any kind. The aura strikes in elemental-aura.js are the
// damage; rain is the visible pressure. Do not add an ambient
// tick here without Merlin's explicit go.

import { ELEMENT_AURA, auraRowFor, isExemptSource } from './elemental-aura.js';
import { PROJECTILE_STYLE } from './monster-projectiles.js';

// Rain numbers — worker's call (audit §3b), stated plainly.
export const RAIN_STREAKS_PER_MONSTER = 40;
export const RAIN_MAX_STREAKS = 600;
export const RAIN_FALL_SPEED_M_S = 22;
export const RAIN_HEIGHT_M = 25;
export const RAIN_STREAK_LENGTH_M = 2; // rendered streak length, worker's call

/** The rain colour for an element (its PROJECTILE_STYLE hex), or null for an unknown element. */
export function rainColorFor(element) {
  const style = PROJECTILE_STYLE[element];
  return style ? style.color : null;
}

/**
 * True when a monster record is a rain source: alive, active,
 * unmounted, not exempt (Korus/Ghorrum), carrying a known
 * element. Dead monsters rain nothing; the Haven is handled by
 * rainFor's observer check, not here.
 */
export function isRainSource(monster) {
  if (!monster) return false;
  if (monster.dead) return false;
  if (monster.active === false) return false;
  if (monster.mounted) return false;
  if (isExemptSource(monster)) return false;
  return auraRowFor(monster.element) != null;
}

/** Ground height under a monster (0 when the record carries no y / groundY). */
export function rainGroundY(monster) {
  if (monster == null) return 0;
  if (typeof monster.groundY === 'number') return monster.groundY;
  return 0;
}

/**
 * Base height a monster's rain falls from, before the +25 m
 * column: flyers use their flight height (flyHeight / y), vortex
 * forms use their funnel top (funnelTopY / vortexTopY), everyone
 * else the ground.
 */
export function rainBaseY(monster) {
  const groundY = rainGroundY(monster);
  if (typeof monster.funnelTopY === 'number') return monster.funnelTopY;
  if (typeof monster.vortexTopY === 'number') return monster.vortexTopY;
  if (monster.vortex === true || monster.role === 'vortex') return groundY + 6;
  if (typeof monster.flyHeight === 'number') return groundY + monster.flyHeight;
  if (typeof monster.y === 'number' && monster.y > groundY) return monster.y;
  return groundY;
}

/** Top of a monster's rain column: base height + 25 m. */
export function rainTopY(monster) {
  return rainBaseY(monster) + RAIN_HEIGHT_M;
}

// Deterministic per-streak placement: a tiny string hash of the
// monster id + streak index, so the same field renders the same
// rain every frame and tests can pin exact positions. No
// Math.random here — the wiring worker must not get a different
// column on every call.
export function rainHash(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function streakFor(monster, index, radiusM, groundY, topY) {
  const id = monster.id || monster.type || 'monster';
  const a = rainHash(`${id}:a:${index}`) * Math.PI * 2;
  // sqrt distribution so streaks spread evenly over the disc, not piled at the centre.
  const r = Math.sqrt(rainHash(`${id}:r:${index}`)) * radiusM;
  const x = (monster.x || 0) + Math.cos(a) * r;
  const z = (monster.z || 0) + Math.sin(a) * r;
  const y = groundY + rainHash(`${id}:y:${index}`) * (topY - groundY);
  return {
    id: `rain-${id}-${index}`,
    monsterId: id,
    element: monster.element,
    color: rainColorFor(monster.element),
    x, y, z,
    topY,
    groundY,
    lengthM: RAIN_STREAK_LENGTH_M,
    speedMps: RAIN_FALL_SPEED_M_S,
    radiusM,
  };
}

/**
 * Rain for a field of monster records, from an observer's point
 * of view.
 *
 *   rainFor(monsters, observer)
 *   monsters — field records {id, type, element, x, z, ...}
 *   observer — {x, z, inBase} or null. inBase (inside The Haven)
 *     suppresses ALL rain — sanctuary means sanctuary.
 *
 * Returns { cylinders, streaks, totalStreaks, culled, suppressed }:
 * one cylinder per live rain source (radius = its aura radius),
 * ~40 streaks per cylinder, capped at 600 field-wide. The cap
 * keeps the NEAREST cylinders to the observer and culls the
 * farthest first; with no observer, field order is kept (earliest
 * records first). `culled` counts the streaks dropped by the cap.
 */
export function rainFor(monsters, observer = null) {
  if (observer && observer.inBase) {
    return { cylinders: [], streaks: [], totalStreaks: 0, culled: 0, suppressed: true };
  }
  const list = Array.isArray(monsters) ? monsters : [];
  const sources = list.filter(isRainSource);
  const withDist = sources.map((m) => {
    const dx = observer ? (m.x || 0) - (observer.x || 0) : 0;
    const dz = observer ? (m.z || 0) - (observer.z || 0) : 0;
    return { m, dist: observer ? Math.hypot(dx, dz) : 0 };
  });
  // Nearest first when an observer is known (farthest culled
  // first under the cap); field order otherwise.
  if (observer) withDist.sort((a, b) => a.dist - b.dist);
  const cylinders = [];
  const streaks = [];
  let culled = 0;
  for (const { m } of withDist) {
    const row = ELEMENT_AURA[m.element];
    const radiusM = row.radiusM;
    const groundY = rainGroundY(m);
    const topY = rainTopY(m);
    const cylinder = {
      monsterId: m.id || m.type || 'monster',
      element: m.element,
      color: rainColorFor(m.element),
      x: m.x || 0,
      z: m.z || 0,
      radiusM,
      topY,
      groundY,
      streakCount: RAIN_STREAKS_PER_MONSTER,
    };
    for (let i = 0; i < RAIN_STREAKS_PER_MONSTER; i++) {
      if (streaks.length >= RAIN_MAX_STREAKS) {
        culled++;
        continue;
      }
      streaks.push(streakFor(m, i, radiusM, groundY, topY));
    }
    cylinder.streakCount = streaks.filter((s) => s.monsterId === cylinder.monsterId).length;
    cylinders.push(cylinder);
  }
  return { cylinders, streaks, totalStreaks: streaks.length, culled, suppressed: false };
}

/**
 * Advance rain streaks one step: each streak falls 22 m/s; a
 * streak that reaches the ground respawns at the top of its own
 * cylinder (same x/z — the column holds its shape). Returns a
 * NEW array (does not mutate). `groundHeight` maps (x, z) to
 * ground height when the terrain is not flat; defaults to the
 * streak's own groundY.
 */
export function advanceRainStreaks(streaks, dt, groundHeight = null) {
  const step = Math.max(dt || 0, 0);
  const list = Array.isArray(streaks) ? streaks : [];
  return list.map((s) => {
    const groundY = groundHeight ? groundHeight(s.x, s.z) : s.groundY;
    let y = s.y - RAIN_FALL_SPEED_M_S * step;
    if (y <= groundY) y = s.topY;
    return { ...s, y, groundY };
  });
}

// Same step function under the shorter name the wiring worker may prefer.
export const advanceRain = advanceRainStreaks;
