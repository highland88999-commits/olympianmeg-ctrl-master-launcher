// lib/planets/landscape.js — procedural REGIONAL landscapes for the
// hub planet realms (Merlin, 2026-10-22: "As for planetary procedural
// generation for landscapes? ... You draw the invisible zone lines
// and make it transition organically").
//
// THE MODEL, in plain words. A planet surface is NOT partitioned by
// drawing lines. Three smooth, seeded fields wash over the whole
// disc — MOISTURE, TEMPERATURE and ELEVATION — and each of the
// planet's five regions ("biomes") is a soft Gaussian hill in that
// (moisture, temperature, elevation) space. At any point on the
// ground, every region has a continuous influence weight: the weights
// are the region. Walking toward a "border", one region's weight
// ebbs and its neighbour's grows across a wide blend band — the
// ground colour, the flora, and the fauna are all computed as blends
// of the two, so there is never an edge to point at. The zone lines
// exist only as mathematics; nothing in the scene draws them.
//
// Everything derives deterministically from the planet profile (its
// canonical seed + life type): same seed ⇒ identical fields, regions,
// colours and scatter, every run. No runtime randomness anywhere — the noise
// is an integer-lattice value noise (platform-stable), the draws are
// SeedRNG streams named per system.
//
// HEIGHT: the walk/collision truth stays the shared realm field
// (lib/mars/engine.js getTerrainHeight — basins, walkers and the Mars
// fauna all stand on it, untouched). heightAt() here = that base
// field + a shallow seeded fBm DETAIL (raise-biased, faded out inside
// the basins so the pools stay clean). The planet ground skin
// (components/planets/PlanetLandscape.jsx) is displaced by heightAt
// and coloured by colorAt; the regional fauna stand on heightAt too.
import * as THREE from 'three';
import { SeedRNG, getTerrainHeight } from '../mars/engine.js';

// --- deterministic value noise (integer lattice; no trig hashes) ----
function seedInt(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function hash2(ix, iz, seed) {
  let h = seed ^ Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smootherstep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smootherstep(x - ix);
  const fz = smootherstep(z - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** fBm in ~[0,1]: `octaves` of value noise, summed and renormalised. */
function fbm(x, z, seed, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  let fx = x;
  let fz = z;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(fx, fz, seed + o * 1013);
    total += amp;
    amp *= 0.5;
    fx *= 2.03;
    fz *= 2.03;
  }
  const v = sum / total;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// --- region families, one per life type ------------------------------
// Five soft regions per planet. `centers` are (moisture, temperature,
// elevation) affinities — well spread so every climate the fields
// produce has a home; each planet jitters them by its seed. `forms`
// names the flora silhouette each region grows; `tints` walks the
// planet palette (0 = ground, 1 = ground accent, 2 = water,
// 3 = horizon) for the region's ground colour; `sizeBias` scales the
// region's fauna; `archetypes` weights the fauna mix (keys of
// lib/planets/creatures.js ARCHETYPES).
const SLOT_CENTERS = [
  { m: 0.24, t: 0.46, e: 0.28 },
  { m: 0.80, t: 0.54, e: 0.24 },
  { m: 0.50, t: 0.20, e: 0.76 },
  { m: 0.34, t: 0.86, e: 0.44 },
  { m: 0.66, t: 0.38, e: 0.84 },
];

const FAMILIES = {
  'terran-biosphere': {
    pre: ['Green', 'Wild', 'Amber', 'River', 'High', 'Soft'],
    suf: ['Reach', 'Meadows', 'Basin', 'Wilds', 'Downs', 'Marches'],
    forms: ['tuft', 'bloom', 'spire', 'tuft', 'bloom'],
    tints: [0, 2, 1, 3, 1],
    archetypes: [
      { grazer: 5, swarmer: 2, burrower: 2 },
      { grazer: 3, flyer: 2, swarmer: 3 },
      { stalker: 3, burrower: 2, grazer: 1 },
      { grazer: 4, stalker: 2, flyer: 2 },
      { flyer: 3, drifter: 1, stalker: 2 },
    ],
  },
  'microbial-mat': {
    pre: ['Rust', 'Brine', 'Ancient', 'Amber', 'Salt', 'Dawn'],
    suf: ['Flats', 'Margins', 'Mats', 'Fields', 'Shores', 'Crusts'],
    forms: ['mat', 'mat', 'bloom', 'mat', 'spire'],
    tints: [0, 2, 0, 3, 1],
    archetypes: [
      { grazer: 4, swarmer: 3, burrower: 2 },
      { grazer: 3, swarmer: 4, drifter: 1 },
      { burrower: 3, stalker: 2 },
      { grazer: 3, flyer: 2, swarmer: 2 },
      { flyer: 2, stalker: 2, drifter: 1 },
    ],
  },
  'aerial-plankton': {
    pre: ['Cream', 'Amber', 'Band', 'Storm', 'Golden', 'Shear'],
    suf: ['Expanse', 'Reaches', 'Shallows', 'Currents', 'Drift', 'Banks'],
    forms: ['bloom', 'bloom', 'spire', 'bloom', 'spire'],
    tints: [3, 0, 1, 2, 1],
    archetypes: [
      { flyer: 5, drifter: 3, grazer: 1 },
      { flyer: 4, drifter: 2, swarmer: 2 },
      { stalker: 2, flyer: 3 },
      { flyer: 4, swarmer: 3, drifter: 1 },
      { drifter: 3, flyer: 3, stalker: 1 },
    ],
  },
  'photosynthetic-titan': {
    pre: ['Pale', 'Ring', 'Titan', 'Solar', 'Gold', 'Sail'],
    suf: ['Meadow', 'Shallows', 'Expanse', 'Reach', 'Fields', 'Heights'],
    forms: ['spire', 'bloom', 'spire', 'tuft', 'spire'],
    tints: [0, 3, 1, 2, 1],
    archetypes: [
      { grazer: 5, drifter: 1, swarmer: 1 },
      { grazer: 4, flyer: 2 },
      { grazer: 3, stalker: 2 },
      { grazer: 4, flyer: 2, burrower: 1 },
      { flyer: 3, drifter: 2, grazer: 2 },
    ],
  },
  'ammonia-aquatic': {
    pre: ['Cobalt', 'Lightless', 'Pressure', 'Abyssal', 'Silent', 'Deep'],
    suf: ['Deep', 'Fields', 'Expanse', 'Gardens', 'Trenches', 'Drift'],
    forms: ['spire', 'bloom', 'shard', 'bloom', 'spire'],
    tints: [2, 0, 1, 2, 1],
    archetypes: [
      { grazer: 3, burrower: 3, swarmer: 2 },
      { grazer: 4, drifter: 2 },
      { stalker: 3, burrower: 2 },
      { drifter: 3, grazer: 2, flyer: 1 },
      { stalker: 2, drifter: 2, flyer: 2 },
    ],
  },
  'fungal-network': {
    pre: ['Spore', 'Mycelial', 'Glow', 'Hyphal', 'Velvet', 'Pale'],
    suf: ['Flats', 'Thickets', 'Marshes', 'Gardens', 'Reaches', 'Hollows'],
    forms: ['bloom', 'spire', 'bloom', 'mat', 'spire'],
    tints: [0, 1, 2, 0, 1],
    archetypes: [
      { grazer: 4, swarmer: 3, burrower: 2 },
      { grazer: 3, burrower: 3, stalker: 1 },
      { swarmer: 4, drifter: 2, grazer: 2 },
      { grazer: 4, burrower: 2, flyer: 1 },
      { flyer: 2, stalker: 2, drifter: 2 },
    ],
  },
  'chemosynthetic-deep': {
    pre: ['Sulphur', 'Ember', 'Acid', 'Vent', 'Ashen', 'Magma'],
    suf: ['Fields', 'Shallows', 'Expanse', 'Deep', 'Banks', 'Vents'],
    forms: ['shard', 'mat', 'spire', 'shard', 'spire'],
    tints: [0, 2, 1, 0, 1],
    archetypes: [
      { grazer: 4, burrower: 3, swarmer: 2 },
      { grazer: 3, swarmer: 3, drifter: 1 },
      { stalker: 3, burrower: 2 },
      { grazer: 3, flyer: 2, stalker: 1 },
      { stalker: 2, flyer: 2, drifter: 1 },
    ],
  },
  'silicon-crystal': {
    pre: ['Shard', 'Storm', 'Gray', 'Lattice', 'Prism', 'Charged'],
    suf: ['Expanse', 'Reaches', 'Lattice', 'Bands', 'Fields', 'Heights'],
    forms: ['shard', 'shard', 'spire', 'shard', 'spire'],
    tints: [0, 1, 3, 0, 1],
    archetypes: [
      { grazer: 4, burrower: 2, swarmer: 2 },
      { grazer: 3, flyer: 3, swarmer: 1 },
      { stalker: 3, burrower: 2 },
      { flyer: 3, stalker: 2, grazer: 1 },
      { stalker: 2, flyer: 2, drifter: 1 },
    ],
  },
  'hive-insectoid': {
    pre: ['Rose', 'Brood', 'Resin', 'Velvet', 'Amber', 'Hive'],
    suf: ['Hivefields', 'Canyon', 'Flats', 'Expanse', 'Warrens', 'Gardens'],
    forms: ['spire', 'shard', 'mat', 'bloom', 'spire'],
    tints: [0, 1, 0, 2, 1],
    archetypes: [
      { swarmer: 5, grazer: 3, burrower: 2 },
      { swarmer: 4, stalker: 2, burrower: 2 },
      { grazer: 4, swarmer: 3, burrower: 1 },
      { flyer: 3, swarmer: 3, grazer: 1 },
      { stalker: 2, flyer: 2, swarmer: 2 },
    ],
  },
  'radiotroph': {
    pre: ['Terminator', 'Radiant', 'Ash', 'Solar', 'Iron', 'Gamma'],
    suf: ['Line', 'Gardens', 'Expanse', 'Fields', 'Flats', 'Reach'],
    forms: ['mat', 'bloom', 'mat', 'shard', 'spire'],
    tints: [0, 1, 0, 3, 1],
    archetypes: [
      { grazer: 4, swarmer: 2, burrower: 2 },
      { grazer: 3, flyer: 2, drifter: 2 },
      { burrower: 3, stalker: 2, grazer: 1 },
      { flyer: 3, grazer: 2, swarmer: 2 },
      { stalker: 2, flyer: 2, drifter: 1 },
    ],
  },
};

const FALLBACK_FAMILY = FAMILIES['terran-biosphere'];
export const REGION_COUNT = SLOT_CENTERS.length; // 5 soft regions
/** Two regions are "in blend" when their top weights sit this close. */
export const BLEND_BAND = 0.15;
const SIGMA = 0.34;

/**
 * Build (or fetch) the regional landscape of a planet profile.
 * Planet profiles only (lib/planets/profiles.js output). Cached per
 * profile object so the scene, the fauna and the console all read
 * the one same world.
 */
const _cache = new WeakMap();
export function getLandscape(profile) {
  let ls = _cache.get(profile);
  if (!ls) {
    ls = createLandscape(profile);
    _cache.set(profile, ls);
  }
  return ls;
}

export function createLandscape(profile) {
  const seed = profile.seed;
  const family = FAMILIES[profile.lifeType] || FALLBACK_FAMILY;
  const moistSeed = seedInt(seed + '-MOIST');
  const tempSeed = seedInt(seed + '-TEMP');
  const detailSeed = seedInt(seed + '-DETAIL');
  const mottleSeed = seedInt(seed + '-MOTTLE');
  const maxH = profile.amp1 + profile.amp2 + 0.85;

  // --- regions: names + jittered affinity centers + colours -------
  const rng = new SeedRNG(seed + '-REGIONS');
  const combos = [];
  for (const p of family.pre) for (const s of family.suf) combos.push(`${p} ${s}`);
  // Seeded Fisher-Yates over the name combos, then a greedy pass
  // that prefers a fresh prefix per region — five distinct names
  // that do not all start with the same word.
  for (let i = combos.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = combos[i];
    combos[i] = combos[j];
    combos[j] = tmp;
  }
  const usedPre = new Set();
  const pickedNames = [];
  for (const name of combos) {
    if (pickedNames.length >= SLOT_CENTERS.length) break;
    const pre = name.split(' ')[0];
    if (usedPre.has(pre)) continue;
    usedPre.add(pre);
    pickedNames.push(name);
  }
  for (const name of combos) {
    if (pickedNames.length >= SLOT_CENTERS.length) break;
    if (!pickedNames.includes(name)) pickedNames.push(name);
  }
  const palette = [
    profile.groundColor,
    profile.groundAccentColor,
    profile.waterColor,
    profile.dayHorizonColor,
  ];
  const biomes = SLOT_CENTERS.map((c, i) => {
    const center = {
      m: clamp01(c.m + rng.range(-0.09, 0.09)),
      t: clamp01(c.t + rng.range(-0.09, 0.09)),
      e: clamp01(c.e + rng.range(-0.09, 0.09)),
    };
    const base = palette[family.tints[i] % palette.length].clone();
    base.lerp(palette[(family.tints[i] + 1) % palette.length], rng.range(0.1, 0.45));
    base.offsetHSL(rng.range(-0.03, 0.03), rng.range(-0.05, 0.08), rng.range(-0.045, 0.045));
    return {
      id: `region_${i}`,
      name: pickedNames[i],
      center,
      color: base,
      colorHex: '#' + base.getHexString(),
      floraForm: family.forms[i],
      floraDensity: [0.8, 1.25, 0.55, 0.95, 0.7][i],
      sizeBias: [1.0, 0.92, 1.12, 1.05, 1.18][i],
      archetypeWeights: family.archetypes[i],
    };
  });

  // --- the fields ---------------------------------------------------
  const elevationAt = (x, z) => clamp01((getTerrainHeight(x, z, profile) + 1.8) / (maxH + 1.8));

  const moistureAt = (x, z) => {
    let m = fbm(x * 0.013 + 7.3, z * 0.013 - 2.9, moistSeed, 4);
    for (const b of profile.basins) {
      const d = Math.hypot(x - b.x, z - b.z);
      const pull = Math.exp(-((d / (b.radius * 1.2)) ** 2));
      m += (b.type === 'water' ? 0.55 : 0.16) * pull;
    }
    return clamp01(m);
  };

  const temperatureAt = (x, z) =>
    clamp01(fbm(x * 0.009 - 13.1, z * 0.009 + 5.7, tempSeed, 4) - 0.38 * elevationAt(x, z) + 0.19);

  const detailAt = (x, z) => fbm(x * 0.055, z * 0.055, detailSeed, 3) - 0.5;

  const heightAt = (x, z) => {
    const base = getTerrainHeight(x, z, profile);
    let fade = 1;
    for (const b of profile.basins) {
      const d = Math.hypot(x - b.x, z - b.z);
      const f = clamp01((d - b.radius * 0.8) / (b.radius * 0.5));
      if (f < fade) fade = f;
    }
    const d = detailAt(x, z) * 0.22;
    const lift = d >= 0 ? d : d * 0.45; // raise-biased: the skin never dips far under the base field
    return base + 0.03 + lift * fade;
  };

  // --- region weights: the invisible zone lines ---------------------
  const weightsAt = (x, z) => {
    const m = moistureAt(x, z);
    const t = temperatureAt(x, z);
    const e = elevationAt(x, z);
    const w = new Array(biomes.length);
    let sum = 0;
    for (let i = 0; i < biomes.length; i++) {
      const c = biomes[i].center;
      const d2 = (m - c.m) ** 2 + (t - c.t) ** 2 + (e - c.e) ** 2;
      w[i] = Math.exp(-d2 / (2 * SIGMA * SIGMA));
      sum += w[i];
    }
    for (let i = 0; i < w.length; i++) w[i] /= sum;
    return w;
  };

  /** Top-two blend at a point: who rules here, who is arriving, and
   *  how completely (share of the top two). `between` is true inside
   *  the organic blend band — the honest "you are between regions". */
  const blendAt = (x, z) => {
    const w = weightsAt(x, z);
    let top = 0;
    let second = -1;
    for (let i = 1; i < w.length; i++) if (w[i] > w[top]) top = i;
    for (let i = 0; i < w.length; i++) {
      if (i !== top && (second < 0 || w[i] > w[second])) second = i;
    }
    const share = w[top] / (w[top] + w[second]);
    return {
      weights: w,
      top: biomes[top],
      second: biomes[second],
      topIndex: top,
      secondIndex: second,
      share,
      between: w[top] - w[second] < BLEND_BAND,
    };
  };

  const dominantAt = (x, z) => blendAt(x, z).top;

  const _col = new THREE.Color();
  /** Ground colour at a point: the full weight-blend of the region
   *  palette, mottled by fine moisture noise and shaded by elevation
   *  the way the base terrain is (dark lows, bright heights). */
  const colorAt = (x, z, out) => {
    const w = weightsAt(x, z);
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < biomes.length; i++) {
      const c = biomes[i].color;
      r += c.r * w[i];
      g += c.g * w[i];
      b += c.b * w[i];
    }
    _col.setRGB(r, g, b);
    const e = elevationAt(x, z);
    const shade = 0.78 + 0.34 * e;
    const mottle = 0.93 + 0.14 * fbm(x * 0.11, z * 0.11, mottleSeed, 2);
    _col.multiplyScalar(shade * mottle);
    if (out) out.copy(_col);
    return _col;
  };

  /** Deterministic flora scatter: points across the disc (never in
   *  deep basin water), each carrying its region weights for the
   *  scene to dress by. Stream: `${seed}-SCATTER`. */
  const scatterPoints = (count) => {
    const srng = new SeedRNG(seed + '-SCATTER');
    const pts = [];
    let guard = 0;
    while (pts.length < count && guard < count * 30) {
      guard++;
      const ang = srng.range(0, Math.PI * 2);
      const dist = 6 + Math.sqrt(srng.next()) * 80;
      const x = Math.cos(ang) * dist;
      const z = Math.sin(ang) * dist;
      const inDeep = profile.basins.some(
        (b) => Math.hypot(x - b.x, z - b.z) < b.radius * 0.85
      );
      if (inDeep) continue;
      const blend = blendAt(x, z);
      pts.push({
        x,
        z,
        y: heightAt(x, z),
        biome: blend.top,
        biomeIndex: blend.topIndex,
        moisture: moistureAt(x, z),
        scale: srng.range(0.7, 1.5),
        rot: srng.range(0, Math.PI * 2),
      });
    }
    return pts;
  };

  return {
    seed,
    lifeType: profile.lifeType,
    biomes,
    moistureAt,
    temperatureAt,
    elevationAt,
    detailAt,
    heightAt,
    weightsAt,
    blendAt,
    dominantAt,
    colorAt,
    scatterPoints,
  };
}

export { FAMILIES as BIOME_FAMILIES };
