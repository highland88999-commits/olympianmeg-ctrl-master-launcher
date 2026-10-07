// lib/gta/wanted.js — Wanted system: 0-5 stars, police AI chase.
// Crimes raise heat; cops chase the player; evade by breaking line of sight.
// Merlin's rule: busted = respawn at station, never death.

import { moveBody } from './collisions.js';

export const MAX_WANTED = 5;

// Heat values per crime
export const CRIMES = {
  stealCar: 1,
  hitPedestrian: 1,
  recklessDriving: 0.5, // sustained dangerous driving
  hitPolice: 2,
  evadePolice: 0.25, // per second while fleeing at wanted > 0
};

export function createWanted() {
  return {
    stars: 0,
    heat: 0, // 0..5 fractional, stars = ceil
    lastCrimeT: 0,
    evadeT: 0, // time since last seen by police
    busted: false,
  };
}

export function commitCrime(w, crime, now) {
  const heat = CRIMES[crime] || 0;
  w.heat = Math.min(MAX_WANTED, w.heat + heat);
  w.stars = Math.ceil(w.heat);
  w.lastCrimeT = now;
  w.evadeT = 0;
}

// Decay heat when not seen and no recent crimes
export function updateWanted(w, dt, now, seenByPolice) {
  if (w.stars === 0) return;

  if (seenByPolice) {
    w.evadeT = 0;
    // Slowly gain heat while actively fleeing
    if (now - w.lastCrimeT > 5) {
      w.heat = Math.min(MAX_WANTED, w.heat + CRIMES.evadePolice * dt);
      w.stars = Math.ceil(w.heat);
    }
  } else {
    w.evadeT += dt;
    // After 10s unseen, heat decays
    if (w.evadeT > 10) {
      w.heat = Math.max(0, w.heat - dt * 0.25);
      const newStars = Math.ceil(w.heat);
      if (newStars < w.stars) {
        w.stars = newStars;
        w.evadeT = 0; // grace before next decay tick
      }
    }
  }
}

// Police car AI: chase the player, ram to stop them
// cop: { x, z, heading, speed, vx, vz, radius }
// Returns 'chase' | 'search' | 'idle'
export function updateCop(cop, playerX, playerZ, wantedStars, colliders, dt) {
  const dx = playerX - cop.x, dz = playerZ - cop.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (wantedStars === 0) {
    // Patrol slowly
    cop.speed = Math.max(0, cop.speed - 5 * dt);
    return 'idle';
  }

  // Chase: steer toward player
  const targetHeading = Math.atan2(dx, dz);
  let diff = targetHeading - cop.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff -= Math.PI * 2;
  cop.heading += Math.max(-2.5 * dt, Math.min(2.5 * dt, diff * 4));

  // Speed: faster with more stars, slow near player to ram not overshoot
  const wantSpeed = dist > 12 ? 30 + wantedStars * 3 : 18;
  cop.speed += (wantSpeed - cop.speed) * Math.min(1, 3 * dt);

  const fx = Math.sin(cop.heading), fz = Math.cos(cop.heading);
  cop.vx = fx * cop.speed; cop.vz = fz * cop.speed;

  // Move with collisions
  const body = { x: cop.x, z: cop.z, radius: cop.radius || 1.6, vx: cop.vx, vz: cop.vz };
  moveBody(body, colliders, dt);
  cop.x = body.x; cop.z = body.z;

  return dist < 60 ? 'chase' : 'search';
}

// Busted check: cop within 3 units and player speed < 2 for 2s
export function checkBusted(cops, playerX, playerZ, playerSpeed, dt, bustTimer) {
  for (const cop of cops) {
    const dx = playerX - cop.x, dz = playerZ - cop.z;
    if (Math.sqrt(dx * dx + dz * dz) < 4 && Math.abs(playerSpeed) < 3) {
      bustTimer.t += dt;
      if (bustTimer.t > 2) return true;
      return false;
    }
  }
  bustTimer.t = 0;
  return false;
}

export function resetWanted(w) {
  w.stars = 0; w.heat = 0; w.evadeT = 0; w.busted = false;
}
