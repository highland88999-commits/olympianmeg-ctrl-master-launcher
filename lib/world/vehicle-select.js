// lib/world/vehicle-select.js — THE SHARED VEHICLE SELECTION LOGIC
// (Merlin, Nov 16 ~03:49 — UNIVERSAL CONTROLS CORE, workstream E).
//
// For worlds where MORE THAN ONE vehicle can be summoned, clicking
// SUMMON opens a VEHICLE SELECTION MENU instead of summoning
// directly. One implementation, not per-world copies: every world
// maps its own roster into options, the menu (components/world/
// VehicleSelectMenu.jsx) wears them, and the caller spawns the
// pick. Worlds with ONE vehicle keep direct summon; worlds with
// none keep no summon.
//
// THE SUMMON ACT (the Wave 1 orientation law): the chosen vehicle
// spawns WITH the user in it, ready to go — front-forward. The
// spawn pose puts the vehicle a clearance ahead of the walker, on
// the walker's own heading, so the nose faces the way the walker
// faces (front bumper forward, rear behind the user) on spawn,
// on mount, and while moving. The caller applies the pose to its
// own vehicle state (parked landmark, fleet entry, parcel vehicle
// — the state machine stays the world's own) and mounts.
//
// THE FACES: each option wears a graphic of THAT vehicle in the
// button (public/images/shadow-realm/ui/tron-vehicle-<id>.webp,
// TRON house style — the same disc frame as the per-function
// faces, the vehicle itself a side-profile silhouette styled
// after the actual machine: class, stance and colour). No words
// on the selection orbs — the name lives in the menu's detail
// line / aria-label only, never printed on the orb.
//
// Pure functions only — no DOM, no React, no THREE — node tests
// drive this module directly (tests/vehicle-select.test.mjs).

/** Folder the vehicle faces live in (same as the orb faces). */
export const VEHICLE_FACE_DIR = '/images/shadow-realm/ui/';

/** Fallback face when a vehicle has no art of its own yet: the
 * SUMMON face. A missing face never blocks the menu — the orb
 * falls back to this instead of rendering blank. */
export const VEHICLE_FACE_FALLBACK = `${VEHICLE_FACE_DIR}tron-summon.webp`;

/** Minimum roster size that opens the menu (2+). A lone vehicle
 * keeps direct summon — the menu never appears for one. */
export const MULTI_VEHICLE_MIN = 2;

/** Gap (m) between the walker and the summoned vehicle's nose —
 * clear of the rider, close enough that summoning never reads
 * as a teleport. Added to the vehicle's own body radius. */
export const SUMMON_GAP_M = 1.5;

/** Max orbs per row in the menu grid — five across fits a phone
 * frame at 56 px orbs with gaps; more rows stack below. */
export const VEHICLE_MENU_MAX_COLUMNS = 5;

/**
 * Face art for a vehicle id: `tron-vehicle-<id>.webp` in the
 * TRON ui folder. Pass an explicit `art` on the option to
 * override (Earth 2's `earth1:` slugs and Argo's namespaced ids
 * do — their files are named for the menu id, not the slug).
 */
export function vehicleFaceArtFor(id) {
  if (typeof id !== 'string' || !id) return VEHICLE_FACE_FALLBACK;
  return `${VEHICLE_FACE_DIR}tron-vehicle-${id}.webp`;
}

/**
 * Normalize any world's roster into menu options:
 * `{ id, name, blurb, art }`. Accepts `id` or `key`, `blurb` or
 * `desc`; drops entries with no id or no name; keeps the
 * roster's order. `art` defaults to vehicleFaceArtFor(id).
 */
export function normalizeVehicleOptions(roster) {
  if (!Array.isArray(roster)) return [];
  const out = [];
  for (const v of roster) {
    if (!v || typeof v !== 'object') continue;
    const id = v.id != null ? String(v.id) : (v.key != null ? String(v.key) : '');
    const name = typeof v.name === 'string' ? v.name : '';
    if (!id || !name) continue;
    out.push({
      id,
      name,
      blurb: typeof v.blurb === 'string' ? v.blurb
        : (typeof v.desc === 'string' ? v.desc : ''),
      art: typeof v.art === 'string' && v.art ? v.art : vehicleFaceArtFor(id),
    });
  }
  return out;
}

/** True when the roster opens the selection menu (2+ options). */
export function shouldShowVehicleMenu(options) {
  return Array.isArray(options) && options.length >= MULTI_VEHICLE_MIN;
}

/** The option with this id, or null — a stale pick never spawns. */
export function pickVehicleOption(options, id) {
  if (!Array.isArray(options) || typeof id !== 'string') return null;
  return options.find((o) => o && o.id === id) || null;
}

/**
 * Columns for the menu grid: as many across as fit (up to
 * VEHICLE_MENU_MAX_COLUMNS), never more than the option count,
 * never below 1 — a lone row never stretches, a full roster
 * never runs off the frame's width.
 */
export function vehicleMenuColumns(count, maxColumns = VEHICLE_MENU_MAX_COLUMNS) {
  const n = Math.floor(Number(count) || 0);
  if (n <= 0) return 1;
  const cap = Math.floor(Number(maxColumns) || VEHICLE_MENU_MAX_COLUMNS);
  return Math.max(1, Math.min(n, Math.max(1, cap)));
}

/**
 * Where the chosen vehicle spawns, front-forward on the
 * walker's heading (walker convention: yaw 0 = -Z, forward =
 * (-sin yaw, -cos yaw) — the same forward vehicles.js
 * vehicleForward uses).
 *
 *   yaw: the walker's yaw — the vehicle's nose faces the way
 *     the walker faces, so the driver is already looking down
 *     the road with the front bumper ahead.
 *   x/z: the walker's position advanced along that forward by
 *     bodyRadiusM + SUMMON_GAP_M — the vehicle arrives ahead
 *     of the rider, never on top of them.
 *
 * A non-finite yaw/position falls back to yaw 0 at the walker's
 * spot (never NaN into a scene); a bad radius falls back to 2 m.
 */
export function summonSpawnPose({ walkerX = 0, walkerZ = 0, walkerYaw = 0, bodyRadiusM = 2 } = {}) {
  const x = Number.isFinite(walkerX) ? walkerX : 0;
  const z = Number.isFinite(walkerZ) ? walkerZ : 0;
  const yaw = Number.isFinite(walkerYaw) ? walkerYaw : 0;
  const r = Number.isFinite(bodyRadiusM) && bodyRadiusM > 0 ? bodyRadiusM : 2;
  const dist = r + SUMMON_GAP_M;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return { x: x + fx * dist, z: z + fz * dist, yaw };
}

/**
 * Earth 1 roster -> menu options (lib/earth/vehicles.js
 * VEHICLES): id, name, blurb straight through, face by id.
 * Kept here so Earth 1 and the Earth 2 bridge share one map.
 */
export function earthVehicleOptions(vehicles) {
  return normalizeVehicleOptions(vehicles);
}

/**
 * Star Wars parked vehicles -> menu options: the zone entries
 * (`{ id, type }` — one landspeeder + three podracers, each
 * with its own vid). The face is per TYPE (one landspeeder
 * face, one podracer face), the name per ENTRY (the grid pods
 * are distinct machines, not one button).
 */
export function starWarsVehicleOptions(entries) {
  if (!Array.isArray(entries)) return [];
  const names = {
    landspeeder: 'Landspeeder',
    podracer: 'Podracer',
    rover: 'Rover',
  };
  return entries
    .filter((e) => e && typeof e.id === 'string' && typeof e.type === 'string')
    .map((e) => ({
      id: e.id,
      name: e.name || names[e.type] || e.type,
      blurb: '',
      art: vehicleFaceArtFor(e.type),
    }));
}

/**
 * Shadow Realm trim bikes -> menu options (app/shadow-realm/
 * schemes.js VEHICLES): key -> id, desc -> blurb, face by key.
 */
export function shadowRealmBikeOptions(bikes) {
  return normalizeVehicleOptions(bikes);
}
