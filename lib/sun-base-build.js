// lib/sun-base-build.js — BUILDING INSIDE THE SUN BASE (Merlin, Nov 13, 2026).
//
// The Earth 2 build functions, in the sun base: the SAME catalog,
// the SAME placement law, the SAME piece renderer — no copy. The
// sun base is a build surface exactly like a parcel, except the
// "parcel" is the room itself: the build frame is the room's own
// inset floor, and placements live in ROOM space — (0, 0) is one
// corner of the floor, (width, depth) the opposite — so the
// placement law's 0..width frame math holds unchanged. The scene
// centres the room at the origin by translating the build group
// by (-width/2, 0, -depth/2).
//
// The pieces render at the USER'S OWN SCALE (Merlin, Nov 14,
// 2026 — "Objects in solar base are too big"): a 4 m wall is 4 m
// to the shrunken user, the same relative size it would have at
// normal scale — so placements live in USER METRES (the room
// divided by the 0.2 user scale), and the placement law judges
// that world directly: the ghost, the stacking seat, the frame
// bounds and the portal walk-through all agree with the rendered
// piece. The room itself stays full size — only the placed
// pieces shrink. Round-1 builds were stored in room metres;
// they convert on load (× 5, same visual spot, only smaller),
// never by a stored migration. The build surface is the room
// floor; the placement law's support rule keeps every piece held
// up by the floor or by a piece beneath it, never floating, never
// through a wall.
//
// Persistence is device-local (the interior-pick pattern): the
// builds live in localStorage under SUN_BASE_BUILDS_KEY, one
// build per interior (groundType 'sun-base', groundId = assetId),
// merged with upsertBuild from lib/earth2/build-store.js. No
// server mirror yet — /api/earth2/builds is parcel-typed, so a
// sun-base mirror is a separate route Merlin has not ordered.
//
// Pure: no DOM, no React, no THREE — node tests drive this module
// directly (the scene is the only THREE side).

import { SUN_BASE_USER_SCALE } from './sun-base.js';
import { upsertBuild } from './earth2/build-store.js';
import {
  clampPlacementToFrame,
  snapRotation,
  validatePlacementSet,
} from './building/placement.js';
import {
  serializeBuild,
  validatePlacement,
} from './building/catalog.js';

/** Device-local builds storage (the interior-pick pattern). */
export const SUN_BASE_BUILDS_KEY = 'sun-base:builds:v1';

/**
 * THE PIECE SCALE (Merlin, Nov 14, 2026): build pieces inside
 * the sun base render at the user's own scale — one fifth — so
 * they read the size they would at normal scale. The interior
 * itself never shrinks; only the placed pieces do.
 */
export const SUN_BASE_PIECE_SCALE = SUN_BASE_USER_SCALE;

/** The units marker stamped on every sun-base build saved in user metres. */
export const SUN_BASE_BUILD_UNITS = 'user';

const round3 = (n) => Math.round(n * 1000) / 1000 || 0; // || 0: -0 reads as 0

/**
 * The build frame for one interior spec in ROOM metres: the
 * room's own inset floor (the 0.94 inset is the room shell's,
 * same as the walk clamp), capped at the room's own height.
 * Rounded to 3 decimals — the placement law's own precision.
 */
export function sunBaseRoomFrame(spec) {
  return {
    width: round3(spec.widthM * 0.94),
    depth: round3(spec.depthM * 0.94),
    maxY: spec.heightM,
  };
}

/**
 * The build frame the placement law judges against, in USER
 * metres: the room frame divided by the user scale. A 4 m wall
 * is 4 user-metres in a 42.3 user-metre farmhouse floor — the law
 * judges the world the shrunken user actually sees, so a wall
 * the ghost shows as fitting is judged as fitting, and a piece
 * stacked on a wall seats on the wall's rendered top.
 */
export function sunBaseBuildFrame(spec) {
  const room = sunBaseRoomFrame(spec);
  const s = SUN_BASE_USER_SCALE;
  return {
    width: round3(room.width / s),
    depth: round3(room.depth / s),
    maxY: round3(room.maxY / s),
  };
}

/** Room-space offset: the build group sits centred on the origin. */
export function sunBaseBuildOffset(spec) {
  const f = sunBaseRoomFrame(spec);
  return { x: -f.width / 2, z: -f.depth / 2 };
}

/** True when a stored build predates user-metre units (no marker). */
export function sunBaseIsLegacyBuild(build) {
  return !build || build.units !== SUN_BASE_BUILD_UNITS;
}

/**
 * A stored build from the round-1 room-metre units into user
 * metres — no stored migration, the conversion happens on load,
 * and the next save (which already rewrites the whole build)
 * persists the new units.
 *
 * The plan (x/z) converts about the build's own anchor — the
 * centroid of its pieces (the frame corner when empty): the
 * anchor keeps its room spot (× 5 into user metres) while each
 * piece keeps its legacy offset from the anchor, so the build
 * keeps its exact shape (walls that touched still touch, gaps
 * stay gaps) and sits where it stood, only smaller. A bare × 5
 * on every piece would have pulled them five times apart and
 * torn the build open.
 *
 * Heights never scale: catalog heights are identical in both
 * unit systems, so a wall that sat on a 0.25 m panel top still
 * sits on that panel's 0.25 user-m top, a roof still caps its
 * 3 m wall, and a floor piece still rests exactly on the floor.
 * Support, stacking, floor rest and adjacency all survive the
 * conversion unchanged — a build that was lawful stays lawful.
 */
export function sunBaseConvertLegacyBuild(build) {
  if (!build || typeof build !== 'object') return build;
  const pieces = Array.isArray(build.pieces) ? build.pieces : [];
  let cx = 0;
  let cz = 0;
  if (pieces.length) {
    cx = pieces.reduce((s, p) => s + (Number(p.x) || 0), 0) / pieces.length;
    cz = pieces.reduce((s, p) => s + (Number(p.z) || 0), 0) / pieces.length;
  }
  const s = SUN_BASE_USER_SCALE;
  return {
    ...build,
    units: SUN_BASE_BUILD_UNITS,
    pieces: pieces.map((p) => ({
      ...p,
      x: round3(cx / s + ((Number(p.x) || 0) - cx)),
      z: round3(cz / s + ((Number(p.z) || 0) - cz)),
    })),
  };
}

/**
 * A user-metre placement into room-space scene coordinates: the
 * build group is centred on the origin by the room offset, and
 * the piece itself is scaled to the user — so a stacked piece's
 * base lands exactly on the rendered top of the piece beneath it
 * (a wall at y 3 user-m sits at 0.6 room-m, the top of a 0.6
 * room-m wall), and a floor piece rests exactly on the floor.
 */
export function sunBaseRoomPosition(placement, off) {
  const s = SUN_BASE_PIECE_SCALE;
  return {
    x: round3((placement.x || 0) * s + (off ? off.x : 0)),
    y: round3((placement.y || 0) * s),
    z: round3((placement.z || 0) * s + (off ? off.z : 0)),
  };
}

/** A room-space (x, z) point into user metres inside the frame. */
export function sunBaseToUserPoint(x, z, off) {
  const s = SUN_BASE_USER_SCALE;
  return {
    x: round3(((x || 0) - (off ? off.x : 0)) / s),
    z: round3(((z || 0) - (off ? off.z : 0)) / s),
  };
}

/**
 * The default turn for a freshly picked piece: face the placer.
 * A piece's front is its local +Z at rotY 0 — chair backs,
 * throne backs and sofa backs all sit on -Z, fireplace openings
 * and console screens face +Z — so rotY = the walker's yaw turns
 * the front back toward the person placing it: walls run across
 * their view, chairs and fireplaces face into the room instead
 * of showing their backs to it. Snapped to the piece's own
 * rotation step; the Turn button takes over from here (the page
 * keeps rotY once it is set).
 */
export function sunBaseAutoRotY(yawRad, pieceId) {
  const deg = ((Number(yawRad) || 0) * 180) / Math.PI;
  return snapRotation(deg, pieceId);
}

function loadList() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const parsed = JSON.parse(localStorage.getItem(SUN_BASE_BUILDS_KEY) || 'null');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveList(list) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(SUN_BASE_BUILDS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    return true;
  } catch {
    return false;
  }
}

/** All stored sun-base builds (empty list when nothing is stored). */
export function loadSunBaseBuilds() {
  return loadList();
}

/** Persist the sun-base builds list. */
export function saveSunBaseBuilds(list) {
  return saveList(list);
}

/** The caller's build for one interior (assetId), or null. */
export function sunBaseMyBuildFor(builds, assetId) {
  const list = Array.isArray(builds) ? builds : [];
  return (
    list.find((b) => b && b.groundType === 'sun-base' && b.groundId === assetId) || null
  );
}

/** Insert or replace one sun-base build (upsertBuild from the Earth 2 store). */
export function sunBaseUpsertBuild(builds, build) {
  return upsertBuild(builds, build);
}

/** Clamp one placement into the room (the placement law, user-metre frame). */
export function sunBaseClampPlacement(placement, spec) {
  return clampPlacementToFrame(placement, sunBaseBuildFrame(spec));
}

/**
 * Judge a whole sun-base build set with the placement law (user
 * frame, flat floor): bounds, overlaps, support, nothing buried.
 */
export function sunBaseValidatePieces(pieces, spec) {
  return validatePlacementSet(pieces, {
    frame: sunBaseBuildFrame(spec),
    terrainHeightAt: () => 0,
  });
}

/**
 * Serialize a sun-base build with the catalog's own wire format.
 * The catalog's normalizePlacement drops `portalTo` (it is an
 * Earth 2 extension, not a catalog field), so destinations are
 * re-attached per piece by index after the catalog pass. The
 * units marker is stamped too, so a later load knows these
 * placements are already in user metres and never converts them
 * twice.
 */
export function sunBaseSerializeBuild(build) {
  const out = serializeBuild(build);
  out.units = SUN_BASE_BUILD_UNITS;
  const pieces = Array.isArray(build.pieces) ? build.pieces : [];
  out.pieces = out.pieces.map((p, i) => {
    const src = pieces[i];
    if (src && src.portalTo && typeof src.portalTo === 'object') {
      return { ...p, portalTo: src.portalTo };
    }
    return p;
  });
  return out;
}

/**
 * Parse + validate stored sun-base build data (user-metre frame).
 * The catalog's parseBuild only accepts groundType earth2-parcel
 * or user-world, so the sun base validates its own way: the
 * ground type must be sun-base, every placement must be lawful
 * against the room frame, and the set must fit together under
 * the placement law. Destinations survive the round trip:
 * portalTo is re-attached from the raw pieces by index (only
 * well-formed { kind, id, label } records).
 */
export function sunBaseParseBuild(raw, spec) {
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['A build must be an object.'] };
  if (raw.groundType !== 'sun-base') {
    return { ok: false, errors: ['A sun-base build needs groundType sun-base.'] };
  }
  if (typeof raw.groundId !== 'string' || !raw.groundId) {
    return { ok: false, errors: ['A sun-base build needs an interior id.'] };
  }
  if (!Array.isArray(raw.pieces)) {
    return { ok: false, errors: ['A sun-base build needs pieces.'] };
  }
  // Round-1 builds were stored in room metres: convert them into
  // user metres first, so the law judges the pieces where they
  // stand — a build saved after this change already carries the
  // marker and passes through untouched.
  const build0 = sunBaseIsLegacyBuild(raw) ? sunBaseConvertLegacyBuild(raw) : raw;
  const frame = sunBaseBuildFrame(spec);
  const errors = [];
  build0.pieces.forEach((p, i) => {
    for (const e of validatePlacement(p, frame)) errors.push(`Piece ${i}: ${e}`);
  });
  if (errors.length === 0) {
    const set = sunBaseValidatePieces(build0.pieces, spec);
    if (!set.ok) errors.push('The pieces do not fit together lawfully.');
  }
  if (errors.length) return { ok: false, errors };
  const build = sunBaseSerializeBuild(build0);
  return { ok: true, build };
}

/**
 * The load fallback, legacy-aware: the pieces that are still
 * lawful under the catalog (unknown pieces and bad finishes drop
 * out), converted into user metres first when the build predates
 * them. Bounds are not re-checked here — the parse already
 * refused a wholesale-unlawful build, and this path keeps the
 * pieces that still stand rather than wiping the room over one
 * bad piece.
 */
export function sunBaseFilterLawfulPieces(build) {
  if (!build || !Array.isArray(build.pieces)) return [];
  // Filter first, in the build's own units (catalog validity does
  // not depend on units) — so a dropped piece never drags the
  // survivors' anchor when the conversion follows.
  const lawful = build.pieces.filter((p) => validatePlacement(p, null).length === 0);
  if (sunBaseIsLegacyBuild(build)) {
    return sunBaseConvertLegacyBuild({ ...build, pieces: lawful }).pieces;
  }
  return lawful;
}

/**
 * Where a sun-base portal goes: the picker's destination kinds
 * resolved to an Olympus route, or null when the destination is
 * not a place the sun base can travel to — a floor of the base
 * itself (there is only one floor), a friend's tile (the picker
 * leaves that list empty), or anything unknown. Programs are
 * routes by slug (app/<slug> exists for every program the picker
 * lists); the map's hub is the hub, its spawn is Earth 2, and a
 * monument is an Earth 2 landmark.
 */
export function resolveSunBasePortalDestination(dest) {
  if (!dest || typeof dest !== 'object') return null;
  if (dest.kind === 'programs' && typeof dest.id === 'string' && dest.id) {
    return `/${dest.id}`;
  }
  if (dest.kind === 'map') {
    if (dest.id === 'map:hub') return '/';
    if (dest.id === 'map:spawn') return '/earth-2';
    return null;
  }
  if (dest.kind === 'monuments') return '/earth-2';
  return null;
}
