// lib/planets/creatures.js — the REGIONAL fauna of the hub planet
// realms (Merlin, 2026-10-22: "expand the creatures and different
// types across regions").
//
// Where lib/planets/profiles.js grows FIVE Mars-shaped showcase
// species per planet (which still render, unchanged), this module
// grows the WILD population: many smaller procedural creatures whose
// body plans are DERIVED FROM THE GROUND THEY SPAWN ON. A spawn
// point reads its region blend (lib/planets/landscape.js — the top
// two region weights at that exact spot) and the creature is a lerp
// of the two regions' variants: size biased by both regions, colour
// washed between both regions' ground colours, archetype picked from
// the blended archetype tables. Deep inside one region a creature is
// purely of that region; in a blend band it is visibly an
// intermediate — the organic transition, walking around on legs.
//
// Six archetypes (the brief's set): grazer, stalker, flyer, swarmer,
// burrower, drifter. Everything is a pure, seeded function of the
// profile: same seed ⇒ same population, body for body — zero
// runtime randomness. Rendering (primitive-composed bodies + procedural
// gait) lives in components/planets/PlanetCreatures.jsx; this module
// is the biology only.
//
// MORPHOLOGY (Merlin, 2026-10-22: "the life in Saturn is the life
// in Jupiter? Every planet is supposed to be unique"): the six
// archetypes are ROLES, not body plans. Each planet grows its own
// BAUPLAN — proportions, limb plan, stance, surface and an appendage
// vocabulary drawn from its LIFE TYPE's family, jittered by its own
// seed (planetMorphology below). The archetypes are then expressed
// THROUGH that bauplan: a Saturn grazer is a sail-backed sun-drinker
// on column legs, a Jupiter grazer a long, low filter-body with a
// gas sac and fins. Same role, different animal — the way one
// world's fauna shares a body-plan language while its species
// differ. Before this layer, body params came from the shared
// archetype ranges alone (region size/colour only), so every
// planet's fauna was the same shapes repainted.
import { SeedRNG } from '../mars/engine.js';
import { getLandscape } from './landscape.js';

/** Hard cap on regional individuals per planet — phone budget. */
export const POPULATION_CAP = 36;

/**
 * Archetype body-plan ranges (drawn per individual, then biased by
 * the spawn point's region blend). Legs 0 = the archetype does not
 * walk (flyer hovers on wings, drifter floats on a gas sac).
 * social: herd/pack/pair/solo — how a spawn cluster groups.
 * hover: height above ground the body rides at (0 = stands on it).
 */
export const ARCHETYPES = {
  grazer: {
    legs: [4, 6], bodyLen: [1.5, 2.3], bodyRad: [0.4, 0.58],
    neck: [0.3, 0.7], head: [0.3, 0.42], tail: [0.5, 1.0],
    tempo: [0.8, 1.2], social: 'herd', count: [3, 5], hover: [0, 0],
    wander: [6, 11],
  },
  stalker: {
    legs: [4, 6], bodyLen: [1.6, 2.4], bodyRad: [0.3, 0.42],
    neck: [0.1, 0.3], head: [0.3, 0.4], tail: [0.9, 1.5],
    tempo: [1.1, 1.5], social: 'solo', count: [1, 1], hover: [0, 0],
    wander: [12, 18],
  },
  flyer: {
    legs: [0, 0], bodyLen: [0.9, 1.5], bodyRad: [0.2, 0.32],
    neck: [0.0, 0.2], head: [0.18, 0.28], tail: [0.3, 0.7],
    tempo: [1.6, 2.2], social: 'pair', count: [1, 2], hover: [5, 9],
    wander: [9, 15],
  },
  swarmer: {
    legs: [6, 8], bodyLen: [0.35, 0.55], bodyRad: [0.12, 0.2],
    neck: [0.0, 0.05], head: [0.1, 0.16], tail: [0.1, 0.3],
    tempo: [2.2, 3.0], social: 'pack', count: [4, 6], hover: [0, 0],
    wander: [2, 4],
  },
  burrower: {
    legs: [4, 6], bodyLen: [1.3, 2.0], bodyRad: [0.34, 0.5],
    neck: [0.0, 0.1], head: [0.26, 0.36], tail: [0.4, 0.8],
    tempo: [0.6, 0.95], social: 'pair', count: [1, 2], hover: [0, 0],
    wander: [4, 7],
  },
  drifter: {
    legs: [0, 0], bodyLen: [0.8, 1.3], bodyRad: [0.5, 0.85],
    neck: [0.0, 0.0], head: [0.16, 0.24], tail: [0.5, 0.9],
    tempo: [0.4, 0.7], social: 'solo', count: [1, 1], hover: [2.5, 5],
    wander: [5, 9],
  },
};
export const ARCHETYPE_NAMES = Object.keys(ARCHETYPES);

const lerp = (a, b, t) => a + (b - a) * t;

function weightedPick(weights, rng) {
  let total = 0;
  for (const k of ARCHETYPE_NAMES) total += weights[k] || 0;
  if (total <= 0) return 'grazer';
  let roll = rng.next() * total;
  for (const k of ARCHETYPE_NAMES) {
    roll -= weights[k] || 0;
    if (roll <= 0) return k;
  }
  return 'grazer';
}

// --- morphology: the planet's bauplan --------------------------------
// One family per life type: the appendage vocabulary the world's
// fauna may grow, the surfaces its bodies wear, and the proportion
// envelopes its seed draws from. Two planets of the same life type
// would still differ — the plan is drawn from the planet's own seed
// inside these envelopes — but the registry gives every hub world a
// different life type, so every hub world's fauna speaks a different
// body-plan language outright.
//
// Appendage kinds (the renderer builds each from primitives):
//   gasSac, fins, tendrils, sail, fronds, stalkEyes, stalks, caps,
//   sporePods, vents, shellPlates, tubeClusters, shardCrest,
//   antennae, gillFans, barbels, matSkirt, humps, spines, dishes.
// Crest kinds: fin, frill, spines, shards, stalks, horns (or none).
// Surfaces: smooth, segmented, plated, faceted, knobbed.
// Stances: column (legs near-vertical), splayed, low.
const MORPH_FAMILIES = {
  'terran-biosphere': {
    appendages: ['humps', 'stalkEyes', 'fronds'],
    surfaces: ['smooth'],
    bulk: [0.9, 1.15], elongation: [0.9, 1.15], flatten: [0.9, 1.0],
    neck: [0.8, 1.2], head: [0.9, 1.15], tail: [0.8, 1.2],
    limbShift: [0, 0], legLen: [0.9, 1.15], legThick: [0.9, 1.2],
    stances: ['column', 'low'], crests: ['horns', 'frill', 'fin', null],
  },
  'microbial-mat': {
    appendages: ['matSkirt', 'humps', 'tendrils'],
    surfaces: ['knobbed', 'smooth'],
    bulk: [1.0, 1.3], elongation: [0.85, 1.1], flatten: [0.55, 0.8],
    neck: [0.3, 0.7], head: [0.9, 1.2], tail: [0.7, 1.1],
    limbShift: [-1, 0], legLen: [0.6, 0.9], legThick: [1.0, 1.3],
    stances: ['low'], crests: ['stalks', 'spines', null],
  },
  'aerial-plankton': {
    appendages: ['gasSac', 'fins', 'tendrils'],
    surfaces: ['smooth'],
    bulk: [0.7, 0.95], elongation: [1.05, 1.35], flatten: [0.8, 1.0],
    neck: [0.5, 0.9], head: [0.85, 1.1], tail: [1.0, 1.5],
    limbShift: [-1, 0], legLen: [0.7, 1.0], legThick: [0.7, 1.0],
    stances: ['splayed', 'low'], crests: ['fin', 'frill', null],
  },
  'photosynthetic-titan': {
    appendages: ['sail', 'fronds', 'stalkEyes'],
    surfaces: ['smooth', 'plated'],
    bulk: [1.05, 1.3], elongation: [0.95, 1.2], flatten: [0.9, 1.05],
    neck: [1.0, 1.6], head: [0.9, 1.2], tail: [0.8, 1.2],
    limbShift: [0, 0], legLen: [1.1, 1.45], legThick: [1.0, 1.3],
    stances: ['column'], crests: ['fin', 'frill', null],
  },
  'ammonia-aquatic': {
    appendages: ['fins', 'gillFans', 'barbels', 'tendrils'],
    surfaces: ['smooth'],
    bulk: [0.8, 1.05], elongation: [1.1, 1.4], flatten: [0.8, 0.95],
    neck: [0.3, 0.6], head: [0.9, 1.15], tail: [1.1, 1.5],
    limbShift: [-1, 0], legLen: [0.7, 1.0], legThick: [0.8, 1.1],
    stances: ['splayed', 'low'], crests: ['fin', null],
  },
  'fungal-network': {
    appendages: ['stalks', 'caps', 'sporePods'],
    surfaces: ['knobbed', 'smooth'],
    bulk: [0.9, 1.2], elongation: [0.85, 1.1], flatten: [0.85, 1.0],
    neck: [0.6, 1.1], head: [0.9, 1.2], tail: [0.7, 1.1],
    limbShift: [0, 1], legLen: [0.8, 1.15], legThick: [0.9, 1.2],
    stances: ['low', 'column'], crests: ['stalks', 'spines', null],
  },
  'chemosynthetic-deep': {
    appendages: ['vents', 'shellPlates', 'tubeClusters'],
    surfaces: ['plated', 'smooth'],
    bulk: [0.95, 1.25], elongation: [0.9, 1.2], flatten: [0.85, 1.0],
    neck: [0.4, 0.8], head: [0.95, 1.25], tail: [0.8, 1.2],
    limbShift: [0, 1], legLen: [0.8, 1.1], legThick: [1.0, 1.4],
    stances: ['splayed', 'low'], crests: ['spines', null],
  },
  'silicon-crystal': {
    appendages: ['shardCrest', 'spines', 'dishes'],
    surfaces: ['faceted'],
    bulk: [0.85, 1.1], elongation: [0.9, 1.2], flatten: [0.85, 1.0],
    neck: [0.5, 0.9], head: [0.9, 1.15], tail: [0.9, 1.3],
    limbShift: [0, 1], legLen: [0.9, 1.25], legThick: [0.7, 1.0],
    stances: ['splayed', 'column'], crests: ['shards'],
  },
  'hive-insectoid': {
    appendages: ['antennae', 'spines', 'shellPlates'],
    surfaces: ['segmented'],
    bulk: [0.8, 1.05], elongation: [1.0, 1.25], flatten: [0.85, 1.0],
    neck: [0.4, 0.7], head: [0.95, 1.2], tail: [0.9, 1.3],
    limbShift: [1, 2], legLen: [0.9, 1.3], legThick: [0.6, 0.9],
    stances: ['splayed'], crests: ['spines', 'horns', null],
  },
  'radiotroph': {
    appendages: ['spines', 'dishes', 'humps'],
    surfaces: ['smooth', 'plated'],
    bulk: [0.85, 1.1], elongation: [0.9, 1.2], flatten: [0.7, 0.95],
    neck: [0.5, 1.0], head: [0.9, 1.15], tail: [0.8, 1.2],
    limbShift: [0, 1], legLen: [0.85, 1.15], legThick: [0.85, 1.15],
    stances: ['column', 'splayed'], crests: ['spines', 'fin', null],
  },
};
const FALLBACK_MORPH_FAMILY = MORPH_FAMILIES['terran-biosphere'];

/** The full parameter vector of a bauplan, for uniqueness checks. */
export function morphologyVector(plan) {
  return [
    plan.lifeType, plan.surface, plan.stance, plan.segments, plan.limbShift,
    plan.crest ? plan.crest.kind : 'none',
    ...plan.appendages.map((a) => a.kind),
    plan.bulk, plan.elongation, plan.flatten, plan.neckScale, plan.headScale,
    plan.tailScale, plan.legLenScale, plan.legThickness,
    ...(plan.crest ? [plan.crest.emphasis] : []),
    ...plan.appendages.map((a) => a.emphasis),
  ];
}

const _morphCache = new WeakMap();
/**
 * The planet's bauplan: a pure, seeded function of the profile
 * (stream `${seed}-MORPHOLOGY`). Plain data only — numbers, strings,
 * small arrays — so populations stay JSON-stable and tests can
 * compare plans value for value. Cached per profile object, like
 * the landscape.
 */
export function planetMorphology(profile) {
  let plan = _morphCache.get(profile);
  if (plan) return plan;
  const fam = MORPH_FAMILIES[profile.lifeType] || FALLBACK_MORPH_FAMILY;
  const rng = new SeedRNG(profile.seed + '-MORPHOLOGY');
  const bulk = rng.range(fam.bulk[0], fam.bulk[1]);
  const elongation = rng.range(fam.elongation[0], fam.elongation[1]);
  const flatten = rng.range(fam.flatten[0], fam.flatten[1]);
  const neckScale = rng.range(fam.neck[0], fam.neck[1]);
  const headScale = rng.range(fam.head[0], fam.head[1]);
  const tailScale = rng.range(fam.tail[0], fam.tail[1]);
  const limbShift = rng.int(fam.limbShift[0], fam.limbShift[1]);
  const legLenScale = rng.range(fam.legLen[0], fam.legLen[1]);
  const legThickness = rng.range(fam.legThick[0], fam.legThick[1]);
  const stance = rng.pick(fam.stances);
  const surface = rng.pick(fam.surfaces);
  const segments = surface === 'segmented' ? rng.int(3, 5) : 0;
  const crestKind = rng.pick(fam.crests);
  const crest = crestKind ? { kind: crestKind, emphasis: rng.range(0.4, 1) } : null;
  // The planet's appendage set: a seeded subset of the family
  // vocabulary (2–3 kinds), each with its own emphasis.
  const vocab = [...fam.appendages];
  for (let i = vocab.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = vocab[i];
    vocab[i] = vocab[j];
    vocab[j] = tmp;
  }
  const take = Math.min(vocab.length, rng.int(2, 3));
  const appendages = vocab.slice(0, take).map((kind) => ({
    kind,
    emphasis: rng.range(0.5, 1),
  }));
  plan = {
    seed: profile.seed,
    planetKey: profile.planetKey || null,
    lifeType: profile.lifeType || null,
    bulk, elongation, flatten, neckScale, headScale, tailScale,
    limbShift, legLenScale, legThickness, stance, surface, segments,
    crest, appendages,
  };
  _morphCache.set(profile, plan);
  return plan;
}

/**
 * One species' expression of the planet bauplan (stream
 * `${seed}-MORPH-<archetype>`): same language, different animal —
 * proportions nudge, appendage emphasis varies per species and a
 * weak appendage drops out entirely, the crest may be strong on
 * the grazer and nearly absent on the stalker.
 */
export function archetypeMorphology(plan, archetype) {
  const rng = new SeedRNG(plan.seed + '-MORPH-' + archetype);
  const lenMul = rng.range(0.93, 1.07);
  const bulkMul = rng.range(0.92, 1.08);
  const legMul = rng.range(0.9, 1.1);
  const crestEmphasis = plan.crest ? plan.crest.emphasis * rng.range(0.2, 1.15) : 0;
  const appendages = plan.appendages
    .map((a) => ({ kind: a.kind, emphasis: a.emphasis * rng.range(0.25, 1.1) }))
    .filter((a) => a.emphasis >= 0.3);
  return { lenMul, bulkMul, legMul, crestEmphasis, appendages };
}

// Plain words for the bauplan, derived from the same params the
// renderer consumes — consoles name the difference honestly, with
// no per-planet text written anywhere.
const APPENDAGE_ADJECTIVES = {
  gasSac: 'gas-sac', fins: 'finned', tendrils: 'tendrilled', sail: 'sail-backed',
  fronds: 'fronded', stalkEyes: 'stalk-eyed', stalks: 'stalk-crowned',
  caps: 'cap-backed', sporePods: 'pod-backed', vents: 'vent-backed',
  shellPlates: 'shell-plated', tubeClusters: 'tube-clustered',
  shardCrest: 'shard-crested', antennae: 'antennaed', gillFans: 'gill-fanned',
  barbels: 'barbelled', matSkirt: 'mat-skirted', humps: 'hump-backed',
  spines: 'spine-backed', dishes: 'dish-backed',
};
const SURFACE_ADJECTIVES = {
  segmented: 'segmented', plated: 'plate-backed', faceted: 'faceted',
  knobbed: 'knob-backed', smooth: null,
};

/**
 * "Bauplan: sail-backed grazers, finned drifters, ..." — one clause
 * per headline archetype, each voiced by that species' strongest
 * appendage (or its surface / limb plan when it grows none).
 */
export function bauplanSignature(plan) {
  const clauses = [];
  for (const archetype of ['grazer', 'drifter', 'stalker']) {
    const am = archetypeMorphology(plan, archetype);
    let adj = am.appendages.length ? APPENDAGE_ADJECTIVES[am.appendages[0].kind] : null;
    if (!adj) adj = SURFACE_ADJECTIVES[plan.surface];
    if (!adj) adj = plan.limbShift >= 1 ? 'many-legged' : plan.limbShift <= -1 ? 'long-limbed' : 'smooth-bodied';
    clauses.push(`${adj} ${archetype}s`);
  }
  return `Bauplan: ${clauses.join(', ')}`;
}

export { MORPH_FAMILIES };

/**
 * Grow the regional population of a planet profile.
 * Returns individuals in a FIXED generation order; each carries
 * everything the renderer needs plus its biomeMix — the names of the
 * two regions it blends and the dominant share — so consoles and
 * tests can say honestly what it is.
 */
export function generatePopulation(profile, landscape = getLandscape(profile)) {
  const rng = new SeedRNG(profile.seed + '-REGIONAL-FAUNA');
  // The planet's bauplan and each archetype's expression of it —
  // computed once, from their own seeded streams, so the population
  // stream below stays the only per-individual draw.
  const morph = planetMorphology(profile);
  const archMorph = {};
  const morphFor = (archetype) =>
    archMorph[archetype] || (archMorph[archetype] = archetypeMorphology(morph, archetype));
  const creatures = [];
  let guard = 0;

  while (creatures.length < POPULATION_CAP && guard < 28) {
    guard++;
    // --- a spawn anchor, clear of deep basin water ----------------
    let ax = 0;
    let az = 0;
    let placed = false;
    for (let attempt = 0; attempt < 8 && !placed; attempt++) {
      const ang = rng.range(0, Math.PI * 2);
      const dist = 10 + Math.sqrt(rng.next()) * 68;
      ax = Math.cos(ang) * dist;
      az = Math.sin(ang) * dist;
      placed = !profile.basins.some(
        (b) => Math.hypot(ax - b.x, az - b.z) < b.radius * 0.9
      );
    }
    if (!placed) continue;

    // --- the ground decides the biology ---------------------------
    const blend = landscape.blendAt(ax, az);
    const share = blend.share; // dominant region's share of the top two
    const mixedWeights = {};
    for (const k of ARCHETYPE_NAMES) {
      mixedWeights[k] =
        (blend.top.archetypeWeights[k] || 0) * share +
        (blend.second.archetypeWeights[k] || 0) * (1 - share);
    }
    const archetype = weightedPick(mixedWeights, rng);
    const arch = ARCHETYPES[archetype];
    const sizeMul = blend.top.sizeBias * share + blend.second.sizeBias * (1 - share);

    let count = rng.int(arch.count[0], arch.count[1]);
    const remaining = POPULATION_CAP - creatures.length;
    if (count > remaining) count = remaining;
    if (count <= 0) break;

    // Body colour: washed between the two regions' ground colours,
    // lifted toward the planet accent so fauna read against terrain.
    const bodyColor = blend.top.color
      .clone()
      .lerp(blend.second.color, 1 - share)
      .lerp(profile.groundAccentColor, 0.22);
    const clusterSpread =
      arch.social === 'herd' ? 4.5 : arch.social === 'pack' ? 1.8 : arch.social === 'pair' ? 2.4 : 0;

    const am = morphFor(archetype);
    for (let j = 0; j < count; j++) {
      const ox = clusterSpread ? rng.range(-clusterSpread, clusterSpread) : 0;
      const oz = clusterSpread ? rng.range(-clusterSpread, clusterSpread) : 0;
      const x = ax + ox;
      const z = az + oz;
      const indiv = bodyColor.clone();
      indiv.offsetHSL(rng.range(-0.02, 0.02), rng.range(-0.04, 0.04), rng.range(-0.03, 0.05));
      // Limb plan: the archetype's pair range, shifted by the
      // planet's bauplan (hive worlds grow extra pairs, plankton
      // worlds shed them) and clamped to a sane walking plan.
      // Flyers/drifters never walk — their 0 stands.
      let legPairs = 0;
      if (arch.legs[1] > 0) {
        legPairs = rng.int(Math.ceil(arch.legs[0] / 2), Math.floor(arch.legs[1] / 2));
        legPairs = Math.max(1, Math.min(4, legPairs + morph.limbShift));
      }
      creatures.push({
        id: `regional_${creatures.length}`,
        archetype,
        social: arch.social,
        x,
        z,
        y: landscape.heightAt(x, z),
        anchor: { x: ax, z: az },
        wanderRadius: rng.range(arch.wander[0], arch.wander[1]),
        phase: rng.range(0, Math.PI * 2),
        dirSign: rng.next() > 0.5 ? 1 : -1,
        params: {
          bodyLen: rng.range(arch.bodyLen[0], arch.bodyLen[1]) * sizeMul * morph.elongation * am.lenMul,
          bodyRad: rng.range(arch.bodyRad[0], arch.bodyRad[1]) * sizeMul * morph.bulk * am.bulkMul,
          legCount: legPairs * 2,
          legLen: rng.range(0.5, 0.8) * sizeMul * morph.legLenScale * am.legMul * (arch.legs[1] > 0 ? 1 : 0),
          neckLen: rng.range(arch.neck[0], arch.neck[1]) * sizeMul * morph.neckScale,
          headRad: rng.range(arch.head[0], arch.head[1]) * sizeMul * morph.headScale,
          tailLen: rng.range(arch.tail[0], arch.tail[1]) * sizeMul * morph.tailScale,
          tempo: rng.range(arch.tempo[0], arch.tempo[1]),
          hover: rng.range(arch.hover[0], arch.hover[1]),
          colorHex: '#' + indiv.getHexString(),
          accentHex: '#' + profile.groundAccentColor.getHexString(),
          // The species' body-plan expression, consumed by the
          // renderer: surface, segmentation, stance, leg build,
          // crest and the appendage set it actually grows.
          morph: {
            surface: morph.surface,
            segments: morph.segments,
            flatten: morph.flatten,
            stance: morph.stance,
            legThickness: morph.legThickness,
            crest: morph.crest && am.crestEmphasis >= 0.25
              ? { kind: morph.crest.kind, emphasis: am.crestEmphasis }
              : null,
            appendages: am.appendages,
          },
        },
        biomeMix: {
          primary: blend.top.name,
          secondary: blend.second.name,
          share: Math.round(share * 100) / 100,
          between: blend.between,
        },
      });
    }
  }
  return creatures;
}
