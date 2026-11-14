// lib/earth2/parcel-shrink.js
// EARTH 2 — PARCEL SHRINK (Merlin, 2026-11-13):
//
// "When a user enters a parcel that is owned, they shrink to fit
// that world and upon exiting they grow back to normal size."
//
// OWNED parcels only — Free Commons never shrink anyone. The
// shrink is a property of the parcel underfoot, not of the user:
// anyone who walks into a titled parcel shrinks, visitor or
// title-holder alike, and anyone who walks out grows back.
//
// What shrinks, consistently, by one factor (PARCEL_SHRINK_SCALE):
//   - the walker: eye height, walk/travel speed, collision radius
//     (so a shrunken walker still fits through their own shrunken
//     doors — the door sector math reads the scaled radius)
//   - the objects the user built on that parcel: every placed
//     piece renders at the shrunken scale while the walker is
//     inside that parcel, INCLUDING pieces placed before this law
//     existed (Merlin's base E2-0619 included — no migration, the
//     scale is applied at render time from the live state)
//   - the build ghost and the build orbit distance, so placing a
//     piece while shrunken shows exactly what the finished piece
//     will look like ("adjust the building parcel squares
//     accordingly")
//
// What does NOT shrink: the world itself (terrain, trees, dinos,
// landmarks stay full size — that is the point: the parcel reads
// as a whole world), vehicles (a parked Lambo stays world size;
// boarding is position-based, so a shrunken walker still boards),
// the grapple's physics (the pull is real velocity in world
// metres; only the hook's eye origin scales with the walker),
// or the parcel's 28 m build frame (pieces stay parcel-local;
// only their rendered size changes).
//
// The transition is hysteretic: the walker must be SHRINK_EDGE_M
// inside a parcel before it becomes current, so standing on the
// border can never flicker the scale. Leaving restores normal
// size EXACTLY (scale 1, eye 1.7 m, speed 6 m/s, radius 0.55 m)
// — never a near-1 drift.
//
// Pure and deterministic: no imports from the scene, no THREE, no
// DOM. The scene (components/earth2/Earth2World.jsx) owns the
// live state and calls nextShrinkState once a frame.

import {
  parcelAtWorld,
  parcelWorldRect,
  WALK_EYE_M,
  WALK_SPEED_MPS,
  TRAVEL_SPEED_MPS,
  WALKER_RADIUS_M,
} from './world.js';

/** The shrink factor: a shrunken walker is a quarter of normal size. */
export const PARCEL_SHRINK_SCALE = 0.25;

/** Normal size, exactly — the exit state. */
export const NORMAL_SCALE = 1;

/** Hysteresis band at a parcel border: the walker must be this far
 *  inside a parcel before it becomes current. Standing on the line
 *  keeps the previous state, so the scale can never flicker. */
export const SHRINK_EDGE_M = 0.5;

/**
 * The owner row for a parcel, from the scene's owners map (a Map
 * keyed by parcel id, or a plain object). Null when the parcel has
 * no title row — including while titles are still loading, which
 * reads as "not owned" (safe: normal size until proven owned).
 */
export function ownerRowForParcel(owners, parcelId) {
  if (!owners || typeof parcelId !== 'string') return null;
  if (typeof owners.get === 'function') return owners.get(parcelId) || null;
  return owners[parcelId] || null;
}

/** True when the parcel carries a land title (an owner row). */
export function isOwnedParcel(parcel, owners) {
  if (!parcel || typeof parcel.id !== 'string') return false;
  return !!ownerRowForParcel(owners, parcel.id);
}

/** The scale for standing on this parcel: shrunken when owned, 1 otherwise. */
export function shrinkScaleForParcel(parcel, owners) {
  return isOwnedParcel(parcel, owners) ? PARCEL_SHRINK_SCALE : NORMAL_SCALE;
}

/** Walker eye height at a scale (1.7 m normal, 0.425 m shrunken). */
export function walkerEyeM(scale) {
  return WALK_EYE_M * (Number(scale) || 0);
}

/** Walker ground speed at a scale (walk 6 m/s, travel 26 m/s, both scaled). */
export function walkerSpeedMps(scale, travel = false) {
  return (travel ? TRAVEL_SPEED_MPS : WALK_SPEED_MPS) * (Number(scale) || 0);
}

/** Walker collision radius at a scale (0.55 m normal, 0.1375 m shrunken). */
export function walkerRadiusM(scale) {
  return WALKER_RADIUS_M * (Number(scale) || 0);
}

/**
 * The render scale for a built piece on a parcel, given the live
 * shrink state { parcelId, scale }: shrunken only when the piece
 * stands on the parcel the walker is currently shrunk inside.
 * Every other parcel's pieces render at full size.
 */
export function buildPieceScale(parcelId, shrinkState) {
  if (!shrinkState || shrinkState.scale === NORMAL_SCALE) return NORMAL_SCALE;
  if (typeof parcelId !== 'string' || !shrinkState.parcelId) return NORMAL_SCALE;
  return parcelId === shrinkState.parcelId ? PARCEL_SHRINK_SCALE : NORMAL_SCALE;
}

/**
 * The shrink state machine — one pure step per frame.
 * prev: { parcelId, scale } | null. x/z: the walker's position.
 * owners: the scene's owners map.
 * Returns { parcelId, scale, changed }.
 *
 *   - First call (no prev): the parcel underfoot becomes current
 *     at once, no hysteresis — a spawn inside an owned parcel
 *     starts shrunken.
 *   - Same parcel: only the scale can change (titles arriving
 *     late flip an unowned parcel to owned) — applied at once.
 *   - New parcel: the walker must be SHRINK_EDGE_M inside the new
 *     parcel's rect before it becomes current; standing in the
 *     dead band keeps the previous state, so the scale never
 *     flickers on the border. The parcel id changing (even between
 *     two owned parcels) counts as changed, so the built pieces
 *     re-scale to the new parcel.
 */
export function nextShrinkState(prev, x, z, owners) {
  const parcel = parcelAtWorld(x, z);
  const targetScale = shrinkScaleForParcel(parcel, owners);
  if (!prev || typeof prev.parcelId !== 'string') {
    return { parcelId: parcel.id, scale: targetScale, changed: true };
  }
  if (parcel.id === prev.parcelId) {
    if (targetScale !== prev.scale) {
      return { parcelId: prev.parcelId, scale: targetScale, changed: true };
    }
    return { parcelId: prev.parcelId, scale: prev.scale, changed: false };
  }
  const rect = parcelWorldRect(parcel);
  const inside =
    x >= rect.minX + SHRINK_EDGE_M && x <= rect.maxX - SHRINK_EDGE_M &&
    z >= rect.minZ + SHRINK_EDGE_M && z <= rect.maxZ - SHRINK_EDGE_M;
  if (!inside) return { parcelId: prev.parcelId, scale: prev.scale, changed: false };
  return { parcelId: parcel.id, scale: targetScale, changed: true };
}
