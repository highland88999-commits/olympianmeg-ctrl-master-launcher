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
//   - structures push out by radius, the world's edge is a wall;
//   - the VTOL answers to different physics: it lifts vertically,
//     tilts into horizontal motion, and may cross water (it is
//     ABOVE it) — what it may NOT do is meet the ground, the
//     water or a hillside at speed and walk away (Phase 2).
//
// PHASE 2 — NO WALLS, TRUE PHYSICS (Merlin, 2026-10-23):
// "Vehicles should not have walls… deep water, land vehicles
// sink, shallow water, land vehicles drive through nonissue…
// give vehicles integrity bars and if that bar gets shrunken
// to nothing, they explode." The steppers no longer refuse
// water or slope: motion integrates, and CONTACTS have
// consequences through the one damage path
// (lib/earth2/vehicle-damage.js):
//   - ground machines ford the shallows (drag, no damage),
//     drown their drive as the water deepens, sink with the
//     bed, and drain integrity while they sit under — momentum
//     can still carry one across a narrow deep cut to the far
//     shallows, exactly as physics allows;
//   - the boat grounds on its bow: a gentle touch beaches it
//     (stuck, unharmed), a fast one tears the hull;
//   - the VTOL's landing is JUDGED at touchdown — descent
//     rate, attitude against the ground plane, contact speed —
//     never refused: gentle and upright is a landing, hard is
//     damage, on-its-side or a dive is an explosion. Water is
//     not a landing: it ditches, floods, and sinks.
// Every state carries integrity (100 → 0); at 0 the machine is
// wrecked, the steppers refuse it, and a fresh one replaces it
// at its home once the respawn timer runs out (below).
//
// SPEEDS (Merlin's ordering): the bike is fastest on the ground,
// the scarab mid, the rover slowest-but-steady (its turn
// authority holds at crawl speed, where the others fade), and
// the VTOL fastest overall once it is in the air.
//
// PERSISTENCE, HONESTLY: where each vehicle was left persists
// on-device (localStorage), like the fossil pack and the
// blood-sac tallies — no server vehicle ledger exists yet. State
// is { x, z, heading, speed, alt, integrity, wrecked, … } per
// slug; anything malformed sanitizes back to the vehicle's
// parking spot (airport.js).
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

import { WORLD_HALF_M, WATER_Y } from './world.js';
import { bridgedParcelSpec } from './parcel-vehicle-catalog.js';
import {
  INTEGRITY_MAX,
  RESPAWN_DELAY_S,
  SHALLOW_DRIVE_DEPTH_M,
  DROWN_DEPTH_M,
  VTOL_SAFE_DESCENT_MPS,
  VTOL_SAFE_TILT_RAD,
  applyDamage,
  applyShotToVehicle,
  ejectPointFor,
} from './vehicle-damage.js';
import { AIRPORT_PARKING } from './airport.js';
import {
  vehicleInstances,
  vehicleInstanceById,
  homeStateForInstance,
  modelSlugForInstance,
  isStockId,
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
    maxAlt: 42, climbRate: 7, descentRate: 3.2, landSlopeMax: 0.16,
    // Takeoff (Merlin, 2026-11-02): the Scout takes off LIKE A
    // PLANE — a rolling runway takeoff, not a vertical lift.
    // 'rolling': throttle accelerates along the ground; at
    // takeoffSpeed with lift commanded she rotates and climbs.
    // 'vertical': the old VTOL lift (for true VTOL machines,
    // if any are ever defined — none are today).
    takeoffStyle: 'rolling',
    takeoffSpeed: 16, // m/s — rotation speed on the runway roll
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

/** A spec by MODEL slug — the four field machines, the boat, or a
 *  bridged Earth-garage import parked on bought land (Merlin,
 *  2026-11-01: any program's vehicle may live on a buyer's land). */
export function modelSpec(slug) {
  if (slug === BOAT_SLUG) return BOAT_SPEC;
  return VEHICLE_SPECS[slug] || bridgedParcelSpec(slug) || null;
}

/** A spec by INSTANCE id (fleet.js's registry resolves the model). */
export function vehicleSpecForInstance(id) {
  const slug = modelSlugForInstance(id);
  return slug ? modelSpec(slug) : null;
}

// ── State: where each machine sleeps ────────────────────────────
function parkingState(slug) {
  const spot = AIRPORT_PARKING.find((s) => s.slug === slug);
  if (!spot) return { x: 0, z: 0, heading: 0, speed: 0, alt: 0, integrity: INTEGRITY_MAX, wrecked: false };
  return { x: spot.x, z: spot.z, heading: spot.heading, speed: 0, alt: 0, integrity: INTEGRITY_MAX, wrecked: false };
}

// The Phase 2 fields of a state, read honestly out of arbitrary
// stored data: a sound bar survives a reload, a wreck stays a
// wreck (its replacement timer keeps counting), a beached boat
// stays beached, a ditched VTOL stays in the water. Garbage
// reads as a whole, unhurt machine.
function integrityFields(raw) {
  if (!raw || typeof raw !== 'object') {
    return { integrity: INTEGRITY_MAX, wrecked: false, beached: false, ditched: false };
  }
  const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const integrity = clamp(num(raw.integrity, INTEGRITY_MAX), 0, INTEGRITY_MAX);
  const wrecked = raw.wrecked === true || integrity <= 0;
  const out = {
    integrity: wrecked ? 0 : integrity,
    wrecked,
    beached: raw.beached === true,
    ditched: raw.ditched === true,
  };
  if (wrecked) out.respawnIn = clamp(num(raw.respawnIn, RESPAWN_DELAY_S), 0, RESPAWN_DELAY_S);
  return out;
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
    ...integrityFields(raw),
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
  if (!raw || typeof raw !== 'object') {
    return { ...home, integrity: INTEGRITY_MAX, wrecked: false, claimedBy: null, claimedAt: null, awaySince: null };
  }
  const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const spec = modelSpec(inst.slug);
  return {
    slug: inst.slug,
    x: clamp(num(raw.x, home.x), -WORLD_HALF_M + 4, WORLD_HALF_M - 4),
    z: clamp(num(raw.z, home.z), -WORLD_HALF_M + 4, WORLD_HALF_M - 4),
    heading: num(raw.heading, home.heading),
    speed: 0, // a reloaded world never inherits motion
    alt: spec && spec.air ? clamp(num(raw.alt, 0), 0, spec.maxAlt) : 0,
    ...integrityFields(raw),
    // Ownership (fleet.js): the claim + departure stamp ride the
    // ledger verbatim — a claimed machine's saved transform is
    // authoritative and never sanitizes back home.
    claimedBy: typeof raw.claimedBy === 'string' && raw.claimedBy ? raw.claimedBy : null,
    claimedAt: num(raw.claimedAt, null),
    awaySince: num(raw.awaySince, null),
  };
}

/** Every instance's state, each parked at its own home. */
export function defaultInstanceStates() {
  const out = {};
  for (const inst of vehicleInstances()) {
    out[inst.id] = {
      ...homeStateForInstance(inst.id), integrity: INTEGRITY_MAX, wrecked: false,
      claimedBy: null, claimedAt: null, awaySince: null,
    };
  }
  return out;
}

/** The sanitized INSTANCE map for arbitrary stored data. */
export function sanitizeInstanceStates(raw) {
  const out = defaultInstanceStates();
  if (!raw || typeof raw !== 'object') return out;
  for (const inst of vehicleInstances()) {
    if (raw[inst.id]) out[inst.id] = sanitizeInstanceState(inst, raw[inst.id]);
  }
  // Stock instances (fleet.js ownership): born at runtime, kept
  // in the same ledger — any raw key that resolves to a stock
  // descriptor sanitizes against its home instance.
  for (const id of Object.keys(raw)) {
    if (out[id] || !raw[id]) continue;
    const inst = vehicleInstanceById(id);
    if (inst && isStockId(id)) out[id] = sanitizeInstanceState(inst, raw[id]);
  }
  // Parcel vehicles (Merlin, 2026-10-31): buyer-chosen machines
  // parked on owned land. They ride this same ledger — validate
  // the slug and the spot, drop anything else.
  for (const id of Object.keys(raw)) {
    if (out[id] || !raw[id] || !isParcelVehicleId(id)) continue;
    const clean = sanitizeParcelVehicleState(id, raw[id]);
    if (clean) out[id] = clean;
  }
  return out;
}

// ── Parcel vehicles (Merlin, 2026-10-31) ────────────────────────
// A buyer picks one vehicle per owned parcel; it parks where they
// tap on their land and spawns there on every world entry. One
// vehicle per parcel: the ledger key carries the parcel id, so
// re-picking replaces the choice instead of stacking.

/** Ledger key prefix for buyer-chosen parcel vehicles. */
export const PARCEL_VEHICLE_PREFIX = 'parcel-vehicle:';

/** Ledger key for a parcel's chosen vehicle. */
export function parcelVehicleId(parcelId) {
  return `${PARCEL_VEHICLE_PREFIX}${parcelId}`;
}

/** True for ledger keys that are parcel-vehicle entries. */
export function isParcelVehicleId(id) {
  return typeof id === 'string' && id.startsWith(PARCEL_VEHICLE_PREFIX);
}

/** Validate + clean a parcel-vehicle ledger entry; null when junk. */
function sanitizeParcelVehicleState(id, raw) {
  if (!raw || typeof raw !== 'object') return null;
  const slug = typeof raw.slug === 'string' ? raw.slug : null;
  if (!slug || !modelSpec(slug)) return null;
  const parcelId = id.slice(PARCEL_VEHICLE_PREFIX.length);
  if (!parcelId) return null;
  const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  return {
    slug,
    parcelId,
    x: clamp(num(raw.x, 0), -WORLD_HALF_M + 4, WORLD_HALF_M - 4),
    z: clamp(num(raw.z, 0), -WORLD_HALF_M + 4, WORLD_HALF_M - 4),
    heading: num(raw.heading, 0),
    speed: 0, // a reloaded world never inherits motion
    alt: 0,
    ...integrityFields(raw),
    // No claim stamps on parcel vehicles (Merlin, 2026-11-01):
    // ownership is by land title, never by boarding. Stale
    // claimedBy/claimedAt on old records is dropped here.
    awaySince: num(raw.awaySince, null),
  };
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

/**
 * The contact read for one step: resolve a candidate position
 * against the collider circles and the world's edge (the same
 * push-out the law always used), and say whether the resolution
 * was an IMPACT — the candidate had to be corrected while the
 * machine was moving AND it was not already resting against
 * something at the step's start. A resting contact is a scrape,
 * not a crash: the impact bills once, when it happens. The
 * billed speed is the velocity component INTO the surface —
 * the velocity dotted with the contact's outward normal — not
 * the frame's penetration depth (which is quantized by the
 * step size and can read near zero on a genuine full-speed
 * arrival whose step happens to end at the surface).
 * Returns { x, z, impactSpeed } — impactSpeed 0 when no bill.
 */
function resolveContacts(state, nx, nz, radius, speed, dt, colliders) {
  const pushed = pushOutOfCircles(nx, nz, radius, colliders);
  const cx = clamp(pushed.x, -WORLD_HALF_M + 4, WORLD_HALF_M - 4);
  const cz = clamp(pushed.z, -WORLD_HALF_M + 4, WORLD_HALF_M - 4);
  const correction = Math.hypot(nx - cx, nz - cz);
  let impactSpeed = 0;
  if (correction > 1e-6 && speed !== 0 && dt > 0) {
    const resting = (colliders || []).some(
      (c) => Math.hypot(state.x - c.x, state.z - c.z) < c.r + radius + 0.02,
    ) || state.x <= -WORLD_HALF_M + 4.02 || state.x >= WORLD_HALF_M - 4.02
      || state.z <= -WORLD_HALF_M + 4.02 || state.z >= WORLD_HALF_M - 4.02;
    if (!resting) {
      const vx = Math.sin(state.heading || 0) * speed;
      const vz = Math.cos(state.heading || 0) * speed;
      for (const c of colliders || []) {
        const dx = nx - c.x;
        const dz = nz - c.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-9 && d < c.r + radius) {
          // (dx, dz)/d is the surface's outward normal at the
          // contact; the into-surface speed is the velocity
          // AGAINST that normal.
          impactSpeed = Math.max(impactSpeed, -(vx * dx + vz * dz) / d);
        }
      }
      if (cx !== pushed.x) impactSpeed = Math.max(impactSpeed, Math.abs(vx));
      if (cz !== pushed.z) impactSpeed = Math.max(impactSpeed, Math.abs(vz));
      impactSpeed = clamp(impactSpeed, 0, Math.abs(speed));
    }
  }
  return { x: cx, z: cz, impactSpeed };
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
 * One ground-vehicle step. state { x, z, heading, speed,
 * integrity, wrecked }; input { throttle, steer } in −1..1;
 * env { heightAt, waterDepthAt, colliders }. Returns a NEW
 * state with `y`, `pitch`, `roll` filled from the ground read.
 *
 * PHASE 2: there is no water wall. The drive reads the water
 * under the hull: in the shallows (≤ SHALLOW_DRIVE_DEPTH_M) it
 * fords — top speed scaled down by drag, no harm done; deeper,
 * the drive drowns progressively (SHALLOW → DROWN_DEPTH_M) and
 * plain water drag eats the machine's momentum, so a fast entry
 * can still coast across a narrow deep cut on what it carried
 * in. Wherever it stops with water past DROWN_DEPTH_M over the
 * bed, it sits submerged: integrity drains per second until it
 * wrecks where it sank. Its y always follows the bed — sinking
 * is the bed dropping away under the waterline, honestly read.
 * Collider and edge contacts bill through the damage path.
 */
export function stepGroundVehicle(state, spec, input, dt, env) {
  const stepDt = Math.max(0, dt);
  const depthAt = env && typeof env.waterDepthAt === 'function' ? env.waterDepthAt : () => 0;
  if (state.wrecked) {
    const pose = groundPose(state, spec, env.heightAt);
    return {
      ...state, speed: 0, alt: 0, y: pose.y, pitch: pose.pitch, roll: pose.roll,
      integrity: 0, wrecked: true, landingRefused: false,
    };
  }
  const throttle = clamp(Number(input && input.throttle) || 0, -1, 1);
  const steer = clamp(Number(input && input.steer) || 0, -1, 1);

  // Power and drag from the water under the hull RIGHT NOW.
  const depthHere = depthAt(state.x, state.z);
  let power = 1;
  if (depthHere > SHALLOW_DRIVE_DEPTH_M) {
    power = clamp(1 - (depthHere - SHALLOW_DRIVE_DEPTH_M) / (DROWN_DEPTH_M - SHALLOW_DRIVE_DEPTH_M), 0, 1);
  }
  const baseTarget = throttle >= 0 ? throttle * spec.maxSpeed : throttle * spec.reverseMax;
  let target = baseTarget * power;
  if (depthHere > 0 && depthHere <= SHALLOW_DRIVE_DEPTH_M) {
    target = baseTarget * (1 - 0.45 * (depthHere / SHALLOW_DRIVE_DEPTH_M));
  }
  let speed = approachSpeed(state.speed || 0, target, spec.accel, stepDt);
  if (depthHere > SHALLOW_DRIVE_DEPTH_M && speed !== 0) {
    // Drowned: the water itself brakes the machine — a steady
    // drag plus a term that grows with speed, so momentum is a
    // real but wasting asset.
    const drag = (4 + 0.3 * Math.abs(speed)) * stepDt;
    speed -= Math.sign(speed) * Math.min(Math.abs(speed), drag);
  }

  // Turn authority fades in with speed (the rover's barely fades
  // — turnFloor is its "steady") and flips in reverse, like a
  // real wheel.
  const authority = Math.max(spec.turnFloor, Math.min(1, Math.abs(speed) / 3.5));
  const heading = state.heading + steer * spec.turnRate * authority * Math.sign(speed || 1) * stepDt;
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);

  const contact = resolveContacts(
    state,
    state.x + sin * speed * stepDt,
    state.z + cos * speed * stepDt,
    spec.radius, speed, stepDt, env.colliders,
  );

  let next = {
    ...state, x: contact.x, z: contact.z, heading, speed, alt: 0,
    integrity: typeof state.integrity === 'number' ? state.integrity : INTEGRITY_MAX,
    wrecked: false, landingRefused: false,
  };
  if (contact.impactSpeed > 0) {
    next = applyDamage(next, spec, { kind: 'impact', impactSpeed: contact.impactSpeed });
  }
  // Submersion: stopped or crawling with the water over the
  // drowning line, the bar drains. (On a bridge deck the env's
  // depth read is 0 — a machine on a deck never drowns.)
  const depthThere = depthAt(next.x, next.z);
  if (!next.wrecked && depthThere > DROWN_DEPTH_M && stepDt > 0) {
    next = applyDamage(next, spec, { kind: 'submersion', dt: stepDt });
  }
  if (next.wrecked && !state.wrecked) {
    next.eject = ejectPointFor(next, env, state);
  }
  const pose = groundPose(next, spec, env.heightAt);
  return { ...next, y: pose.y, pitch: pose.pitch, roll: pose.roll, depthHere: depthThere };
}

// ── The VTOL ────────────────────────────────────────────────────
// The sink a ditched airframe settles to at the waterline.
export const DITCHED_DRAFT_M = 0.4;
// How fast vertical speed itself builds (m/s²) — a tapped
// descent stays gentle; a held one reaches full descent rate.
const VERT_ACCEL_MPS2 = 5;

function approachRate(v, target, rate, dt) {
  if (v < target) return Math.min(target, v + rate * dt);
  if (v > target) return Math.max(target, v - rate * dt);
  return v;
}

/**
 * One VTOL step. state { x, z, heading, speed, alt, vspeed,
 * integrity, wrecked, ditched }; input { throttle, steer,
 * lift } in −1..1. On the ground (alt 0) the craft only lifts;
 * airborne, throttle drives horizontal motion along the
 * heading, steer yaws freely (turnFloor 1 — it pivots in a
 * hover), and lift drives an INTEGRATED vertical speed toward
 * the climb/descent rate — so the descent rate at touchdown is
 * a real flown quantity, not a switch.
 *
 * PHASE 2: landings are judged, never refused (landingRefused
 * stays on the return for the scene's sake and is always
 * false). At touchdown the judge reads the true flight state —
 * descent rate, the craft's attitude against the ground plane
 * under its footprint, and the total contact speed:
 *   gentle + upright + slow  → a landing, no harm;
 *   harder / leaned / fast   → integrity damage (damage.js);
 *   on its side, or flown into the ground → catastrophic.
 * Meeting rising terrain faster than the craft is climbing is
 * a terrain strike, judged as an impact at horizontal speed.
 * Meeting WATER is a ditch: heavy damage, and the craft —
 * which is not a boat — sits at the waterline taking on water
 * (submersion drain) until it wrecks; lift cannot save it.
 * The ceiling stays what it always was: a thrust envelope.
 */
export function stepVtol(state, spec, input, dt, env) {
  const stepDt = Math.max(0, dt);
  const groundHere = env.heightAt(state.x, state.z);
  if (state.wrecked) {
    return {
      ...state, speed: 0, vspeed: 0, landingRefused: false, integrity: 0, wrecked: true,
      y: state.ditched ? WATER_Y - DITCHED_DRAFT_M : groundHere + (state.alt || 0),
      pitch: 0, roll: 0,
    };
  }
  const throttle = clamp(Number(input && input.throttle) || 0, -1, 1);
  const steer = clamp(Number(input && input.steer) || 0, -1, 1);
  const lift = clamp(Number(input && input.lift) || 0, -1, 1);
  const alt0 = Math.max(0, state.alt || 0);
  const integrity0 = typeof state.integrity === 'number' ? state.integrity : INTEGRITY_MAX;

  if (state.ditched) {
    // In the water and waterlogged: no lift, no thrust — the
    // bar drains until the wreck is replaced at the field.
    let next = {
      ...state, speed: 0, vspeed: 0, alt: alt0, integrity: integrity0, wrecked: false,
      y: WATER_Y - DITCHED_DRAFT_M, pitch: 0, roll: 0, landingRefused: false,
    };
    if (stepDt > 0) next = applyDamage(next, spec, { kind: 'submersion', dt: stepDt });
    if (next.wrecked) next.eject = ejectPointFor(next, env, state);
    return next;
  }

  // Vertical: integrate the speed toward the commanded rate.
  // TAKEOFF (Merlin, 2026-11-02): a 'rolling' craft does NOT lift
  // from a standstill — throttle rolls her along the ground like
  // a plane's runway run; at takeoffSpeed with lift commanded she
  // rotates (pitches up) and climbs. A 'vertical' craft keeps the
  // old VTOL behaviour (lift straight up from parked).
  const takeoffRolling = spec.takeoffStyle === 'rolling' && alt0 <= 0.02;
  if (takeoffRolling) {
    // Runway roll: throttle drives ground speed, steer taxis.
    const rollTarget = throttle > 0 ? throttle * spec.maxSpeed : 0;
    const rollSpeed = approachSpeed(state.speed || 0, rollTarget, spec.accel, stepDt);
    const taxiAuthority = Math.min(1, rollSpeed / 6);
    const rollHeading = state.heading + steer * spec.turnRate * 0.45 * taxiAuthority * stepDt;
    const rsin = Math.sin(rollHeading);
    const rcos = Math.cos(rollHeading);
    const contact = resolveContacts(
      state,
      state.x + rsin * rollSpeed * stepDt,
      state.z + rcos * rollSpeed * stepDt,
      spec.radius, rollSpeed, stepDt, env.colliders,
    );
    const rotateSpeed = spec.takeoffSpeed || 16;
    const rotating = rollSpeed >= rotateSpeed && lift > 0;
    let next = {
      ...state, x: contact.x, z: contact.z, heading: rollHeading,
      speed: rollSpeed, alt: 0, vspeed: 0,
      integrity: integrity0, wrecked: false,
      y: groundHere, pitch: rotating ? -0.28 : 0, roll: 0,
      bankRoll: 0, landingRefused: false, rotating,
    };
    if (contact.impactSpeed > 0) {
      next = applyDamage(next, spec, { kind: 'impact', impactSpeed: contact.impactSpeed });
    }
    if (rotating) {
      // Rotation: she leaves the ground this step — seed a
      // small altitude and an upward vertical speed so the
      // airborne law takes over cleanly next step.
      next.alt = Math.max(0.05, lift * spec.climbRate * stepDt);
      next.vspeed = lift * spec.climbRate;
      next.y = groundHere + next.alt;
    }
    if (next.wrecked && !state.wrecked) {
      next.eject = ejectPointFor(next, env, state);
    }
    return next;
  }
  const vTarget = lift > 0 ? lift * spec.climbRate : lift < 0 ? lift * (spec.descentRate || 3.2) : 0;
  let vspeed = approachRate(state.vspeed || 0, vTarget, VERT_ACCEL_MPS2, stepDt);
  const altStep = alt0 + vspeed * stepDt; // altitude over the OLD ground
  const flying = altStep > 0.02;
  // Airborne for the step as a whole: a craft that STARTED the
  // step in the air keeps its true flight state (speed, lean)
  // through the step in which it touches down — the landing
  // judge reads those, so they must not be zeroed by the new
  // altitude crossing the grounded threshold first.
  const airborne = flying || alt0 > 0.02;

  // Horizontal: only in the air (a grounded craft just sits).
  const target = airborne ? (throttle >= 0 ? throttle * spec.maxSpeed : throttle * spec.reverseMax) : 0;
  const speed = approachSpeed(airborne ? (state.speed || 0) : 0, target, spec.accel, stepDt);
  const heading = state.heading + (airborne ? steer * spec.turnRate * stepDt : 0);
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);
  const nx = clamp(state.x + sin * speed * stepDt, -WORLD_HALF_M + 4, WORLD_HALF_M - 4);
  const nz = clamp(state.z + cos * speed * stepDt, -WORLD_HALF_M + 4, WORLD_HALF_M - 4);
  const groundNext = env.heightAt(nx, nz);

  // TRUE HEIGHT: within the step the craft's height is
  // absolute — the altitude it carries over the new ground is
  // its old altitude plus its own vertical motion, MINUS the
  // ground's rise (or plus its fall). Without this the law
  // contour-follows for free, gaining height over rising
  // terrain at no cost, and no hillside could ever be struck.
  // The state's meaning is unchanged: height over the ground
  // at the craft's position, honestly integrated.
  const terrainRise = groundNext - groundHere;
  let alt = altStep - terrainRise;
  if (alt >= spec.maxAlt) { alt = spec.maxAlt; if (vspeed > 0) vspeed = 0; }

  // Flight presentation: the craft leans into its motion —
  // nose-down pitch with forward speed (three.js rotation.x,
  // hence negative). BANKING (Merlin, 2026-11-02): steering
  // rolls the craft INTO the turn — up to ~35° at full
  // deflection and speed — easing back to level when the
  // steering centres. bankRoll rides the state so the ease is
  // continuous across steps, never a snap.
  const craftPitch = airborne ? -(speed / spec.maxSpeed) * 0.38 : 0;
  const bankTarget = airborne ? -steer * Math.min(1, Math.abs(speed) / (spec.maxSpeed * 0.55)) * 0.61 : 0;
  const bankEase = Math.min(1, stepDt * 4.5);
  const bankRoll = (state.bankRoll || 0) + (bankTarget - (state.bankRoll || 0)) * bankEase;
  const craftRoll = bankRoll;

  const depthAtFn = typeof env.waterDepthAt === 'function' ? env.waterDepthAt : null;
  const depthNext = depthAtFn ? depthAtFn(nx, nz) : 0;
  const descentRate = Math.max(0, -vspeed);
  const absY0 = groundHere + alt0; // absolute height at the step's start
  const absY = groundHere + altStep; // …and after its own vertical motion

  // THE DITCH: the descent crosses the WATERLINE this step —
  // the surface is met at absolute height WATER_Y, long before
  // the bed-relative altitude would run out.
  if (airborne && depthNext > 0 && absY0 > WATER_Y && absY <= WATER_Y) {
    // The craft settles at the waterline and stays.
    let next = {
      ...state, x: nx, z: nz, heading, speed: 0, vspeed: 0,
      alt: Math.max(0, WATER_Y - DITCHED_DRAFT_M - groundNext),
      integrity: integrity0, wrecked: false, ditched: true,
      y: WATER_Y - DITCHED_DRAFT_M, pitch: 0, roll: 0, landingRefused: false,
    };
    next = applyDamage(next, spec, { kind: 'ditch', descentRate });
    if (next.wrecked) next.eject = ejectPointFor(next, env, state);
    return next;
  }

  // CONTACT: the craft's height over the new ground ran out.
  // What ran it out decides the judgment — the terrain rising
  // to meet it is a STRIKE, billed at the total velocity into
  // the slope; its own descent bringing it down is a LANDING,
  // judged by descent rate, tilt, and contact speed.
  if (airborne && alt <= 0) {
    if (terrainRise > 0.01) {
      let next = {
        ...state, x: state.x, z: state.z, heading, speed: 0, vspeed: 0, alt: 0,
        integrity: integrity0, wrecked: false,
        y: groundHere, pitch: craftPitch, roll: craftRoll, landingRefused: false,
      };
      next = applyDamage(next, spec, { kind: 'impact', impactSpeed: Math.hypot(Math.abs(speed), descentRate) });
      if (next.wrecked) next.eject = { x: state.x, z: state.z };
      return next;
    }
    const pose = groundPose({ x: nx, z: nz, heading }, spec, env.heightAt);
    const tilt = Math.hypot(craftPitch - pose.pitch, craftRoll - pose.roll);
    const contactSpeed = Math.hypot(descentRate, Math.abs(speed));
    let next = {
      ...state, x: nx, z: nz, heading, speed: 0, vspeed: 0, alt: 0,
      integrity: integrity0, wrecked: false,
      y: groundNext, pitch: pose.pitch, roll: pose.roll, landingRefused: false,
    };
    if (descentRate > VTOL_SAFE_DESCENT_MPS || tilt > VTOL_SAFE_TILT_RAD || Math.abs(speed) > 3) {
      next = applyDamage(next, spec, {
        kind: 'landing', descentRate, tiltRad: tilt,
        horizontalSpeed: Math.abs(speed), contactSpeed,
      });
      if (next.wrecked) next.eject = { x: nx, z: nz };
    }
    return next;
  }

  if (alt < 0) alt = 0;
  if (alt <= 0.02 && alt0 <= 0.02 && lift <= 0) vspeed = 0; // parked: no phantom descent hoarded
  return {
    ...state, x: nx, z: nz, heading, speed, alt, vspeed,
    integrity: integrity0, wrecked: false, bankRoll,
    y: groundNext + alt, pitch: craftPitch, roll: craftRoll, landingRefused: false,
  };
}

// ── The River Runner ────────────────────────────────────────────
/**
 * One boat step. state { x, z, heading, speed, integrity,
 * wrecked, beached }; input { throttle, steer }; env
 * { waterDepthAt, colliders } — the scene passes the bridge
 * piers plus the static set, so the arch's waterline ends are
 * obstacles and the arch CENTRE is the pass-through. The law:
 *   - the hull floats at the waterline (y = WATER_Y − draft;
 *     the scene adds the bob and the wake read);
 *   - PHASE 2: the bow-depth rule is no longer a wall, it is
 *     the grounding line. The hull sails where the water under
 *     its BOW stays deeper than BOAT_MIN_DEPTH_M; the house
 *     slide rule still applies first (a slide that truly moves
 *     is a scrub along the bank, unharmed). When no slide
 *     escapes, the step becomes a GROUNDING: the hull advances
 *     the largest fraction of the step that stays bow-clear,
 *     stops dead, and the grounding bills through the damage
 *     path at the speed it carried in — a gentle touch costs
 *     little or nothing and merely BEACHES the boat (stuck
 *     fast: no driving off, in either direction), a fast one
 *     tears the hull, and a wrecking one puts the driver
 *     ashore (eject on the returned state);
 *   - it banks into its turns and lifts its bow with speed —
 *     `roll` and `pitch` ride the returned state for the scene;
 *   - colliders push out with the hull's own radius, exactly
 *     the ground law, and bill as impacts the same way.
 */
export function stepBoat(state, spec, input, dt, env) {
  const stepDt = Math.max(0, dt);
  const depthAt = env && env.waterDepthAt ? env.waterDepthAt : () => 99;
  const ease = Math.min(1, stepDt * 5);
  if (state.wrecked) {
    return {
      ...state, speed: 0, alt: 0, y: WATER_Y - spec.draft, pitch: 0,
      roll: (state.roll || 0) * (1 - ease), integrity: 0, wrecked: true, landingRefused: false,
    };
  }
  const throttle = clamp(Number(input && input.throttle) || 0, -1, 1);
  const steer = clamp(Number(input && input.steer) || 0, -1, 1);
  if (state.beached) {
    // Aground and stuck fast — the helm answers nothing. The
    // boat leaves this spot only as a wreck (replaced at its
    // mooring) or by a hand Phase B has not built yet.
    return {
      ...state, speed: 0, alt: 0, y: WATER_Y - spec.draft, pitch: 0,
      roll: (state.roll || 0) * (1 - ease), beached: true, landingRefused: false,
    };
  }
  const target = throttle >= 0 ? throttle * spec.maxSpeed : throttle * spec.reverseMax;
  const speed = approachSpeed(state.speed || 0, target, spec.accel, stepDt);
  const heading = state.heading + steer * spec.turnRate * Math.sign(speed || 1) * stepDt;
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);

  const bowClear = (x2, z2, h2) => depthAt(x2 + Math.sin(h2) * spec.halfLength, z2 + Math.cos(h2) * spec.halfLength) > BOAT_MIN_DEPTH_M;
  let nx = state.x + sin * speed * stepDt;
  let nz = state.z + cos * speed * stepDt;
  let grounded = false;
  if (speed !== 0 && !bowClear(nx, nz, heading)) {
    const slideX = bowClear(nx, state.z, heading) && Math.abs(nx - state.x) > 1e-9;
    const slideZ = bowClear(state.x, nz, heading) && Math.abs(nz - state.z) > 1e-9;
    if (slideX) {
      nz = state.z;
    } else if (slideZ) {
      nx = state.x;
    } else {
      // The grounding: creep the hull forward only as far as
      // the bow stays in sailable water, then it stops for good.
      let f = 0;
      for (const fr of [0.75, 0.5, 0.25, 0.1]) {
        const px = state.x + (nx - state.x) * fr;
        const pz = state.z + (nz - state.z) * fr;
        if (bowClear(px, pz, heading)) { f = fr; break; }
      }
      nx = state.x + (nx - state.x) * f;
      nz = state.z + (nz - state.z) * f;
      grounded = true;
    }
  }
  const contact = resolveContacts(state, nx, nz, spec.radius, grounded ? 0 : speed, stepDt, env && env.colliders);
  nx = contact.x;
  nz = contact.z;

  let next = {
    ...state, x: nx, z: nz, heading, speed: grounded ? 0 : speed, alt: 0,
    integrity: typeof state.integrity === 'number' ? state.integrity : INTEGRITY_MAX,
    wrecked: false, beached: grounded, landingRefused: false,
  };
  if (grounded) {
    next = applyDamage(next, spec, { kind: 'grounding', impactSpeed: Math.abs(speed) });
  }
  if (contact.impactSpeed > 0) {
    next = applyDamage(next, spec, { kind: 'impact', impactSpeed: contact.impactSpeed });
  }
  if (next.wrecked && !state.wrecked) {
    next.eject = ejectPointFor(next, env, state);
  }

  const speedRatio = clamp(Math.abs(next.speed) / spec.maxSpeed, 0, 1);
  const rollTarget = -steer * speedRatio * 0.14 * Math.sign(next.speed || 1);
  const roll = (state.roll || 0) + (rollTarget - (state.roll || 0)) * ease;
  return {
    ...next,
    y: WATER_Y - spec.draft,
    pitch: -0.055 * speedRatio * Math.sign(next.speed || 1),
    roll,
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

// ── Wrecks & replacement (Phase 2) ──────────────────────────────
// Merlin's law: "Every vehicle that wrecks, a new one spawning
// its place." A wreck carries `respawnIn` seconds (set by the
// damage path at the wrecking moment); the scene ticks every
// instance with tickVehicleRespawn, and when the timer runs
// out the wreck is replaced by a fresh machine AT ITS HOME —
// the apron slot, the scatter spot, the mooring — whole-barred
// and parked. Pure: no clock in here, dt is the only time.
export {
  INTEGRITY_MAX,
  RESPAWN_DELAY_S,
  SHOT_DAMAGE,
  SHALLOW_DRIVE_DEPTH_M,
  DROWN_DEPTH_M,
  applyShotToVehicle,
  assessDamage,
  applyDamage,
  ejectPointFor,
} from './vehicle-damage.js';

/** A brand-new vehicle state at a home: whole bar, parked,
 *  every Phase 2 flag cleared. `home` is any state-shaped
 *  object carrying x / z / heading (and slug, for instances). */
export function freshVehicleState(home) {
  if (!home) return null;
  return {
    ...home, speed: 0, alt: 0, vspeed: 0,
    integrity: INTEGRITY_MAX, wrecked: false, exploded: false,
    beached: false, ditched: false, respawnIn: 0,
    lastDamage: null, eject: null,
  };
}

/** Replace a wreck with a fresh machine at home, right now.
 *  Ownership law: a CLAIMED wreck's replacement stays claimed —
 *  the claim follows the machine home (fleet.js). */
export function respawnVehicleNow(state, home) {
  const fresh = freshVehicleState(home);
  if (!fresh) return state;
  if (state && state.claimedBy) {
    fresh.claimedBy = state.claimedBy;
    fresh.claimedAt = state.claimedAt ?? null;
    fresh.awaySince = null;
  }
  return fresh;
}

/** True when a wreck's replacement timer has run out. */
export function vehicleRespawnDue(state) {
  return !!(state && state.wrecked && (state.respawnIn == null || state.respawnIn <= 0));
}

/**
 * Tick one instance's replacement timer by dt seconds. A state
 * that is not wrecked passes through untouched; a wreck counts
 * down; at zero the fresh home state takes its place.
 */
export function tickVehicleRespawn(state, home, dt) {
  if (!state || !state.wrecked) return state;
  const left = (typeof state.respawnIn === 'number' ? state.respawnIn : RESPAWN_DELAY_S) - Math.max(0, dt || 0);
  if (left > 0) return { ...state, respawnIn: left };
  return respawnVehicleNow(state, home) || { ...state, respawnIn: 0 };
}
