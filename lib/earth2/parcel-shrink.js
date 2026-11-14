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
// MINIATURE FOR EVERYONE (Merlin, 2026-11-14): the stuff built
// on an owned parcel — and the machines parked on it — render
// MINIATURE (0.25x) to EVERYONE, not only to the shrunken
// occupant. A passerby sees a little model base sitting in the
// middle of the 28 m parcel: every built piece and every parked
// vehicle is scaled toward the parcel CENTER, so the whole base
// reads as a ~7 m model in the middle of the parcel. Crossing
// the property line still shrinks the walker to base size; inside,
// walker and base are the same scale (the parcel reads 4x bigger).
//
// What shrinks, consistently, by one factor (PARCEL_SHRINK_SCALE):
//   - the walker: eye height and collision radius (so a shrunken
//     walker still fits through their own shrunken doors — the
//     door sector math reads the scaled radius). SPEED DOES NOT
//     SHRINK (Merlin, 2026-11-14): miniature-mode motion matches
//     normal size — world-relative walk 6 m/s, travel 26 m/s —
//     while the eye stays small. The shrink changes how big the
//     world reads, never how fast you cross it.
//   - the objects built on an owned parcel: every placed piece
//     renders at the shrunken scale with its position scaled
//     toward the parcel center, INCLUDING pieces placed before
//     this law existed (Merlin's base E2-0619 included — no
//     migration, the scale reads the live state). A piece's height
//     scales too, so a roof seated on a wall seats on it instead
//     of floating 3 m up over a 0.75 m wall.
//   - the machines parked on an owned parcel: plane, car and boat
//     alike render at 0.25x at their miniature spot (positions
//     scaled toward the parcel center). Boarding one and leaving
//     the parcel brings rider and machine back to full size
//     together — the scale flips at the property line, the same
//     crossing that restores the walker (the garage ramp exit
//     counts as leaving: the ramp surfaces outside the parcel).
//   - the build ghost and the build orbit distance, so placing a
//     piece while shrunken shows exactly what the finished piece
//     will look like.
//
// What does NOT shrink: the world itself (terrain, trees, dinos,
// landmarks stay full size — that is the point: the parcel reads
// as a whole world), the grapple's physics (the pull is real
// velocity in world metres; only the hook's eye origin scales
// with the walker), or the parcel's 28 m build frame (pieces stay
// parcel-local; only their rendered size changes).
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
  parcelCenterWorld,
  WALK_EYE_M,
  WALK_SPEED_MPS,
  TRAVEL_SPEED_MPS,
  WALKER_RADIUS_M,
} from './world.js';
import { parcelById } from './parcels.js';

/** The shrink factor: a shrunken walker is a quarter of normal size. */
export const PARCEL_SHRINK_SCALE = 0.25;

/** Normal size, exactly — the exit state. */
export const NORMAL_SCALE = 1;

/** Hysteresis band at a parcel border: the walker must be this far
 *  inside a parcel before it becomes current. Standing on the line
 *  keeps the previous state, so the scale never flickers on the border. */
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

/**
 * The miniature scale for a parcel, for EVERY viewer (Merlin,
 * 2026-11-14): built pieces and parked machines on an owned
 * parcel render at 0.25x — a little model in the middle of the
 * parcel — whether the viewer stands inside it (shrunken) or
 * walks past it at full size. Free Commons render at full size.
 */
export function miniatureScaleForParcel(parcelId, owners) {
  if (typeof parcelId !== 'string') return NORMAL_SCALE;
  const parcel = parcelById(parcelId);
  if (!parcel) return NORMAL_SCALE;
  return isOwnedParcel(parcel, owners) ? PARCEL_SHRINK_SCALE : NORMAL_SCALE;
}

/**
 * A world position scaled toward its parcel's center by the
 * parcel's miniature scale: the miniature base clusters at the
 * parcel center, so the whole base reads as one small model.
 * A full-size parcel returns the position unchanged.
 */
export function miniaturePositionForParcel(parcelId, x, z, owners) {
  const scale = miniatureScaleForParcel(parcelId, owners);
  if (scale === NORMAL_SCALE) return { x, z };
  const parcel = parcelById(parcelId);
  if (!parcel) return { x, z };
  const c = parcelCenterWorld(parcel);
  return {
    x: c.x + (x - c.x) * scale,
    z: c.z + (z - c.z) * scale,
  };
}

/** Walker eye height at a scale (1.7 m normal, 0.425 m shrunken). */
export function walkerEyeM(scale) {
  return WALK_EYE_M * (Number(scale) || 0);
}

/**
 * Walker ground speed at a scale (Merlin, 2026-11-14): miniature
 * motion matches normal size — walk 6 m/s, travel 26 m/s — the
 * scale is deliberately NOT applied. A shrunken walker crosses
 * the parcel at the same world speed as a full-size one; only
 * the eye stays small, which is what makes the parcel read big.
 * (With normal speed, a shrunken walker is no longer slower than
 * the predators hunting them — the old chase-speed concern is gone.)
 */
export function walkerSpeedMps(scale, travel = false) {
  return travel ? TRAVEL_SPEED_MPS : WALK_SPEED_MPS;
}

/**
 * The speed multiplier the scene passes to the walker step laws:
 * always 1 — miniature motion is normal-speed motion. Kept as a
 * named law (instead of a bare 1 at the call sites) so the rule
 * is pinned in one place and in tests.
 */
export function walkerMotionSpeedScale() {
  return NORMAL_SCALE;
}

/** Walker collision radius at a scale (0.55 m normal, 0.1375 m shrunken). */
export function walkerRadiusM(scale) {
  return WALKER_RADIUS_M * (Number(scale) || 0);
}

/**
 * The render scale for a built piece on a parcel, given the
 * scene's owners map: miniature on any owned parcel, full size
 * elsewhere — to EVERY viewer, not only the shrunken occupant
 * (Merlin, 2026-11-14). Free Commons have no builds.
 */
export function buildPieceScale(parcelId, owners) {
  return miniatureScaleForParcel(parcelId, owners);
}

/**
 * The render scale for a parked machine: its state's miniature
 * flag (a machine on an owned parcel is miniature; anywhere else
 * it is full size). States written before this law carry no flag
 * and read as full size — the scene migrates them on entry.
 */
export function vehicleScaleFor(state) {
  return state && state.miniature === true ? PARCEL_SHRINK_SCALE : NORMAL_SCALE;
}

/**
 * The scale flip for a DRIVEN machine crossing a property line
 * (Merlin, 2026-11-14): boarding a shrunken machine on a parcel
 * and leaving brings rider and machine back to full size
 * together, and driving a full-size machine onto an owned parcel
 * shrinks it onto the base. Pure: prev is the state before the
 * step, stepped is the state after it (its x/z are the new spot);
 * owners is the scene's owners map. Returns the stepped state,
 * rescaled when the parcel membership changed:
 *   - onto an owned parcel: shrink toward that parcel's center
 *     (x/z pull 4x closer to the center, miniature: true).
 *   - off an owned parcel: restore from the parcel just left
 *     (x/z push 4x away from its center, miniature: false) — the
 *     rider's walker position follows the same rescale (the scene
 *     seats the walker on the stepped state), so rider and machine
 *     grow together at the boundary.
 *   - from one owned parcel straight into another: rebase — restore
 *     from the old center, then shrink toward the new one.
 * The garage ramp exit counts as leaving: the ramp surfaces
 * outside the parcel, so the x/z parcel check catches it.
 */
export function applyVehicleParcelScale(prev, stepped, owners) {
  if (!prev || !stepped || typeof stepped.x !== 'number' || typeof stepped.z !== 'number') {
    return stepped;
  }
  const prevParcel = parcelAtWorld(prev.x, prev.z);
  // COORDINATE LAW: a miniature vehicle's x/z are anchored at
  // its parcel center — the parcel line in miniature coordinates
  // sits at center + (line - center) * 0.25, NOT at the full-size
  // line. Reading parcelAtWorld on the miniature coordinates
  // directly would miss the crossing (the miniature rect sits
  // inside the full-size rect) and then restore the machine
  // metres past the line. So convert the stepped position back
  // to full size through the parcel just left, read the parcel
  // THERE, and only then rescale into the new parcel.
  const c = parcelCenterWorld(prevParcel);
  const steppedFull = prev.miniature === true
    ? { x: c.x + (stepped.x - c.x) / PARCEL_SHRINK_SCALE, z: c.z + (stepped.z - c.z) / PARCEL_SHRINK_SCALE }
    : { x: stepped.x, z: stepped.z };
  const nextParcel = parcelAtWorld(steppedFull.x, steppedFull.z);
  if (nextParcel.id === prevParcel.id) return stepped;
  if (isOwnedParcel(nextParcel, owners)) {
    // Onto an owned parcel: shrink toward its center.
    const nc = parcelCenterWorld(nextParcel);
    return {
      ...stepped,
      miniature: true,
      x: nc.x + (steppedFull.x - nc.x) * PARCEL_SHRINK_SCALE,
      z: nc.z + (steppedFull.z - nc.z) * PARCEL_SHRINK_SCALE,
    };
  }
  // Out into the Commons (or an untitled parcel): grow back to
  // full size, exactly where the full-size step landed — the
  // rider's walker position follows the same rescale (the scene
  // seats the walker on the stepped state), so rider and machine
  // grow together at the boundary. The garage ramp exit counts
  // as leaving: the ramp surfaces outside the parcel, so the
  // x/z parcel check catches it.
  return { ...stepped, miniature: false, x: steppedFull.x, z: steppedFull.z };
}

/**
 * The one-time migration for a parcel-vehicle state written before
 * the miniature law (Merlin, 2026-11-14): a machine with NO
 * miniature flag yet, parked inside its own home parcel, was
 * seeded at full-size coordinates — rescale it toward the parcel
 * center and stamp it miniature. Parcel vehicles only ever exist
 * on owned land, so the home parcel needs no owners lookup. A
 * machine with a flag already (true or false) is never touched,
 * and a machine parked away from its home parcel stays full size.
 * Returns the state (possibly a new object), or the input when
 * nothing applies.
 */
export function migrateParcelVehicleScale(state) {
  if (!state || typeof state.miniature === 'boolean') return state;
  if (typeof state.parcelId !== 'string') return state;
  const parcel = parcelById(state.parcelId);
  if (!parcel) return state;
  const rect = parcelWorldRect(parcel);
  if (state.x < rect.minX || state.x > rect.maxX || state.z < rect.minZ || state.z > rect.maxZ) {
    return state;
  }
  const c = parcelCenterWorld(parcel);
  return {
    ...state,
    miniature: true,
    x: c.x + (state.x - c.x) * PARCEL_SHRINK_SCALE,
    z: c.z + (state.z - c.z) * PARCEL_SHRINK_SCALE,
  };
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
