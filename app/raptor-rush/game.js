// Raptor Rush — pure game logic. Dependency-free, no DOM, no network.
// A 2D endless runner: jump and slide a raptor through a canyon, eat rabbits,
// dodge rock spires. Speed ramps up; 3 hits ends the run.

export const WORLD_W = 960;
export const WORLD_H = 540;
export const GROUND_Y = 470;
export const GRAVITY = 3200; // px/s^2
export const JUMP_V = 980; // px/s, upward
export const SLIDE_TIME = 0.6; // s
export const BASE_SPEED = 380; // px/s
export const MAX_SPEED = 920; // px/s
export const RAMP_TIME = 90; // s to reach max speed
export const INVINCIBLE_TIME = 1.5; // s after a hit
export const MAX_HEARTS = 3;
export const RAPTOR_X = 130; // raptor left edge, fixed
export const RABBIT_SCORE = 25;

// Obstacle shapes. "jump" obstacles sit on the ground; "slide" obstacles hang
// from above and must be slid under (they cannot be jumped over).
export const OBSTACLE_TYPES = {
  spire: { w: 52, h: 118, kind: 'jump' },
  boulder: { w: 96, h: 58, kind: 'jump' },
  vines: { w: 70, h: 90, kind: 'slide', hang: 70 }, // bottom edge 70px above ground: blocks standing, cleared by sliding, too tall to jump
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
    phase: 'ready', // ready | running | over
    time: 0,
    distancePx: 0,
    score: 0,
    prey: 0,
    hearts: MAX_HEARTS,
    speed: BASE_SPEED,
    rng: mulberry32(seed),
    raptor: { y: 0, vy: 0, sliding: 0 }, // y: height above ground in px
    invincible: 0,
    obstacles: [], // { id, type, x }
    rabbits: [], // { id, x, hopPhase }
    dust: [], // { x, y, vx, vy, life, maxLife }
    spawnTimer: 0.9,
    rabbitTimer: 1.6,
    nextId: 1,
  };
}

export function startGame(g) {
  const fresh = createGame(1);
  // Keep a fresh RNG each run so patterns vary run to run.
  fresh.rng = mulberry32((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  fresh.phase = 'running';
  Object.assign(g, fresh);
}

export function jump(g) {
  if (g.phase !== 'running') return false;
  const r = g.raptor;
  if (r.y === 0 && r.vy === 0) {
    r.vy = JUMP_V;
    r.sliding = 0;
    puff(g, RAPTOR_X + 30, GROUND_Y, 4);
    return true;
  }
  return false;
}

export function slide(g) {
  if (g.phase !== 'running') return false;
  const r = g.raptor;
  if (r.y === 0 && r.vy === 0) {
    r.sliding = SLIDE_TIME;
    return true;
  }
  // Slam down out of the air.
  if (r.y > 0) {
    r.vy = -1700;
    r.sliding = SLIDE_TIME;
    return true;
  }
  return false;
}

// Raptor hitbox in world coords.
export function raptorBox(g) {
  const sliding = g.raptor.sliding > 0;
  const w = sliding ? 86 : 62;
  const h = sliding ? 44 : 92;
  return { x: RAPTOR_X, y: GROUND_Y - g.raptor.y - h, w, h };
}

export function obstacleBox(o) {
  const t = OBSTACLE_TYPES[o.type];
  const y = t.kind === 'slide' ? GROUND_Y - t.hang - t.h : GROUND_Y - t.h;
  return { x: o.x, y, w: t.w, h: t.h };
}

export function rabbitBox(r) {
  const hop = Math.abs(Math.sin(r.hopPhase)) * 42;
  return { x: r.x, y: GROUND_Y - hop - 30, w: 36, h: 30, hop };
}

export function boxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function puff(g, x, y, n) {
  for (let i = 0; i < n; i++) {
    g.dust.push({
      x: x + (g.rng() - 0.5) * 20,
      y: y - g.rng() * 10,
      vx: (g.rng() - 0.7) * 160,
      vy: -g.rng() * 140,
      life: 0.5,
      maxLife: 0.5,
    });
  }
}

function spawnInterval(g) {
  const t = Math.min(g.time / RAMP_TIME, 1);
  return 1.15 - 0.6 * t;
}

function canSpawn(g) {
  for (const o of g.obstacles) {
    if (o.x > WORLD_W - 280) return false;
  }
  return true;
}

function spawnObstacle(g) {
  const roll = g.rng();
  const type = roll < 0.38 ? 'spire' : roll < 0.72 ? 'boulder' : 'vines';
  g.obstacles.push({ id: g.nextId++, type, x: WORLD_W + 40 });
}

function spawnRabbit(g) {
  g.rabbits.push({ id: g.nextId++, x: WORLD_W + 40, hopPhase: g.rng() * Math.PI * 2 });
}

export function update(g, dt) {
  dt = Math.min(Math.max(dt, 0), 0.05);
  if (g.phase !== 'running') return;

  g.time += dt;
  const ramp = Math.min(g.time / RAMP_TIME, 1);
  g.speed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * ramp;
  g.distancePx += g.speed * dt;
  g.score = Math.floor(g.distancePx / 25) + g.prey * RABBIT_SCORE;

  // Raptor vertical physics (y = height above ground, up positive).
  const r = g.raptor;
  if (r.y > 0 || r.vy !== 0) {
    r.vy -= GRAVITY * dt;
    r.y += r.vy * dt;
    if (r.y <= 0) {
      const slammed = r.vy < -1200;
      r.y = 0;
      r.vy = 0;
      if (slammed) puff(g, RAPTOR_X + 30, GROUND_Y, 6);
    }
  }
  if (r.sliding > 0) r.sliding -= dt;
  if (g.invincible > 0) g.invincible -= dt;

  // Spawning.
  g.spawnTimer -= dt;
  if (g.spawnTimer <= 0) {
    if (canSpawn(g)) {
      spawnObstacle(g);
      g.spawnTimer = spawnInterval(g);
    } else {
      g.spawnTimer = 0.15;
    }
  }
  g.rabbitTimer -= dt;
  if (g.rabbitTimer <= 0) {
    spawnRabbit(g);
    g.rabbitTimer = 2 + g.rng() * 2.2;
  }

  // Scroll entities.
  const dx = g.speed * dt;
  for (const o of g.obstacles) o.x -= dx;
  for (const rb of g.rabbits) {
    rb.x -= dx;
    rb.hopPhase += dt * 9;
  }
  g.obstacles = g.obstacles.filter((o) => o.x > -160);
  g.rabbits = g.rabbits.filter((rb) => rb.x > -80);

  // Dust.
  for (const p of g.dust) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 900 * dt;
    p.life -= dt;
  }
  g.dust = g.dust.filter((p) => p.life > 0);

  // Collisions.
  const rb = raptorBox(g);
  for (const o of g.obstacles) {
    if (boxesOverlap(rb, obstacleBox(o))) {
      // Remove the obstacle so one obstacle = one hit.
      o.x = -9999;
      if (g.invincible <= 0) {
        g.hearts -= 1;
        g.invincible = INVINCIBLE_TIME;
        puff(g, RAPTOR_X + 30, GROUND_Y - 50, 10);
        if (g.hearts <= 0) {
          g.phase = 'over';
          return;
        }
      }
    }
  }
  g.obstacles = g.obstacles.filter((o) => o.x > -160);

  for (const q of g.rabbits) {
    if (boxesOverlap(rb, rabbitBox(q))) {
      q.x = -9999;
      g.prey += 1;
      g.score = Math.floor(g.distancePx / 25) + g.prey * RABBIT_SCORE;
      puff(g, q.x < 0 ? RAPTOR_X + 40 : q.x, GROUND_Y - 40, 6);
    }
  }
  g.rabbits = g.rabbits.filter((q) => q.x > -80);
}

export function distanceMeters(g) {
  return Math.floor(g.distancePx / 50);
}
