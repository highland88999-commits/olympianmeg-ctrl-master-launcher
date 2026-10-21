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
import { latLonToVec3, vec3ToLatLon, EARTH_RADIUS } from '../geo.js';
import { surfaceRadiusAt, DISPLAY_UNITS_PER_METRE } from './placements.js';
import { EARTH_ASSETS } from './assets.js';
import { moveWithCollision } from './collision.js';
import { parachuteState } from './parachute.js';
import { createSwimState, stepSwim, SWIM_SPEED_FACTOR } from './swim.js';

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
export const ROAM_PITCH_MAX = 85;
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
    // Water (lib/earth/swim.js): the swim sub-state, advanced by
    // stepRoam from the same heightmap the rig grounds on.
    swim: createSwimState(),
    // The embodied character's measured size in display metres
    // { heightM, lengthM }, published by the scene layer (Earth
    // Walker) when a pick is standing; cameraRig uses it to frame
    // the WHOLE body. Null = the native figure's 2 m stature.
    charSizeM: null,
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
  state.swim = createSwimState();
  return state;
}

export function endRoam(state) {
  state.active = false;
  state.moving = false;
  state.sprinting = false;
  state.speed01 = 0;
  state.swim = createSwimState();
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
  // Water first (lib/earth/swim.js): the swim state machine runs
  // even at a standstill — floating, diving and resurfacing are
  // not locomotion. It needs the heightmap; callers without one
  // (older tests) simply stay on dry land.
  const hd = opts.heightData || null;
  stepSwim(state, { dive: !!input?.dive, surface: !!input?.surface }, dt,
    hd ? hd.data : null, hd ? hd.w : 0, hd ? hd.h : 0,
    { frozen: !!opts.swimFrozen });
  if (!(dt > 0) || mag < 0.02) {
    state.moving = false;
    state.sprinting = false;
    state.speed01 = 0;
    return state;
  }
  const radius = opts.radius || EARTH_RADIUS;
  // Speed scales with the Ant-Man shrink: proportional at every size,
  // so a step at 0.00001x covers 0.00001x the world-distance — the
  // quantum realm is a real place to cross, not a puddle (Merlin's
  // scale-invariance experiment, 2026-10-20). Swimming is a pace
  // of its own (lib/earth/swim.js SWIM_SPEED_FACTOR).
  const swimFactor = state.swim?.active ? SWIM_SPEED_FACTOR : 1;
  const speed = ROAM_MAX_SPEED * Math.pow(mag, 1.15) * (parachuteState?.scale || 1) * swimFactor;
  const bearing = state.yawDeg + (Math.atan2(s, f) * 180) / Math.PI;
  const next = destinationPoint(state.lat, state.lon, bearing, (speed * dt) / radius);
  // Solid collision: walls, buildings, landmarks, rocks block movement.
  // Slides along the obstacle if only one axis is blocked.
  // Player radius scales with Ant-Man shrink (0.5m at 1x, shrinking in proportion to the Ant-Man scale).
  const playerRadiusM = 0.5 * (parachuteState?.scale || 1);
  const moved = moveWithCollision(state.lat, state.lon, next.lat, next.lon, playerRadiusM, false);
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
  // Character-aware framing (Merlin, 2026-10-20: "3rd person
  // should put the character fully in front of the camera"). The
  // scene layer publishes the embodied character's measured size
  // (opts.charSizeM { heightM, lengthM }, display metres); the boom
  // stretches so the WHOLE body — head to tail, feet to crown —
  // fits in front of the lens, and the head anchor rides at the
  // body's own eye line. With NO published size the rig is the
  // historic one, byte-exact (head 1.62 m, boom 7.5 m).
  const hasChar = !!(opts.charSizeM
    && (opts.charSizeM.heightM > 0 || opts.charSizeM.lengthM > 0));
  const charH = hasChar && opts.charSizeM.heightM > 0 ? opts.charSizeM.heightM : 2;
  const charL = hasChar && opts.charSizeM.lengthM > 0 ? opts.charSizeM.lengthM : 1;
  const headM = hasChar ? Math.max(ROAM_HEAD_M, charH * 0.92) : ROAM_HEAD_M;
  const backM = hasChar
    ? Math.max(ROAM_CAM_BACK_M, charL * 1.35 + charH * 2.4)
    : ROAM_CAM_BACK_M;
  const back = backM * upm;
  // Swimming (lib/earth/swim.js): the body floats/dives ABOVE the
  // ground point (the seabed, in water) — the whole rig rides the
  // same lift the walker mesh gets, so the camera frames the
  // swimmer, not the lakebed under him.
  const swimLiftM = opts.swimAltM > 0 ? opts.swimAltM : 0;
  const head = addScaled(ground, frame.normal, (headM + swimLiftM) * upm);
  const avatarPos = swimLiftM > 0
    ? addScaled(ground, frame.normal, swimLiftM * upm)
    : ground;
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
  // Camera-LOCAL floor (the black-band fix): the walker-relative
  // lift above only proves the lens is over the WALKER's ground.
  // Swung 8–27 m behind him onto a rising slope or a structure's
  // side, the terrain under the CAMERA can be higher than the
  // terrain under his feet — the old rig (and the world clamp that
  // shared its walker anchor) let the lens sink under that local
  // surface, where the viewer sees geometry undersides: a black
  // band with the world far below. Clamp against the surface at
  // the camera's OWN lat/lon: radial distance >= that surface +
  // the same margin, the floor law applied to the lens itself.
  if (heightData) {
    const camLL = vec3ToLatLon(camPos);
    if (camLL.radius > 0) {
      const camSurfaceR = surfaceRadiusAt(heightData, w, h, camLL.lat, camLL.lon);
      const minR = camSurfaceR + ROAM_MIN_CAM_ABOVE_GROUND_M * upm;
      if (camLL.radius < minR) {
        const k = minR / camLL.radius;
        camPos = { x: camPos.x * k, y: camPos.y * k, z: camPos.z * k };
      }
    }
  }
  const lookTarget = addScaled(head, forward, ROAM_CAM_LOOKAHEAD_M * upm);
  if (opts.firstPerson) {
    // First person: the lens sits IN the traveler's head and looks
    // where they face, pitched by the same pitchDeg the boom rig
    // obeys (positive pitch = gaze tilts down toward the ground
    // ahead, negative = gaze rises) — one look model, two seats.
    // The scene layer hides the traveler's own body in this mode,
    // so nothing of them can block or haunt the view.
    const lookDir = {
      x: forward.x * Math.cos(pitch) - frame.normal.x * Math.sin(pitch),
      y: forward.y * Math.cos(pitch) - frame.normal.y * Math.sin(pitch),
      z: forward.z * Math.cos(pitch) - frame.normal.z * Math.sin(pitch),
    };
    return {
      surfaceRadius,
      ground,
      normal: frame.normal,
      east: frame.east,
      north: frame.north,
      forward,
      head,
      camPos: head,
      lookTarget: addScaled(head, lookDir, ROAM_CAM_LOOKAHEAD_M * upm),
      avatarPos,
      firstPerson: true,
      boomM: 0,
      headM,
    };
  }
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
    avatarPos,
    firstPerson: false,
    boomM: backM,
    headM,
  };
}
