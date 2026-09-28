// puzzle.js — pure game logic for the IQ Test module.
// No DOM, no three.js: fully unit-testable in Node.
//
// The game: an N×N board of square tiles. Each tile has four colored edges
// (neon pairs; head vs tail). Tiles are scrambled across slots with random
// rotations. Tap a tile to rotate it 90° clockwise; drag a tile onto another
// slot to swap. Solved = every shared edge matches and every border edge
// matches the original border.

export const DIFFICULTIES = Object.freeze({
  easy: { n: 2, label: 'Easy · 2×2' },
  medium: { n: 3, label: 'Medium · 3×3' },
  hard: { n: 4, label: 'Hard · 4×4' },
});

export function createEdge(pairIndex, isHead) {
  return { pairIndex, isHead };
}

export function complement(edge) {
  return { pairIndex: edge.pairIndex, isHead: !edge.isHead };
}

export function edgesEqual(a, b) {
  return a.pairIndex === b.pairIndex && a.isHead === b.isHead;
}

// Two touching edges match when they share a color pair with opposite polarity.
export function edgesMatch(a, b) {
  return a.pairIndex === b.pairIndex && a.isHead !== b.isHead;
}

// Rotate {top,right,bottom,left} clockwise by `steps` quarter turns.
export function rotateEdgesCW(edges, steps) {
  let s = ((steps % 4) + 4) % 4;
  let out = [edges.top, edges.right, edges.bottom, edges.left];
  for (let i = 0; i < s; i++) {
    out = [out[3], out[0], out[1], out[2]];
  }
  return { top: out[0], right: out[1], bottom: out[2], left: out[3] };
}

// Deterministic PRNG (mulberry32) for tests and reproducible templates.
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

function edgeFromVal(v) {
  return createEdge(Math.abs(v) - 1, v > 0);
}

// The original 3×3 template, preserved from the source repo.
// Each row is [top, right, bottom, left]; sign = head/tail, |v|-1 = color pair.
const TEMPLATE_3X3 = [
  [[-1, -2, 2, -2], [-4, 3, 3, 2], [4, 2, -1, -3]],
  [[-2, 3, 1, 2], [-3, -1, 1, -3], [1, 4, -3, 1]],
  [[-1, 4, 4, -4], [-1, 3, 1, -4], [3, 4, -2, -3]],
];

function templateToGrid(template) {
  return template.map((row) =>
    row.map(([t, r, b, l]) => ({
      top: edgeFromVal(t),
      right: edgeFromVal(r),
      bottom: edgeFromVal(b),
      left: edgeFromVal(l),
    }))
  );
}

// Generate an internally-consistent solved grid for any N by propagating
// constraints: each tile's top/left edges are forced to match its neighbors.
export function generateSolvedGrid(n, rand) {
  if (n === 3) return templateToGrid(TEMPLATE_3X3);
  const grid = [];
  for (let y = 0; y < n; y++) {
    grid[y] = [];
    for (let x = 0; x < n; x++) {
      const left =
        x === 0
          ? createEdge(Math.floor(rand() * 4), rand() < 0.5)
          : complement(grid[y][x - 1].right);
      const top =
        y === 0
          ? createEdge(Math.floor(rand() * 4), rand() < 0.5)
          : complement(grid[y - 1][x].bottom);
      const right = createEdge(Math.floor(rand() * 4), rand() < 0.5);
      const bottom = createEdge(Math.floor(rand() * 4), rand() < 0.5);
      grid[y][x] = { top, right, bottom, left };
    }
  }
  return grid;
}

export function createGame(n, rand = Math.random) {
  const grid = generateSolvedGrid(n, rand);
  const tiles = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      tiles.push({ id: y * n + x, edges: grid[y][x] });
    }
  }
  const game = {
    n,
    tiles,
    placement: tiles.map((t) => t.id), // placement[slotIndex] = tileId
    rotations: tiles.map(() => 0), // rotations[tileId] = quarter turns CW
    moves: 0,
  };
  scramble(game, rand);
  return game;
}

// Shuffle positions + rotations from the solved state. By construction the
// result is always solvable. Re-rolls the (astronomically unlikely) case of
// landing back on solved.
export function scramble(game, rand = Math.random) {
  const count = game.n * game.n;
  let guard = 0;
  do {
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = game.placement[i];
      game.placement[i] = game.placement[j];
      game.placement[j] = t;
    }
    for (let t = 0; t < count; t++) {
      game.rotations[t] = Math.floor(rand() * 4);
    }
    guard++;
  } while (isSolved(game) && guard < 50);
  game.moves = 0;
  return game;
}

export function effectiveEdges(game, tileId) {
  return rotateEdgesCW(game.tiles[tileId].edges, game.rotations[tileId]);
}

export function rotateTile(game, tileId) {
  game.rotations[tileId] = (game.rotations[tileId] + 1) % 4;
  game.moves++;
  return game;
}

export function swapTiles(game, slotA, slotB) {
  if (slotA === slotB) return game;
  const t = game.placement[slotA];
  game.placement[slotA] = game.placement[slotB];
  game.placement[slotB] = t;
  game.moves++;
  return game;
}

export function slotOfTile(game, tileId) {
  return game.placement.indexOf(tileId);
}

export function isSolved(game) {
  const n = game.n;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      const e = effectiveEdges(game, game.placement[i]);
      const solved = game.tiles[i].edges;
      if (r === 0) {
        if (!edgesEqual(e.top, solved.top)) return false;
      } else {
        const above = effectiveEdges(game, game.placement[(r - 1) * n + c]);
        if (!edgesMatch(e.top, above.bottom)) return false;
      }
      if (c === 0) {
        if (!edgesEqual(e.left, solved.left)) return false;
      } else {
        const left = effectiveEdges(game, game.placement[r * n + c - 1]);
        if (!edgesMatch(e.left, left.right)) return false;
      }
      if (c === n - 1 && !edgesEqual(e.right, solved.right)) return false;
      if (r === n - 1 && !edgesEqual(e.bottom, solved.bottom)) return false;
    }
  }
  return true;
}

export function computeScore(difficultyKey, moves, seconds) {
  const base = { easy: 1000, medium: 2500, hard: 5000 }[difficultyKey] ?? 1000;
  return Math.max(50, base - moves * 15 - seconds * 5);
}

export function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
