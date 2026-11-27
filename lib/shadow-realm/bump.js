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
/**
 * FLY-OFF (race + bump modes): a bumped victim is launched off the bike,
 * tumbles through the air, and respawns AT THE PRE-HIT POSITION — the pose
 * captured at the moment of impact, not the nearest safe point (that
 * respawn belongs to trail deaths). No life lost for a fly-off in either
 * mode; lives are only lost to flame / trail deaths.
 * Ballistics: vertical pop FLY_UP_SPEED against FLY_GRAVITY gives
 * FLY_SECS = 2*up/g seconds of air; the bike tumbles FLY_SPIN_TURNS full
 * rolls in that window. Horizontal drift rides the victim's post-impact
 * velocity, so a hard ram throws the rider further.
 */
export const FLY_UP_SPEED = 9;
/** Downward acceleration (m/s^2) during a fly-off. */
export const FLY_GRAVITY = 20;
/** Airborne seconds: 2 * FLY_UP_SPEED / FLY_GRAVITY (0.9 s). */
export const FLY_SECS = (2 * FLY_UP_SPEED) / FLY_GRAVITY;
/** Full tumble rolls over one flight. */
export const FLY_SPIN_TURNS = 1.5;

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
 * bumpVictim(a, b) — who got rammed? a, b: { x, z, vx, vz }.
 * The bumper is the bike moving faster TOWARD the other along the contact
 * normal (a->b); the other is the victim. Returns 'a' | 'b' | 'both':
 * near-equal approach speeds (within 0.5 m/s — a head-on) demolish both.
 * Pure geometry, symmetric: both clients in a PvP hit compute the same
 * victim from the same beacon velocities.
 */
export function bumpVictim(a, b) {
  const dx = (b.x || 0) - (a.x || 0);
  const dz = (b.z || 0) - (a.z || 0);
  const d = Math.hypot(dx, dz) || 1;
  const nx = dx / d;
  const nz = dz / d;
  const aToward = (a.vx || 0) * nx + (a.vz || 0) * nz; // a's speed toward b
  const bToward = -((b.vx || 0) * nx + (b.vz || 0) * nz); // b's speed toward a
  const diff = aToward - bToward;
  if (Math.abs(diff) <= 0.5) return 'both';
  return diff > 0 ? 'b' : 'a';
}

/**
 * startFly({ x, z, heading, vx, vz }) -> fly state for a bump victim.
 * x/z/heading are the pre-hit pose (the respawn point); vx/vz is the
 * victim's post-impact horizontal velocity (the launch drift). t starts
 * at 0; dur is FLY_SECS.
 */
export function startFly({ x, z, heading, vx, vz }) {
  return {
    t: 0,
    dur: FLY_SECS,
    x0: Number(x) || 0,
    z0: Number(z) || 0,
    heading0: Number(heading) || 0,
    vx: Number(vx) || 0,
    vz: Number(vz) || 0,
  };
}

/**
 * flyPose(fly, t) -> { x, z, y, roll, heading, done } at t seconds into
 * the flight. Ballistic arc (up, then gravity back to y=0) + a steady
 * tumble roll (FLY_SPIN_TURNS full rolls over the flight). Heading stays
 * the pre-hit heading — the bike flips on its roll axis, it doesn't yaw.
 * y is clamped at 0 (the bike never sinks below the ground) and k at 1.
 */
export function flyPose(fly, t) {
  const tt = Number.isFinite(t) ? Math.max(0, t) : 0;
  const dur = (fly && Number(fly.dur) > 0 ? fly.dur : FLY_SECS) || FLY_SECS;
  const k = Math.min(1, tt / dur);
  const y = Math.max(0, FLY_UP_SPEED * tt - 0.5 * FLY_GRAVITY * tt * tt);
  return {
    x: (fly?.x0 || 0) + (fly?.vx || 0) * tt,
    z: (fly?.z0 || 0) + (fly?.vz || 0) * tt,
    y,
    roll: FLY_SPIN_TURNS * Math.PI * 2 * k,
    heading: fly?.heading0 || 0,
    done: tt >= dur,
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
