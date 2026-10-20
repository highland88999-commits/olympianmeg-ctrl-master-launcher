// app/neon-void/engine.js
// NEON VOID — pure game logic for a 3D maze-chase game.
// No DOM, no rendering, no audio. Shared by the page (rAF driver) and the
// headless tests. The page drains state.events to fire sound + haptics.
//
// Story: you are a light spirit drifting the void. Gather every star shard
// while four void wraiths hunt you. Eat a nova shard and the hunt flips —
// for a few seconds YOU are the predator.

import { generateMaze, MAX_LEVEL } from '../../lib/neon-void/levels.js';

export const DIRS = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
const DIR_LIST = [DIRS.up, DIRS.right, DIRS.down, DIRS.left];

export const POINTS = {
  shard: 10,
  nova: 50,
  bonusBase: 300,
  extraLifeAt: 10000,
};
export const WRAITH_POINTS = [200, 400, 800, 1600];

// Four wraith personalities — original characters, original behaviour.
//   stalker  — targets the spirit's exact cell
//   ambusher — targets 4 cells ahead of the spirit's heading
//   flanker  — targets a point offset from the spirit (tries to cut corners)
//   drifter  — wanders at random (seeded), scarier at close range
export const WRAITHS = [
  { id: 'stalker', name: 'Stalker', color: '#ff2d78', kind: 'stalker' },
  { id: 'ambusher', name: 'Ambusher', color: '#ff9f1c', kind: 'ambusher' },
  { id: 'flanker', name: 'Flanker', color: '#00e5ff', kind: 'flanker' },
  { id: 'drifter', name: 'Drifter', color: '#c77dff', kind: 'drifter' },
];

const key = (x, y) => `${x},${y}`;
const sameDir = (a, b) => a && b && a.x === b.x && a.y === b.y;
const reverseOf = (d) => ({ x: -d.x, y: -d.y });

function isOpen(state, x, y) {
  const { cols, rows, maze } = state;
  if (y < 0 || y >= rows) return false;
  const wx = ((x % cols) + cols) % cols;
  return maze.grid[y * cols + wx] === 0;
}

function actorAtCellCenter(state, actor) {
  // Actors only travel axis-aligned, so one coordinate is always integral.
  return Math.abs(actor.x - Math.round(actor.x)) < 1e-6 &&
    Math.abs(actor.y - Math.round(actor.y)) < 1e-6;
}

/**
 * Advance one actor by `distance` cells, running `decide(state, actor)` at
 * each cell center it passes. decide() may set actor.dir (or null to stop).
 */
function moveActor(state, actor, distance, decide) {
  let budget = distance;
  let guard = 0;
  while (budget > 1e-9 && guard++ < 8) {
    if (actorAtCellCenter(state, actor)) {
      actor.x = Math.round(actor.x);
      actor.y = Math.round(actor.y);
      decide(state, actor);
      if (!actor.dir) return;
    }
    if (!actor.dir) return;
    // Distance to the next cell center along dir.
    const cx = actor.dir.x !== 0
      ? (actor.dir.x > 0 ? Math.floor(actor.x) + 1 : Math.ceil(actor.x) - 1)
      : actor.x;
    const cy = actor.dir.y !== 0
      ? (actor.dir.y > 0 ? Math.floor(actor.y) + 1 : Math.ceil(actor.y) - 1)
      : actor.y;
    const dist = Math.abs(cx - actor.x) + Math.abs(cy - actor.y);
    const stepLen = Math.min(budget, dist);
    actor.x += actor.dir.x * stepLen;
    actor.y += actor.dir.y * stepLen;
    budget -= stepLen;
    // Tunnel wrap (horizontal edges).
    if (actor.x < -0.5) actor.x += state.cols;
    if (actor.x >= state.cols - 0.5) actor.x -= state.cols;
  }
}

function playerDecide(state, p) {
  // Queued direction wins as soon as it is open (classic buffered turns).
  const cell = { x: Math.round(p.x), y: Math.round(p.y) };
  if (p.queuedDir && isOpen(state, cell.x + p.queuedDir.x, cell.y + p.queuedDir.y)) {
    p.dir = p.queuedDir;
  }
  if (p.dir && !isOpen(state, cell.x + p.dir.x, cell.y + p.dir.y)) {
    p.dir = null; // nose against a wall — stop, keep the queued turn alive
  }
}

function wraithTarget(state, w) {
  const p = state.player;
  const px = Math.round(p.x);
  const py = Math.round(p.y);
  if (w.mode === 'eaten') return state.maze.door;
  if (w.mode === 'frightened') return null; // decided by flee logic
  if (state.modePhase === 'scatter') {
    const corners = [
      { x: state.cols - 2, y: 1 },
      { x: 1, y: 1 },
      { x: state.cols - 2, y: state.rows - 2 },
      { x: 1, y: state.rows - 2 },
    ];
    return corners[WRAITHS.findIndex((v) => v.id === w.id)] || corners[0];
  }
  switch (w.kind) {
    case 'stalker':
      return { x: px, y: py };
    case 'ambusher': {
      const d = p.dir || DIRS.up;
      return { x: px + d.x * 4, y: py + d.y * 4 };
    }
    case 'flanker': {
      const d = p.dir || DIRS.up;
      const perp = { x: d.y, y: d.x };
      return { x: px - d.x * 2 + perp.x * 3, y: py - d.y * 2 + perp.y * 3 };
    }
    case 'drifter':
    default:
      return null; // random
  }
}

function wraithDecide(state, w) {
  const cell = { x: Math.round(w.x), y: Math.round(w.y) };

  // In the home box: head for the door.
  if (w.mode === 'home') {
    const door = state.maze.door;
    if (cell.x === door.x && cell.y === door.y) {
      w.mode = state.frightTimer > 0 ? 'frightened' : state.modePhase;
      w.dir = DIRS.up;
      return;
    }
    // Simple homing: prefer the move that reduces distance to the door.
    w.dir = pickDir(state, w, door, { allowReverse: true });
    return;
  }
  // Eaten wraith arriving at the door drops back into the home.
  if (w.mode === 'eaten' && cell.x === state.maze.door.x && cell.y === state.maze.door.y) {
    w.mode = 'home';
    w.dir = DIRS.down;
    w.x = state.maze.door.x;
    w.y = state.maze.door.y + 1; // just inside the home box
    return;
  }

  const target = wraithTarget(state, w);
  if (w.mode === 'frightened') {
    w.dir = fleeDir(state, w) || w.dir;
    return;
  }
  if (target) {
    w.dir = pickDir(state, w, target, { allowReverse: false }) || w.dir;
    return;
  }
  // Drifter: random open direction (never reverse unless cornered).
  w.dir = randomDir(state, w) || w.dir;
}

/** Open directions from a cell, excluding reverse when asked. */
function openDirs(state, w, allowReverse) {
  const cell = { x: Math.round(w.x), y: Math.round(w.y) };
  const out = [];
  for (const d of DIR_LIST) {
    if (!allowReverse && w.dir && sameDir(d, reverseOf(w.dir))) continue;
    if (isOpen(state, cell.x + d.x, cell.y + d.y)) out.push(d);
  }
  return out;
}

function pickDir(state, w, target, { allowReverse }) {
  const cell = { x: Math.round(w.x), y: Math.round(w.y) };
  const opts = openDirs(state, w, allowReverse);
  if (!opts.length) {
    const all = openDirs(state, w, true);
    return all[0] || null;
  }
  let best = opts[0];
  let bestD = Infinity;
  for (const d of opts) {
    const nx = cell.x + d.x;
    const ny = cell.y + d.y;
    const dist = (nx - target.x) * (nx - target.x) + (ny - target.y) * (ny - target.y);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}

function fleeDir(state, w) {
  const cell = { x: Math.round(w.x), y: Math.round(w.y) };
  const opts = openDirs(state, w, false);
  if (!opts.length) return null;
  const p = state.player;
  let best = opts[0];
  let bestD = -Infinity;
  for (const d of opts) {
    const nx = cell.x + d.x;
    const ny = cell.y + d.y;
    const dist = (nx - p.x) * (nx - p.x) + (ny - p.y) * (ny - p.y);
    // Tiny seeded jitter so flight paths feel organic, not robotic.
    const jitter = state.rng() * 0.6;
    if (dist + jitter > bestD) {
      bestD = dist + jitter;
      best = d;
    }
  }
  return best;
}

function randomDir(state, w) {
  const opts = openDirs(state, w, false);
  if (!opts.length) return null;
  return opts[(state.rng() * opts.length) | 0];
}

/** Reset actor positions for a fresh attempt at the current level. */
function resetPositions(state) {
  const { maze } = state;
  state.player.x = maze.spawn.x;
  state.player.y = maze.spawn.y;
  state.player.dir = null;
  state.player.queuedDir = null;
  state.releaseTimer = 0;
  state.released = 0;
  state.wraiths = WRAITHS.map((def, i) => ({
    ...def,
    x: maze.home.cols[i % maze.home.cols.length],
    y: i < 2 ? maze.home.top : maze.home.bottom,
    dir: null,
    mode: 'home',
    homeDelay: i * state.cfg.releaseGap, // seconds after level start
  }));
  state.frightTimer = 0;
  state.combo = 0;
  state.modePhase = 'scatter';
  state.modeTimer = state.cfg.scatterDuration;
}

/** Build the full game state for a run, starting at `level`. */
export function createGame(level = 1) {
  const startLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1));
  const state = {
    level: startLevel,
    score: 0,
    lives: 3,
    status: 'ready', // ready | playing | dying | levelclear | gameover | won | paused handled by page
    statusTimer: 1.4,
    time: 0,
    extraLifeAwarded: false,
    events: [],
    rng: Math.random,
  };
  loadLevel(state, startLevel);
  return state;
}

/** (Re)build the maze + shards for a level inside an existing state. */
export function loadLevel(state, level) {
  const maze = generateMaze(level);
  state.level = level;
  state.maze = maze;
  state.cfg = maze; // levelConfig output is embedded in the maze object
  state.cols = maze.cols;
  state.rows = maze.rows;
  // Deterministic per-level rng for wraith jitter / drifter wandering.
  let s = maze.seed ^ 0x9e3779b9;
  state.rng = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };

  // Shards on every path cell except the home box, the door and the spawn.
  state.shards = new Set();
  state.novas = new Set(maze.novas.map((n) => key(n.x, n.y)));
  for (let y = 0; y < maze.rows; y++) {
    for (let x = 0; x < maze.cols; x++) {
      if (maze.grid[y * maze.cols + x] !== 0) continue;
      if (maze.inHome(x, y)) continue;
      if (x === maze.door.x && y === maze.door.y) continue;
      if (x === maze.spawn.x && y === maze.spawn.y) continue;
      const k = key(x, y);
      if (state.novas.has(k)) continue;
      state.shards.add(k);
    }
  }
  state.shardsTotal = state.shards.size + state.novas.size;
  state.shardsEaten = 0;
  state.shardsVersion = 0; // bumped when a shard/nova/bonus changes (render sync)
  state.bonus = null;
  state.bonusSpawned = false;

  state.player = { x: maze.spawn.x, y: maze.spawn.y, dir: null, queuedDir: null };
  resetPositions(state);
  state.status = 'ready';
  state.statusTimer = 1.4;
}

function emit(state, type, extra = {}) {
  state.events.push({ type, ...extra });
}

/** Drain pending events (page uses them for sound + haptics). */
export function drainEvents(state) {
  const out = state.events;
  state.events = [];
  return out;
}

/** Queue a direction (call from keyboard / swipe / D-pad). */
export function queueDirection(state, dirName) {
  const d = DIRS[dirName];
  if (!d) return;
  if (!state.player.queuedDir || !sameDir(state.player.queuedDir, d)) {
    state.player.queuedDir = d;
  }
}

function actorSpeed(state, w) {
  if (w.mode === 'eaten') return 10;
  if (w.mode === 'frightened') return state.cfg.wraithSpeed * 0.55;
  if (w.mode === 'home') return 3;
  return state.cfg.wraithSpeed;
}

function eatAtPlayerCell(state) {
  const p = state.player;
  const cx = Math.round(p.x);
  const cy = Math.round(p.y);
  if (Math.abs(p.x - cx) > 0.45 || Math.abs(p.y - cy) > 0.45) return;
  const k = key(cx, cy);
  if (state.shards.has(k)) {
    state.shards.delete(k);
    state.shardsEaten++;
    state.shardsVersion++;
    addScore(state, POINTS.shard);
    emit(state, 'shard');
    maybeSpawnBonus(state);
  } else if (state.novas.has(k)) {
    state.novas.delete(k);
    state.shardsEaten++;
    state.shardsVersion++;
    addScore(state, POINTS.nova);
    state.frightTimer = state.cfg.frightDuration;
    state.combo = 0;
    for (const w of state.wraiths) {
      if (w.mode === 'chase' || w.mode === 'scatter') {
        w.mode = 'frightened';
        if (w.dir) w.dir = reverseOf(w.dir);
      }
    }
    emit(state, 'nova');
  }
  if (state.bonus && state.bonus.active) {
    const b = state.bonus;
    if (Math.abs(p.x - b.x) < 0.6 && Math.abs(p.y - b.y) < 0.6) {
      addScore(state, b.points);
      emit(state, 'bonus', { points: b.points });
      state.bonus = null;
      state.shardsVersion++;
    }
  }
}

function maybeSpawnBonus(state) {
  if (state.bonusSpawned || state.bonus) return;
  if (state.shardsEaten < 60) return;
  // Golden comet: park it on a random open path cell away from the spirit.
  const cells = [];
  for (let y = 1; y < state.rows - 1; y++) {
    for (let x = 1; x < state.cols - 1; x++) {
      if (state.maze.grid[y * state.cols + x] === 0 && !state.maze.inHome(x, y)) {
        const d = Math.abs(x - state.player.x) + Math.abs(y - state.player.y);
        if (d >= 6) cells.push({ x, y });
      }
    }
  }
  if (!cells.length) return;
  const cell = cells[(state.rng() * cells.length) | 0];
  state.bonus = {
    ...cell,
    points: POINTS.bonusBase + state.level * 10,
    active: true,
    until: state.time + 9,
  };
  state.bonusSpawned = true;
  state.shardsVersion++;
}

function addScore(state, pts) {
  state.score += pts;
  if (!state.extraLifeAwarded && state.score >= POINTS.extraLifeAt) {
    state.extraLifeAwarded = true;
    state.lives += 1;
    emit(state, 'extraLife');
  }
}

function checkWraithCollisions(state) {
  const p = state.player;
  for (const w of state.wraiths) {
    if (w.mode === 'home' || w.mode === 'eaten') continue;
    const dx = w.x - p.x;
    const dy = w.y - p.y;
    if (dx * dx + dy * dy < 0.55 * 0.55) {
      if (w.mode === 'frightened') {
        const pts = WRAITH_POINTS[Math.min(state.combo, WRAITH_POINTS.length - 1)];
        state.combo++;
        addScore(state, pts);
        w.mode = 'eaten';
        emit(state, 'eatWraith', { points: pts, wraith: w.id });
      } else {
        state.status = 'dying';
        state.statusTimer = 1.2;
        emit(state, 'death');
        return;
      }
    }
  }
}

/**
 * Advance the simulation by dt seconds (call with a fixed step, e.g. 1/120).
 */
export function stepGame(state, dt) {
  if (state.status === 'gameover' || state.status === 'won') return;
  state.time += dt;

  if (state.status === 'ready') {
    state.statusTimer -= dt;
    if (state.statusTimer <= 0) {
      state.status = 'playing';
      emit(state, 'start');
    }
    return;
  }
  if (state.status === 'dying') {
    state.statusTimer -= dt;
    if (state.statusTimer <= 0) {
      state.lives -= 1;
      if (state.lives <= 0) {
        state.status = 'gameover';
        emit(state, 'gameover');
      } else {
        resetPositions(state);
        state.status = 'ready';
        state.statusTimer = 1.2;
      }
    }
    return;
  }
  if (state.status === 'levelclear') {
    state.statusTimer -= dt;
    if (state.statusTimer <= 0) {
      if (state.level >= MAX_LEVEL) {
        state.status = 'won';
        emit(state, 'won');
      } else {
        loadLevel(state, state.level + 1);
        emit(state, 'levelStart', { level: state.level });
      }
    }
    return;
  }
  if (state.status !== 'playing') return;

  // Fright timer.
  if (state.frightTimer > 0) {
    state.frightTimer -= dt;
    if (state.frightTimer <= 0) {
      state.frightTimer = 0;
      for (const w of state.wraiths) {
        if (w.mode === 'frightened') w.mode = state.modePhase;
      }
    }
  }

  // Scatter <-> chase phase cycling (scatter opens each level, then chase).
  state.modeTimer -= dt;
  if (state.modeTimer <= 0) {
    if (state.modePhase === 'scatter') {
      state.modePhase = 'chase';
      state.modeTimer = 20;
    } else {
      state.modePhase = 'scatter';
      state.modeTimer = Math.max(2, state.cfg.scatterDuration * 0.6);
    }
    for (const w of state.wraiths) {
      if (w.mode === 'scatter' || w.mode === 'chase') w.mode = state.modePhase;
    }
  }

  // Wraith releases.
  state.releaseTimer += dt;

  // Move the spirit.
  moveActor(state, state.player, state.cfg.playerSpeed * dt, playerDecide);
  eatAtPlayerCell(state);

  // Win check: every shard + nova gathered.
  if (state.shards.size === 0 && state.novas.size === 0) {
    addScore(state, state.level * 100);
    state.status = 'levelclear';
    state.statusTimer = 1.6;
    emit(state, 'levelClear', { level: state.level });
    return;
  }

  // Move wraiths.
  for (const w of state.wraiths) {
    const inHomeWaiting = w.mode === 'home' && state.releaseTimer < w.homeDelay;
    if (inHomeWaiting) continue; // still sealed in the home box
    moveActor(state, w, actorSpeed(state, w) * dt, wraithDecide);
  }

  // Bonus expiry.
  if (state.bonus && state.time > state.bonus.until) {
    state.bonus = null;
    state.shardsVersion++;
  }

  checkWraithCollisions(state);
}
