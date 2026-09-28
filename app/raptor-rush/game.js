// Raptor Rush — pure game logic. Dependency-free, no DOM, no network.
// A vertical dead-ahead endless runner: the canyon runs INTO the screen,
// the raptor sprints toward the horizon at the bottom of the screen and
// steers left/right to eat rabbits and dodge rock. Speed ramps up; 3 hits
// ends the hunt.
//
// Party (PvP) mode: a fixed-length match where every player runs their own
// track at the same time. The escalation curve makes rabbits spawn
// increasingly more and obstacles harder as the match progresses —
// high score wins.

export const WORLD_W = 540;
export const WORLD_H = 960;
export const TRACK_X0 = 72; // left canyon wall edge
export const TRACK_X1 = 468; // right canyon wall edge
export const RAPTOR_Y = 792; // raptor anchor, near the bottom of the screen
export const STEER_SPEED = 560; // px/s toward the steering target
export const BASE_SPEED = 400; // px/s of forward scroll
export const MAX_SPEED = 940; // px/s
export const RAMP_TIME = 90; // s to reach max speed
export const INVINCIBLE_TIME = 1.5; // s after a hit
export const MAX_HEARTS = 3;
export const RABBIT_SCORE = 25;
export const MATCH_SECONDS = 75; // PvP party match length
export const ESCALATE_EVERY = 20; // seconds per escalation level

// Obstacle shapes. All are dodged by steering around them; "drift" rocks
// also slide sideways across the track (they only appear once the
// escalation curve reaches level 2).
export const OBSTACLE_TYPES = {
  spire: { w: 66, h: 118, kind: 'static' }, // rock spire jutting up
  boulder: { w: 96, h: 72, kind: 'static' }, // rolling boulder
  rockfall: { w: 60, h: 60, kind: 'drift' }, // drifting rockfall
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

/**
 * The escalation curve: rabbits spawn increasingly more and obstacles get
 * harder as the match progresses. Level rises by 1 every ESCALATE_EVERY
 * seconds. Pure function — safe to test headless.
 */
export function escalationAt(time) {
  const level = Math.floor(Math.max(time, 0) / ESCALATE_EVERY);
  return {
    level,
    rabbitEvery: Math.max(0.7, 2.4 - 0.35 * level), // s between rabbit spawns
    obstacleEvery: Math.max(0.5, 1.45 - 0.18 * level), // s between obstacles
    doubleChance: Math.min(0.55, 0.1 + 0.09 * level), // two obstacles at once
    warrenChance: Math.min(0.45, 0.08 * level), // a cluster of rabbits
    drifters: level >= 2, // drifting rockfall joins the track
    speedBoost: 1 + 0.05 * level, // forward scroll multiplier
  };
}

export function createGame(seed = 1, opts = {}) {
  const mode = opts.mode === 'party' ? 'party' : 'solo';
  return {
    phase: 'ready', // ready | running | over
    mode,
    matchSeconds: opts.matchSeconds || MATCH_SECONDS,
    timedOut: false, // true when a party match ends on the clock
    time: 0,
    distancePx: 0,
    score: 0,
    prey: 0,
    hearts: MAX_HEARTS,
    speed: BASE_SPEED,
    rng: mulberry32(seed),
    raptor: { x: (TRACK_X0 + TRACK_X1) / 2, targetX: (TRACK_X0 + TRACK_X1) / 2 },
    invincible: 0,
    obstacles: [], // { id, type, x, y }
    rabbits: [], // { id, x, y, hopPhase }
    dust: [], // { x, y, vx, vy, life, maxLife }
    spawnTimer: 0.9,
    rabbitTimer: 1.4,
    nextId: 1,
  };
}

export function startGame(g, opts = {}) {
  const fresh = createGame(1, { mode: g.mode, ...opts });
  // Keep a fresh RNG each run so patterns vary run to run.
  fresh.rng = mulberry32((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  fresh.phase = 'running';
  Object.assign(g, fresh);
}

/** Point the raptor's steering target at a world x (drag / touch). */
export function steerTo(g, x) {
  if (g.phase !== 'running') return false;
  g.raptor.targetX = Math.max(TRACK_X0 + 20, Math.min(TRACK_X1 - 20, x));
  return true;
}

/** Nudge the steering target left (-1) or right (+1) by one step. */
export function nudge(g, dir) {
  if (g.phase !== 'running') return false;
  return steerTo(g, g.raptor.targetX + dir * 72);
}

// Raptor hitbox in world coords.
export function raptorBox(g) {
  return { x: g.raptor.x - 31, y: RAPTOR_Y - 92, w: 62, h: 92 };
}

export function obstacleBox(o) {
  const t = OBSTACLE_TYPES[o.type];
  return { x: o.x - t.w / 2, y: o.y - t.h / 2, w: t.w, h: t.h };
}

export function rabbitBox(r) {
  const hop = Math.abs(Math.sin(r.hopPhase)) * 36;
  return { x: r.x - 18, y: r.y - hop - 30, w: 36, h: 30, hop };
}

export function boxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function puff(g, x, y, n) {
  for (let i = 0; i < n; i++) {
    g.dust.push({
      x: x + (g.rng() - 0.5) * 20,
      y: y - g.rng() * 10,
      vx: (g.rng() - 0.5) * 160,
      vy: -g.rng() * 140,
      life: 0.5,
      maxLife: 0.5,
    });
  }
}

function randLaneX(g, margin = 30) {
  return TRACK_X0 + margin + g.rng() * (TRACK_X1 - TRACK_X0 - margin * 2);
}

function canSpawn(g) {
  for (const o of g.obstacles) {
    if (o.y < 220) return false;
  }
  return true;
}

function spawnObstacle(g, esc) {
  const roll = g.rng();
  const type = esc.drifters && roll < 0.22 ? 'rockfall' : roll < 0.55 ? 'spire' : 'boulder';
  g.obstacles.push({ id: g.nextId++, type, x: randLaneX(g), y: -140 });
}

function spawnRabbit(g) {
  g.rabbits.push({ id: g.nextId++, x: randLaneX(g), y: -80, hopPhase: g.rng() * Math.PI * 2 });
}

export function update(g, dt) {
  dt = Math.min(Math.max(dt, 0), 0.05);
  if (g.phase !== 'running') return;

  g.time += dt;
  const esc = escalationAt(g.time);

  // Party matches end on the clock — high score wins.
  if (g.mode === 'party' && g.time >= g.matchSeconds) {
    g.phase = 'over';
    g.timedOut = true;
    return;
  }

  const ramp = Math.min(g.time / RAMP_TIME, 1);
  g.speed = (BASE_SPEED + (MAX_SPEED - BASE_SPEED) * ramp) * esc.speedBoost;
  g.distancePx += g.speed * dt;
  g.score = Math.floor(g.distancePx / 25) + g.prey * RABBIT_SCORE;

  // Steering: the raptor glides toward its target.
  const r = g.raptor;
  const dx = r.targetX - r.x;
  const step = STEER_SPEED * dt;
  r.x += Math.abs(dx) <= step ? dx : Math.sign(dx) * step;
  if (g.invincible > 0) g.invincible -= dt;

  // Spawning (intervals shrink as escalation rises).
  g.spawnTimer -= dt;
  if (g.spawnTimer <= 0) {
    if (canSpawn(g)) {
      spawnObstacle(g, esc);
      if (g.rng() < esc.doubleChance) spawnObstacle(g, esc);
      g.spawnTimer = esc.obstacleEvery * (0.85 + g.rng() * 0.3);
    } else {
      g.spawnTimer = 0.15;
    }
  }
  g.rabbitTimer -= dt;
  if (g.rabbitTimer <= 0) {
    spawnRabbit(g);
    // Warrens: extra rabbits hop in together at higher escalation.
    if (g.rng() < esc.warrenChance) {
      spawnRabbit(g);
      if (g.rng() < esc.warrenChance * 0.5) spawnRabbit(g);
    }
    g.rabbitTimer = esc.rabbitEvery * (0.85 + g.rng() * 0.3);
  }

  // Scroll entities toward the player (dead-ahead).
  const dy = g.speed * dt;
  for (const o of g.obstacles) {
    o.y += dy;
    if (o.type === 'rockfall') {
      // Drifters slide sideways toward the raptor's current position.
      const want = Math.max(-1, Math.min(1, (r.x - o.x) / 120));
      o.x += want * 90 * dt;
    }
  }
  for (const rb of g.rabbits) {
    rb.y += dy;
    rb.hopPhase += dt * 9;
  }
  g.obstacles = g.obstacles.filter((o) => o.y < WORLD_H + 200);
  g.rabbits = g.rabbits.filter((rb) => rb.y < WORLD_H + 120);

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
      o.y = WORLD_H + 9999;
      if (g.invincible <= 0) {
        g.hearts -= 1;
        g.invincible = INVINCIBLE_TIME;
        puff(g, r.x, RAPTOR_Y - 50, 10);
        if (g.hearts <= 0) {
          g.phase = 'over';
          return;
        }
      }
    }
  }
  g.obstacles = g.obstacles.filter((o) => o.y < WORLD_H + 200);

  for (const q of g.rabbits) {
    if (boxesOverlap(rb, rabbitBox(q))) {
      q.y = WORLD_H + 9999; // eaten
      g.prey += 1;
      g.score = Math.floor(g.distancePx / 25) + g.prey * RABBIT_SCORE;
      puff(g, q.x, RAPTOR_Y - 60, 6);
    }
  }
  g.rabbits = g.rabbits.filter((q) => q.y < WORLD_H + 120);
}

export function distanceMeters(g) {
  return Math.floor(g.distancePx / 50);
}

export function timeLeft(g) {
  if (g.mode !== 'party') return null;
  return Math.max(0, Math.ceil(g.matchSeconds - g.time));
}
