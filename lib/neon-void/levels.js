// lib/neon-void/levels.js
// Seeded procedural mazes + difficulty tuning for Neon Void's 100 levels.
// Pure functions — no DOM, no network. Shared by the engine and tests.

/**
 * mulberry32 — small deterministic PRNG.
 * @param {number} seed
 * @returns {() => number} 0..1
 */
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

export const MAX_LEVEL = 100;

const DIRS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * Difficulty tuning for a 1-based level.
 * Speeds are in maze cells per second.
 */
export function levelConfig(level) {
  const L = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1));
  let cols = 19;
  let rows = 19;
  if (L >= 26) { cols = 21; rows = 21; }
  if (L >= 51) { cols = 21; rows = 23; }
  if (L >= 76) { cols = 23; rows = 23; }
  return {
    level: L,
    cols,
    rows,
    seed: L * 7919 + 1013,
    playerSpeed: 6.0 + Math.min((L - 1) * 0.035, 1.0),
    wraithSpeed: Math.min(4.6 + (L - 1) * 0.045, 7.4),
    frightDuration: Math.max(7 - (L - 1) * 0.06, 1.6), // seconds
    scatterDuration: Math.max(6 - (L - 1) * 0.05, 1.0), // safe time at level start
    releaseGap: Math.max(4 - (L - 1) * 0.03, 1.2), // seconds between wraith releases
  };
}

/**
 * Generate a maze for a 1-based level. Deterministic: same level -> same maze.
 * Returns { cols, rows, grid (Uint8Array, 1 = wall), spawn, home, door, novas }.
 * - Recursive-backtracker carve on odd cells, plus loop-removal.
 * - Center holds the wraith home (3x2 carved box with a door cell above).
 * - The middle row is a full horizontal corridor (the tunnel): moving off one
 *   edge wraps to the other.
 */
export function generateMaze(level) {
  const cfg = levelConfig(level);
  const { cols, rows } = cfg;
  const rand = mulberry32(cfg.seed);
  const idx = (x, y) => y * cols + x;
  const grid = new Uint8Array(cols * rows).fill(1);

  const cx = (cols - 1) >> 1; // center column
  const cy = (rows - 1) >> 1; // center row
  const homeTop = cy - 1;
  const homeBottom = cy;
  const homeCols = [cx - 1, cx, cx + 1];

  const inHome = (x, y) =>
    y >= homeTop && y <= homeBottom && x >= cx - 1 && x <= cx + 1;

  // 1. Carve via recursive backtracker on odd coordinates.
  const cellCols = (cols - 1) >> 1;
  const cellRows = (rows - 1) >> 1;
  const visited = new Uint8Array(cellCols * cellRows);
  const stack = [[0, 0]];
  visited[0] = 1;
  while (stack.length) {
    const [cc, cr] = stack[stack.length - 1];
    const opts = [];
    for (const d of DIRS) {
      const nc = cc + d.x;
      const nr = cr + d.y;
      if (nc >= 0 && nr >= 0 && nc < cellCols && nr < cellRows && !visited[nr * cellCols + nc]) {
        opts.push([nc, nr, d]);
      }
    }
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const [nc, nr, d] = opts[(rand() * opts.length) | 0];
    visited[nr * cellCols + nc] = 1;
    grid[idx(cc * 2 + 1, cr * 2 + 1)] = 0;
    grid[idx(cc * 2 + 1 + d.x, cr * 2 + 1 + d.y)] = 0;
    grid[idx(nc * 2 + 1, nr * 2 + 1)] = 0;
    stack.push([nc, nr]);
  }

  // 2. Knock out extra walls to create loops (fewer dead ends = better chase).
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      if (grid[idx(x, y)] === 1 && rand() < 0.09) {
        grid[idx(x, y)] = 0;
      }
    }
  }

  // 3. Middle row = full horizontal tunnel corridor.
  for (let x = 0; x < cols; x++) grid[idx(x, cy)] = 0;

  // 4. Wraith home box + door.
  for (const hx of homeCols) {
    grid[idx(hx, homeTop)] = 0;
    grid[idx(hx, homeBottom)] = 0;
  }
  const door = { x: cx, y: homeTop - 1 };
  grid[idx(door.x, door.y)] = 0;

  // 5. Player spawn: first open cell a couple rows below home.
  let spawn = null;
  for (let y = homeBottom + 2; y < rows - 1 && !spawn; y++) {
    if (grid[idx(cx, y)] === 0) spawn = { x: cx, y };
  }
  if (!spawn) spawn = { x: cx, y: rows - 2 };

  // 6. Nova shards: path cells closest to the four quadrant corners
  //    (but not inside the home area).
  const novas = [];
  const quadrants = [
    { x: 1, y: 1 },
    { x: cols - 2, y: 1 },
    { x: 1, y: rows - 2 },
    { x: cols - 2, y: rows - 2 },
  ];
  for (const q of quadrants) {
    let best = null;
    let bestD = Infinity;
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        if (grid[idx(x, y)] === 0 && !inHome(x, y)) {
          const d = Math.abs(x - q.x) + Math.abs(y - q.y);
          if (d < bestD) {
            bestD = d;
            best = { x, y };
          }
        }
      }
    }
    if (best) novas.push(best);
  }

  return {
    ...cfg,
    grid,
    spawn,
    home: { top: homeTop, bottom: homeBottom, cols: homeCols.slice() },
    door,
    novas,
    inHome,
  };
}

/**
 * All path cells reachable from the spawn (BFS). The generator guarantees
 * full connectivity, but tests assert it.
 */
export function reachableCells(maze) {
  const { cols, rows, grid, spawn } = maze;
  const seen = new Set();
  const q = [[spawn.x, spawn.y]];
  seen.add(`${spawn.x},${spawn.y}`);
  while (q.length) {
    const [x, y] = q.pop();
    for (const d of DIRS) {
      const nx = (x + d.x + cols) % cols; // tunnel wrap horizontally
      const ny = y + d.y;
      if (ny < 0 || ny >= rows) continue;
      const k = `${nx},${ny}`;
      if (!seen.has(k) && grid[ny * cols + nx] === 0) {
        seen.add(k);
        q.push([nx, ny]);
      }
    }
  }
  return seen;
}

/** Count path cells in the maze. */
export function pathCellCount(maze) {
  let n = 0;
  for (let i = 0; i < maze.grid.length; i++) if (maze.grid[i] === 0) n++;
  return n;
}
