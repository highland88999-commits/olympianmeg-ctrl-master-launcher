// lib/shadow-realm/bump.js
// Pure bumper-bike battle math for SHADOW REALM "BUMP RACE" (Merlin 2026-10-03).
// Headless-testable — no I/O, no Three.js, no framework.
//
// CONCEPT: a long ring track around an eternal flame. Bumper cars — shove
// rivals; don't get bumped INTO the flame. 3 lives per race.
//
// This module owns ONLY the math. The scene Rig (app/shadow-realm/scene.jsx)
// applies it per frame; AI steering extensions live in app/shadow-realm/ai.js.
// Bikes stay GHOST everywhere else — bump collision exists only in BUMP RACE.

import { closestOnPolyline } from '../../app/shadow-realm/race.js';

/** Lives per rider per bump race. */
export const BUMP_LIVES = 3;
/** Bike collision radius (world units) — circle-circle. */
export const BUMP_RADIUS = 1.7;
/** Restitution for bike-vs-bike: bouncy, bumper-car feel. */
export const BUMP_RESTITUTION = 0.85;
/** Seconds of bump immunity after being hit — no stunlock. */
export const BUMP_IMMUNITY_S = 0.5;
/** Seconds of invulnerability after a flame respawn (blinking bike). */
export const RESPAWN_INVULN_S = 2.0;
/** Boost-meter reward (0..1) per clean hit landed. */
export const BUMP_BOOST_REWARD = 0.25;
/** Knock-velocity decay rate (1/s) — shoves fade, control returns. */
export const KNOCK_DECAY = 3.0;
/** Player mass vs bot mass in bump resolution. */
export const PLAYER_MASS = 1.0;
export const BOT_MASS = 1.25;
/** Bot aggression default for bump mode (0..1). */
export const BOT_AGGRESSION = 0.55;
/** How far inward (world units) an aggressive bot aims past the player's line. */
export const SHOVE_DEPTH = 4.0;
/** Arclength window (world units) inside which a bot engages the player. */
export const BUMP_ENGAGE_S = 42;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * resolveBump(a, b, restitution) — elastic circle-circle collision.
 * a, b: { x, z, vx, vz, mass }. radius = BUMP_RADIUS both.
 * Returns { hit, ax, az, avx, avz, bx, bz, bvx, bvz, impact } where impact
 * is the impulse magnitude (0 when merely separating). Inputs untouched.
 * Positional correction splits overlap by inverse mass; the impulse runs
 * along the contact normal scaled by closing speed — head-on swaps the
 * normal components, sideswipes only bite the normal part.
 */
export function resolveBump(a, b, restitution = BUMP_RESTITUTION) {
  const noHit = {
    hit: false,
    ax: a.x, az: a.z, avx: a.vx, avz: a.vz,
    bx: b.x, bz: b.z, bvx: b.vx, bvz: b.vz,
    impact: 0,
  };
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const minDist = BUMP_RADIUS * 2;
  if (!(dist < minDist) || dist < 1e-6) return noHit;
  const nx = dx / dist;
  const nz = dz / dist;

  const ma = a.mass > 0 ? a.mass : 1;
  const mb = b.mass > 0 ? b.mass : 1;
  const invA = 1 / ma;
  const invB = 1 / mb;
  const invSum = invA + invB;

  // Positional correction: push apart along the normal, split by mass.
  const overlap = minDist - dist;
  const ax = a.x - nx * overlap * (invA / invSum);
  const az = a.z - nz * overlap * (invA / invSum);
  const bx = b.x + nx * overlap * (invB / invSum);
  const bz = b.z + nz * overlap * (invB / invSum);

  // Impulse along the normal, only when closing.
  const rvx = b.vx - a.vx;
  const rvz = b.vz - a.vz;
  const vrel = rvx * nx + rvz * nz;
  if (vrel >= 0) {
    return { ...noHit, hit: true, ax, az, bx, bz };
  }
  const j = (-(1 + restitution) * vrel) / invSum;
  return {
    hit: true,
    ax, az,
    avx: a.vx - (j * nx * invA),
    avz: a.vz - (j * nz * invA),
    bx, bz,
    bvx: b.vx + (j * nx * invB),
    bvz: b.vz + (j * nz * invB),
    impact: Math.abs(j),
  };
}

/**
 * inFlameZone(pos, flame) — true when the bike is inside the burn radius.
 * flame: { x, z, radius }.
 */
export function inFlameZone(pos, flame) {
  if (!pos || !flame) return false;
  const dx = pos.x - flame.x;
  const dz = pos.z - flame.z;
  return Math.hypot(dx, dz) < flame.radius;
}

/**
 * lateralOffset(pos, center, flame) — signed lateral offset from the
 * centerline: POSITIVE = outward (away from the flame), NEGATIVE = toward
 * the flame. Pure geometric; works on any track with a flame anchor.
 */
export function lateralOffset(pos, center, flame) {
  const near = closestOnPolyline(pos, center);
  const ox = pos.x - near.point.x;
  const oz = pos.z - near.point.z;
  const ix = (flame?.x ?? 0) - near.point.x;
  const iz = (flame?.z ?? 0) - near.point.z;
  const il = Math.hypot(ix, iz) || 1;
  // dot((pos-point), (flame-point)): >0 means pos is flame-ward.
  // Negated so + = outward, - = toward the flame.
  return -((ox * ix + oz * iz) / il);
}

/**
 * inwardOffsetSign(trackData, flame) — which SIGN of a bot's lateral offset
 * moves it toward the flame. Determined empirically: pose at s=0 with
 * offset +1 vs -1 and see which lands closer to the flame. Cached on
 * trackData by buildTrackData; robust for any track winding.
 */
export function inwardOffsetSign(trackData, flame) {
  if (!trackData || !trackData.pts || !trackData.pts.length || !flame) return -1;
  const p = trackData.pts[0];
  const i = 0;
  const nx = trackData.tz[i];
  const nz = -trackData.tx[i];
  const dPlus = Math.hypot(p.x + nx - flame.x, p.z + nz - flame.z);
  const dMinus = Math.hypot(p.x - nx - flame.x, p.z - nz - flame.z);
  return dPlus < dMinus ? 1 : -1;
}

/**
 * botBumpTargetOffset({ botOffset, playerOffset, sDelta, aggression,
 *   inwardSign, halfW }) — where an aggressive bot aims its lateral offset.
 * When the player is alongside (|sDelta| < BUMP_ENGAGE_S), the bot steers to
 * a line just INSIDE (flame-ward of) the player's line so the shove pushes
 * the player toward the flame. Otherwise null (keep the wobble line).
 * The result is a target offset; the caller eases toward it and clamps.
 */
export function botBumpTargetOffset({ botOffset, playerOffset, sDelta, aggression, inwardSign, halfW }) {
  const agg = clamp(Number(aggression) || 0, 0, 1);
  if (agg <= 0) return null;
  if (!Number.isFinite(sDelta) || Math.abs(sDelta) > BUMP_ENGAGE_S) return null;
  if (!Number.isFinite(playerOffset)) return null;
  const sign = inwardSign >= 0 ? 1 : -1;
  const target = playerOffset + sign * agg * SHOVE_DEPTH;
  const maxOff = (Number(halfW) || 7) * 0.7;
  return clamp(target, -maxOff, maxOff);
}

/**
 * resolveOuterOnly(pos, vel, center, halfW, flame, restitution) — bump-mode
 * barrier: the OUTER wall stays solid (bounce/deflect, never die); the
 * INNER edge is OPEN — the flame is the hazard. pos/vel are {x,z} pairs.
 * Returns { pos, vel, bounced } with inputs untouched.
 */
export function resolveOuterOnly(pos, vel, center, halfW, flame, restitution = 0.55) {
  const p = { x: pos.x, z: pos.z };
  const v = { x: vel.x, z: vel.z };
  const lat = lateralOffset(pos, center, flame); // + = outward
  if (!(lat > halfW)) {
    return { pos: p, vel: v, bounced: false };
  }
  const near = closestOnPolyline(pos, center);
  let ox = pos.x - near.point.x;
  let oz = pos.z - near.point.z;
  const ol = Math.hypot(ox, oz) || 1;
  ox /= ol;
  oz /= ol;
  const excess = lat - halfW;
  p.x -= ox * excess;
  p.z -= oz * excess;
  const outwardSpeed = v.x * ox + v.z * oz;
  if (outwardSpeed > 0) {
    v.x -= (1 + restitution) * outwardSpeed * ox;
    v.z -= (1 + restitution) * outwardSpeed * oz;
  }
  return { pos: p, vel: v, bounced: true };
}

/**
 * respawnPose(center, pos) — nearest centerline point + forward tangent
 * heading (nose-+Z yaw convention: atan2(dx, dz)). For flame respawns.
 */
export function respawnPose(center, pos) {
  const near = closestOnPolyline(pos, center);
  const n = center.length;
  const a = center[near.segIndex % n];
  const b = center[(near.segIndex + 1) % n];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: near.point.x, z: near.point.z, heading: Math.atan2(dx / l, dz / l) };
}

/** applyLifeLoss(lives) -> lives - 1 (floored at 0). */
export function applyLifeLoss(lives) {
  return Math.max(0, (Number(lives) || 0) - 1);
}

/** isEliminated(lives) — 0 lives = out. */
export function isEliminated(lives) {
  return (Number(lives) || 0) <= 0;
}

/**
 * sortBumpStandings(rows) — bump-mode ranking.
 * rows: { name, color, isPlayer, lives, laps, progress, finishTime }.
 * Order: alive (lives>0) first; then laps desc, lives desc, finishTime asc
 * (nulls last), progress desc. Returns rows with rank 1..n.
 */
export function sortBumpStandings(rows) {
  const rs = (rows || []).map((r) => ({ ...r }));
  const alive = (r) => (Number(r.lives) || 0) > 0;
  rs.sort((a, b) => {
    const aa = alive(a);
    const ba = alive(b);
    if (aa && !ba) return -1;
    if (!aa && ba) return 1;
    const lapD = (Number(b.laps) || 0) - (Number(a.laps) || 0);
    if (lapD !== 0) return lapD;
    const lifeD = (Number(b.lives) || 0) - (Number(a.lives) || 0);
    if (lifeD !== 0) return lifeD;
    const af = a.finishTime != null;
    const bf = b.finishTime != null;
    if (af && bf) return a.finishTime - b.finishTime;
    if (af) return -1;
    if (bf) return 1;
    return (Number(b.progress) || 0) - (Number(a.progress) || 0);
  });
  rs.forEach((r, i) => { r.rank = i + 1; });
  return rs;
}

/**
 * arclengthAt(pos, trackData) — approximate arclength s of the nearest
 * centerline sample. For AI engagement windows (not for lap counting).
 */
export function arclengthAt(pos, trackData) {
  if (!trackData || !trackData.pts || !trackData.pts.length) return 0;
  const near = closestOnPolyline(pos, trackData.pts);
  return (near.segIndex / trackData.n) * trackData.lapLen;
}
