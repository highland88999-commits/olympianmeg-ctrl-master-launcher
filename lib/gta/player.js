// lib/gta/player.js — Third-person on-foot character controller.
// WASD moves relative to camera, Shift sprints, Space jumps.
// Uses circle-vs-AABB collisions (no pass-through, slide response).

import { moveBody } from './collisions.js';

export const PLAYER = {
  walkSpeed: 6,
  sprintSpeed: 11,
  jumpVelocity: 8,
  gravity: 22,
  radius: 0.6,
  eyeHeight: 1.7,
};

export function createPlayer(x = 0, z = 0) {
  return {
    x, z, y: 0, // y = height above ground
    vx: 0, vz: 0, vy: 0,
    radius: PLAYER.radius,
    heading: 0, // facing direction (radians)
    grounded: true,
    inVehicle: null,
    health: 100,
    // Animation state
    moving: false,
    sprinting: false,
  };
}

// Update player. input = { moveX, moveY, sprint, jump }, camYaw = camera heading.
// colliders = AABB list. dt = seconds.
export function updatePlayer(p, input, camYaw, colliders, dt) {
  if (p.inVehicle) return; // vehicle handles movement

  const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  p.sprinting = input.sprint && (input.moveX !== 0 || input.moveY !== 0);

  // Move relative to camera
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  // moveY=+1 is forward (away from camera)
  const wishX = (input.moveX * cos - input.moveY * sin) * speed;
  const wishZ = (-input.moveX * sin - input.moveY * cos) * speed;

  // Smooth acceleration
  const accel = p.grounded ? 40 : 12;
  p.vx += (wishX - p.vx) * Math.min(1, accel * dt / speed * 10);
  p.vz += (wishZ - p.vz) * Math.min(1, accel * dt / speed * 10);

  p.moving = Math.sqrt(p.vx * p.vx + p.vz * p.vz) > 0.5;

  // Face movement direction
  if (p.moving) {
    const target = Math.atan2(p.vx, p.vz);
    let diff = target - p.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff -= Math.PI * 2;
    p.heading += diff * Math.min(1, 12 * dt);
  }

  // Jump / gravity
  if (input.jump && p.grounded) {
    p.vy = PLAYER.jumpVelocity;
    p.grounded = false;
  }
  if (!p.grounded) {
    p.vy -= PLAYER.gravity * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; p.grounded = true; }
  }

  // Collide and move
  const body = { x: p.x, z: p.z, radius: p.radius, vx: p.vx, vz: p.vz };
  moveBody(body, colliders, dt);
  p.x = body.x; p.z = body.z;
  p.vx = body.vx; p.vz = body.vz;
}

// Damage (never kills per Merlin's rule — min 1 HP, screen flash instead)
export function damagePlayer(p, amount) {
  p.health = Math.max(1, p.health - amount);
  return p.health;
}

export function healPlayer(p, amount) {
  p.health = Math.min(100, p.health + amount);
}
