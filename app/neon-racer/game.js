// Neon Racer — pure game logic. No DOM, no canvas, no network.
// A pseudo-3D deep-space survival run: dodge asteroids, grab star shards,
// thread wormhole rings for light-speed, survive 90 seconds.

export const MISSION_SECONDS = 90;
export const START_SHIELDS = 3;
export const MAX_LEVEL = 5;
export const LEVEL_SECONDS = 18; // level up every 18s -> 5 levels
export const SHIP_RADIUS = 0.9;
export const FAR_Z = 120;
export const WORLD = { x: 10, y: 6 }; // half-extents of the flight corridor
export const BULLET_COOLDOWN = 0.25;
export const INVULN_SECONDS = 1.5;
export const LIGHTSPEED_SECONDS = 3;
export const BULLET_SPEED = 60;

export const SCORE = {
  shard: 50,
  ring: 100,
  asteroidKill: 25,
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGame(seed = 1) {
  return {
    seed,
    rng: mulberry32(seed),
    phase: 'ready', // ready | playing | won | lost
    elapsed: 0,
    score: 0,
    shields: START_SHIELDS,
    level: 1,
    ship: { x: 0, y: 0, tx: 0, ty: 0 },
    invulnUntil: -1,
    lightspeedUntil: -1,
    bulletReadyAt: 0,
    asteroids: [],
    shards: [],
    rings: [],
    bullets: [],
    particles: [],
    spawnT: { asteroid: 0.6, shard: 2.0, ring: 6.0 },
    events: [],
  };
}

export function startGame(state) {
  state.phase = 'playing';
  state.elapsed = 0;
  state.score = 0;
  state.shields = START_SHIELDS;
  state.level = 1;
  state.ship.x = 0;
  state.ship.y = 0;
  state.ship.tx = 0;
  state.ship.ty = 0;
  state.invulnUntil = -1;
  state.lightspeedUntil = -1;
  state.bulletReadyAt = 0;
  state.asteroids.length = 0;
  state.shards.length = 0;
  state.rings.length = 0;
  state.bullets.length = 0;
  state.particles.length = 0;
  state.spawnT.asteroid = 0.6;
  state.spawnT.shard = 2.0;
  state.spawnT.ring = 6.0;
  state.events.length = 0;
}

export function setShipTarget(state, x, y) {
  state.ship.tx = Math.max(-WORLD.x, Math.min(WORLD.x, x));
  state.ship.ty = Math.max(-WORLD.y, Math.min(WORLD.y, y));
}

export function isLightspeed(state) {
  return state.elapsed < state.lightspeedUntil;
}

export function isInvulnerable(state) {
  return state.elapsed < state.invulnUntil || isLightspeed(state);
}

export function timeLeft(state) {
  return Math.max(0, MISSION_SECONDS - state.elapsed);
}

export function drainEvents(state) {
  const ev = state.events;
  state.events = [];
  return ev;
}

function gain(state, base) {
  const mult = isLightspeed(state) ? 2 : 1;
  state.score += base * mult;
}

function spawnAsteroid(state) {
  const rng = state.rng;
  const n = 7 + Math.floor(rng() * 4);
  const radii = [];
  for (let i = 0; i < n; i++) radii.push(0.75 + rng() * 0.5);
  state.asteroids.push({
    x: (rng() * 2 - 1) * WORLD.x,
    y: (rng() * 2 - 1) * WORLD.y,
    z: FAR_Z + rng() * 30,
    r: 0.8 + rng() * 0.9,
    vx: (rng() * 2 - 1) * 1.5,
    vy: (rng() * 2 - 1) * 1.5,
    rot: rng() * Math.PI * 2,
    rotV: (rng() * 2 - 1) * 1.2,
    verts: n,
    radii,
    hit: false,
  });
}

function spawnShard(state) {
  const rng = state.rng;
  state.shards.push({
    x: (rng() * 2 - 1) * (WORLD.x - 1),
    y: (rng() * 2 - 1) * (WORLD.y - 1),
    z: FAR_Z + rng() * 20,
    r: 0.55,
    spin: rng() * Math.PI * 2,
    taken: false,
  });
}

function spawnRing(state) {
  const rng = state.rng;
  state.rings.push({
    x: (rng() * 2 - 1) * (WORLD.x - 2.5),
    y: (rng() * 2 - 1) * (WORLD.y - 2),
    z: FAR_Z + 40,
    r: 2.2,
    spin: rng() * Math.PI * 2,
    used: false,
  });
}

function burst(state, x, y, z, color, count, speed) {
  const rng = state.rng;
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const s = speed * (0.4 + rng() * 0.8);
    state.particles.push({
      x, y, z,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      vz: (rng() * 2 - 1) * speed * 0.5,
      life: 0.6 + rng() * 0.5,
      age: 0,
      color,
      size: 0.12 + rng() * 0.18,
    });
  }
}

export function fireBullet(state) {
  if (state.phase !== 'playing') return false;
  if (state.elapsed < state.bulletReadyAt) return false;
  state.bulletReadyAt = state.elapsed + BULLET_COOLDOWN;
  state.bullets.push({
    x: state.ship.x,
    y: state.ship.y,
    z: 1.5,
    r: 0.22,
  });
  state.events.push({ type: 'shoot' });
  return true;
}

function damageShip(state) {
  state.shields -= 1;
  state.invulnUntil = state.elapsed + INVULN_SECONDS;
  burst(state, state.ship.x, state.ship.y, 0, '#ff3131', 22, 9);
  if (state.shields <= 0) {
    state.phase = 'lost';
    state.events.push({ type: 'lose' });
    burst(state, state.ship.x, state.ship.y, 0, '#00e0ff', 40, 12);
  } else {
    state.events.push({ type: 'hit' });
  }
}

export function updateGame(state, dt) {
  if (state.phase !== 'playing') return;
  if (!(dt > 0)) return;
  dt = Math.min(dt, 0.05);

  state.elapsed += dt;
  if (state.elapsed >= MISSION_SECONDS) {
    state.phase = 'won';
    state.events.push({ type: 'win' });
    return;
  }

  state.level = Math.min(MAX_LEVEL, 1 + Math.floor(state.elapsed / LEVEL_SECONDS));

  const speedMul = isLightspeed(state) ? 2.2 : 1;
  const approach = (20 + 4 * state.level) * speedMul;

  // Ship eases toward its target.
  const k = 1 - Math.exp(-12 * dt);
  state.ship.x += (state.ship.tx - state.ship.x) * k;
  state.ship.y += (state.ship.ty - state.ship.y) * k;

  // Spawning.
  const lv = state.level;
  state.spawnT.asteroid -= dt;
  if (state.spawnT.asteroid <= 0) {
    spawnAsteroid(state);
    state.spawnT.asteroid = Math.max(0.34, 1.15 - 0.16 * lv) * (0.7 + state.rng() * 0.6);
  }
  state.spawnT.shard -= dt;
  if (state.spawnT.shard <= 0) {
    spawnShard(state);
    state.spawnT.shard = 2.2 + state.rng() * 1.6;
  }
  state.spawnT.ring -= dt;
  if (state.spawnT.ring <= 0) {
    spawnRing(state);
    state.spawnT.ring = 8 + state.rng() * 5;
  }

  // Move incoming objects toward the ship plane (z = 0).
  for (const a of state.asteroids) {
    a.z -= approach * dt;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.rot += a.rotV * dt;
  }
  for (const s of state.shards) {
    s.z -= approach * dt;
    s.spin += 3 * dt;
  }
  for (const r of state.rings) {
    r.z -= approach * dt;
    r.spin += 1.2 * dt;
  }
  for (const b of state.bullets) b.z += BULLET_SPEED * dt;
  for (const p of state.particles) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
  }

  // Bullets vs asteroids (3D proximity).
  for (const b of state.bullets) {
    for (const a of state.asteroids) {
      if (a.hit) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      if (dx * dx + dy * dy + dz * dz < (a.r + b.r) * (a.r + b.r)) {
        a.hit = true;
        b.z = FAR_Z + 1000; // retire bullet
        gain(state, SCORE.asteroidKill);
        burst(state, a.x, a.y, a.z, '#ff9f1c', 16, 8);
        state.events.push({ type: 'explosion' });
        break;
      }
    }
  }

  // Ship-plane crossings.
  const vuln = !isInvulnerable(state);
  for (const a of state.asteroids) {
    if (a.hit || a.z > 0.6 || a.z < -0.6) continue;
    const dx = a.x - state.ship.x;
    const dy = a.y - state.ship.y;
    if (dx * dx + dy * dy < (a.r + SHIP_RADIUS) * (a.r + SHIP_RADIUS)) {
      a.hit = true;
      if (vuln) damageShip(state);
      else {
        // Grazed while shielded — shatter it for half credit.
        gain(state, Math.floor(SCORE.asteroidKill / 2));
        burst(state, a.x, a.y, a.z, '#00e0ff', 10, 6);
        state.events.push({ type: 'explosion' });
      }
    }
  }
  for (const s of state.shards) {
    if (s.taken || s.z > 0.9 || s.z < -0.9) continue;
    const dx = s.x - state.ship.x;
    const dy = s.y - state.ship.y;
    if (dx * dx + dy * dy < (s.r + SHIP_RADIUS + 0.35) * (s.r + SHIP_RADIUS + 0.35)) {
      s.taken = true;
      gain(state, SCORE.shard);
      burst(state, s.x, s.y, s.z, '#ffd23f', 10, 5);
      state.events.push({ type: 'pickup' });
    }
  }
  for (const r of state.rings) {
    if (r.used || r.z > 1.2 || r.z < -1.2) continue;
    const dx = r.x - state.ship.x;
    const dy = r.y - state.ship.y;
    if (dx * dx + dy * dy < r.r * r.r * 0.72) {
      r.used = true;
      gain(state, SCORE.ring); // scored BEFORE light-speed engages (no self-double)
      state.lightspeedUntil = state.elapsed + LIGHTSPEED_SECONDS;
      burst(state, r.x, r.y, 0, '#ff3df0', 26, 10);
      state.events.push({ type: 'warp' });
    }
  }

  // Cleanup.
  state.asteroids = state.asteroids.filter((a) => a.z > -6 && !a.hit);
  state.shards = state.shards.filter((s) => s.z > -6 && !s.taken);
  state.rings = state.rings.filter((r) => r.z > -6 && !r.used);
  state.bullets = state.bullets.filter((b) => b.z < FAR_Z + 40);
  state.particles = state.particles.filter((p) => p.age < p.life);

  if (state.phase !== 'playing') return;
}
