// lib/earth2/vehicles.js
// EARTH 2 — THE FLEET: pure drive/fly logic (Vehicles Phase 1,
// 2026-10-23). Tyrrell Field's four machines (lib/earth2/
// airport.js) — the Expedition Rover, the Speed Bike, the Scarab
// Cruiser and the VTOL Scout — are driven by the step functions
// here, and only here: the scene (components/earth2/
// Earth2World.jsx) feeds input in and reads transforms out, so
// every law of motion is unit-testable without a renderer.
//
// THE LAWS, mirroring the walker's (lib/earth2/world.js):
//   - terrain is the floor: a ground vehicle's y is heightAt,
//     its pitch and roll read off the slope under its own
//     footprint (front/back, left/right samples);
//   - deep water is a wall: no swimming vehicles — a step into
//     water deeper than the wading limit slides along each axis
//     before it is given up, exactly the walker's rule, and a
//     vehicle already somehow over-deep may move only shallower;
//   - structures push out by radius, the world's edge is a wall;
//   - the VTOL answers to different physics: it lifts vertically,
//     tilts into horizontal motion, may cross water (it is ABOVE
//     it), and lands only where the ground is near-flat — over
//     steep ground the descent is refused and the refusal is
//     reported on the returned state (landingRefused).
//
// SPEEDS (Merlin's ordering): the bike is fastest on the ground,
// the scarab mid, the rover slowest-but-steady (its turn
// authority holds at crawl speed, where the others fade), and
// the VTOL fastest overall once it is in the air.
//
// PERSISTENCE, HONESTLY: where each vehicle was left persists
// on-device (localStorage), like the fossil pack and the
// blood-sac tallies — no server vehicle ledger exists yet. State
// is { x, z, heading, speed, alt } per slug; anything malformed
// sanitizes back to the vehicle's parking spot (airport.js).
//
// FACING (measured off the real GLBs, the Hammond discipline):
// each rig's forward was read from its geometry/skeleton and is
// carried here as `spin` — the rotation the mount applies inside
// the heading group so the model's nose lands on its local +Z:
//   rover  — longest axis X, the mast/sensor end leads: forward
//            −X in bind space → spin +90°
//   bike   — the humanoid template lies along Z with its head at
//            the fairing end: forward −Z → spin 180°
//   scarab — spine/head run up +X: forward +X → spin −90°
//   vtol   — unrigged, near-square plan; +Z taken as the nose.
// The on-device look is the verdict on each, as with every rig.

import { WORLD_HALF_M, MAX_WADE_DEPTH_M, WATER_Y } from './world.js';
import { AIRPORT_PARKING } from './airport.js';
import {
  vehicleInstances,
  homeStateForInstance,
  modelSlugForInstance,
  BOAT_SLUG,
} from './fleet.js';
import { bridgePierColliders } from './bridges.js';

export const VEHICLE_STORAGE_KEY = 'earth2:vehicles:v1';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Per-vehicle truth: how it moves, how it is boarded, how the
 *  mount seats it. Speeds in m/s, turn rates in rad/s. */
export const VEHICLE_SPECS = Object.freeze({
  rover: Object.freeze({
    slug: 'rover', name: 'Expedition Rover', verb: 'Drive', air: false,
    maxSpeed: 9, reverseMax: 3.5, accel: 5, turnRate: 0.9, turnFloor: 0.65,
    radius: 2.3, halfLength: 2.3, halfWidth: 1.35, eyeHeight: 2.9,
    spin: Math.PI / 2,
  }),
  'speed-bike': Object.freeze({
    slug: 'speed-bike', name: 'Speed Bike', verb: 'Ride', air: false,
    maxSpeed: 30, reverseMax: 4, accel: 14, turnRate: 1.25, turnFloor: 0.25,
    radius: 1.3, halfLength: 1.3, halfWidth: 0.6, eyeHeight: 2.2,
    spin: Math.PI,
  }),
  scarab: Object.freeze({
    slug: 'scarab', name: 'Scarab Cruiser', verb: 'Drive', air: false,
    maxSpeed: 16, reverseMax: 5, accel: 8, turnRate: 1.0, turnFloor: 0.4,
    radius: 2.6, halfLength: 2.5, halfWidth: 1.9, eyeHeight: 3.0,
    spin: -Math.PI / 2,
  }),
  vtol: Object.freeze({
    slug: 'vtol', name: 'VTOL Scout', verb: 'Fly', air: true,
    maxSpeed: 34, reverseMax: 10, accel: 11, turnRate: 1.1, turnFloor: 1,
    radius: 5.2, halfLength: 5.5, halfWidth: 5.5, eyeHeight: 3.4,
    spin: 0,
    maxAlt: 42, climbRate: 7, landSlopeMax: 0.16,
  }),
});

export const VEHICLE_SLUGS = Object.freeze(Object.keys(VEHICLE_SPECS));

/** One vehicle's spec by slug, or null. */
export function vehicleSpec(slug) {
  return VEHICLE_SPECS[slug] || null;
}

// ── Terrain Wave B: the River Runner, and the fleet as instances ──
// The boat is NOT one of the four Tyrrell Field specs above (that
// set stays exactly what Phase 1 pinned); it carries its own spec
// and its own step law below. The hull measures ~7.7 m: reading
// the optimized geometry's cross-sections, the +Z end is the
// tapered, low, narrow end — the bow — so spin is 0 (the vehicle
// convention's forward already), and the stern carries the
// windshield and the twin outboards. The on-device look is the
// verdict, as with every mount.
export const BOAT_SPEC = Object.freeze({
  slug: BOAT_SLUG,
  name: 'River Runner',
  verb: 'Sail',
  water: true,
  maxSpeed: 26, // the fastest way across this planet's water
  reverseMax: 6,
  accel: 7,
  brake: 10,
  turnRate: 0.85,
  turnFloor: 1, // a boat answers its helm at any speed
  radius: 2.2, // collision circle
  halfLength: 3.85, // the bow probe rides this far ahead
  halfWidth: 1.8,
  draft: 0.45, // hull below the waterline; arch clearance reads it
  eyeHeight: 2.4,
  spin: 0,
});
export const BOAT_MIN_DEPTH_M = 0.4; // the bow grounds where the water shallows past this

/** A spec by MODEL slug — the four field machines or the boat. */
export function modelSpec(slug) {
  if (slug === BOAT_SLUG) return BOAT_SPEC;
  return VEHICLE_SPECS[slug] || null;
}

/** A spec by INSTANCE id (fleet.js's registry resolves the model). */
export function vehicleSpecForInstance(id) {
  const slug = modelSlugForInstance(id);
  return slug ? modelSpec(slug) : null;
}

// ── State: where each machine sleeps ────────────────────────────
function parkingState(slug) {
  const spot = AIRPORT_PARKING.find((s) => s.slug === slug);
  if (!spot) return { x: 0, z: 0, heading: 0, speed: 0, alt: 0 };
  return { x: spot.x, z: spot.z, heading: spot.heading, speed: 0, alt: 0 };
}

function sanitizeVehicleState(slug, raw) {
  const home = parkingState(slug);
  if (!raw || typeof raw !== 'object') return home;
  const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const spec = VEHICLE_SPECS[slug];
  return {
    x: clamp(num(raw.x, home.x), -WORLD_HALF_M + 4, WORLD_HALF_M - 4),
    z: clamp(num(raw.z, home.z), -WORLD_HALF_M + 4, WORLD_HALF_M - 4),
    heading: num(raw.heading, home.heading),
    speed: 0, // a reloaded world never inherits motion
    alt: spec && spec.air ? clamp(num(raw.alt, 0), 0, spec.maxAlt) : 0,
  };
}

/** Every vehicle's state, parked at Tyrrell Field. */
export function defaultVehicleStates() {
  const out = {};
  for (const slug of VEHICLE_SLUGS) out[slug] = parkingState(slug);
  return out;
}

/** The sanitized state map for arbitrary stored data. */
export function sanitizeVehicleStates(raw) {
  const out = defaultVehicleStates();
  if (!raw || typeof raw !== 'object') return out;
  for (const slug of VEHICLE_SLUGS) {
    if (raw[slug]) out[slug] = sanitizeVehicleState(slug, raw[slug]);
  }
  return out;
}

// ── Instance states (Wave B): one state per physical machine ────
// The scene's state map is keyed by INSTANCE id (fleet.js). The
// four Tyrrell Field machines keep their Phase 1 ids — the id IS
// the slug — so a Phase 1 save (four keys) loads into the
// instance map unchanged, and every instance the save has never
// heard of simply starts at its home. defaultVehicleStates /
// sanitizeVehicleStates above keep their Phase 1, airport-only
// meaning for the callers that speak in slugs.
function sanitizeInstanceState(inst, raw) {
  const home = homeStateForInstance(inst.id);
  if (!raw || typeof raw !== 'object') return home;
  const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const spec = modelSpec(inst.slug);
  return {
    slug: inst.slug,
    x: clamp(num(raw.x, home.x), -WORLD_HALF_M + 4, WORLD_HALF_M - 4),
    z: clamp(num(raw.z, home.z), -WORLD_HALF_M + 4, WORLD_HALF_M - 4),
    heading: num(raw.heading, home.heading),
    speed: 0, // a reloaded world never inherits motion
    alt: spec && spec.air ? clamp(num(raw.alt, 0), 0, spec.maxAlt) : 0,
  };
}

/** Every instance's state, each parked at its own home. */
export function defaultInstanceStates() {
  const out = {};
  for (const inst of vehicleInstances()) out[inst.id] = homeStateForInstance(inst.id);
  return out;
}

/** The sanitized INSTANCE map for arbitrary stored data. */
export function sanitizeInstanceStates(raw) {
  const out = defaultInstanceStates();
  if (!raw || typeof raw !== 'object') return out;
  for (const inst of vehicleInstances()) {
    if (raw[inst.id]) out[inst.id] = sanitizeInstanceState(inst, raw[inst.id]);
  }
  return out;
}

export function loadVehicleStates() {
  try {
    if (typeof localStorage === 'undefined') return defaultInstanceStates();
    const raw = localStorage.getItem(VEHICLE_STORAGE_KEY);
    if (!raw) return defaultInstanceStates();
    return sanitizeInstanceStates(JSON.parse(raw));
  } catch {
    return defaultInstanceStates();
  }
}

export function saveVehicleStates(states) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(VEHICLE_STORAGE_KEY, JSON.stringify(sanitizeInstanceStates(states)));
  } catch { /* a full/blocked store never breaks the drive */ }
}

/** True when a machine sits (near enough) on its home spot —
 *  by slug (the airport four) or by instance id (the fleet). */
export function isParkedAtHome(state, key) {
  const home = homeStateForInstance(key) || parkingState(key);
  return Math.hypot(state.x - home.x, state.z - home.z) < 1.5 && (state.alt || 0) < 0.05;
}

// ── Shared step helpers ─────────────────────────────────────────
function pushOutOfCircles(x, z, radius, colliders) {
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders || []) {
      const dx = px - c.x;
      const dz = pz - c.z;
      const rr = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.001;
        px = c.x + (dx / d) * rr;
        pz = c.z + (dz / d) * rr;
      }
    }
  }
  return { x: px, z: pz };
}

function approachSpeed(speed, target, accel, dt) {
  if (speed < target) return Math.min(target, speed + accel * dt);
  if (speed > target) return Math.max(target, speed - accel * dt * 1.6);
  return speed;
}

/** The ground read at a state: height + the slope tilts under
 *  the footprint (pitch about the local X axis — nose up is
 *  negative in three.js YXZ, matching the scene's rotation.x —
 *  and roll about the local Z). */
export function groundPose(state, spec, heightAt) {
  const sin = Math.sin(state.heading);
  const cos = Math.cos(state.heading);
  const hF = heightAt(state.x + sin * spec.halfLength, state.z + cos * spec.halfLength);
  const hB = heightAt(state.x - sin * spec.halfLength, state.z - cos * spec.halfLength);
  const hR = heightAt(state.x + cos * spec.halfWidth, state.z - sin * spec.halfWidth);
  const hL = heightAt(state.x - cos * spec.halfWidth, state.z + sin * spec.halfWidth);
  return {
    y: heightAt(state.x, state.z),
    pitch: Math.atan2(hB - hF, spec.halfLength * 2),
    roll: Math.atan2(hL - hR, spec.halfWidth * 2),
  };
}

// ── Ground vehicles ─────────────────────────────────────────────
/**
 * One ground-vehicle step. state { x, z, heading, speed };
 * input { throttle, steer } in −1..1; env { heightAt,
 * waterDepthAt, colliders }. Returns a NEW state with `y`,
 * `pitch`, `roll` filled from the ground read. The wading wall
 * and the collider push-out mirror stepWorldWalker's laws.
 */
export function stepGroundVehicle(state, spec, input, dt, env) {
  const throttle = clamp(Number(input && input.throttle) || 0, -1, 1);
  const steer = clamp(Number(input && input.steer) || 0, -1, 1);
  const target = throttle >= 0 ? throttle * spec.maxSpeed : throttle * spec.reverseMax;
  const speed = approachSpeed(state.speed || 0, target, spec.accel, Math.max(0, dt));

  // Turn authority fades in with speed (the rover's barely fades
  // — turnFloor is its "steady") and flips in reverse, like a
  // real wheel.
  const authority = Math.max(spec.turnFloor, Math.min(1, Math.abs(speed) / 3.5));
  const heading = state.heading + steer * spec.turnRate * authority * Math.sign(speed || 1) * dt;
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);

  let nx = state.x + sin * speed * dt;
  let nz = state.z + cos * speed * dt;
  if (speed !== 0) {
    const depthHere = env.waterDepthAt(state.x, state.z);
    const blocked = (x2, z2) => {
      const d = env.waterDepthAt(x2, z2);
      if (depthHere > MAX_WADE_DEPTH_M) return d > depthHere + 0.02;
      return d > MAX_WADE_DEPTH_M;
    };
    if (blocked(nx, nz)) {
      if (!blocked(nx, state.z)) nz = state.z;
      else if (!blocked(state.x, nz)) nx = state.x;
      else { nx = state.x; nz = state.z; }
    }
  }
  const pushed = pushOutOfCircles(nx, nz, spec.radius, env.colliders);
  nx = clamp(pushed.x, -WORLD_HALF_M + 4, WORLD_HALF_M - 4);
  nz = clamp(pushed.z, -WORLD_HALF_M + 4, WORLD_HALF_M - 4);

  const next = { ...state, x: nx, z: nz, heading, speed, alt: 0 };
  const pose = groundPose(next, spec, env.heightAt);
  return { ...next, y: pose.y, pitch: pose.pitch, roll: pose.roll, landingRefused: false };
}

// ── The VTOL ────────────────────────────────────────────────────
/**
 * One VTOL step. state { x, z, heading, speed, alt }; input
 * { throttle, steer, lift } in −1..1. On the ground (alt 0) the
 * craft only lifts; airborne, throttle drives horizontal motion
 * along the heading, steer yaws freely (turnFloor 1 — it pivots
 * in a hover), and lift climbs/descends. Descent onto ground
 * whose slope exceeds spec.landSlopeMax is refused: alt holds
 * at 0.6 m and the returned state carries landingRefused: true.
 * Airborne there is no water wall and no collider push-out —
 * the craft is above both (the world's edge still holds).
 */
export function stepVtol(state, spec, input, dt, env) {
  const throttle = clamp(Number(input && input.throttle) || 0, -1, 1);
  const steer = clamp(Number(input && input.steer) || 0, -1, 1);
  const lift = clamp(Number(input && input.lift) || 0, -1, 1);
  const alt0 = Math.max(0, state.alt || 0);
  const airborne = alt0 > 0.02 || lift > 0;

  let alt = alt0;
  let landingRefused = false;
  if (lift !== 0) {
    alt = clamp(alt0 + lift * spec.climbRate * dt, 0, spec.maxAlt);
    if (lift < 0 && alt < 0.6 && alt0 >= 0.6 - 1e-9) {
      // The landing check, read off the footprint's slope.
      const probe = groundPose({ ...state, alt: 0 }, spec, env.heightAt);
      if (Math.abs(probe.pitch) > spec.landSlopeMax || Math.abs(probe.roll) > spec.landSlopeMax) {
        alt = 0.6;
        landingRefused = true;
      }
    }
    if (lift < 0 && alt <= 0.02) alt = 0;
  }

  const flying = alt > 0.02;
  const target = flying ? (throttle >= 0 ? throttle * spec.maxSpeed : throttle * spec.reverseMax) : 0;
  const speed = approachSpeed(flying ? (state.speed || 0) : 0, target, spec.accel, Math.max(0, dt));
  const heading = state.heading + (flying || airborne ? steer * spec.turnRate * dt : 0);
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);
  const nx = clamp(state.x + sin * speed * dt, -WORLD_HALF_M + 4, WORLD_HALF_M - 4);
  const nz = clamp(state.z + cos * speed * dt, -WORLD_HALF_M + 4, WORLD_HALF_M - 4);

  const groundY = env.heightAt(nx, nz);
  // Flight presentation: the craft leans into its motion —
  // nose-down pitch with forward speed (three.js rotation.x,
  // hence negative), roll from the steer while moving.
  const pitch = flying ? -(speed / spec.maxSpeed) * 0.38 : 0;
  const roll = flying ? -steer * Math.min(1, Math.abs(speed) / spec.maxSpeed) * 0.3 : 0;
  return {
    ...state, x: nx, z: nz, heading, speed, alt,
    y: groundY + alt, pitch, roll, landingRefused,
  };
}

// ── The River Runner ────────────────────────────────────────────
/**
 * One boat step. state { x, z, heading, speed }; input
 * { throttle, steer }; env { waterDepthAt, colliders } — the
 * scene passes the bridge piers plus the static set, so the
 * arch's waterline ends are obstacles and the arch CENTRE is the
 * pass-through. The law:
 *   - the hull floats at the waterline (y = WATER_Y − draft;
 *     the scene adds the bob and the wake read);
 *   - it moves ONLY where the water under its BOW stays deeper
 *     than BOAT_MIN_DEPTH_M — shallows stop the bow dead
 *     (speed bleeds to 0), so there is no beaching onto land;
 *     the house slide rule applies (x-only, then z-only);
 *   - it banks into its turns and lifts its bow with speed —
 *     `roll` and `pitch` ride the returned state for the scene;
 *   - colliders push out with the hull's own radius, exactly the
 *     ground law.
 */
export function stepBoat(state, spec, input, dt, env) {
  const throttle = clamp(Number(input && input.throttle) || 0, -1, 1);
  const steer = clamp(Number(input && input.steer) || 0, -1, 1);
  const target = throttle >= 0 ? throttle * spec.maxSpeed : throttle * spec.reverseMax;
  let speed = approachSpeed(state.speed || 0, target, spec.accel, Math.max(0, dt));
  const heading = state.heading + steer * spec.turnRate * Math.sign(speed || 1) * dt;
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);

  const depthAt = env && env.waterDepthAt ? env.waterDepthAt : () => 99;
  const bowClear = (x2, z2, h2) => depthAt(x2 + Math.sin(h2) * spec.halfLength, z2 + Math.cos(h2) * spec.halfLength) > BOAT_MIN_DEPTH_M;
  let nx = state.x + sin * speed * dt;
  let nz = state.z + cos * speed * dt;
  if (speed !== 0 && !bowClear(nx, nz, heading)) {
    if (bowClear(nx, state.z, heading)) nz = state.z;
    else if (bowClear(state.x, nz, heading)) nx = state.x;
    else { nx = state.x; nz = state.z; }
    // A refused step that moved nothing — the head-on grind
    // against a shore — bleeds the speed away: the hull is
    // stopped, whatever the throttle says. (A slide that DOES
    // move keeps its way on, scrubbing along the bank.)
    if (Math.hypot(nx - state.x, nz - state.z) < 1e-9) speed = 0;
  }
  const pushed = pushOutOfCircles(nx, nz, spec.radius, env && env.colliders);
  nx = clamp(pushed.x, -WORLD_HALF_M + 4, WORLD_HALF_M - 4);
  nz = clamp(pushed.z, -WORLD_HALF_M + 4, WORLD_HALF_M - 4);

  const speedRatio = clamp(Math.abs(speed) / spec.maxSpeed, 0, 1);
  const rollTarget = -steer * speedRatio * 0.14 * Math.sign(speed || 1);
  const ease = Math.min(1, Math.max(0, dt) * 5);
  const roll = (state.roll || 0) + (rollTarget - (state.roll || 0)) * ease;
  return {
    ...state, x: nx, z: nz, heading, speed, alt: 0,
    y: WATER_Y - spec.draft,
    pitch: -0.055 * speedRatio * Math.sign(speed || 1),
    roll,
    landingRefused: false,
  };
}

/** Every collider a boat must respect at a point: the bridge
 *  piers (exported for the scene's boat environment). */
export function boatColliders(extra) {
  return bridgePierColliders().concat(extra || []);
}

/** The step dispatcher the scene calls: air specs fly, water
 *  specs sail, the rest drive. env { heightAt, waterDepthAt,
 *  colliders }. */
export function stepVehicle(state, spec, input, dt, env) {
  if (!spec) return state;
  if (spec.water) return stepBoat(state, spec, input, dt, env);
  return spec.air ? stepVtol(state, spec, input, dt, env) : stepGroundVehicle(state, spec, input, dt, env);
}
