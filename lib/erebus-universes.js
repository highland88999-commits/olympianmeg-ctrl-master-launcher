// lib/erebus-universes.js — EREBUS pocket universe: 140 explorable void universes.
//
// A pure escape space: no programs, no modules inside — just a dark void to
// get lost in for a while, flown on a TRON bike. Each universe is seeded and
// deterministic: the same seed always builds the same sky.
//
// Contents per universe: planets (+ orbiting moons), starfields, nebula
// accents, 2-3 asteroid fields to steer around, ONE fixed portal ring, and
// exactly 2 hidden gold bars (one in the open, one tucked away).
//
// Pure logic: no DOM, no THREE imports, fully headless-testable.
// The page (app/erebus/page.jsx) renders these.

import { mulberry32 } from './myriad-universes.js';

export const EREBUS_SEED = 20260930;
export const UNIVERSE_COUNT = 140;

// ---------------------------------------------------------------------------
// Identity / naming
// ---------------------------------------------------------------------------

// 20 x 20 = 400 unique dark-cosmic name pairs; we take 140.
const NAME_ADJECTIVES = [
  'Silent', 'Hollow', 'Ebon', 'Sunless', 'Drifting', 'Forgotten', 'Velvet',
  'Ashen', 'Starless', 'Deep', 'Wandering', 'Obsidian', 'Pale', 'Endless',
  'Quiet', 'Frozen', 'Drowned', 'Weightless', 'Sable', 'Moonless',
];

const NAME_NOUNS = [
  'Deep', 'Maw', 'Reach', 'Hollow', 'Expanse', 'Drift', 'Veil',
  'Quiet', 'Dark', 'Cradle', 'Hush', 'Gulf', 'Still', 'Night',
  'Abyss', 'Shade', 'Rest', 'Lull', 'Void', 'Sleep',
];

// Darker cosmic palettes: [deep background tint, mid tone, bright accent].
const PALETTES = [
  ['#04060f', '#1e1b4b', '#818cf8'],
  ['#050308', '#3b0764', '#c084fc'],
  ['#030507', '#083344', '#22d3ee'],
  ['#080402', '#451a03', '#fbbf24'],
  ['#060309', '#4a044e', '#e879f9'],
  ['#020604', '#052e16', '#4ade80'],
  ['#070304', '#450a0a', '#f87171'],
  ['#030309', '#172554', '#93c5fd'],
  ['#090604', '#431407', '#fb923c'],
  ['#040409', '#1e1b4b', '#a5b4fc'],
];

function plural(n, one, many) {
  return n === 1 ? one : many;
}

function shuffledIndices(n, rand) {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

function describeUniverse(adj, planetCount, fieldCount) {
  const article = /^[aeiou]/i.test(adj) ? 'An' : 'A';
  return (
    `${article} ${adj.toLowerCase()} pocket of the void with ` +
    `${planetCount} ${plural(planetCount, 'planet', 'planets')} and ` +
    `${fieldCount} ${plural(fieldCount, 'asteroid field', 'asteroid fields')} ` +
    `to drift between. Two gold bars are hidden here. No programs, no noise — just space.`
  );
}

export function generateUniverses(masterSeed = EREBUS_SEED) {
  const rand = mulberry32(masterSeed);
  const pairOrder = shuffledIndices(
    NAME_ADJECTIVES.length * NAME_NOUNS.length,
    mulberry32(masterSeed ^ 0x9e3779b9)
  );
  const universes = [];
  for (let i = 0; i < UNIVERSE_COUNT; i++) {
    const pair = pairOrder[i];
    const adj = NAME_ADJECTIVES[Math.floor(pair / NAME_NOUNS.length)];
    const noun = NAME_NOUNS[pair % NAME_NOUNS.length];
    const id = i + 1;
    const seed = (masterSeed ^ Math.imul(id, 0x85ebca6b)) >>> 0;
    const palette = PALETTES[Math.floor(rand() * PALETTES.length)];
    const starDensity = 0.4 + rand() * 0.6;
    const ur = mulberry32(seed ^ 0x51ed);
    const planetCount = 6 + Math.floor(ur() * 4); // 6..9
    const fieldCount = 2 + Math.floor(ur() * 2); // 2..3
    universes.push({
      id,
      name: `The ${adj} ${noun}`,
      seed,
      palette: [...palette],
      starDensity,
      planetCount,
      fieldCount,
      description: describeUniverse(adj, planetCount, fieldCount),
    });
  }
  return universes;
}

export const UNIVERSES = generateUniverses();

export function universeById(id) {
  return UNIVERSES.find((u) => u.id === id) || null;
}

// ---------------------------------------------------------------------------
// Scene derivation
// ---------------------------------------------------------------------------

export const EREBUS_SPAWN = { x: 0, y: 0, z: 40 };
export const EREBUS_SPAWN_YAW = Math.PI; // facing -Z, into the void

// The ONE portal: a fixed ring, well placed — visible from spawn, slightly
// above the straight flight line so jumping through it is always deliberate.
export const PORTAL = {
  pos: { x: 0, y: 9, z: -42 },
  radius: 8,
  label: 'Portal — fly in to jump',
};

export const BAR_OPEN = 0;
export const BAR_TUCKED = 1;
export const BARS_PER_UNIVERSE = 2;
export const BAR_COLLECT_RADIUS = 8;

// Gold credit: 1,000 liquid gold per gold bar found
// (gold economy v2: 1,000 liquid gold = 1 gold bar).
export const GOLD_LIQUID_PER_BAR = 1000;

function vsub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vlen(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vnorm(v) {
  const l = vlen(v) || 1e-6;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

export function dist3(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Push `pos` away from `center` until it clears `minDist`.
function ensureClearance(pos, center, minDist) {
  const d = vsub(pos, center);
  const l = vlen(d);
  if (l >= minDist) return pos;
  const n = l < 1e-6 ? { x: 0, y: 1, z: 0 } : vnorm(d);
  return {
    x: center.x + n.x * minDist,
    y: center.y + n.y * minDist,
    z: center.z + n.z * minDist,
  };
}

export function sceneFor(universe) {
  const rand = mulberry32(universe.seed);
  const [deep, mid, accent] = universe.palette;

  // --- planets -------------------------------------------------------------
  const planets = [];
  for (let i = 0; i < universe.planetCount; i++) {
    planets.push({
      key: `p${i}`,
      pos: {
        x: (rand() - 0.5) * 340,
        y: (rand() - 0.5) * 120,
        z: -60 - rand() * 360,
      },
      radius: 8 + rand() * 14, // 8..22
      colorIdx: Math.floor(rand() * 3),
      ringed: rand() < 0.35,
      texSeed: Math.floor(rand() * 1e9),
    });
  }
  // One separation pass so planets rarely interpenetrate.
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i];
      const b = planets[j];
      const minD = a.radius + b.radius + 12;
      if (dist3(a.pos, b.pos) < minD) {
        b.pos = ensureClearance(b.pos, a.pos, minD);
      }
    }
  }

  // --- moons ----------------------------------------------------------------
  const moons = [];
  for (const p of planets) {
    const n = Math.floor(rand() * 4); // 0..3
    for (let m = 0; m < n; m++) {
      moons.push({
        key: `${p.key}m${m}`,
        planetKey: p.key,
        orbitR: p.radius + 8 + rand() * 12,
        size: 1.5 + rand() * 2.5,
        speed: (0.12 + rand() * 0.35) * (rand() < 0.5 ? 1 : -1),
        phase: rand() * Math.PI * 2,
        bobAmp: 1 + rand() * 2,
      });
    }
  }

  // --- asteroid fields -------------------------------------------------------
  const fields = [];
  for (let f = 0; f < universe.fieldCount; f++) {
    const center = {
      x: (rand() - 0.5) * 260,
      y: (rand() - 0.5) * 90,
      z: -80 - rand() * 300,
    };
    const extent = {
      x: 50 + rand() * 40,
      y: 24 + rand() * 16,
      z: 50 + rand() * 40,
    };
    const rockCount = 40 + Math.floor(rand() * 30); // 40..69
    const rocks = [];
    for (let r = 0; r < rockCount; r++) {
      rocks.push({
        ox: (rand() - 0.5) * extent.x * 2,
        oy: (rand() - 0.5) * extent.y * 2,
        oz: (rand() - 0.5) * extent.z * 2,
        r: 1 + rand() * 3, // 1..4
        spin: 0.1 + rand() * 0.5,
        phase: rand() * Math.PI * 2,
        tint: rand(),
      });
    }
    fields.push({ key: `f${f}`, center, extent, rocks });
  }

  // --- nebulae ----------------------------------------------------------------
  const nebulae = [];
  const nebCount = 2 + Math.floor(rand() * 2); // 2..3
  for (let i = 0; i < nebCount; i++) {
    nebulae.push({
      key: `n${i}`,
      pos: {
        x: (rand() - 0.5) * 300,
        y: (rand() - 0.5) * 100,
        z: -120 - rand() * 260,
      },
      radius: 24 + rand() * 16,
      palette: [mid, accent, deep],
    });
  }

  // --- gold bars ---------------------------------------------------------------
  // Bar 0 (open): moderate distance from spawn, clear of everything.
  let barOpen = {
    x: (rand() - 0.5) * 160,
    y: (rand() - 0.5) * 60,
    z: EREBUS_SPAWN.z - (130 + rand() * 70),
  };
  for (const p of planets) barOpen = ensureClearance(barOpen, p.pos, p.radius + 28);
  for (const fl of fields) barOpen = ensureClearance(barOpen, fl.center, 30);

  // Bar 1 (tucked): behind a planet, near a moon, or at a field edge.
  // Prefer tuck spots within a fair flight of spawn so every bar is
  // findable within a few minutes of exploring.
  const TUCK_RANGE = 300;
  const nearPlanets = planets.filter((p) => dist3(p.pos, EREBUS_SPAWN) <= TUCK_RANGE);
  const tuckPool = nearPlanets.length ? nearPlanets : planets;
  const nearMoons = moons.filter((m) => {
    const p = planets.find((pp) => pp.key === m.planetKey);
    return p && dist3(p.pos, EREBUS_SPAWN) <= TUCK_RANGE;
  });
  const tuck = rand();
  let barTucked;
  if (tuck < 0.4) {
    const p = tuckPool[Math.floor(rand() * tuckPool.length)];
    const dir = vnorm(vsub(p.pos, EREBUS_SPAWN));
    barTucked = {
      x: p.pos.x + dir.x * (p.radius + 18 + rand() * 10),
      y: p.pos.y + (rand() - 0.5) * 20,
      z: p.pos.z + dir.z * (p.radius + 18 + rand() * 10),
    };
    for (const q of planets) {
      if (q !== p) barTucked = ensureClearance(barTucked, q.pos, q.radius + 10);
    }
  } else if (tuck < 0.7 && nearMoons.length) {
    const m = nearMoons[Math.floor(rand() * nearMoons.length)];
    const p = planets.find((pp) => pp.key === m.planetKey);
    const mp = moonPosAt(p, m, 0);
    barTucked = {
      x: mp.x + (rand() - 0.5) * 16,
      y: mp.y + (rand() - 0.5) * 10,
      z: mp.z + (rand() - 0.5) * 16,
    };
    barTucked = ensureClearance(barTucked, p.pos, p.radius + 8);
  } else {
    const fl = fields[Math.floor(rand() * fields.length)];
    barTucked = {
      x: fl.center.x + (rand() < 0.5 ? -1 : 1) * (fl.extent.x + 10 + rand() * 8),
      y: fl.center.y + (rand() - 0.5) * fl.extent.y,
      z: fl.center.z + (rand() - 0.5) * fl.extent.z,
    };
    for (const p of planets) barTucked = ensureClearance(barTucked, p.pos, p.radius + 10);
  }
  // Final fairness pass: never strand the tucked bar beyond a few minutes'
  // flight from spawn; keep it clear of planet interiors after the pull-in.
  if (dist3(barTucked, EREBUS_SPAWN) > TUCK_RANGE) {
    const n = vnorm(vsub(barTucked, EREBUS_SPAWN));
    barTucked = {
      x: EREBUS_SPAWN.x + n.x * TUCK_RANGE,
      y: EREBUS_SPAWN.y + n.y * TUCK_RANGE,
      z: EREBUS_SPAWN.z + n.z * TUCK_RANGE,
    };
    for (const p of planets) barTucked = ensureClearance(barTucked, p.pos, p.radius + 10);
  }

  const bars = [
    { index: BAR_OPEN, kind: 'open', pos: barOpen },
    { index: BAR_TUCKED, kind: 'tucked', pos: barTucked },
  ];

  return { planets, moons, fields, nebulae, bars, portal: PORTAL, deep };
}

/** Moon world position at time t (seconds). */
export function moonPosAt(planet, moon, t) {
  const a = moon.phase + t * moon.speed;
  return {
    x: planet.pos.x + Math.cos(a) * moon.orbitR,
    y: planet.pos.y + Math.sin(t * moon.speed * 0.3 + moon.phase) * moon.bobAmp,
    z: planet.pos.z + Math.sin(a) * moon.orbitR,
  };
}

/**
 * Flatten a scene into collision obstacles {x,y,z,r} at time t.
 * Planets + moons (at their current orbit position) + every rock.
 */
export function obstaclesFor(scene, t) {
  const out = [];
  for (const p of scene.planets) out.push({ x: p.pos.x, y: p.pos.y, z: p.pos.z, r: p.radius });
  for (const moon of scene.moons) {
    const p = scene.planets.find((pp) => pp.key === moon.planetKey);
    if (!p) continue;
    const mp = moonPosAt(p, moon, t);
    out.push({ x: mp.x, y: mp.y, z: mp.z, r: moon.size });
  }
  for (const fl of scene.fields) {
    for (const rk of fl.rocks) {
      out.push({
        x: fl.center.x + rk.ox,
        y: fl.center.y + rk.oy,
        z: fl.center.z + rk.oz,
        r: rk.r,
      });
    }
  }
  return out;
}

/**
 * Resolve a sphere (center `pos`, radius `radius`) against obstacles.
 * Bounce, don't die: push out along the contact normal, report the hit.
 * Returns { pos, hit, nx, ny, nz } (normal of the first contact).
 */
export function resolveCollision(pos, radius, obstacles) {
  let { x, y, z } = pos;
  let hit = false;
  let nx = 0;
  let ny = 1;
  let nz = 0;
  for (const o of obstacles) {
    const dx = x - o.x;
    const dy = y - o.y;
    const dz = z - o.z;
    const minD = o.r + radius;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < minD * minD) {
      const d = Math.sqrt(d2);
      let ux;
      let uy;
      let uz;
      if (d < 1e-6) {
        ux = 0;
        uy = 1;
        uz = 0;
      } else {
        ux = dx / d;
        uy = dy / d;
        uz = dz / d;
      }
      x = o.x + ux * minD;
      y = o.y + uy * minD;
      z = o.z + uz * minD;
      if (!hit) {
        hit = true;
        nx = ux;
        ny = uy;
        nz = uz;
      }
    }
  }
  return { pos: { x, y, z }, hit, nx, ny, nz };
}

/**
 * How "tucked" a bar is: near a planet's far side / a moon / a field edge.
 * Used by tests to pin the difficulty design (not too easy, not too hard).
 */
export function tuckedness(scene, barPos) {
  let nearPlanet = false;
  let nearMoon = false;
  let nearField = false;
  for (const p of scene.planets) {
    if (dist3(barPos, p.pos) < p.radius + 55) nearPlanet = true;
  }
  for (const moon of scene.moons) {
    const p = scene.planets.find((pp) => pp.key === moon.planetKey);
    if (!p) continue;
    const mp = moonPosAt(p, moon, 0);
    if (dist3(barPos, mp) < 30) nearMoon = true;
  }
  for (const fl of scene.fields) {
    const dx = Math.abs(barPos.x - fl.center.x);
    const dy = Math.abs(barPos.y - fl.center.y);
    const dz = Math.abs(barPos.z - fl.center.z);
    if (dx < fl.extent.x + 30 && dy < fl.extent.y + 30 && dz < fl.extent.z + 30) {
      nearField = true;
    }
  }
  return { nearPlanet, nearMoon, nearField };
}

// ---------------------------------------------------------------------------
// Progress + local gold ledger (localStorage-only, per scope)
// ---------------------------------------------------------------------------

export const PROGRESS_VERSION = 1;

export function progressKey(scope) {
  return `erebus:progress:v${PROGRESS_VERSION}:${scope}`;
}

export function ledgerKey(scope) {
  return `erebus:gold:v${PROGRESS_VERSION}:${scope}`;
}

export function blankProgress() {
  return { v: PROGRESS_VERSION, visited: [], bars: {}, goldBars: 0 };
}

export function loadProgress(scope, storage) {
  try {
    const raw = storage.getItem(progressKey(scope));
    if (!raw) return blankProgress();
    const p = JSON.parse(raw);
    if (!p || p.v !== PROGRESS_VERSION || !Array.isArray(p.visited)) return blankProgress();
    return { v: 1, visited: p.visited, bars: p.bars || {}, goldBars: p.goldBars || 0 };
  } catch {
    return blankProgress();
  }
}

export function saveProgress(scope, progress, storage) {
  try {
    storage.setItem(progressKey(scope), JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function markVisited(progress, universeId) {
  if (progress.visited.includes(universeId)) return progress;
  return { ...progress, visited: [...progress.visited, universeId] };
}

/** Collect a bar. Idempotent — collecting twice credits once. */
export function collectBar(progress, universeId, barIndex) {
  const have = progress.bars[universeId] || [false, false];
  if (have[barIndex]) return { progress, fresh: false };
  const next = [!!have[0], !!have[1]];
  next[barIndex] = true;
  return {
    progress: {
      ...progress,
      bars: { ...progress.bars, [universeId]: next },
      goldBars: progress.goldBars + 1,
    },
    fresh: true,
  };
}

export function barsFound(progress, universeId) {
  const b = progress.bars[universeId] || [false, false];
  return (b[0] ? 1 : 0) + (b[1] ? 1 : 0);
}

export function totalBars(progress) {
  return progress.goldBars;
}

export function visitedCount(progress) {
  return progress.visited.length;
}

// --- local gold ledger --------------------------------------------------------
// Append-only, idempotent by entry id. localStorage only — no SQL, no server.
// Amounts are in liquid gold (1,000 liquid gold = 1 gold bar).

export function blankLedger() {
  return { v: PROGRESS_VERSION, balance: 0, entries: [] };
}

export function loadLedger(scope, storage) {
  try {
    const raw = storage.getItem(ledgerKey(scope));
    if (!raw) return blankLedger();
    const l = JSON.parse(raw);
    if (!l || l.v !== PROGRESS_VERSION || !Array.isArray(l.entries)) return blankLedger();
    return { v: 1, balance: l.balance || 0, entries: l.entries };
  } catch {
    return blankLedger();
  }
}

export function saveLedger(scope, ledger, storage) {
  try {
    storage.setItem(ledgerKey(scope), JSON.stringify(ledger));
    return true;
  } catch {
    return false;
  }
}

/** Credit a found bar to the ledger. Idempotent by entry id `u<id>b<index>`. */
export function creditBarToLedger(ledger, universeId, barIndex, universeName) {
  const id = `u${universeId}b${barIndex}`;
  if (ledger.entries.some((e) => e.id === id)) return { ledger, fresh: false };
  const entry = {
    id,
    ts: Date.now(),
    universe: universeId,
    name: universeName || '',
    bar: barIndex,
    amount: GOLD_LIQUID_PER_BAR,
  };
  return {
    ledger: {
      ...ledger,
      balance: ledger.balance + GOLD_LIQUID_PER_BAR,
      entries: [...ledger.entries, entry],
    },
    fresh: true,
  };
}
