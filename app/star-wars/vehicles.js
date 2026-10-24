/*
 * STAR WARS — rideable vehicles (pure: no three, no DOM).
 *
 * Merlin 2026-10-23: "Not able to ride the cruiser at the end (click
 * to ride? No bueno rn)". The landspeeder was dressing; this module
 * is the generic drive system every world inherits. A landmark def
 * opts in with `vehicle: '<type>'` (+ optional `vid`); zone.js
 * builds a state per vehicle landmark and page.jsx drives it:
 *
 *   parked --(walk within PROMPT_DIST, tap the prompt)--> mounted
 *   mounted --(Exit control)--> parked, exactly where it was left
 *
 * Driving: throttle eases toward fwd * cruise (smooth accel, firm
 * brake/reverse), steering turns the heading (authority grows with
 * speed; a hover vehicle can still creep-turn at a standstill). The
 * vehicle HOVERS at groundHeight + hover and leans with the terrain:
 * pitch from the slope along the heading, roll from the lateral
 * slope plus a bank into turns. Colliders stay solid — the vehicle
 * pushes out of everything except its OWN parked collider circles
 * (passed in as `ignore`), and the world bounds contain it.
 *
 * While mounted, the page reads the mission gates from the VEHICLE
 * position (not the walker), so the podrace runs on a pod.
 */

export const VEHICLE_PROMPT_DIST = 3.5;

export const VEHICLE_TYPES = {
  /* The farm speeder: a gentle cruiser. */
  landspeeder: {
    hover: 0.5,        // metres above the terrain while driven
    cruise: 18,        // m/s at full throttle
    accel: 9,          // m/s^2 toward the throttle target
    brake: 16,         // m/s^2 when braking / reversing
    turnRate: 1.7,     // rad/s at full steering authority
    radius: 2.6,       // body radius for its own collision push-out
    rest: 0.12,        // parked settle height above the terrain
    prompt: 'Tap to ride',
  },
  /* The grid pods: the podrace fantasy — faster, twitchier. */
  podracer: {
    hover: 0.55,
    cruise: 30,
    accel: 15,
    brake: 20,
    turnRate: 2.1,
    radius: 2.8,
    rest: 0.1,
    prompt: 'Tap to ride',
  },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Fresh parked state for one vehicle landmark. seatY is the world y
 * the landmark group was seated at (zone span seating) — the vehicle
 * renders there until first driven; after a drive it re-seats at
 * groundHeight + rest wherever it was left.
 */
export function createVehicleState(type, { x = 0, z = 0, yaw = 0, seatY = 0 } = {}) {
  if (!VEHICLE_TYPES[type]) throw new Error('unknown vehicle type: ' + type);
  return {
    type,
    mode: 'parked', // parked | mounted
    x, z,
    y: seatY,       // render height (world y of the group origin)
    yaw,
    pitch: 0,
    roll: 0,
    speed: 0,
  };
}

/** Unit forward vector for a heading (walker convention: yaw 0 = -z). */
export function vehicleForward(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** True when (x, z) is close enough to offer the ride prompt. */
export function vehicleInPromptRange(state, x, z, dist = VEHICLE_PROMPT_DIST) {
  return Math.hypot(x - state.x, z - state.z) <= dist;
}

export function mountVehicle(state) {
  if (state.mode !== 'parked') return false;
  state.mode = 'mounted';
  state.speed = 0;
  return true;
}

/**
 * Where the rider steps out: beside the vehicle on its right, clear
 * of its body radius. Returns { x, z, yaw } for the walker.
 */
export function dismountPoint(state) {
  const def = VEHICLE_TYPES[state.type];
  const f = vehicleForward(state.yaw);
  const right = { x: -f.z, z: f.x };
  const off = def.radius + 1.2;
  return { x: state.x + right.x * off, z: state.z + right.z * off, yaw: state.yaw };
}

/** Settle a just-parked vehicle onto the terrain where it was left. */
export function parkVehicle(state, groundHeight) {
  const def = VEHICLE_TYPES[state.type];
  state.mode = 'parked';
  state.speed = 0;
  state.pitch = 0;
  state.roll = 0;
  state.y = groundHeight(state.x, state.z) + def.rest;
  return state;
}

/**
 * Advance a mounted vehicle one frame.
 * input: { fwd: -1..1 (throttle), turn: -1..1 (steer; + = right) }
 * world: { groundHeight(x,z), colliders: [{x,z,r}], bounds, ignore }
 *   ignore: a Set of collider objects to skip (the vehicle's own).
 */
export function stepVehicle(state, input = {}, dt = 0.016, world = {}) {
  const def = VEHICLE_TYPES[state.type];
  const gh = world.groundHeight || (() => 0);
  const step = Math.max(0, dt || 0);
  const fwdIn = clamp(input.fwd || 0, -1, 1);
  const turnIn = clamp(input.turn || 0, -1, 1);

  // Steering: authority grows with speed; turning right is a
  // clockwise heading change seen from above (yaw decreases).
  const speedRatio = Math.min(1, Math.abs(state.speed) / def.cruise);
  const authority = 0.35 + 0.65 * speedRatio;
  state.yaw -= turnIn * def.turnRate * authority * step;

  // Throttle: ease toward the target speed; brake harder when the
  // input fights the current motion (or asks for a stop from speed).
  const target = fwdIn * def.cruise;
  const dv = target - state.speed;
  const fighting = (state.speed !== 0 && Math.sign(dv) !== Math.sign(state.speed))
    || (target === 0 && state.speed !== 0);
  const rate = (fighting ? def.brake : def.accel) * step;
  state.speed += clamp(dv, -rate, rate);

  // Advance along the heading.
  const f = vehicleForward(state.yaw);
  state.x += f.x * state.speed * step;
  state.z += f.z * state.speed * step;

  // Solid world: push out of every collider except our own, using
  // the vehicle's (shrunk) body radius so gates and gaps stay fair.
  if (world.colliders) {
    const ignore = world.ignore || null;
    const rr = def.radius * 0.55;
    for (const c of world.colliders) {
      if (ignore && ignore.has(c)) continue;
      const dx = state.x - c.x;
      const dz = state.z - c.z;
      const need = c.r + rr;
      const d = Math.hypot(dx, dz);
      if (d < need && d > 1e-4) {
        const push = (need - d) / d;
        state.x += dx * push;
        state.z += dz * push;
      } else if (d <= 1e-4) {
        state.x = c.x + need;
      }
    }
  }
  if (world.bounds && world.bounds.kind === 'circle') {
    const max = Math.max(0, world.bounds.max - 1);
    const d = Math.hypot(state.x, state.z);
    if (d > max && d > 1e-6) {
      state.x = (state.x / d) * max;
      state.z = (state.z / d) * max;
    }
  }

  // Hover: track the terrain, gently (a vehicle may smooth what a
  // walker must not — it floats on repulsors, not feet).
  const targetY = gh(state.x, state.z) + def.hover;
  state.y += (targetY - state.y) * Math.min(1, step * 10);
  if (Math.abs(targetY - state.y) < 0.002) state.y = targetY;

  // Lean: pitch with the slope along the heading (nose up climbing),
  // roll with the lateral slope, plus a bank into the turn.
  const S = 2.2;
  const hF = gh(state.x + f.x * S, state.z + f.z * S);
  const hB = gh(state.x - f.x * S, state.z - f.z * S);
  const right = { x: -f.z, z: f.x };
  const hR = gh(state.x + right.x * S, state.z + right.z * S);
  const hL = gh(state.x - right.x * S, state.z - right.z * S);
  state.pitch = clamp(Math.atan2(hF - hB, S * 2) * 0.8, -0.35, 0.35);
  state.roll = clamp(
    Math.atan2(hR - hL, S * 2) * 0.7 - turnIn * speedRatio * 0.22,
    -0.4, 0.4
  );
  return state;
}

/**
 * Third-person chase pose for the camera: behind and above the
 * vehicle, looking ahead of it. Pure — page.jsx applies it.
 */
export function chaseCameraPose(state, dist = 7.5, height = 3.1) {
  const f = vehicleForward(state.yaw);
  return {
    x: state.x - f.x * dist,
    y: state.y + height,
    z: state.z - f.z * dist,
    lx: state.x + f.x * 8,
    ly: state.y + 1.1,
    lz: state.z + f.z * 8,
  };
}
