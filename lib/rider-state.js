// lib/rider-state.js
// Per-account rider persistence for the hub's TRON bike.
//
// - Pure helpers (nextFlightAxis, dismountPosition, isValidSavedState):
//   headless-testable, no three.js.
// - Client fetch wrappers (fetchRiderState, saveRiderState): talk to
//   /api/rider/state with the Supabase access token as a Bearer header.
//   The server derives user_id from that token (requireUser) — the client
//   NEVER asserts identity and never writes to Supabase directly.

import { rotateOffsetByYaw } from './bike-flight.js';

/** How far to the bike's right the rider is placed on dismount (bike nose is +Z at yaw 0). */
export const DISMOUNT_SIDE = 3.4;
/** Rider eye height above the bike's hover point when standing beside it. */
export const DISMOUNT_EYE = 1.7;
/** Realms a rider_state row may name. The hub is the only rideable realm today. */
export const RIDER_REALMS = ['hub'];

/** The FLIGHT AXIS toggle state machine: horizontal <-> vertical. */
export function nextFlightAxis(axis) {
  return axis === 'horizontal' ? 'vertical' : 'horizontal';
}

/**
 * Where the rider stands on dismount: right BESIDE the bike, offset from
 * the bike's CURRENT position/yaw — never a default spawn point.
 * Pure: does not mutate bikePos.
 */
export function dismountPosition(bikePos, yaw = 0, side = DISMOUNT_SIDE, eye = DISMOUNT_EYE) {
  const off = rotateOffsetByYaw({ x: side, y: 0, z: 0 }, yaw);
  return {
    x: bikePos.x + off.x,
    y: bikePos.y + eye,
    z: bikePos.z + off.z,
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
