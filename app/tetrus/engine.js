// app/tetrus/engine.js
// TETRUS — pure headless logic for an original 3D block-stacking game.
// No DOM, no rendering, no audio. Shared by the page (rAF driver) and the
// headless tests. The page drains state.events to fire sound + haptics.
//
// You stack tetracubes (4-cube pieces) inside a true 3D well. Pieces can
// be rotated around all three axes. A fully filled horizontal layer
// (wellW x wellD at one height) collapses and everything above settles.
// Complete enough layers to seal the depth, descend through 100 levels,
// and keep the stones from overflowing the pit — or Kronos breaks free.

import { levelConfig, mulberry32, MAX_LEVEL } from '../../lib/tetrus/levels.js';

// ---------------------------------------------------------------- pieces ---
// Tetracubes: offsets [x, y, z], y is up. Original set of eight.
export const PIECES = {
  spear: {
    name: 'Spear of Athena',
    color: '#22d3ee',
    cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]],
  },
  altar: {
    name: 'Altar Stone',
    color: '#fbbf24',
    cells: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]],
  },
  trident: {
    name: 'Trident',
    color: '#f97316',
    cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0]],
  },
  aegis: {
    name: 'Aegis',
    color: '#a78bfa',
    cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 0, 1]],
  },
  serpent: {
    name: 'Serpent',
    color: '#34d399',
    cells: [[1, 0, 0], [2, 0, 0], [0, 0, 1], [1, 0, 1]],
  },
  tripod: {
    name: 'Tripod of Delphi',
    color: '#f472b6',
    cells: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
  },
  helixA: {
    name: 'Helix of Daedalus',
    color: '#60a5fa',
    cells: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  },
  helixB: {
    name: 'Helix Mirrored',
    color: '#f87171',
    cells: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, -1]],
  },
};
export const PIECE_IDS = Object.keys(PIECES);
export const PIECE_INDEX = Object.fromEntries(PIECE_IDS.map((id, i) => [id, i]));
// Color lookup by grid value (grid stores piece index + 1; 0 = rubble).
export const GRID_COLORS = ['#8a6d3b', ...PIECE_IDS.map((id) => PIECES[id].color)];

export const LAYER_POINTS = [0, 100, 300, 600, 1000, 1500];
export const LOCK_DELAY = 0.45;
const MAX_LOCK_RESETS = 15;

// ---------------------------------------------------------------- helpers --
export const cellKey = (x, y, z) => `${x},${y},${z}`;

/** Rotate offsets 90° around an axis. dir = +1 or -1. Pure — returns new array. */
export function rotateOffsets(cells, axis, dir = 1) {
  const d = dir < 0 ? -1 : 1;
  const n = (v) => (v === 0 ? 0 : v); // normalize -0
  return cells.map(([x, y, z]) => {
    switch (axis) {
      case 'x':
        return d > 0 ? [x, n(-z), y] : [x, z, n(-y)];
      case 'y':
        return d > 0 ? [z, y, n(-x)] : [n(-z), y, x];
      case 'z':
      default:
        return d > 0 ? [n(-y), x, z] : [y, n(-x), z];
    }
  });
}

/** True if the given offsets at pos collide with walls/floor/locked cubes. */
export function collides(state, cells, pos) {
  const { wellW, wellD, wellH } = state.cfg;
  for (const [cx, cy, cz] of cells) {
    const x = pos.x + cx;
    const y = pos.y + cy;
    const z = pos.z + cz;
    if (x < 0 || x >= wellW || z < 0 || z >= wellD || y < 0) return true;
    if (y >= wellH) continue; // above the rim is open sky while spawning
    if (state.grid.has(cellKey(x, y, z))) return true;
  }
  return false;
}

/** Absolute cube positions of a piece placement. */
export function absoluteCells(piece) {
  return piece.cells.map(([cx, cy, cz]) => ({
    x: piece.pos.x + cx,
    y: piece.pos.y + cy,
    z: piece.pos.z + cz,
  }));
}

/** Lowest y the active piece can fall to from its current x/z. */
export function ghostY(state) {
  const p = state.active;
  if (!p) return 0;
  let y = p.pos.y;
  while (!collides(state, p.cells, { x: p.pos.x, y: y - 1, z: p.pos.z })) y--;
  return y;
}

function emit(state, type, extra = {}) {
  state.events.push({ type, ...extra });
}

/** Drain pending events (page uses them for sound + haptics + FX). */
export function drainEvents(state) {
  const out = state.events;
  state.events = [];
  return out;
}

// ------------------------------------------------------------------- rng ---
function shuffledBag(rng) {
  const bag = PIECE_IDS.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function refillQueue(state) {
  while (state.queue.length < 5) state.queue.push(...shuffledBag(state.rng));
}

// ------------------------------------------------------------------ game ---
/** Build the full game state for a run, starting at `level`. */
export function createGame(level = 1, seed = null) {
  const startLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1));
  const state = {
    level: startLevel,
    score: 0,
    layers: 0, // total layers cleared this run
    childrenFreed: 0, // golden lights released
    bestCombo: 0,
    piecesPlaced: 0,
    status: 'ready', // ready | playing | levelclear | gameover | won
    statusTimer: 1.4,
    time: 0,
    events: [],
    grid: new Map(), // "x,y,z" -> color value (piece index + 1, 0 = rubble)
    boardVersion: 0, // bumped when the locked grid changes (render sync)
    active: null,
    queue: [],
    softDrop: false,
    rng: mulberry32(seed == null ? (Math.random() * 0xffffffff) >>> 0 : seed >>> 0),
  };
  loadLevel(state, startLevel);
  return state;
}

/** (Re)build the well for a level inside an existing state. */
export function loadLevel(state, level) {
  const cfg = levelConfig(level);
  state.level = level;
  state.cfg = cfg;
  state.grid = new Map();
  state.layersThisLevel = 0;
  state.comboChain = 0;
  state.queue = [];
  refillQueue(state);

  // Kronos's rubble: seeded partial layers at the pit floor, never full.
  if (cfg.prefillLayers > 0) {
    const rng = mulberry32(cfg.seed ^ 0x51ab3);
    for (let y = 0; y < cfg.prefillLayers; y++) {
      for (let x = 0; x < cfg.wellW; x++) {
        for (let z = 0; z < cfg.wellD; z++) {
          if (rng() < cfg.prefillDensity) state.grid.set(cellKey(x, y, z), 0);
        }
      }
      // Guarantee no pre-filled layer starts complete.
      if (layerFull(state, y)) state.grid.delete(cellKey(0, y, 0));
    }
  }
  state.boardVersion++;
  spawnPiece(state);
  state.status = 'ready';
  state.statusTimer = 1.4;
}

function layerFull(state, y) {
  const { wellW, wellD } = state.cfg;
  for (let x = 0; x < wellW; x++) {
    for (let z = 0; z < wellD; z++) {
      if (!state.grid.has(cellKey(x, y, z))) return false;
    }
  }
  return true;
}

function spawnPiece(state) {
  refillQueue(state);
  const id = state.queue.shift();
  refillQueue(state);
  const def = PIECES[id];
  const { wellW, wellD, wellH } = state.cfg;
  const piece = {
    id,
    cells: def.cells.map((c) => c.slice()),
    pos: {
      x: Math.floor(wellW / 2) - 1,
      y: wellH - 2,
      z: Math.floor(wellD / 2),
    },
  };
  // Lift until the whole piece is under the rim.
  const maxOffY = Math.max(...piece.cells.map((c) => c[1]));
  if (piece.pos.y + maxOffY > wellH - 1) piece.pos.y = wellH - 1 - maxOffY;
  state.active = piece;
  state.dropAcc = 0;
  state.lockTimer = 0;
  state.lockResets = 0;
  state.grounded = false;
  if (collides(state, piece.cells, piece.pos)) {
    state.status = 'gameover';
    emit(state, 'gameover', { score: state.score });
  } else {
    emit(state, 'spawn', { piece: id });
  }
}

// ----------------------------------------------------------------- input ---
/** Move the active piece in the floor plane. Returns true if it moved. */
export function movePiece(state, dx, dz) {
  if (state.status !== 'playing' || !state.active) return false;
  const p = state.active;
  const next = { x: p.pos.x + dx, y: p.pos.y, z: p.pos.z + dz };
  if (collides(state, p.cells, next)) return false;
  p.pos = next;
  afterSuccessfulShift(state);
  return true;
}

const KICKS = [
  [0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
  [0, 1, 0], [1, 0, 1], [-1, 0, -1], [1, 0, -1], [-1, 0, 1], [0, -1, 0],
];

/** Rotate the active piece 90° around axis ('x'|'y'|'z'). Returns success. */
export function rotatePiece(state, axis, dir = 1) {
  if (state.status !== 'playing' || !state.active) return false;
  const p = state.active;
  const rotated = rotateOffsets(p.cells, axis, dir);
  for (const [kx, ky, kz] of KICKS) {
    const next = { x: p.pos.x + kx, y: p.pos.y + ky, z: p.pos.z + kz };
    if (!collides(state, rotated, next)) {
      p.cells = rotated;
      p.pos = next;
      afterSuccessfulShift(state);
      emit(state, 'rotate', { axis });
      return true;
    }
  }
  return false;
}

function afterSuccessfulShift(state) {
  // Moving/rotating while grounded buys a little more lock time (capped).
  if (state.grounded && state.lockResets < MAX_LOCK_RESETS) {
    state.lockTimer = 0;
    state.lockResets++;
  }
}

export function setSoftDrop(state, on) {
  state.softDrop = !!on;
}

/** Drop the active piece straight to its ghost position and lock it. */
export function hardDrop(state) {
  if (state.status !== 'playing' || !state.active) return 0;
  const p = state.active;
  const target = ghostY(state);
  const fell = p.pos.y - target;
  p.pos.y = target;
  if (fell > 0) addScore(state, fell * 2);
  emit(state, 'hardDrop', { cells: fell });
  lockPiece(state);
  return fell;
}

// ---------------------------------------------------------------- scoring --
function addScore(state, pts) {
  state.score += pts;
}

function clearFullLayers(state) {
  const { wellW, wellD, wellH } = state.cfg;
  const full = [];
  for (let y = 0; y < wellH; y++) if (layerFull(state, y)) full.push(y);
  if (!full.length) return 0;
  const cleared = new Set(full);
  const next = new Map();
  for (const [k, v] of state.grid) {
    const [x, y, z] = k.split(',').map(Number);
    if (cleared.has(y)) continue;
    const drop = full.filter((fy) => fy < y).length;
    next.set(cellKey(x, y - drop, z), v);
  }
  state.grid = next;
  state.boardVersion++;
  return full.length;
}

function lockPiece(state) {
  const p = state.active;
  if (!p) return;
  const value = PIECE_INDEX[p.id] + 1;
  for (const c of absoluteCells(p)) {
    if (c.y >= 0 && c.y < state.cfg.wellH) state.grid.set(cellKey(c.x, c.y, c.z), value);
  }
  state.boardVersion++;
  state.piecesPlaced++;
  state.active = null;
  emit(state, 'lock', { piece: p.id });

  const cleared = clearFullLayers(state);
  if (cleared > 0) {
    state.comboChain++;
    state.bestCombo = Math.max(state.bestCombo, state.comboChain);
    const base = (LAYER_POINTS[Math.min(cleared, LAYER_POINTS.length - 1)] || 0) * state.level;
    const comboBonus = state.comboChain > 1 ? 50 * (state.comboChain - 1) * state.level : 0;
    const pts = base + comboBonus;
    addScore(state, pts);
    state.layers += cleared;
    state.layersThisLevel += cleared;
    const freed = cleared * 4 + (state.comboChain > 1 ? state.comboChain : 0);
    state.childrenFreed += freed;
    emit(state, 'clear', {
      layers: cleared,
      points: pts,
      combo: state.comboChain,
      comboBonus,
      childrenFreed: freed,
    });
    if (state.comboChain > 1) emit(state, 'combo', { combo: state.comboChain, points: comboBonus });
  } else {
    state.comboChain = 0;
  }

  if (state.status !== 'playing') return;
  if (state.layersThisLevel >= state.cfg.layersGoal) {
    const bonus = state.level * 250;
    addScore(state, bonus);
    state.status = 'levelclear';
    state.statusTimer = 2.0;
    emit(state, 'levelClear', { level: state.level, bonus });
    return;
  }
  spawnPiece(state);
}

// -------------------------------------------------------------------- step --
/** Advance the simulation by dt seconds (call with a fixed step, e.g. 1/120). */
export function stepGame(state, dt) {
  if (state.status === 'gameover' || state.status === 'won') return;
  state.time += dt;

  if (state.status === 'ready') {
    state.statusTimer -= dt;
    if (state.statusTimer <= 0) {
      state.status = 'playing';
      emit(state, 'start', { level: state.level });
    }
    return;
  }
  if (state.status === 'levelclear') {
    state.statusTimer -= dt;
    if (state.statusTimer <= 0) {
      if (state.level >= MAX_LEVEL) {
        state.status = 'won';
        emit(state, 'won', { score: state.score });
      } else {
        loadLevel(state, state.level + 1);
        emit(state, 'levelStart', { level: state.level });
      }
    }
    return;
  }
  if (state.status !== 'playing' || !state.active) return;

  const p = state.active;
  const interval = state.softDrop ? state.cfg.dropInterval / 18 : state.cfg.dropInterval;
  state.dropAcc = (state.dropAcc || 0) + dt;
  state.grounded = collides(state, p.cells, { x: p.pos.x, y: p.pos.y - 1, z: p.pos.z });

  if (state.grounded) {
    state.lockTimer += dt;
    if (state.lockTimer >= LOCK_DELAY) {
      lockPiece(state);
      return;
    }
  } else {
    state.lockTimer = 0;
  }

  while (state.dropAcc >= interval && state.active) {
    state.dropAcc -= interval;
    const cur = state.active;
    if (!collides(state, cur.cells, { x: cur.pos.x, y: cur.pos.y - 1, z: cur.pos.z })) {
      cur.pos.y -= 1;
      if (state.softDrop) addScore(state, 1);
    } else {
      state.dropAcc = 0;
      break;
    }
  }
}
