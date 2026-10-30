// app/collapse-run/engine.js — pure Collapse Run game logic (Merlin, 2026-10-29).
// No DOM, no three.js: stepped with dt seconds + input. Seeded RNG.
//
// The run: 3s countdown, then the runner sprints down a raised tiled
// platform. Tiles cave a few seconds behind the runner — if the collapse
// catches them, they fall INTO A VORTEX and warp to the next realm
// (next level, new texture), distance kept. Obstacles slow you;
// solid objects pause you 1s then vanish. 100 levels; reaching the top
// sucks the runner UP into the vortex (victory).

export const COUNTDOWN_MS = 3000;
export const TILE_M = 2;             // each tile is 2 meters deep
export const COLLAPSE_GRACE_S = 3;   // tiles cave ~3s behind the runner
export const BASE_SPEED = 9;         // m/s
export const SPRINT_MULT = 1.6;
export const SLOW_MULT = 0.55;       // after hitting an obstruction
export const SLOW_TIME_S = 2;
export const SOLID_PAUSE_S = 1;      // solid object: 1s pause, then it vanishes
export const LEVEL_EVERY_M = 400;    // a new level (texture) every 400m
export const MAX_LEVEL = 100;
export const TRACK_HALF = 2.2;       // runner lateral range (-2.2..2.2)
export const VIEW_AHEAD_M = 90;

export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function createGame(seed = (Math.random() * 0xffffffff) >>> 0, best = 0) {
  return {
    seed,
    rng: makeRng(seed),
    phase: 'countdown', // countdown | running | hitpause | warping | ascending | victory
    countdownT: COUNTDOWN_MS / 1000,
    distance: 0,
    best,
    level: 1,
    speed: 0,
    sprinting: false,
    lateral: 0,
    lateralVel: 0,
    // Collapse wave: tiles at distance < collapseD are gone.
    collapseD: -BASE_SPEED * COLLAPSE_GRACE_S,
    slowT: 0,
    pauseT: 0,
    // Warp / ascent bookkeeping.
    warpFromLevel: 1,
    newBest: false,
    tiles: new Map(),   // tileIndex -> 'solid' | 'shaking' | 'falling'
    obstacles: [],      // { d, lat, kind: 'obstruction' | 'solid', hit }
    nextSpawnD: 30,
    time: 0,
  };
}

// Path curve: the platform turns. Visual + spawn lateral reference.
export function pathCurve(d) {
  return Math.sin(d * 0.021) * 6 + Math.sin(d * 0.0073 + 1.7) * 9;
}

function spawnAhead(g) {
  const r = g.rng;
  while (g.nextSpawnD < g.distance + VIEW_AHEAD_M) {
    const d = g.nextSpawnD + 8 + r() * 14;
    const lat = (r() * 2 - 1) * (TRACK_HALF - 0.4);
    const roll = r();
    const kind = roll < 0.22 ? 'solid' : 'obstruction';
    // Don't spawn a solid right on top of another hazard.
    if (!g.obstacles.some((o) => Math.abs(o.d - d) < 6)) {
      g.obstacles.push({ d, lat, kind, hit: false });
    }
    g.nextSpawnD = d;
  }
  // Drop hazards far behind.
  g.obstacles = g.obstacles.filter((o) => o.d > g.collapseD - 10);
}

function levelFor(distance) {
  return Math.min(MAX_LEVEL, Math.floor(distance / LEVEL_EVERY_M) + 1);
}

// input: { steer: -1..1, sprint: bool }
export function stepGame(g, dt, input = {}) {
  g.time += dt;

  if (g.phase === 'countdown') {
    g.countdownT -= dt;
    if (g.countdownT <= 0) {
      g.phase = 'running';
      g.speed = BASE_SPEED;
    }
    return g;
  }
  if (g.phase !== 'running' && g.phase !== 'hitpause') return g;

  // Hit pause: solid object stops the runner for 1s, then vanishes.
  // The collapse keeps coming — that's the danger.
  if (g.phase === 'hitpause') {
    g.pauseT -= dt;
    // The collapse keeps coming while you're frozen — that's the danger.
    const gap = g.distance - g.collapseD;
    g.collapseD += (BASE_SPEED * 0.94 + Math.max(0, (gap - 30) * 0.15)) * dt;
    if (g.pauseT <= 0) g.phase = 'running';
    if (g.collapseD >= g.distance) return startWarp(g);
    return g;
  }

  const sprinting = !!input.sprint;
  g.sprinting = sprinting;

  let target = BASE_SPEED * (sprinting ? SPRINT_MULT : 1);
  if (g.slowT > 0) {
    g.slowT -= dt;
    target *= SLOW_MULT;
  }
  // Ease toward target speed.
  g.speed += (target - g.speed) * Math.min(1, dt * 4);

  // Steering.
  const steer = Math.max(-1, Math.min(1, input.steer || 0));
  g.lateralVel += (steer * 14 - g.lateralVel) * Math.min(1, dt * 8);
  g.lateral = Math.max(-TRACK_HALF, Math.min(TRACK_HALF, g.lateral + g.lateralVel * dt));

  g.distance += g.speed * dt;

  // Collapse wave: it chases at near-base speed and hurries when it
  // falls too far behind, so it trails ~3s back at full pace — but any
  // slowdown lets it catch up, and a 1s solid-object pause is scary.
  const gap = g.distance - g.collapseD;
  const waveSpeed = BASE_SPEED * 0.94 + Math.max(0, (gap - 30) * 0.15);
  g.collapseD += waveSpeed * dt;

  // Tile states.
  const shakeZone = 6;
  for (const [idx, st] of g.tiles) {
    const tileD = idx * TILE_M;
    if (tileD < g.collapseD - shakeZone && st === 'solid') g.tiles.set(idx, 'shaking');
    else if (tileD < g.collapseD && st !== 'falling') g.tiles.set(idx, 'falling');
    else if (tileD < g.collapseD - 12) g.tiles.delete(idx);
  }
  const firstIdx = Math.floor((g.collapseD - 14) / TILE_M);
  const lastIdx = Math.floor((g.distance + VIEW_AHEAD_M) / TILE_M);
  for (let i = firstIdx; i <= lastIdx; i++) {
    if (!g.tiles.has(i)) g.tiles.set(i, 'solid');
  }

  spawnAhead(g);

  // Collisions.
  for (const o of g.obstacles) {
    if (o.hit) continue;
    if (Math.abs(o.d - g.distance) < 1.2 && Math.abs(o.lat - g.lateral) < 0.9) {
      o.hit = true;
      if (o.kind === 'solid') {
        g.phase = 'hitpause';
        g.pauseT = SOLID_PAUSE_S;
        // It vanishes after the pause.
        o.vanish = true;
      } else {
        g.slowT = SLOW_TIME_S;
      }
    }
  }
  g.obstacles = g.obstacles.filter((o) => !(o.hit && o.vanish && g.phase === 'running'));

  // Level ups by distance.
  const lv = levelFor(g.distance);
  if (lv > g.level) {
    g.level = lv;
    if (g.level >= MAX_LEVEL) {
      g.phase = 'ascending';
      return g;
    }
  }

  // The floor caught the runner → fall into the vortex (warp, not death).
  if (g.collapseD >= g.distance) return startWarp(g);

  if (g.distance > g.best) {
    g.best = Math.floor(g.distance);
    g.newBest = true;
  }
  return g;
}

function startWarp(g) {
  g.warpFromLevel = g.level;
  // The warp IS the level transition: spit out into another realm.
  g.level = Math.min(MAX_LEVEL, g.level + 1);
  // Warping out of the final realm ascends to the Summit (victory) —
  // the distance-based level-up can never fire at the cap.
  g.phase = g.level >= MAX_LEVEL ? 'ascending' : 'warping';
  return g;
}

// Called by the page when the vortex ride ends: the runner lands in the
// new realm and keeps sprinting, distance kept (Merlin's twist).
export function landFromWarp(g) {
  g.phase = 'running';
  g.speed = BASE_SPEED;
  g.slowT = 0;
  g.lateral = 0;
  g.lateralVel = 0;
  g.obstacles = [];
  g.nextSpawnD = g.distance + 30;
  // Fresh grace in the new realm.
  g.collapseD = g.distance - g.speed * COLLAPSE_GRACE_S;
  const firstIdx = Math.floor((g.collapseD - 14) / TILE_M);
  const lastIdx = Math.floor((g.distance + VIEW_AHEAD_M) / TILE_M);
  g.tiles.clear();
  for (let i = firstIdx; i <= lastIdx; i++) g.tiles.set(i, 'solid');
  return g;
}

export function resetRun(g, best = g.best) {
  const fresh = createGame((Math.random() * 0xffffffff) >>> 0, best);
  Object.keys(fresh).forEach((k) => { g[k] = fresh[k]; });
  return g;
}
