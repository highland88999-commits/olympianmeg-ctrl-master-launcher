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

import { WORLD_HALF_M, MAX_WADE_DEPTH_M } from './world.js';
import { AIRPORT_PARKING } from './airport.js';

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

export function loadVehicleStates() {
  try {
    if (typeof localStorage === 'undefined') return defaultVehicleStates();
    const raw = localStorage.getItem(VEHICLE_STORAGE_KEY);
    if (!raw) return defaultVehicleStates();
    return sanitizeVehicleStates(JSON.parse(raw));
  } catch {
    return defaultVehicleStates();
  }
}

export function saveVehicleStates(states) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(VEHICLE_STORAGE_KEY, JSON.stringify(sanitizeVehicleStates(states)));
  } catch { /* a full/blocked store never breaks the drive */ }
}

/** True when a vehicle sits (near enough) on its parking spot. */
export function isParkedAtHome(state, slug) {
  const home = parkingState(slug);
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

/** The step dispatcher the scene calls: air specs fly, the rest
 *  drive. env { heightAt, waterDepthAt, colliders }. */
export function stepVehicle(state, spec, input, dt, env) {
  if (!spec) return state;
  return spec.air ? stepVtol(state, spec, input, dt, env) : stepGroundVehicle(state, spec, input, dt, env);
}
