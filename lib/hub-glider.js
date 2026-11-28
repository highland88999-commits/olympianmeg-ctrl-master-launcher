// lib/hub-glider.js — the hub solar-sail glider, pure logic.
//
// The Jupiter 2 speeder contract (lib/jupiter2/speeder.js), on the
// hub: summon materialises the craft and AUTO-MOUNTS it; dismount
// puts the rider exactly where the craft was and the craft VANISHES
// (summon again for a fresh one). The hub bike parks — the glider
// does NOT copy the bike; it copies the speeder (Merlin, Nov 27,
// 2026: dismount = despawn, no parked glider, no /api/rider/state
// write — that store is the bike's park-position store).
//
// The hub has no walker, so the summon anchor is the CAMERA pose:
// the glider appears ahead of the user and auto-mounts. The scene
// owns the camera, so it computes the anchor (camera position +
// forward × GLIDER_SPAWN_AHEAD, yaw = camera yaw + π — the bike's
// camera relation: a mounted camera reads rotation.y = π + yaw).
// This module only decides the state transitions, never the pose.

import { createMountConfig, mountSpot } from './mounting.js';
import { GLIDER_TUNING } from './hub-glider-flight.js';

/** How far ahead of the camera the glider materialises (hub units). */
export const GLIDER_SPAWN_AHEAD = 12;

/**
 * The glider's mount config (the shared mounting shape —
 * lib/mounting.js — this mount's own numbers). A SUMMON mount: the
 * button calls it from anywhere, so there is no walk-up prompt —
 * promptRangeM keeps the reference 4, unused. The seat fractions
 * keep the reference defaults, unused: the rider is a posed figure
 * on the board, not a seated horse rider — the seat is the board
 * itself, and the third-person camera is lib/hub-glider-camera.js.
 * The ride speed is the flight tuning's cruise, read straight from
 * the tuning so the config can never drift from the flight model.
 */
export const GLIDER_MOUNT_CONFIG = createMountConfig({
  rideSpeedMps: GLIDER_TUNING.maxSpeed, // 110 — hub scene units
  seatYawOffset: 0, // the glider model faces +Z and the rider faces its nose: no +PI turn
  mountHeightM: 1.15,
});
// Dismount puts the rider at the craft's exact place and the craft
// VANISHES — the shared validator only accepts a positive flank
// distance, so the side is recorded as 0 here (exact place).
GLIDER_MOUNT_CONFIG.dismountSideM = 0;

/** Fresh per-user glider state: nothing summoned, on foot. */
export function createGliderState() {
  return {
    summoned: false,
    mounted: false,
    pos: { x: 0, y: 0, z: 0 },
    yaw: 0,
    speed: 0,
    variant: null,
  };
}

/**
 * Summon the glider at the anchor pose and auto-mount it (the
 * speeder's rule: summoning puts you ON it). Returns true.
 * anchor: { x, y, z, yaw } — the glider's spawn pose, computed by
 * the scene from the camera (GLIDER_SPAWN_AHEAD ahead of it).
 * variant: a glider variant id (lib/hub-glider-variants.js), or
 * null for the default — recorded so the scene builds the right mesh.
 */
export function summonGlider(state, anchor, variant = null) {
  state.summoned = true;
  state.mounted = true;
  state.pos = { x: anchor.x, y: anchor.y, z: anchor.z };
  state.yaw = anchor.yaw || 0;
  state.speed = 0;
  state.variant = variant || null;
  return true;
}

/** Dismiss the glider without moving the rider. */
export function dismissGlider(state) {
  state.summoned = false;
  state.mounted = false;
  state.speed = 0;
  return false;
}

/**
 * Dismount: the rider takes the glider's exact place (mountSpot —
 * the shared module's "the mount's own position", not a flank
 * dismount: dismountSideM is 0 for this mount) and the glider
 * VANISHES (the speeder's rule). Returns the rider's new pose
 * { x, y, z, yaw } — the scene plants the first-person camera there.
 */
export function dismountGlider(state) {
  // The glider state nests its position under pos — hand mountSpot
  // the {x, z} handle it reads (the speeder's state carries x/z at
  // the top level, so it can pass itself directly; this one cannot).
  const spot = mountSpot({ x: state.pos.x, z: state.pos.z });
  const pose = { x: spot.x, y: state.pos.y, z: spot.z, yaw: state.yaw };
  state.summoned = false;
  state.mounted = false;
  state.speed = 0;
  return pose;
}
