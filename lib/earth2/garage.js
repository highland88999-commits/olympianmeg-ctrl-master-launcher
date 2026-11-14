// lib/earth2/garage.js — Earth 2 parcel sub-level garage (Merlin, 2026-11-13).
//
// Every OWNED parcel gets a sub-level BELOW GROUND where its vehicles
// are stored. Free Commons get no sub-level. One garage template,
// reused per parcel, positioned under that parcel's centre:
//
//   room 26 x 18 m, floor 12 m below the parcel surface, ceiling 5 m up
//   ramp 6 m wide, 36 m run, from the floor up to the surface (south)
//   wall portal on the north wall (portal transit system) — the on-foot
//     exit back to ground level
//   two parking slots, facing the ramp so a machine drives straight out
//
// Pure geometry + ledger helpers (no THREE, no DOM) so the scene stays
// thin and the rules stay testable in node (tests/earth2-boarding-garage.test.mjs).
//
// Daylight hue (Merlin, 2026-11-13): the sub-level lights give off a
// DAYLIGHT-style hue — bright cool white (D65 daylight, ~6500 K), never
// dim and never yellow. The colour constant lives here so the mesh
// factory and the tests read the same value.

// ── Geometry ────────────────────────────────────────────────────────
import { PARCEL_SHRINK_SCALE } from './parcel-shrink.js';

export const GARAGE_DEPTH_M = 12; // floor sits this far below the parcel surface
export const GARAGE_WIDTH_M = 26; // east-west
export const GARAGE_LENGTH_M = 18; // north-south
export const GARAGE_HEIGHT_M = 5; // floor to ceiling
export const GARAGE_RAMP_WIDTH_M = 6;
export const GARAGE_RAMP_RUN_M = 36; // 12 m rise over 36 m — about 18 degrees
export const GARAGE_SLOT_COUNT = 2;

// ── Daylight lights ─────────────────────────────────────────────────
// Cool bright white (D65 daylight, ~6500 K). The mesh factory paints
// its point lights, hemisphere light and ceiling panels with this
// colour, so the garage reads as daylight, not lamplight.
export const GARAGE_LIGHT_COLOR = 0xf2f5ff;
export const GARAGE_LIGHT_COLOR_CSS = '#f2f5ff';
export const GARAGE_LIGHT_POINT_INTENSITY = 40;
export const GARAGE_LIGHT_POINT_DISTANCE = 28;
export const GARAGE_LIGHT_AMBIENT_INTENSITY = 0.9;

// ── Transit (shared with the hub portals — one gold, one speed) ────
// The wall portal wears the portal transit graphics: gold exit ring
// 0xffd700, turning at 1.4 rad/s with an aurora boot — the same system
// as the hub portals, never a second portal look.
export const GARAGE_TRANSIT_GOLD = 0xffd700;
export const GARAGE_TRANSIT_SPIN_RAD_PER_SEC = 1.4;

// ── Flying out (Merlin, 2026-11-13) ────────────────────────────────
// To fly out of the garage a vehicle RISES OUT OF THE GROUND
// vertically, passing through the property and the objects above —
// during the rise it ignores collision with them. The ramp is for
// driving out; the vertical rise-through is for flying out.
export const RISE_THROUGH_RATE_MPS = 6;
export const RISE_THROUGH_CLEAR_M = 8; // rise until this far above the surface

// ── Portal triggers ────────────────────────────────────────────────
export const GARAGE_PORTAL_TRIGGER_M = 1.6; // walk this close and the portal takes you
export const GARAGE_PORTAL_COOLDOWN_MS = 1500; // once-per-entry guard, like the lava pools

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * The garage spec for one parcel. parcel: { id, cx, cz, surfaceY }
 * (cx/cz = the parcel centre, surfaceY = heightAt at the centre).
 * Returns null for a bad parcel.
 */
export function garageSpecForParcel(parcel) {
  if (!parcel || typeof parcel.id !== 'string' || !parcel.id) return null;
  const cx = Number(parcel.cx);
  const cz = Number(parcel.cz);
  const surfaceY = Number(parcel.surfaceY);
  if (!Number.isFinite(cx) || !Number.isFinite(cz) || !Number.isFinite(surfaceY)) return null;
  const floorY = surfaceY - GARAGE_DEPTH_M;
  const halfW = GARAGE_WIDTH_M / 2;
  const halfL = GARAGE_LENGTH_M / 2;
  const rampHalf = GARAGE_RAMP_WIDTH_M / 2;
  return {
    parcelId: parcel.id,
    cx, cz, surfaceY, floorY,
    ceilingY: floorY + GARAGE_HEIGHT_M,
    room: { x0: cx - halfW, x1: cx + halfW, z0: cz - halfL, z1: cz + halfL },
    ramp: {
      x0: cx - rampHalf, x1: cx + rampHalf,
      z0: cz + halfL, z1: cz + halfL + GARAGE_RAMP_RUN_M,
    },
    // The wall portal sits on the north wall, facing south into the room.
    wallPortal: { x: cx, z: cz - halfL + 0.15, y: floorY + 2.2 },
    // Where the surface portal drops you: just inside the room by the
    // ramp, facing north toward the wall portal.
    entry: { x: cx, z: cz + halfL - 3, yaw: Math.PI },
    slots: [
      { x: cx - 5, z: cz + 2, heading: 0 },
      { x: cx + 5, z: cz + 2, heading: 0 },
    ],
  };
}

/** The ground height inside the garage (floor, or the ramp slope), or null outside it. */
export function garageGroundHeight(spec, x, z) {
  if (!spec || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  const r = spec.room;
  if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return spec.floorY;
  const rp = spec.ramp;
  if (x >= rp.x0 && x <= rp.x1 && z >= rp.z0 && z <= rp.z1) {
    const p = (z - rp.z0) / (rp.z1 - rp.z0);
    return spec.floorY + p * (spec.surfaceY - spec.floorY);
  }
  return null;
}

/** True when (x, z) is inside the garage room or its ramp corridor (plan view). */
export function garageContains(spec, x, z) {
  return garageGroundHeight(spec, x, z) != null;
}

/**
 * Clamp a point into the garage room or its ramp corridor. The walls
 * hold: anything pushed past them comes back to the nearest legal
 * spot (the ramp is the only way out of the south wall).
 */
export function clampToGarage(spec, x, z) {
  if (!spec) return { x, z };
  if (garageContains(spec, x, z)) return { x, z };
  const r = spec.room;
  const rp = spec.ramp;
  if (z >= r.z1 && x >= rp.x0 && x <= rp.x1) {
    return { x, z: clamp(z, rp.z0, rp.z1) };
  }
  return { x: clamp(x, r.x0, r.x1), z: clamp(z, r.z0, r.z1) };
}

/** The parking slot a parcel vehicle lives in: { x, z, heading }, or null. */
export function garageSlotState(spec, slot) {
  if (!spec || !Array.isArray(spec.slots)) return null;
  const s = spec.slots[slot];
  if (!s) return null;
  return { x: s.x, z: s.z, heading: s.heading };
}

/** Parse a parcel-vehicle ledger key: 'parcel-vehicle:<parcelId>:<slug>'. */
export function parseParcelVehicleKey(key) {
  if (typeof key !== 'string') return null;
  const m = key.match(/^parcel-vehicle:([A-Za-z0-9-]+):(.+)$/);
  if (!m) return null;
  return { parcelId: m[1], slug: m[2] };
}

// ── Destruction / respawn (Merlin, 2026-11-13) ─────────────────────
// A destroyed OWNED vehicle respawns IN ITS GARAGE (its parcel's
// sub-level, in its slot). A destroyed PUBLIC vehicle respawns at ITS
// ORIGINAL SPAWN POINT — that rule lives in the fleet home state,
// so this helper returns null for anything that is not a parcel
// vehicle of this garage, and the caller falls back to homeStateForInstance.
/**
 * The respawn home for a parcel vehicle of this garage: its slot,
 * parked facing the ramp. slotIndex is the machine's slot in its
 * parcel's garage (0 or 1 — the scene derives it from the parcel's
 * vehicle list, so two machines never share a slot). Null for any
 * other key or slot (public machines keep their original spawn point).
 */
export function garageRespawnHomeForVehicleKey(key, spec, slotIndex) {
  if (!spec || typeof key !== 'string') return null;
  const parsed = parseParcelVehicleKey(key);
  if (!parsed || parsed.parcelId !== spec.parcelId) return null;
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= GARAGE_SLOT_COUNT) return null;
  const s = garageSlotState(spec, slotIndex);
  if (!s) return null;
  // MINIATURE (Merlin, 2026-11-14): the garage sits under an
  // owned parcel, so its machines park miniature — the slot
  // scales toward the parcel center (the garage center) and the
  // home carries miniature: true, so the replacement renders as
  // a little machine on the garage floor, like the seeds.
  // The home carries the slug + parcel id: freshVehicleState spreads
  // the home into the replacement, and the ledger sanitize drops a
  // state with no slug — a respawn without them would vanish on
  // the next reload.
  return {
    slug: parsed.slug, parcelId: parsed.parcelId,
    x: spec.cx + (s.x - spec.cx) * PARCEL_SHRINK_SCALE,
    z: spec.cz + (s.z - spec.cz) * PARCEL_SHRINK_SCALE,
    heading: s.heading, speed: 0, alt: 0, garaged: true, miniature: true,
  };
}

// ── Remember where they left (Merlin, 2026-11-13) ─────────────────
// The map remembers where the user left, and spawns the user AND
// their vehicles where they last left them. Vehicles already persist
// in the device ledger (the seed never overwrites an existing key);
// the walker is the missing half, so it gets its own record:
// { x, z, yaw, parcelId, inGarage, t }.
export const LAST_LEFT_STORAGE_KEY = 'earth2:last-left:v1';

export function loadLastLeft() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LAST_LEFT_STORAGE_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec || !Number.isFinite(rec.x) || !Number.isFinite(rec.z)) return null;
    return {
      x: rec.x,
      z: rec.z,
      yaw: Number.isFinite(rec.yaw) ? rec.yaw : 0,
      parcelId: typeof rec.parcelId === 'string' ? rec.parcelId : null,
      inGarage: rec.inGarage === true,
      t: Number.isFinite(rec.t) ? rec.t : 0,
    };
  } catch {
    return null;
  }
}

export function saveLastLeft(rec) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!rec || !Number.isFinite(rec.x) || !Number.isFinite(rec.z)) return;
    localStorage.setItem(LAST_LEFT_STORAGE_KEY, JSON.stringify({
      x: rec.x,
      z: rec.z,
      yaw: Number.isFinite(rec.yaw) ? rec.yaw : 0,
      parcelId: typeof rec.parcelId === 'string' ? rec.parcelId : null,
      inGarage: rec.inGarage === true,
      t: Date.now(),
    }));
  } catch {
    // storage unavailable — the walker just spawns at home base
  }
}

// ── Garage portal ledger (one placed portal per owned parcel) ──────
// The owner places the portal from the build menu; the record is
// { x, z, yaw } on the parcel surface. The scene renders it and the
// walker enters the garage through it.
export const GARAGE_PORTAL_STORAGE_KEY = 'earth2:garage-portal:v1';

export function loadGaragePortals() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(GARAGE_PORTAL_STORAGE_KEY);
    if (!raw) return {};
    const rec = JSON.parse(raw);
    if (!rec || typeof rec !== 'object') return {};
    const out = {};
    for (const [parcelId, p] of Object.entries(rec)) {
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
        out[parcelId] = { x: p.x, z: p.z, yaw: Number.isFinite(p.yaw) ? p.yaw : 0 };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveGaragePortal(parcelId, portal) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (typeof parcelId !== 'string' || !parcelId) return;
    if (!portal || !Number.isFinite(portal.x) || !Number.isFinite(portal.z)) return;
    const all = loadGaragePortals();
    all[parcelId] = {
      x: portal.x,
      z: portal.z,
      yaw: Number.isFinite(portal.yaw) ? portal.yaw : 0,
    };
    localStorage.setItem(GARAGE_PORTAL_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable — the portal lives for this session only
  }
}

export function removeGaragePortal(parcelId) {
  try {
    if (typeof localStorage === 'undefined') return;
    const all = loadGaragePortals();
    if (typeof parcelId === 'string' && parcelId in all) {
      delete all[parcelId];
      localStorage.setItem(GARAGE_PORTAL_STORAGE_KEY, JSON.stringify(all));
    }
  } catch {
    // storage unavailable — nothing to remove
  }
}
