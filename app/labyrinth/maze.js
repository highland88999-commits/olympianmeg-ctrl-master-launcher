/**
 * Labyrinth — pure maze generation and game logic.
 * Zero DOM, zero network. Seeded RNG so tests are deterministic.
 */

// Seeded PRNG (mulberry32)
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DX = [0, 1, 0, -1]; // N, E, S, W
const DY = [-1, 0, 1, 0];
const OPP = [2, 3, 0, 1];

/**
 * Generate a perfect maze (recursive backtracker) on an N×N grid.
 * Returns { size, walls } where walls[y][x] is a 4-bit mask:
 * bit 0 = north wall, 1 = east, 2 = south, 3 = west. 1 = wall present.
 */
export function generateMaze(size, seed) {
  const rng = makeRng(seed);
  const walls = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 0b1111)
  );
  const visited = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );

  const stack = [[0, 0]];
  visited[0][0] = true;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const neighbors = [];
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx >= 0 && ny >= 0 && nx < size && ny < size && !visited[ny][nx]) {
        neighbors.push(d);
      }
    }
    if (!neighbors.length) {
      stack.pop();
      continue;
    }
    const d = neighbors[Math.floor(rng() * neighbors.length)];
    const nx = cx + DX[d];
    const ny = cy + DY[d];
    walls[cy][cx] &= ~(1 << d);
    walls[ny][nx] &= ~(1 << OPP[d]);
    visited[ny][nx] = true;
    stack.push([nx, ny]);
  }
  return { size, walls };
}

/** Breadth-first search from start to goal. Returns path array of [x,y] or null. */
export function findPath(maze, sx, sy, gx, gy) {
  const { size, walls } = maze;
  const prev = Array.from({ length: size }, () => Array(size).fill(null));
  const seen = Array.from({ length: size }, () => Array(size).fill(false));
  const queue = [[sx, sy]];
  seen[sy][sx] = true;
  while (queue.length) {
    const [cx, cy] = queue.shift();
    if (cx === gx && cy === gy) {
      const path = [[cx, cy]];
      let [px, py] = [cx, cy];
      while (prev[py][px]) {
        [px, py] = prev[py][px];
        path.unshift([px, py]);
      }
      return path;
    }
    for (let d = 0; d < 4; d++) {
      if (walls[cy][cx] & (1 << d)) continue; // wall blocks
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || seen[ny][nx]) continue;
      seen[ny][nx] = true;
      prev[ny][nx] = [cx, cy];
      queue.push([nx, ny]);
    }
  }
  return null;
}

/** Distances (in steps) from every cell to (gx,gy). */
export function distancesFrom(maze, gx, gy) {
  const { size, walls } = maze;
  const dist = Array.from({ length: size }, () => Array(size).fill(-1));
  const queue = [[gx, gy]];
  dist[gy][gx] = 0;
  while (queue.length) {
    const [cx, cy] = queue.shift();
    for (let d = 0; d < 4; d++) {
      if (walls[cy][cx] & (1 << d)) continue;
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || dist[ny][nx] !== -1) continue;
      dist[ny][nx] = dist[cy][cx] + 1;
      queue.push([nx, ny]);
    }
  }
  return dist;
}

export const STAGES = [
  { name: 'Stage 1 — The Outer Rings', size: 7, tokens: 3, seed: 1101 },
  { name: 'Stage 2 — The Deep Halls', size: 11, tokens: 3, seed: 2202 },
  { name: 'Stage 3 — The Black Bloom', size: 15, tokens: 3, seed: 3303 },
];

/**
 * Create a playable stage: maze + player start + token positions + exit.
 * Tokens are placed on cells reasonably far from the start.
 */
export function createStage(stageIndex) {
  const stage = STAGES[stageIndex];
  if (!stage) throw new Error(`Unknown stage ${stageIndex}`);
  const maze = generateMaze(stage.size, stage.seed);
  const dist = distancesFrom(maze, 0, 0);

  // Candidate cells: far from start, not the start or exit cell.
  const candidates = [];
  for (let y = 0; y < stage.size; y++) {
    for (let x = 0; x < stage.size; x++) {
      if ((x === 0 && y === 0) || (x === stage.size - 1 && y === stage.size - 1)) continue;
      if (dist[y][x] >= Math.floor(stage.size * 1.2)) candidates.push([x, y]);
    }
  }
  // Deterministic pick: sort by distance desc, then take spread picks.
  candidates.sort((a, b) => dist[b[1]][b[0]] - dist[a[1]][a[0]]);
  const tokens = [];
  const step = Math.max(1, Math.floor(candidates.length / stage.tokens));
  for (let i = 0; i < stage.tokens && tokens.length < stage.tokens; i++) {
    const cell = candidates[(i * step + i) % candidates.length];
    if (!tokens.some(([tx, ty]) => tx === cell[0] && ty === cell[1])) {
      tokens.push(cell);
    }
  }
  // Fallback: if somehow short, fill from remaining candidates.
  for (const cell of candidates) {
    if (tokens.length >= stage.tokens) break;
    if (!tokens.some(([tx, ty]) => tx === cell[0] && ty === cell[1])) tokens.push(cell);
  }

  return {
    index: stageIndex,
    name: stage.name,
    maze,
    player: { x: 0, y: 0 },
    tokens: tokens.map(([x, y]) => ({ x, y, collected: false })),
    exit: { x: stage.size - 1, y: stage.size - 1, open: false },
    moves: 0,
    startedAt: null,
    finishedAt: null,
    won: false,
  };
}

/** Can the player move from its cell in direction (dx,dy)? */
export function canMove(game, dx, dy) {
  const { x, y } = game.player;
  const { size, walls } = game.maze;
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= size || ny >= size) return false;
  // Find which direction index matches (dx,dy)
  for (let d = 0; d < 4; d++) {
    if (DX[d] === dx && DY[d] === dy) {
      return !(walls[y][x] & (1 << d));
    }
  }
  return false;
}

/** Attempt a move. Returns true if the player moved. */
export function tryMove(game, dx, dy) {
  if (game.won) return false;
  if (!canMove(game, dx, dy)) return false;
  if (game.startedAt === null) game.startedAt = Date.now();
  game.player.x += dx;
  game.player.y += dy;
  game.moves += 1;

  // Token pickup
  for (const t of game.tokens) {
    if (!t.collected && t.x === game.player.x && t.y === game.player.y) {
      t.collected = true;
    }
  }
  const collected = game.tokens.filter((t) => t.collected).length;
  if (collected === game.tokens.length) game.exit.open = true;

  // Win: standing on the exit cell once the exit is open
  if (
    game.exit.open &&
    game.player.x === game.exit.x &&
    game.player.y === game.exit.y
  ) {
    game.won = true;
    game.finishedAt = Date.now();
  }
  return true;
}

export function tokensRemaining(game) {
  return game.tokens.filter((t) => !t.collected).length;
}

export function elapsedSeconds(game, now = Date.now()) {
  if (game.startedAt === null) return 0;
  const end = game.finishedAt ?? now;
  return Math.floor((end - game.startedAt) / 1000);
}

export function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
