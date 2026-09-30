// lib/myriad-universes.js — MYRIAD pocket universe: 100 explorable universes.
//
// Deterministic seeded generation: the same master seed always produces the
// same 100 universe descriptors. Pure logic — no DOM, no THREE imports,
// fully headless-testable. The page (app/myriad/page.jsx) renders them.

export const MASTER_SEED = 20260929;
export const UNIVERSE_COUNT = 100;

export const ANOMALIES = ['none', 'wormhole', 'starforge', 'voidbloom', 'crystalfield'];

export const ANOMALY_LABELS = {
  none: 'Quiet',
  wormhole: 'Wormhole',
  starforge: 'Starforge',
  voidbloom: 'Voidbloom',
  crystalfield: 'Crystalfield',
};

export function anomalyLabel(a) {
  return ANOMALY_LABELS[a] || 'Quiet';
}

// Deterministic PRNG (mulberry32). Same seed -> same sequence, forever.
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

// 25 x 25 = 625 unique mythic-cosmic name pairs; we take 100.
const NAME_ADJECTIVES = [
  'Silent', 'Ember', 'Hollow', 'Violet', 'Golden', 'Crimson', 'Pale',
  'Howling', 'Gilded', 'Frozen', 'Burning', 'Velvet', 'Iron', 'Opal',
  'Storm', 'Glass', 'Obsidian', 'Ivory', 'Copper', 'Jade', 'Solar',
  'Lunar', 'Astral', 'Ebon', 'Radiant',
];

const NAME_NOUNS = [
  'Drift', 'Reach', 'Veil', 'Expanse', 'Hollow', 'Choir', 'Garden',
  'Forge', 'Harbor', 'Throne', 'Maw', 'Cradle', 'Tempest', 'Sanctum',
  'Labyrinth', 'Crown', 'Tide', 'Mirror', 'Vault', 'Chorus', 'Bastion',
  'Requiem', 'Aurora', 'Abyss', 'Crossing',
];

// Curated cosmic palettes: [deep background tint, mid tone, bright accent].
const PALETTES = [
  ['#0b1026', '#4c1d95', '#a78bfa'],
  ['#0a1420', '#0c4a6e', '#38bdf8'],
  ['#160b06', '#7c2d12', '#fb923c'],
  ['#06120e', '#065f46', '#34d399'],
  ['#12061a', '#701a75', '#e879f9'],
  ['#0d0a02', '#713f12', '#facc15'],
  ['#080a12', '#1e3a8a', '#818cf8'],
  ['#0a0f0a', '#3f6212', '#a3e635'],
  ['#120609', '#881337', '#fb7185'],
  ['#04121a', '#0e7490', '#22d3ee'],
  ['#100a14', '#5b21b6', '#c4b5fd'],
  ['#0c0805', '#92400e', '#ffd700'],
];

function plural(n, one, many) {
  return n === 1 ? one : many;
}

function pickAnomaly(r) {
  const x = r();
  if (x < 0.3) return 'none';
  if (x < 0.5) return 'wormhole';
  if (x < 0.7) return 'starforge';
  if (x < 0.85) return 'voidbloom';
  return 'crystalfield';
}

function describeUniverse(adj, nebulaCount, galaxyCount, anomaly) {
  const bits = `${nebulaCount} ${plural(nebulaCount, 'nebula', 'nebulae')} and ` +
    `${galaxyCount} ${plural(galaxyCount, 'galaxy', 'galaxies')}`;
  const tail = {
    none: 'and open starfields all the way down.',
    wormhole: 'and a live wormhole humming at its heart.',
    starforge: 'and a starforge burning at its core.',
    voidbloom: 'and a voidbloom flowering in the dark.',
    crystalfield: 'and a drifting crystalfield.',
  }[anomaly];
  const article = /^[aeiou]/i.test(adj) ? 'An' : 'A';
  return `${article} ${adj.toLowerCase()} stretch of deep space with ${bits}, ${tail}`;
}

// Seeded shuffle (Fisher-Yates) over [0, n).
function shuffledIndices(n, rand) {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

// Generate exactly 100 universe descriptors from a master seed.
export function generateUniverses(masterSeed = MASTER_SEED) {
  const rand = mulberry32(masterSeed);
  // Unique names: shuffle the 625 adjective/noun pairs, take 100.
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
    const starDensity = 0.35 + rand() * 0.65;
    const nebulaCount = Math.floor(rand() * 4); // 0..3
    const galaxyCount = Math.floor(rand() * 3); // 0..2
    const anomaly = pickAnomaly(rand);
    universes.push({
      id,
      name: `The ${adj} ${noun}`,
      seed,
      palette: [...palette],
      starDensity,
      nebulaCount,
      galaxyCount,
      anomaly,
      description: describeUniverse(adj, nebulaCount, galaxyCount, anomaly),
    });
  }
  return universes;
}

export const UNIVERSES = generateUniverses();

export function universeById(id) {
  return UNIVERSES.find((u) => u.id === id) || null;
}

// ---------------------------------------------------------------------------
// Scene derivation: deterministic positions for a universe's contents,
// from the universe's own seed. The page renders these with the shared
// NOVA deep-space components (SpiralGalaxy, Nebula, Wormhole).
// ---------------------------------------------------------------------------

export const MYRIAD_SPAWN = { x: 0, y: 0, z: 40 };

export function sceneFor(universe) {
  const rand = mulberry32(universe.seed);
  const [deep, mid, accent] = universe.palette;

  const galaxies = [];
  for (let i = 0; i < universe.galaxyCount; i++) {
    const roman = ['I', 'II'][i] || `${i + 1}`;
    galaxies.push({
      key: `g${i}`,
      name: `${universe.name} Spiral ${roman}`,
      pos: {
        x: (rand() - 0.5) * 200,
        y: (rand() - 0.5) * 70,
        z: -120 - rand() * 110,
      },
      radius: 18 + rand() * 14,
      arms: 2 + Math.floor(rand() * 2),
      palette: [accent, mid, '#f8fafc'],
      spin: (rand() > 0.5 ? 1 : -1) * (0.008 + rand() * 0.012),
    });
  }

  const nebulae = [];
  for (let i = 0; i < universe.nebulaCount; i++) {
    const roman = ['I', 'II', 'III'][i] || `${i + 1}`;
    nebulae.push({
      key: `n${i}`,
      name: `${universe.name} Veil ${roman}`,
      pos: {
        x: (rand() - 0.5) * 170,
        y: (rand() - 0.5) * 60,
        z: -80 - rand() * 90,
      },
      radius: 26 + rand() * 12,
      palette: [mid, accent, deep],
    });
  }

  const anomaly =
    universe.anomaly === 'none'
      ? null
      : {
          type: universe.anomaly,
          label: anomalyLabel(universe.anomaly),
          pos: {
            x: (rand() - 0.5) * 90,
            y: (rand() - 0.5) * 30,
            z: -60 - rand() * 40,
          },
          radius: universe.anomaly === 'wormhole' ? 9 : 12,
        };

  return { galaxies, nebulae, anomaly, deep };
}
