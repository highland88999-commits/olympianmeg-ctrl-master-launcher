// lib/gta/vehicle.js — Arcade car physics for GTA-style driving.
// Simple bicycle-ish model: acceleration, speed-sensitive steering,
// handbrake slides, collision slide (no pass-through).

import { moveBody } from './collisions.js';

export const VEHICLE_TYPES = {
  sedan:   { accel: 14, brake: 26, maxSpeed: 32, maxReverse: 10, grip: 8,  turn: 2.2, radius: 1.6 },
  sports:  { accel: 22, brake: 32, maxSpeed: 48, maxReverse: 12, grip: 10, turn: 2.6, radius: 1.5 },
  truck:   { accel: 9,  brake: 20, maxSpeed: 24, maxReverse: 8,  grip: 6,  turn: 1.7, radius: 2.0 },
  taxi:    { accel: 15, brake: 28, maxSpeed: 34, maxReverse: 10, grip: 8,  turn: 2.3, radius: 1.6 },
};

export function createVehicle(type = 'sedan', x = 0, z = 0, heading = 0) {
  const spec = VEHICLE_TYPES[type] || VEHICLE_TYPES.sedan;
  return {
    type, spec,
    x, z, heading,
    speed: 0, // signed forward speed
    vx: 0, vz: 0, // world velocity (for collisions)
    radius: spec.radius,
    driver: null, // player ref when occupied
    // visual
    wheelAngle: 0,
  };
}

// input: { moveY (+1 accel, -1 brake/reverse), moveX (steer), handbrake }
export function updateVehicle(v, input, colliders, dt) {
  const s = v.spec;

  // Steering (less at high speed)
  const speedFactor = 1 / (1 + Math.abs(v.speed) * 0.045);
  const steerTarget = -input.moveX * s.turn * speedFactor;
  v.wheelAngle += (steerTarget - v.wheelAngle) * Math.min(1, 10 * dt);
  v.heading += v.wheelAngle * (v.speed / s.maxSpeed) * dt * 2.2;
  // Reverse steering flip
  if (v.speed < -0.5) v.heading -= v.wheelAngle * 0.0; // handled by speed sign

  // Acceleration
  if (input.moveY > 0.1) {
    v.speed += s.accel * input.moveY * dt;
  } else if (input.moveY < -0.1) {
    if (v.speed > 1) {
      v.speed -= s.brake * dt; // braking
    } else {
      v.speed -= s.accel * 0.6 * dt; // reverse
    }
  } else {
    // Coast / drag
    v.speed -= v.speed * 1.2 * dt;
    if (Math.abs(v.speed) < 0.1) v.speed = 0;
  }

  // Handbrake: kill grip, keep momentum for slides
  const grip = input.handbrake ? 1.5 : s.grip;

  v.speed = Math.max(-s.maxReverse, Math.min(s.maxSpeed, v.speed));

  // Velocity from heading + speed, with lateral grip
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const wantVx = fx * v.speed, wantVz = fz * v.speed;
  v.vx += (wantVx - v.vx) * Math.min(1, grip * dt);
  v.vz += (wantVz - v.vz) * Math.min(1, grip * dt);

  // Move with collisions
  const body = { x: v.x, z: v.z, radius: v.radius, vx: v.vx, vz: v.vz };
  const res = moveBody(body, colliders, dt);
  v.x = body.x; v.z = body.z;

  // Crash: bounce the speed down on hard hits
  if (res.hit) {
    const impact = Math.abs(v.speed);
    v.vx = body.vx; v.vz = body.vz;
    // Recompute speed from post-collision velocity
    v.speed = v.vx * fx + v.vz * fz;
    if (impact > 12) {
      v.speed *= 0.4; // hard crash scrubs speed
    }
    return { crashed: impact > 8, impact };
  }
  v.vx = body.vx; v.vz = body.vz;
  return { crashed: false, impact: 0 };
}

// Enter/exit helpers
export function enterVehicle(player, vehicle) {
  player.inVehicle = vehicle;
  vehicle.driver = player;
}

export function exitVehicle(player) {
  const v = player.inVehicle;
  if (!v) return null;
  player.inVehicle = null;
  v.driver = null;
  // Place player beside the car
  const side = { x: v.x + Math.cos(v.heading) * 2.5, z: v.z - Math.sin(v.heading) * 2.5 };
  player.x = side.x; player.z = side.z;
  player.vx = 0; player.vz = 0;
  v.speed = 0;
  return v;
}

// Find nearest drivable vehicle within range
export function nearestVehicle(x, z, vehicles, maxDist = 4) {
  let best = null, bestD = maxDist;
  for (const v of vehicles) {
    if (v.driver) continue;
    const dx = v.x - x, dz = v.z - z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}
