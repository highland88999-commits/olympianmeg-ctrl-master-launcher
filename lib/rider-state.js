// lib/rider-state.js
// Per-account rider persistence for the hub's TRON bike.
//
// - Pure helpers (nextFlightAxis, dismountPosition, isValidSavedState):
//   headless-testable, no three.js.
// - Client fetch wrappers (fetchRiderState, saveRiderState): talk to
//   /api/rider/state with the Supabase access token as a Bearer header.
//   The server derives user_id from that token (requireUser) — the client
//   NEVER asserts identity and never writes to Supabase directly.

import {
  createMountConfig,
  dismountSpot as sharedDismountSpot,
} from './mounting.js';
import { BIKE_TUNING } from './hub-layout.js';

/** How far to the bike's right the rider is placed on dismount (bike nose is +Z at yaw 0). */
export const DISMOUNT_SIDE = 3.4;
/** Rider eye height above the bike's hover point when standing beside it. */
export const DISMOUNT_EYE = 1.7;
/** Realms a rider_state row may name. The hub is the only rideable realm today. */
export const RIDER_REALMS = ['hub'];

/**
 * The hub bike's mount config (the shared mounting shape —
 * lib/mounting.js — this mount's own numbers). The hub bike is a
 * BUTTON mount: the single RIDE button (Merlin 2026-10-12: one
 * ride button only) or the Concourse tile mounts from anywhere,
 * so there is no walk-up prompt — promptRangeM keeps the
 * reference 4, unused (nearestMountInRange is never called for
 * it). The seat fractions keep the reference defaults, unused:
 * the rider is a camera, not a posed figure — the seat is
 * RIDER_OFFSET in lib/god-orbits.js, the camera's rider seat.
 * The ride speed is the flight tuning's cruise (hub scene units,
 * not metres — the hub is a space scene with no ground to
 * measure against), read straight from the tuning so the config
 * can never drift from the flight model.
 */
export const HUB_BIKE_MOUNT_CONFIG = createMountConfig({
  rideSpeedMps: BIKE_TUNING.maxSpeed, // 150 — hub scene units
  dismountSideM: DISMOUNT_SIDE, // 3.4 — beside the bike, never a default spawn
  seatYawOffset: 0, // the bike model faces +Z and the rider faces its nose: no +PI turn
});

/** The FLIGHT AXIS toggle state machine: horizontal <-> vertical. */
export function nextFlightAxis(axis) {
  return axis === 'horizontal' ? 'vertical' : 'horizontal';
}

/**
 * Where the rider stands on dismount: right BESIDE the bike, offset from
 * the bike's CURRENT position/yaw — never a default spawn point.
 * Pure: does not mutate bikePos. The flank spot is the shared
 * module's dismountSpot (the same math rotateOffsetByYaw did here,
 * now the shared module's); the eye height is the hub's own — the
 * shared module is ground-plane x/z, the hub floats, so y stays
 * bike + eye.
 */
export function dismountPosition(bikePos, yaw = 0, side = DISMOUNT_SIDE, eye = DISMOUNT_EYE) {
  const spot = sharedDismountSpot(
    { x: bikePos.x, z: bikePos.z, yaw },
    { ...HUB_BIKE_MOUNT_CONFIG, dismountSideM: side },
  );
  return {
    x: spot.x,
    y: bikePos.y + eye,
    z: spot.z,
  };
}

/** Sanity-check a row read back from the API before trusting it for a spawn. */
export function isValidSavedState(s) {
  return (
    !!s &&
    Number.isFinite(s.x) &&
    Number.isFinite(s.y) &&
    Number.isFinite(s.z) &&
    typeof s.realm === 'string' &&
    RIDER_REALMS.includes(s.realm)
  );
}

/**
 * Load the caller's saved rider state. Returns the row ({x,y,z,realm}) or
 * null when there is none / the cloud is offline / anything fails.
 */
export async function fetchRiderState(getToken) {
  try {
    const token = await getToken();
    if (!token) return null;
    const res = await fetch('/api/rider/state', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = await res.json();
    return isValidSavedState(body && body.state) ? body.state : null;
  } catch {
    return null;
  }
}

/**
 * Persist the rider's dismount position server-side. Fire-and-forget safe:
 * resolves true on save, false otherwise — never throws.
 */
export async function saveRiderState(pos, getToken, realm = 'hub') {
  try {
    const token = await getToken();
    if (!token) return false;
    const res = await fetch('/api/rider/state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ x: pos.x, y: pos.y, z: pos.z, realm }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
