// lib/earth2/building.js
// EARTH 2 — BUILDING: the Earth 2 face of the shared toolkit
// (lib/building/). The catalog and the rights engine are generic;
// everything that knows about parcels, the planet's terrain and
// its landmark structures lives here.
//
// Merlin's approved design (2026-10-22): building is part of the
// land-title bundle — owners build on their parcels; ownable-but-
// unsold parcels can be homestead-claimed for building (permit
// only, evicted with a pack-up when the parcel sells); Free Commons
// and protected ground are NEVER buildable.
//
// PROTECTED GROUND: Castle Transylvania's parcel (E2-2476 — the
// Count's seat, Free Commons forever), the Royal Tyrrell Museum
// grounds (Earth 2's Drumheller — lib/earth2/museum.js), the
// Tyrrell Field airfield grounds (lib/earth2/airport.js), plus every
// parcel carrying one of the planet's placed landmark structures
// (the mountain range, both volcanoes, the cliff face, the meteor
// crater, the tar pit, the rocky outcrop, the giant boulder —
// lib/earth2/world.js worldLandforms). Those places belong to the
// planet, not to a builder — refused even for the title holder.
//
// Placement is validated against the REAL terrain: piece positions
// are parcel-local (see lib/building/catalog.js), converted here
// through world.js's parcel rect, with heightAt as ground truth.

import {
  PARCELS,
  parcelById,
  isCastleParcel,
  CASTLE_PARCEL_ID,
  museumGroundsParcels,
  airportGroundsParcels,
} from './parcels.js';
import {
  WORLD_CELL_M,
  parcelWorldRect,
  parcelCenterWorld,
  heightAt,
  worldLandforms,
} from './world.js';
import {
  parseBuild,
  pieceById,
  pieceFootprint,
} from '../building/catalog.js';
import {
  canBuildOnParcel,
} from '../building/rights.js';

// The buildable frame of one parcel: the parcel's own square,
// pieces rising at most 60 m above their ground point.
export const PARCEL_BUILD_FRAME = Object.freeze({
  width: WORLD_CELL_M,
  depth: WORLD_CELL_M,
  maxY: 60,
});

// The castle's own groundworks: no user piece may stand within
// this radius of the castle's centre, even on a neighbouring
// parcel (the terrace and court spill past the parcel line).
export const CASTLE_EXCLUSION_M = 30;

let _protectedIds = null;

/** Ids of every protected parcel (castle + landmark structures). */
export function protectedParcelIds() {
  if (_protectedIds) return _protectedIds;
  const ids = new Set([CASTLE_PARCEL_ID]);
  for (const p of museumGroundsParcels()) ids.add(p.id);
  for (const p of airportGroundsParcels()) ids.add(p.id);
  for (const lf of worldLandforms()) {
    const p = PARCELS[lf.parcelIndex];
    if (p) ids.add(p.id);
  }
  _protectedIds = ids;
  return ids;
}

/** True when this parcel's ground is protected (never buildable). */
export function isProtectedParcel(parcel) {
  if (!parcel) return false;
  if (isCastleParcel(parcel)) return true;
  return protectedParcelIds().has(parcel.id);
}

/** The rights context for a parcel: parcels.js + rows + claim. */
export function earth2BuildContext(parcel, ownerRow, claim) {
  return {
    parcel: parcel || null,
    ownerRow: ownerRow || null,
    claim: claim || null,
    protectedGround: isProtectedParcel(parcel),
  };
}

/** canBuild for Earth 2: the shared engine with protection filled in. */
export function canBuildOnEarth2Parcel(user, parcel, ownerRow, claim) {
  return canBuildOnParcel(user, earth2BuildContext(parcel, ownerRow, claim));
}

/** A piece's world-space position (x east, z south) on a parcel. */
export function pieceWorldPosition(parcel, piece) {
  const rect = parcelWorldRect(parcel);
  return { x: rect.minX + piece.x, z: rect.minZ + piece.z };
}

/** The terrain height under a piece — Phase 2 seats pieces on it. */
export function terrainHeightForPiece(parcel, piece) {
  const w = pieceWorldPosition(parcel, piece);
  return heightAt(w.x, w.z);
}

/**
 * Validate a build destined for an Earth 2 parcel: the generic
 * catalog rules against the parcel frame, plus the castle
 * exclusion (no piece inside the castle's groundworks, whichever
 * parcel it technically stands on).
 * Returns { ok, build?, errors } like parseBuild.
 */
export function validateEarth2Build(raw) {
  const parcel = raw && typeof raw.groundId === 'string' ? parcelById(raw.groundId) : null;
  if (!parcel) return { ok: false, errors: ['Unknown parcel.'] };
  if (raw.groundType !== 'earth2-parcel') {
    return { ok: false, errors: ['An Earth 2 build must carry groundType earth2-parcel.'] };
  }
  const parsed = parseBuild(raw, PARCEL_BUILD_FRAME);
  if (!parsed.ok) return parsed;
  const errors = [];
  const castle = parcelCenterWorld(parcelById(CASTLE_PARCEL_ID));
  for (let i = 0; i < parsed.build.pieces.length; i++) {
    const w = pieceWorldPosition(parcel, parsed.build.pieces[i]);
    if (Math.hypot(w.x - castle.x, w.z - castle.z) < CASTLE_EXCLUSION_M) {
      errors.push(`Piece ${i + 1} stands inside Castle Transylvania's groundworks.`);
    }
  }
  if (errors.length) return { ok: false, errors };
  return parsed;
}

// ── Row mapping (earth2-buildings.sql shapes ↔ toolkit shapes) ──
export function claimFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    parcelId: row.parcel_id,
    builderId: row.builder_id,
    builderEmail: row.builder_email,
    status: row.status,
    claimedAt: row.claimed_at || null,
    endedAt: row.ended_at || null,
    endReason: row.end_reason || null,
  };
}

export function buildFromRow(row) {
  if (!row) return null;
  return {
    groundType: row.ground_type,
    groundId: row.ground_id,
    ownerId: row.owner_id,
    ownerEmail: row.owner_email,
    pieces: Array.isArray(row.pieces) ? row.pieces : [],
    updatedAt: row.updated_at || null,
  };
}

// ── Sale eviction against the database ───────────────────────────
// The buy route calls this after a first-round title lands: settle
// any homestead claim on the parcel, exactly as the pure engine
// (lib/building/rights.js onParcelSold) rules it — pack the build
// into earth2_build_packups, notify the builder, end the claim.
// Auction transfers settle through the same engine at the data
// level (lib/earth2/land-sale.js transferLandTitle).
//
// Honest degradation: until supabase/earth2-buildings.sql runs, the
// tables do not exist and this answers { setupRequired: true } —
// the sale itself is never blocked by the eviction step.
function isMissingTable(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(msg);
}

function sameDbUser(aId, aEmail, bId, bEmail) {
  if (aId && bId) return String(aId) === String(bId);
  const ea = String(aEmail || '').toLowerCase();
  const eb = String(bEmail || '').toLowerCase();
  return !!ea && ea === eb;
}

export async function evictHomesteadOnSaleDb(db, parcelId, buyer, atIso) {
  try {
    const claimRes = await db
      .from('earth2_homestead_claims')
      .select('id, parcel_id, builder_id, builder_email, status, claimed_at')
      .eq('parcel_id', parcelId)
      .eq('status', 'active')
      .maybeSingle();
    if (claimRes.error) {
      if (isMissingTable(claimRes.error)) return { setupRequired: true };
      return { evicted: null };
    }
    const claimRow = claimRes.data;
    if (!claimRow) return { evicted: null };

    const converted = sameDbUser(claimRow.builder_id, claimRow.builder_email, buyer && buyer.id, buyer && buyer.email);
    const endedAt = atIso || new Date().toISOString();

    if (converted) {
      await db
        .from('earth2_homestead_claims')
        .update({ status: 'purchased', ended_at: endedAt, end_reason: 'purchased' })
        .eq('id', claimRow.id);
      return { converted: true, evicted: null };
    }

    // Pack the claimant's build up, pieces intact.
    const buildRes = await db
      .from('earth2_builds')
      .select('id, pieces')
      .eq('ground_type', 'earth2-parcel')
      .eq('ground_id', parcelId)
      .eq('owner_id', claimRow.builder_id)
      .maybeSingle();
    let packUpId = null;
    let pieceCount = 0;
    if (!buildRes.error && buildRes.data) {
      const pieces = Array.isArray(buildRes.data.pieces) ? buildRes.data.pieces : [];
      pieceCount = pieces.length;
      const pack = await db
        .from('earth2_build_packups')
        .insert({
          builder_id: claimRow.builder_id,
          builder_email: claimRow.builder_email,
          parcel_id: parcelId,
          pieces,
          piece_count: pieceCount,
          reason: 'parcel-sold',
        })
        .select('id')
        .single();
      if (!pack.error && pack.data) packUpId = pack.data.id;
      await db.from('earth2_builds').delete().eq('id', buildRes.data.id);
    }

    await db.from('earth2_build_notifications').insert({
      user_id: claimRow.builder_id,
      user_email: claimRow.builder_email,
      kind: 'homestead-evicted',
      parcel_id: parcelId,
      packup_id: packUpId,
      payload: { buyerEmail: (buyer && buyer.email) || null, pieceCount },
    });
    await db
      .from('earth2_homestead_claims')
      .update({ status: 'evicted', ended_at: endedAt, end_reason: 'parcel-sold' })
      .eq('id', claimRow.id);

    return {
      evicted: {
        builderEmail: claimRow.builder_email,
        packUpId,
        pieceCount,
      },
    };
  } catch {
    // The eviction step never breaks a completed sale.
    return { evicted: null };
  }
}

// ── BUILD-MODE CAMERA CONTROLS (Merlin, 2026-10-24) ──────────
// The scheme that replaced the 2026-10-23 ANCHORED aim law
// ("moving with the joystick should not be attached" — which
// froze the ghost at its first anchor while the joystick did
// nothing visible on Merlin's phone):
//
//   1. CAMERA MOVES THE TILE. The ghost follows the camera's
//      centre ground point CONTINUOUSLY — march the centre ray
//      down to the terrain every frame, clamp to the parcel
//      frame. The tile never leaves the screen, which is why
//      this beats the reverse: a joystick-moved tile drifts
//      off-screen and the user hunts for it.
//   2. JOYSTICK ORBITS THE VIEW. In build mode only, the
//      joystick stops walking the walker and swings the camera
//      around the current ghost: left/right = orbit yaw,
//      up/down = orbit pitch (clamped above the ground).
//      Orbiting NEVER moves the tile — the aim freezes while
//      the orbit blend is active. Releasing the joystick eases
//      the camera back to the walker eye view; exiting build
//      mode mid-orbit eases back the same way — no jump, no
//      stranded camera.
//   3. TAP PLACES. A tap on the ground view or on the ghost
//      itself commits the ghost's current placement (see
//      decideBuildTapAction). Double-tap pickup, rotate/flip/
//      lift, seam snapping and the verdict display are
//      untouched.

/** Orbit camera tuning — one place, tested, never magic in the scene. */
export const BUILD_ORBIT_PITCH_MIN = 0.15; // rad above the horizon
export const BUILD_ORBIT_PITCH_MAX = 1.45; // rad — just short of overhead
export const BUILD_ORBIT_YAW_RATE = 1.6; // rad per second at full deflection
export const BUILD_ORBIT_PITCH_RATE = 1.2; // rad per second at full deflection
export const BUILD_ORBIT_JOY_DEADZONE = 0.15;
export const BUILD_ORBIT_DIST_MIN = 8; // m from the ghost
export const BUILD_ORBIT_DIST_MAX = 26; // m from the ghost
export const BUILD_ORBIT_BLEND_IN_RATE = 4; // weight per second while held
export const BUILD_ORBIT_BLEND_OUT_RATE = 2.5; // weight per second on release

/**
 * March a ray down to the terrain — the camera-aim law. Mirrors
 * the scene's original march exactly (first step 1.5 m out, last
 * step 18 m, 0.4 m strides, stop at the first sample at or below
 * the ground + 0.05 m; a ray that never meets ground — aimed at
 * the sky — lands at the far point). Returns WORLD { x, z }.
 */
export function marchCameraGroundPoint(origin, dir, heightAt, opts = {}) {
  const minS = opts.minS ?? 1.5;
  const maxS = opts.maxS ?? 18;
  const step = opts.step ?? 0.4;
  let ax = origin.x + dir.x * 9;
  let az = origin.z + dir.z * 9;
  let hit = false;
  for (let s = minS; s <= maxS; s += step) {
    const px = origin.x + dir.x * s;
    const pz = origin.z + dir.z * s;
    const py = origin.y + dir.y * s;
    ax = px;
    az = pz;
    if (py <= heightAt(px, pz) + 0.05) { hit = true; break; }
  }
  // hit reports whether the ray actually met ground: a level or
  // skyward ray runs to maxS without one, and the caller must
  // not treat the far point as a real aim (see updateBuildGhost's
  // hold-last-aim rule). x/z are unchanged from before, so
  // existing callers that ignore the flag behave exactly as they did.
  return { x: ax, z: az, hit };
}

/** Clamp a world aim point into a parcel's local frame. */
export function clampAimToParcel(worldX, worldZ, rect, frame = PARCEL_BUILD_FRAME) {
  return {
    x: Math.min(frame.width, Math.max(0, worldX - rect.minX)),
    z: Math.min(frame.depth, Math.max(0, worldZ - rect.minZ)),
  };
}

/** Clamp an orbit pitch to the above-ground band. */
export function clampOrbitPitch(pitch) {
  return Math.min(BUILD_ORBIT_PITCH_MAX, Math.max(BUILD_ORBIT_PITCH_MIN, pitch));
}

/**
 * Orbit camera position around a centre: yaw 0 sits at +Z of the
 * centre, yaw π/2 at +X; pitch 0 is level, pitch π/2 overhead.
 */
export function orbitCameraPosition(centre, yaw, pitch, dist) {
  const cp = Math.cos(pitch);
  return {
    x: centre.x + dist * cp * Math.sin(yaw),
    y: centre.y + dist * Math.sin(pitch),
    z: centre.z + dist * cp * Math.cos(yaw),
  };
}

/**
 * Seed an orbit from the camera's current position, so the first
 * joystick push continues from exactly where the view already
 * is — no jump on orbit entry. Distance clamps to the orbit band.
 */
export function initOrbitFromCamera(cameraPos, centre) {
  const dx = cameraPos.x - centre.x;
  const dy = cameraPos.y - centre.y;
  const dz = cameraPos.z - centre.z;
  const dist = Math.min(
    BUILD_ORBIT_DIST_MAX,
    Math.max(BUILD_ORBIT_DIST_MIN, Math.hypot(dx, dy, dz)),
  );
  return {
    yaw: Math.atan2(dx, dz),
    pitch: clampOrbitPitch(Math.atan2(dy, Math.hypot(dx, dz))),
    dist,
  };
}

/** Step orbit angles from joystick deflection; inside the deadzone nothing moves. */
export function stepOrbitAngles(yaw, pitch, joyX, joyY, dt) {
  if (Math.hypot(joyX, joyY) < BUILD_ORBIT_JOY_DEADZONE) return { yaw, pitch };
  return {
    yaw: yaw + joyX * BUILD_ORBIT_YAW_RATE * dt,
    pitch: clampOrbitPitch(pitch + joyY * BUILD_ORBIT_PITCH_RATE * dt),
  };
}

/**
 * Step the orbit blend weight: toward 1 while the joystick drives
 * the orbit, back toward 0 on release (and forced to 0 while
 * driving a vehicle, so the orbit never fights a vehicle camera).
 */
export function stepOrbitWeight(weight, driving, dt) {
  if (driving) return Math.min(1, weight + BUILD_ORBIT_BLEND_IN_RATE * dt);
  return Math.max(0, weight - BUILD_ORBIT_BLEND_OUT_RATE * dt);
}

/**
 * Decide what a build-mode tap does, in the Place tool. A tap on
 * the ghost itself places it exactly where it stands (the ghost's
 * current judged placement — no re-march, so a lifted ghost or a
 * slope edge can't shift the spot under the finger). An unlawful
 * ghost refuses with its first reason, never silently. Anything
 * else falls through to the tap-to-aim path.
 */
export function decideBuildTapAction({ tool, ghostHit, ghostPlacement, verdict }) {
  if (tool !== 'place') return { action: 'other-tool' };
  if (ghostHit && ghostPlacement) {
    if (verdict && verdict.ok) return { action: 'place-ghost', placement: ghostPlacement };
    if (verdict && verdict.reasons && verdict.reasons.length) {
      return { action: 'refuse', reason: verdict.reasons[0] };
    }
    return { action: 'refuse', reason: 'It does not fit there.' };
  }
  return { action: 'tap-aim' };
}

// ── BUILD CONTROLS v3 (Merlin, 2026-10-24) ───────────────────
// Three fixes on the v2 scheme, all in build mode only:
//
//   1. TAP CLASSIFICATION BY ENDPOINT, NOT PATH. v2 called a
//      tap "not a drag" when its total pointer path stayed
//      under 7 px — but a finger tap jitters: the path can
//      wander past 7 px while the finger never leaves the
//      spot, so genuine taps were silently reclassified as
//      drag-look (the view wiggled, nothing placed, no
//      feedback at all). A tap is now judged by ENDPOINT
//      displacement: where the finger lifts versus where it
//      landed. The window is generous on purpose (24 px,
//      1000 ms): Merlin taps one-handed while holding a
//      controller in the other hand, so a real tap slides
//      on lift and lands slowly — and a real drag still
//      ends far from its start (a camera sweep is tens to
//      hundreds of pixels), so it never places by accident.
//   2. NO SLINGSHOT. v2 eased the camera back to the walker
//      eye view on joystick release — Merlin reversed that:
//      when the user stops orbiting, the camera STAYS exactly
//      at the orbit pose. stepOrbitPark is the state machine:
//      release with the blend engaged PARKS the camera (weight
//      frozen, position untouched); the next joystick push
//      seeds a fresh orbit from the parked pose, so orbiting
//      continues from where it stopped. Exiting build mode
//      still glides back to the walker eye view — that is a
//      deliberate mode change back to normal play (leaving
//      the camera detached would break walking), and driving
//      a vehicle always wins outright.
//   3. GHOST-FOOTPRINT TAP. A tap on the slab's ground
//      footprint counts as a ghost tap even when the mesh
//      raycast itself misses (glancing angle, matrix lag,
//      any cause): the tap's terrain point inside the
//      ghost's plan footprint, plus a small margin, commits
//      the ghost exactly where it stands.

/** A tap lifts within this distance of where it landed (px) — generous: a real drag ends far away. */
export const TAP_MAX_DISPLACEMENT_PX = 24;
/** A tap lifts within this long of landing (ms) — a slow deliberate press still counts. */
export const TAP_MAX_DURATION_MS = 1000;

/**
 * True when a pointer press/release pair is a tap: the lift
 * point sits near the press point, and the press was quick.
 * Endpoint displacement, not path length — a jittery finger
 * that never leaves the spot still counts as a tap.
 */
export function classifyTapGesture({ downX, downY, upX, upY, durationMs }) {
  if (!(durationMs < TAP_MAX_DURATION_MS)) return false;
  return Math.hypot(upX - downX, upY - downY) < TAP_MAX_DISPLACEMENT_PX;
}

/**
 * The orbit park state machine — one pure step per frame.
 * State { weight, driving, parked }; input { joyDeflected,
 * buildModeOn, drivingVehicle }; dt in seconds. Returns the
 * next state plus frozen (the aim-freeze flag updateBuildGhost
 * reads: frozen while the orbit is actually moving the camera,
 * never while parked — a parked camera leaves the tile-aim law
 * alone, so drag-look still moves the tile after parking).
 */
export function stepOrbitPark(state, input, dt) {
  const weight = state && Number.isFinite(state.weight) ? state.weight : 0;
  if (input && input.drivingVehicle) {
    return { weight: 0, driving: false, parked: false, frozen: false };
  }
  if (!input || !input.buildModeOn) {
    // Leaving build mode: unpark and glide the blend back out.
    const w = stepOrbitWeight(weight, false, dt);
    return { weight: w, driving: false, parked: false, frozen: w > 0.01 };
  }
  if (input.joyDeflected) {
    const w = stepOrbitWeight(weight, true, dt);
    return { weight: w, driving: true, parked: false, frozen: w > 0.01 };
  }
  if (weight > 0.01) {
    // Released mid-orbit: PARK. The weight freezes exactly
    // where it stopped and the camera stays put — no ease-back,
    // no snap-back, no return to the original view.
    return { weight, driving: false, parked: true, frozen: false };
  }
  const w = stepOrbitWeight(weight, false, dt);
  return { weight: w, driving: false, parked: false, frozen: w > 0.01 };
}

/**
 * Whether the scene's orbit block should blend the camera toward
 * the orbit pose this frame. The blend runs while the orbit is
 * driving (joystick held) or gliding out (build mode just left) —
 * but NEVER while parked: a parked camera already sits exactly
 * at the orbit pose, and re-blending every frame would override
 * drag-look and pin the camera-aimed ghost, so after a joystick
 * orbit the piece could no longer be aimed or placed (Merlin's
 * build video, 2026-10-26). Parked, drag-look owns orientation
 * again and the ghost follows the view centre.
 */
export function orbitBlendActive({ weight, parked, drivingVehicle }) {
  return weight > 0.001 && !parked && !drivingVehicle;
}

/**
 * The Earth 2 panels' minimized-orb identity (Merlin, 2026-10-26):
 * the three distinct control boxes — main controls, secondary
 * building controls, environmental information — each get their
 * own colour + glyph when shrunk, so they are distinguishable at
 * a glance. The scene maps `color` to literal Tailwind classes
 * (the scanner only sees classes written in the component file).
 * Behaviour is untouched: tap ＋ to expand, drag by the orb to
 * move, positions persist exactly as before.
 */
export const EARTH2_PANEL_ORBS = {
  parcel: { glyph: '🚶', label: 'Parcel & environment', color: 'sky', art: '/earth2/controls/environment.webp' },
  actions: { glyph: '🎛️', label: 'Controls', color: 'amber', art: '/earth2/controls/main-controls.webp' },
  build: { glyph: '🔨', label: 'Building', color: 'emerald', art: '/earth2/controls/building-controls.webp' },
};
/**
 * Collapse one panel in a panel-layout map, leaving the others
 * exactly as they are. Entering build mode collapses the main
 * controls this way so the building workbench never opens on
 * top of them (the no-overlap rule); the user re-expands with
 * the orb's ＋, and the collapsed state persists like any other.
 */
export function collapsePanelLayout(layout, id) {
  const prev = layout && typeof layout === 'object' ? layout : {};
  const panel = prev[id] && typeof prev[id] === 'object' ? prev[id] : {};
  return { ...prev, [id]: { ...panel, collapsed: true } };
}
export const BUILD_LEVEL_HEIGHT_M = 3;
/** Highest level the 60 m parcel frame allows (60 / 3). */
export const BUILD_MAX_LEVEL = Math.floor(PARCEL_BUILD_FRAME.maxY / BUILD_LEVEL_HEIGHT_M);

/**
 * The ghost's base height for a level: ground level keeps
 * today's stacking seat exactly; above ground, the level's
 * own base wins unless something taller already stands under
 * the footprint (a piece never sinks into what is beneath it).
 * yLift rides on top in both cases.
 */
export function levelPlacementY(level, seatY, lift) {
  const base = (level || 0) > 0 ? level * BUILD_LEVEL_HEIGHT_M : 0;
  return Math.max(base, seatY || 0) + (lift || 0);
}

/** The toggle's label for a level: Ground, L1, L2, … */
export function levelLabel(level) {
  return (level || 0) <= 0 ? 'Ground' : `L${level}`;
}

/** How far past the ghost's plan footprint a tap still counts as on the ghost. */
export const GHOST_TAP_FOOTPRINT_MARGIN_M = 0.5;

/**
 * True when a tap's terrain point (parcel-local { x, z }) falls
 * inside the ghost's plan footprint, plus the margin — the
 * footprint test for "tapping the slab itself", independent of
 * the mesh raycast. The footprint is the catalog's axis-aligned
 * plan box for the judged placement, so rotation is already
 * folded in.
 */
export function tapPointInGhostFootprint(tapLocal, ghostPlacement) {
  if (!tapLocal || !ghostPlacement) return false;
  const piece = pieceById(ghostPlacement.pieceId);
  if (!piece) return false;
  const fp = pieceFootprint(piece, ghostPlacement);
  const m = GHOST_TAP_FOOTPRINT_MARGIN_M;
  return (
    tapLocal.x >= fp.minX - m && tapLocal.x <= fp.maxX + m &&
    tapLocal.z >= fp.minZ - m && tapLocal.z <= fp.maxZ + m
  );
}
