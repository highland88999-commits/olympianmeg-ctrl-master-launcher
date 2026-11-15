// lib/afterlife/guide.js
// SOUL-GUIDING (Merlin, Nov 15 ~02:15, green-lit purposes list,
// tranche 1: the design spine) — the EARN side of the soul loop.
//
// A soul in its 7-day fade is guidable: find one, walk it to the
// river bank, and its soul banks for you when it rests. That banked
// soul is what the Lake of Fire consumes.
//
// The law is the operators' own (lib/afterlife/operators.js):
// lifeFor(realm, kind, cellKey, now) is pure and deterministic —
// the same (realm, soul, clock) always returns the same life — so
// the SERVER can re-verify a guide: it recomputes the life and
// only credits a soul that is genuinely fading, in the generation
// the client saw. The idempotency key carries the generation, so
// the next soul in the same cell can be guided again later but the
// same fading soul can never bank twice.
//
// Pure functions only. The scene owns the follow animation; this
// module owns the rules (who is guidable, when the guide breaks,
// when the bank lands).

import { lifeFor, speciesFor } from './operators.js';

// How close you must stand to a fading soul to take its hand.
export const GUIDE_RANGE_M = 6;
// How far the guided soul may fall behind before it loses you.
export const GUIDE_BREAK_M = 15;
// How close to a bank line the delivery lands (|z - ±18|).
export const GUIDE_BANK_DIST_M = 4;
// The guided soul follows at this speed (foot walk is 8 m/s in
// Hell — 9 keeps up with a walk, falls behind a run, which is the
// honest shape: run off and the soul loses you).
export const GUIDE_FOLLOW_SPEED_MPS = 9;

/** The fading souls among a realm's creatures at the device clock. */
export function fadingSoulsFor(realmKey, creatures, nowMs) {
  const rec = speciesFor(realmKey);
  if (!rec || !Array.isArray(creatures)) return [];
  const out = [];
  for (const c of creatures) {
    if (!c || typeof c.id !== 'string') continue;
    const life = lifeFor(realmKey, rec.kind, c.id, nowMs, { x: c.x, z: c.z });
    if (!life || life.state !== 'fading') continue;
    out.push({ id: c.id, x: c.x, z: c.z, generation: life.generation, fadeFraction: life.decompFraction, stageName: life.decompStageName });
  }
  return out;
}

/** The nearest fading soul within guide range of the player, or null. */
export function nearestGuidable(realmKey, creatures, px, pz, nowMs) {
  const fading = fadingSoulsFor(realmKey, creatures, nowMs);
  let best = null;
  let bestD = GUIDE_RANGE_M;
  for (const s of fading) {
    const d = Math.hypot(s.x - px, s.z - pz);
    if (d <= bestD) { best = s; bestD = d; }
  }
  return best;
}

/** Has the guided soul fallen too far behind? (The guide breaks.) */
export function guideBroken(px, pz, gx, gz) {
  return Math.hypot(px - gx, pz - gz) > GUIDE_BREAK_M;
}

/**
 * Is the player standing at a river bank? The bank is either edge
 * of the band (z = ±18 in every realm) — within 4 m of the line,
 * on either side. Mid-bridge (deep in the band) is not the bank.
 */
export function bankAt(river, x, z) {
  if (!river || typeof x !== 'number' || typeof z !== 'number') return false;
  const dMin = Math.abs(Math.abs(z) - Math.abs(river.zMin));
  const dMax = Math.abs(Math.abs(z) - Math.abs(river.zMax));
  return Math.min(dMin, dMax) <= GUIDE_BANK_DIST_M;
}

/** One follow step: move the guided soul toward the player. */
export function followStep(gx, gz, px, pz, speed, dt) {
  const dx = px - gx;
  const dz = pz - gz;
  const d = Math.hypot(dx, dz);
  if (d <= 0.01) return { x: gx, z: gz, dist: d, arrived: true };
  const step = Math.min(d, Math.max(0, speed) * Math.max(0, dt));
  return { x: gx + (dx / d) * step, z: gz + (dz / d) * step, dist: d - step, arrived: step >= d };
}

/** Idempotency key for banking one fading soul (generation-bound). */
export function guideIdemKey(realmKey, soulId, generation) {
  return `guide:${realmKey}:${soulId}:g${Math.floor(Number(generation)) || 0}`;
}
