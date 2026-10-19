// lib/earth/roam.js — street-level free roam for the hub Earth
// (Master Earth campaign Day 2, pulled forward 2026-10-15).
//
// Pure math + one shared session-state object. No DOM, no THREE:
// headless-testable, same discipline as lib/earth/placements.js.
// The scene layer (EarthFlightController / EarthWalker / NexusEarth)
// reads and writes the singleton `roamState`; everything geometric
// lives here so the traversal tests can prove it without a browser.
//
// The model: the traveler walks the real planet. Position is a
// lat/lon on the real heightmap (grounding via placements.js's
// surfaceRadiusAt — the same sampler that grounds every placed
// asset, so the walker stands on the surface the visitor sees).
// Movement is great-circle stepping from the camera's compass
// heading; the camera is a third-person rig behind the embodied
// character. Speeds and heights are in the scene layer's declared
// display scale (DISPLAY_UNITS_PER_METRE), like every other Earth
// display concern — the underlying geography stays true.
import { latLonToVec3, EARTH_RADIUS } from '../geo.js';
import { surfaceRadiusAt, DISPLAY_UNITS_PER_METRE } from './placements.js';
import { EARTH_ASSETS } from './assets.js';
import { moveWithCollision } from './collision.js';

/** Full-tilt run speed at street level, hub units per second.
 *  In display terms ≈ 13.75 m/s of world — a strong run; the
 *  analog curve below keeps a gentle push at a walking pace. */
export const ROAM_MAX_SPEED = 0.22;
/** Eye/head heights and rig distances, in display metres. */
export const ROAM_HEAD_M = 1.62;
export const ROAM_CAM_BACK_M = 7.5;
export const ROAM_CAM_LOOKAHEAD_M = 2.0;
/** Pitch limits for the street rig, degrees. */
export const ROAM_PITCH_MIN = -28;
export const ROAM_PITCH_MAX = 55;
/** Absolute floor for the street camera, display metres above the
 *  ground surface. Neither the camera nor the avatar may pass below
 *  the flooring: at steep negative pitch the boom would otherwise
 *  push the lens ~1.9m under the terrain, where the viewer sees
 *  geometry undersides and exposure blowout. */
export const ROAM_MIN_CAM_ABOVE_GROUND_M = 0.35;

/** Spawn points for street level: every exact single in the bridge
 *  (the landmark singles at their true coordinates). Bridge order
 *  is curated (natural landmarks, then built landmarks). */
export function landmarkSpawns() {
  const out = [];
  for (const a of EARTH_ASSETS) {
    const p = a.placement || {};
    if (p.mode === 'single' && p.lat != null && p.lon != null) {
      out.push({ id: a.id, name: a.name, lat: p.lat, lon: p.lon });
    }
  }
  return out;
}

/** A fresh roam session state. `yawDeg` is the compass heading the
 *  camera faces (0 = north, 90 = east); `faceDeg` is where the
 *  embodied character faces (it turns toward travel while moving,
 *  and toward the camera heading while standing). */
export function createRoamState() {
  return {
    active: false,
    lat: 0,
    lon: 0,
    yawDeg: 0,
    pitchDeg: 14,
    faceDeg: 0,
    moving: false,
    sprinting: false,
    speed01: 0,
  };
}

/** The one session singleton the scene layer shares. Refs that
 *  must survive re-renders without re-creating the world live
 *  here (the established quatRef/controls pattern, as data). */
export const roamState = createRoamState();

export function beginRoam(state, lat, lon, yawDeg = 0) {
  state.active = true;
  state.lat = lat;
  state.lon = lon;
  state.yawDeg = yawDeg;
  state.faceDeg = yawDeg;
  state.pitchDeg = 14;
  state.moving = false;
  state.sprinting = false;
  state.speed01 = 0;
  return state;
}

export function endRoam(state) {
  state.active = false;
  state.moving = false;
  state.sprinting = false;
  state.speed01 = 0;
  return state;
}

const clampLat = (lat) => Math.max(-85, Math.min(85, lat));
const wrapLon = (lon) => {
  let l = lon;
  while (l > 180) l -= 360;
  while (l < -180) l += 360;
  return l;
};

/** Great-circle destination point: start at (lat, lon), travel
 *  distRad radians of arc on a bearing (compass degrees). */
export function destinationPoint(lat, lon, bearingDeg, distRad) {
  const d = distRad;
  const br = (bearingDeg * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lon * Math.PI) / 180;
  const sinLat2 = Math.sin(p1) * Math.cos(d)
    + Math.cos(p1) * Math.sin(d) * Math.cos(br);
  const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)));
  const lon2 = l1 + Math.atan2(
    Math.sin(br) * Math.sin(d) * Math.cos(p1),
    Math.cos(d) - Math.sin(p1) * Math.sin(lat2),
  );
  return { lat: clampLat((lat2 * 180) / Math.PI), lon: wrapLon((lon2 * 180) / Math.PI) };
}

/** Advance the walker one frame.
 *  input: { forward, strafe } in the hub controls' convention
 *  ALREADY resolved to game terms — forward +1 = push up / W,
 *  strafe +1 = push right / D, magnitudes analog (0..1 each).
 *  dt in seconds. opts.radius = the globe radius to step over
 *  (the local surface radius; defaults to the base globe radius).
 *  Mutates and returns the state. */
export function stepRoam(state, input, dt, opts = {}) {
  const f = input?.forward || 0;
  const s = input?.strafe || 0;
  const mag = Math.min(1, Math.hypot(f, s));
  if (!(dt > 0) || mag < 0.02) {
    state.moving = false;
    state.sprinting = false;
    state.speed01 = 0;
    return state;
  }
  const radius = opts.radius || EARTH_RADIUS;
  const speed = ROAM_MAX_SPEED * Math.pow(mag, 1.15);
  const bearing = state.yawDeg + (Math.atan2(s, f) * 180) / Math.PI;
  const next = destinationPoint(state.lat, state.lon, bearing, (speed * dt) / radius);
  // Solid collision: walls, buildings, landmarks, rocks block movement.
  // Slides along the obstacle if only one axis is blocked.
  const moved = moveWithCollision(state.lat, state.lon, next.lat, next.lon, 0.5, false);
  state.lat = moved.lat;
  state.lon = moved.lon;
  state.faceDeg = bearing;
  state.moving = true;
  state.speed01 = mag;
  state.sprinting = mag > 0.85;
  return state;
}

/** Local tangent frame at lat/lon: unit normal (up), east, north
 *  as plain {x, y, z} vectors in globe-local space. */
export function tangentFrame(lat, lon) {
  const n = latLonToVec3(lat, lon, 1);
  const theta = ((lon + 180) * Math.PI) / 180;
  const east = { x: Math.sin(theta), y: 0, z: Math.cos(theta) };
  // north = normal x east (verified right-handed: east x north = normal)
  const north = {
    x: n.y * east.z - n.z * east.y,
    y: n.z * east.x - n.x * east.z,
    z: n.x * east.y - n.y * east.x,
  };
  return { normal: n, east, north };
}

/** Compass heading vector (tangent, unit) for a yaw in degrees. */
export function headingVector(frame, yawDeg) {
  const y = (yawDeg * Math.PI) / 180;
  const c = Math.cos(y);
  const s = Math.sin(y);
  return {
    x: frame.north.x * c + frame.east.x * s,
    y: frame.north.y * c + frame.east.y * s,
    z: frame.north.z * c + frame.east.z * s,
  };
}

const addScaled = (p, v, k) => ({
  x: p.x + v.x * k,
  y: p.y + v.y * k,
  z: p.z + v.z * k,
});
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/** The street rig for the current state, in globe-local coords:
 *  where the avatar stands, where the camera sits, what it looks
 *  at. heightData (decoded heightmap + dims) grounds the rig on
 *  the real terrain; without it the base sphere is used (the
 *  heightmap loads in the first moments after mount; the rig
 *  settles onto the terrain as soon as it is available).
 *  opts.unitsPerMetre overrides the display scale (tests). */
export function cameraRig(state, heightData, w, h, opts = {}) {
  const upm = opts.unitsPerMetre ?? DISPLAY_UNITS_PER_METRE;
  const surfaceRadius = heightData
    ? surfaceRadiusAt(heightData, w, h, state.lat, state.lon)
    : EARTH_RADIUS;
  const ground = latLonToVec3(state.lat, state.lon, surfaceRadius);
  const frame = tangentFrame(state.lat, state.lon);
  const forward = headingVector(frame, state.yawDeg);
  const pitch = (state.pitchDeg * Math.PI) / 180;
  const back = ROAM_CAM_BACK_M * upm;
  const head = addScaled(ground, frame.normal, ROAM_HEAD_M * upm);
  let camPos = addScaled(
    addScaled(head, forward, -Math.cos(pitch) * back),
    frame.normal, Math.sin(pitch) * back,
  );
  // Absolute floor: lift the lens back above the surface when the boom
  // dips under (steep negative pitch). The avatar is already grounded
  // at `ground`; this keeps the camera on the same side of the floor.
  const camAboveM = dot(sub(camPos, ground), frame.normal) / upm;
  if (camAboveM < ROAM_MIN_CAM_ABOVE_GROUND_M) {
    camPos = addScaled(camPos, frame.normal, (ROAM_MIN_CAM_ABOVE_GROUND_M - camAboveM) * upm);
  }
  const lookTarget = addScaled(head, forward, ROAM_CAM_LOOKAHEAD_M * upm);
  return {
    surfaceRadius,
    ground,
    normal: frame.normal,
    east: frame.east,
    north: frame.north,
    forward,
    head,
    camPos,
    lookTarget,
    avatarPos: ground,
  };
}
