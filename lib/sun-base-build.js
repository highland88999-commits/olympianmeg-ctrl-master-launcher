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
// The pieces stay FULL Earth 2 size (a 4 m wall is a 4 m wall):
// to the shrunken user (lib/sun-base.js SUN_BASE_USER_SCALE 0.2)
// a wall reads 20 m wide — the things they build are huge to
// them, exactly like the room. The build surface is the room
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

import { upsertBuild } from './earth2/build-store.js';
import {
  clampPlacementToFrame,
  validatePlacementSet,
} from './building/placement.js';
import {
  serializeBuild,
  validatePlacement,
} from './building/catalog.js';

/** Device-local builds storage (the interior-pick pattern). */
export const SUN_BASE_BUILDS_KEY = 'sun-base:builds:v1';

/**
 * The build frame for one interior spec: the room's own inset
 * floor (the 0.94 inset is the room shell's, same as the walk
 * clamp), capped at the room's own height. Rounded to 3 decimals
 * — the placement law's own precision — so 9 × 0.94 reads 8.46,
 * not 8.459999999999999.
 */
export function sunBaseBuildFrame(spec) {
  const r3 = (n) => Math.round(n * 1000) / 1000;
  return {
    width: r3(spec.widthM * 0.94),
    depth: r3(spec.depthM * 0.94),
    maxY: spec.heightM,
  };
}

/** Room-space offset: the build group sits centred on the origin. */
export function sunBaseBuildOffset(spec) {
  const f = sunBaseBuildFrame(spec);
  return { x: -f.width / 2, z: -f.depth / 2 };
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

/** Clamp one placement into the room (the placement law, room frame). */
export function sunBaseClampPlacement(placement, spec) {
  return clampPlacementToFrame(placement, sunBaseBuildFrame(spec));
}

/**
 * Judge a whole sun-base build set with the placement law (room
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
 * re-attached per piece by index after the catalog pass.
 */
export function sunBaseSerializeBuild(build) {
  const out = serializeBuild(build);
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
 * Parse + validate stored sun-base build data (room frame).
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
  const frame = sunBaseBuildFrame(spec);
  const errors = [];
  raw.pieces.forEach((p, i) => {
    for (const e of validatePlacement(p, frame)) errors.push(`Piece ${i}: ${e}`);
  });
  if (errors.length === 0) {
    const set = sunBaseValidatePieces(raw.pieces, spec);
    if (!set.ok) errors.push('The pieces do not fit together lawfully.');
  }
  if (errors.length) return { ok: false, errors };
  const build = sunBaseSerializeBuild(raw);
  return { ok: true, build };
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
