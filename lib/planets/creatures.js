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

/**
 * Grow the regional population of a planet profile.
 * Returns individuals in a FIXED generation order; each carries
 * everything the renderer needs plus its biomeMix — the names of the
 * two regions it blends and the dominant share — so consoles and
 * tests can say honestly what it is.
 */
export function generatePopulation(profile, landscape = getLandscape(profile)) {
  const rng = new SeedRNG(profile.seed + '-REGIONAL-FAUNA');
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

    for (let j = 0; j < count; j++) {
      const ox = clusterSpread ? rng.range(-clusterSpread, clusterSpread) : 0;
      const oz = clusterSpread ? rng.range(-clusterSpread, clusterSpread) : 0;
      const x = ax + ox;
      const z = az + oz;
      const indiv = bodyColor.clone();
      indiv.offsetHSL(rng.range(-0.02, 0.02), rng.range(-0.04, 0.04), rng.range(-0.03, 0.05));
      const legPairs = arch.legs[1] > 0 ? rng.int(Math.ceil(arch.legs[0] / 2), Math.floor(arch.legs[1] / 2)) : 0;
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
          bodyLen: rng.range(arch.bodyLen[0], arch.bodyLen[1]) * sizeMul,
          bodyRad: rng.range(arch.bodyRad[0], arch.bodyRad[1]) * sizeMul,
          legCount: legPairs * 2,
          legLen: rng.range(0.5, 0.8) * sizeMul * (arch.legs[1] > 0 ? 1 : 0),
          neckLen: rng.range(arch.neck[0], arch.neck[1]) * sizeMul,
          headRad: rng.range(arch.head[0], arch.head[1]) * sizeMul,
          tailLen: rng.range(arch.tail[0], arch.tail[1]) * sizeMul,
          tempo: rng.range(arch.tempo[0], arch.tempo[1]),
          hover: rng.range(arch.hover[0], arch.hover[1]),
          colorHex: '#' + indiv.getHexString(),
          accentHex: '#' + profile.groundAccentColor.getHexString(),
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
