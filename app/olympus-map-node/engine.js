/**
 * olympus-map-node — procedural holo-navigation logic.
 * A neon street grid, Dijkstra routing, turn-by-turn instruction synthesis,
 * and a drive simulator. No DOM, no network, no location services.
 * Unit-testable in Node.
 */

export const GRID_N = 12; // 12x12 intersections

const ROW_NAMES = [
  "APOLLO AVE", "ARTEMIS AVE", "ZEUS AVE", "HERA AVE",
  "ARES AVE", "ATHENA AVE", "HERMES AVE", "HADES AVE",
  "POSEIDON AVE", "DEMETER AVE", "HESTIA AVE", "DIONYSUS AVE",
];
const COL_NAMES = [
  "1ST ST", "2ND ST", "3RD ST", "4TH ST", "5TH ST", "6TH ST",
  "7TH ST", "8TH ST", "9TH ST", "10TH ST", "11TH ST", "12TH ST",
];

/** Highway rows/cols get a speed bonus (fewer "lights"). */
export const HIGHWAYS = { rows: [5], cols: [5] };

export function nodeId(x, y) {
  return y * GRID_N + x;
}
export function nodeXY(id) {
  return { x: id % GRID_N, y: Math.floor(id / GRID_N) };
}
export function inGrid(x, y) {
  return x >= 0 && y >= 0 && x < GRID_N && y < GRID_N;
}

/** Neighbors with traversal cost (highways are faster). */
export function neighbors(id) {
  const { x, y } = nodeXY(id);
  const out = [];
  const dirs = [
    [1, 0, "E"], [-1, 0, "W"], [0, 1, "S"], [0, -1, "N"],
  ];
  for (const [dx, dy, dir] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inGrid(nx, ny)) continue;
    const highway = HIGHWAYS.rows.includes(ny) || HIGHWAYS.cols.includes(nx);
    out.push({ id: nodeId(nx, ny), dir, cost: highway ? 0.6 : 1 });
  }
  return out;
}

/** Dijkstra shortest path. Returns array of node ids, or null if unreachable. */
export function findRoute(startId, goalId) {
  if (startId === goalId) return [startId];
  const dist = new Map([[startId, 0]]);
  const prev = new Map();
  const prevDir = new Map();
  const visited = new Set();
  // simple priority queue via array (grid is tiny)
  const pq = [{ id: startId, d: 0 }];
  while (pq.length) {
    pq.sort((a, b) => a.d - b.d);
    const { id, d } = pq.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    if (id === goalId) break;
    for (const nb of neighbors(id)) {
      const lastDir = prevDir.get(id);
      const turnPenalty = lastDir && lastDir !== nb.dir ? 0.15 : 0;
      const nd = d + nb.cost + turnPenalty;
      if (nd < (dist.get(nb.id) ?? Infinity)) {
        dist.set(nb.id, nd);
        prev.set(nb.id, id);
        prevDir.set(nb.id, nb.dir);
        pq.push({ id: nb.id, d: nd });
      }
    }
  }
  if (!prev.has(goalId)) return null;
  const path = [goalId];
  let cur = goalId;
  while (cur !== startId) {
    cur = prev.get(cur);
    path.unshift(cur);
  }
  return path;
}

/** Street name for the segment between two adjacent nodes. */
export function streetName(a, b) {
  const pa = nodeXY(a);
  const pb = nodeXY(b);
  if (pa.x !== pb.x) return ROW_NAMES[pa.y]; // moving east/west along a row avenue
  return COL_NAMES[pa.x]; // moving north/south along a column street
}

function turnWord(fromDir, toDir) {
  if (fromDir === toDir) return null;
  const order = ["N", "E", "S", "W"];
  const diff = (order.indexOf(toDir) - order.indexOf(fromDir) + 4) % 4;
  if (diff === 2) return "Make a U-turn";
  if (diff === 1) return "Turn right";
  return "Turn left";
}

const DIR_WORDS = { N: "north", S: "south", E: "east", W: "west" };

/**
 * Compress a node path into turn-by-turn instructions.
 * Each: { text, dir, blocks } — dir is the compass direction of the leg.
 */
export function describeRoute(path) {
  if (!path || path.length < 2) return [];
  const legs = [];
  let legDir = null;
  let legStart = path[0];
  let blocks = 0;
  const dirOf = (a, b) => {
    const pa = nodeXY(a);
    const pb = nodeXY(b);
    if (pb.x > pa.x) return "E";
    if (pb.x < pa.x) return "W";
    if (pb.y > pa.y) return "S";
    return "N";
  };
  for (let i = 1; i < path.length; i++) {
    const d = dirOf(path[i - 1], path[i]);
    if (legDir === null) {
      legDir = d;
      legStart = path[i - 1];
      blocks = 1;
    } else if (d === legDir) {
      blocks++;
    } else {
      legs.push({ dir: legDir, from: legStart, blocks });
      legDir = d;
      legStart = path[i - 1];
      blocks = 1;
    }
  }
  legs.push({ dir: legDir, from: legStart, blocks });

  return legs.map((leg, i) => {
    const street = streetName(leg.from, nextNode(leg));
    const dist = `${leg.blocks} block${leg.blocks === 1 ? "" : "s"}`;
    if (i === 0) {
      return {
        text: `Head ${DIR_WORDS[leg.dir]} on ${street} for ${dist}`,
        dir: leg.dir,
        blocks: leg.blocks,
      };
    }
    const turn = turnWord(legs[i - 1].dir, leg.dir);
    return {
      text: `${turn} onto ${street}, continue ${dist}`,
      dir: leg.dir,
      blocks: leg.blocks,
    };
  });

  function nextNode(l) {
    const { x, y } = nodeXY(l.from);
    const d = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[l.dir];
    return nodeId(x + d[0], y + d[1]);
  }
}

/** Fictional observatory POIs pinned to the grid. */
export const POIS = [
  { name: "AETHER SPIRE", x: 9, y: 2 },
  { name: "ECLIPSE DOCK", x: 2, y: 9 },
  { name: "TRUMAN GATE", x: 10, y: 10 },
  { name: "HIVE RELAY", x: 3, y: 3 },
  { name: "FORGE YARDS", x: 8, y: 7 },
  { name: "ARGUS OBSERVATORY", x: 5, y: 5 },
];

/** Origin node: the observatory. */
export const ORIGIN = nodeId(5, 5);

/**
 * Drive simulator state. speedBlocksPerSec ~= simulated cruise speed.
 * Returns { x, y, legIndex, done } — x/y are fractional grid coords.
 */
export function driveStep(state, path, dt, speedBlocksPerSec = 1.6) {
  let { seg, frac } = state;
  let remaining = dt * speedBlocksPerSec;
  while (remaining > 0 && seg < path.length - 1) {
    const need = 1 - frac;
    if (remaining < need) {
      frac += remaining;
      remaining = 0;
    } else {
      remaining -= need;
      seg += 1;
      frac = 0;
    }
  }
  const done = seg >= path.length - 1;
  const a = nodeXY(path[Math.min(seg, path.length - 1)]);
  const b = nodeXY(path[Math.min(seg + 1, path.length - 1)]);
  return {
    seg,
    frac,
    x: a.x + (b.x - a.x) * frac,
    y: a.y + (b.y - a.y) * frac,
    done,
  };
}

/** Fake-but-honest speed readout: blocks map to ~24 km/h per block/s. */
export function speedKmh(blocksPerSec) {
  return Math.round(blocksPerSec * 24);
}
