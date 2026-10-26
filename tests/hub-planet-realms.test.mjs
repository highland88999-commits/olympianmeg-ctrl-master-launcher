// Planet Program (Merlin, 2026-10-22) — Parts 1–3 pins:
//  1. Quantum realm OFF on hub Earth via the single flag
//     (lib/earth/quantum.js), entry points gated, code intact.
//  2. Canonical planet seeds + distinct life types for every hub
//     planet (lib/planets/planet-seeds.js); no dinosaurs anywhere;
//     user-forged worlds derive a lifeType from the same taxonomy
//     WITHOUT disturbing the original derived fields.
//  3. Street-level click for all planets: profile generation
//     (deterministic, Mars-shaped) + the planet_surface wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PLANETS } from '../lib/god-orbits.js';
import {
  LIFE_TYPES,
  PLANET_SEEDS,
  PLANET_SEED_LIST,
  planetSeedFor,
  isLifeType,
} from '../lib/planets/planet-seeds.js';
import { generatePlanetProfile, hasPlanetDesign } from '../lib/planets/profiles.js';
import { generateWorldParams, DERIVED_KEYS } from '../lib/world-engine/world-seed.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const OUTER_KEYS = PLANETS.map((p) => p.key);
const ALL_KEYS = [...OUTER_KEYS, 'mars', 'earth'];

// ---------- Part 2: the seed registry ----------

test('registry covers every hub planet: the 8 orbit planets + mars + earth', () => {
  assert.equal(PLANET_SEED_LIST.length, ALL_KEYS.length);
  for (const key of ALL_KEYS) {
    const entry = planetSeedFor(key);
    assert.ok(entry, `missing seed entry for ${key}`);
    assert.equal(entry.key, key);
    assert.ok(isLifeType(entry.lifeType), `${key} lifeType not in taxonomy`);
    assert.ok(entry.lifeLabel && entry.lifeLabel.length > 3, `${key} needs a lifeLabel`);
  }
  assert.equal(planetSeedFor('pluto'), null);
});

test('seeds are mint-style Word-Word-NNN and unique per planet', () => {
  const seen = new Set();
  for (const e of PLANET_SEED_LIST) {
    assert.match(e.seed, /^[A-Z][a-z]+-[A-Z][a-z]+-\d{3}$/, `${e.key} seed ${e.seed} not mint-style`);
    assert.ok(!seen.has(e.seed), `duplicate seed ${e.seed}`);
    seen.add(e.seed);
  }
});

test('life types are all different in kind — and none are dinosaurs', () => {
  const types = PLANET_SEED_LIST.map((e) => e.lifeType);
  assert.equal(new Set(types).size, types.length, 'life types must be unique per planet');
  for (const e of PLANET_SEED_LIST) {
    const blob = `${e.lifeType} ${e.lifeLabel} ${e.seed}`.toLowerCase();
    assert.ok(!blob.includes('dino'), `dinosaurs are Phase-2-Earth only: ${e.key}`);
  }
  assert.equal(planetSeedFor('earth').lifeType, 'terran-biosphere');
  assert.equal(planetSeedFor('neptune').lifeType, 'ammonia-aquatic');
  assert.equal(planetSeedFor('venus').lifeType, 'chemosynthetic-deep');
  assert.equal(planetSeedFor('mercury').lifeType, 'radiotroph');
  assert.equal(planetSeedFor('mars').lifeType, 'microbial-mat');
});

// ---------- Part 2b: user worlds derive a lifeType ----------

test('user worlds derive a taxonomy lifeType, deterministically', () => {
  assert.ok(DERIVED_KEYS.includes('lifeType'));
  for (const seed of ['Amber-Lagoon-742', 'Cobalt-Tundra-101', 'Velvet-Falls-999', 'Xenon-Quarry-007']) {
    const a = generateWorldParams(seed);
    const b = generateWorldParams(seed);
    assert.deepEqual(a, b, 'same seed must derive the same world');
    assert.ok(isLifeType(a.lifeType), `${seed} lifeType ${a.lifeType} outside taxonomy`);
    assert.ok(!a.lifeType.includes('dino'));
  }
});

test('lifeType derivation did NOT perturb the original derived fields (stability pins)', () => {
  // Captured from generateWorldParams BEFORE the lifeType draw was
  // appended (it draws last, after weatherType). If a future edit
  // reorders the draws, these change — that is the alarm working.
  assert.deepEqual(generateWorldParams('Amber-Lagoon-742'), {
    terrainType: 'alien', terrainRoughness: 0.46, sunColor: '#af5cc8',
    atmosphereDensity: 0.13, ambientLightIntensity: 0.42, weatherType: 'rain',
    lifeType: 'radiotroph',
  });
  assert.deepEqual(generateWorldParams('Cobalt-Tundra-101'), {
    terrainType: 'plains', terrainRoughness: 0.39, sunColor: '#79e9f3',
    atmosphereDensity: 0.96, ambientLightIntensity: 0.57, weatherType: 'clear',
    lifeType: 'fungal-network',
  });
  assert.deepEqual(generateWorldParams('Velvet-Falls-999'), {
    terrainType: 'desert', terrainRoughness: 0.32, sunColor: '#4c8cd9',
    atmosphereDensity: 0.4, ambientLightIntensity: 1.52, weatherType: 'clear',
    lifeType: 'photosynthetic-titan',
  });
});

// ---------- Part 1: quantum REMOVED (Merlin, 2026-10-26) ----------

test('the quantum flag module is DELETED and nothing imports it', () => {
  assert.throws(() => read('lib/earth/quantum.js'), /ENOENT/);
  for (const f of ['app/page.jsx', 'components/EarthConsole.jsx', 'components/NexusEarth.jsx', 'components/HomeScene.jsx']) {
    assert.ok(!read(f).includes('QUANTUM_ENABLED'), `${f} must not reference the quantum flag`);
  }
});

test('quantum ENTRY points are GONE (console door, parachute, scene mounts, gate)', () => {
  const page = read('app/page.jsx');
  assert.ok(!page.includes('parachuteTo'), 'no parachute funnel in the page');
  assert.ok(!page.includes('onDropToTile'), 'no drop-to-tile prop in the page');

  const consoleSrc = read('components/EarthConsole.jsx');
  assert.ok(!consoleSrc.includes('onDropToTile'), 'no drop-to-tile prop in the console');
  assert.ok(!consoleSrc.includes('Quantum Realm'), 'no Quantum Realm text in the console');

  const nexus = read('components/NexusEarth.jsx');
  assert.ok(!nexus.includes('QuantumSkyDome'), 'no quantum sky mount in NexusEarth');
  assert.ok(!nexus.includes('MicroGroundDisc'), 'no quantum floor mount in NexusEarth');

  const home = read('components/HomeScene.jsx');
  assert.ok(!home.includes('QuantumGate'), 'no gate component in HomeScene');
});

test('quantum code IS deleted — the realm modules are gone, the street modules survive', () => {
  assert.throws(() => read('components/QuantumSkyDome.jsx'), /ENOENT/);
  const parachute = read('lib/earth/parachute.js');
  assert.ok(parachute.includes('bikeState'), 'bike state survives the removal');
  assert.ok(parachute.includes('carState'), 'car state survives the removal');
  assert.ok(parachute.includes('climbState'), 'climb state survives the removal');
  assert.ok(!parachute.includes('parachuteState'), 'shrink state is gone');
  assert.ok(!parachute.includes('beginParachuteDive'), 'shrink entry is gone');
  const nexus = read('components/NexusEarth.jsx');
  assert.ok(nexus.includes('<ProceduralEarthGlobe'), 'the globe survives');
  assert.ok(nexus.includes('<EarthWalker'), 'the walker survives');
  assert.ok(read('components/StreetGroundPatch.jsx').includes('export default function StreetGroundPatch'),
    'the street patch survives');
  assert.ok(!read('components/StreetGroundPatch.jsx').includes('MicroGroundDisc'),
    'MicroGroundDisc module is gone');
});

test('EARTH SEED ISOLATION: no Earth dive/roam file reads the planet seed registry', () => {
  // Earth's seed is descriptive harmony only. The ONLY Earth file
  // allowed to import planet-seeds is EarthConsole (one display
  // line in its header). Terrain, roam, collision, rendering and
  // the dive state machine must stay seed-free.
  const earthPathFiles = [
    'components/NexusEarth.jsx',
    'components/EarthWalker.jsx',
    'components/EarthAssets.jsx',
    'components/EarthFlightController.jsx',
    'components/EarthInteriorRoom.js',
    'lib/earth/roam.js',
    'lib/earth/parachute.js',
    'lib/earth/placements.js',
    'lib/earth/collision.js',
    'lib/earth/interiors.js',
    'lib/earth/heightmap.js',
    'lib/earth/lens.js',
  ];
  for (const f of earthPathFiles) {
    assert.ok(!read(f).includes('planet-seeds'), `${f} must not import the planet seed registry`);
  }
  const consoleSrc = read('components/EarthConsole.jsx');
  assert.match(consoleSrc, /planetSeedFor\('earth'\)/);
});

// ---------- Part 3: profiles + planet_surface wiring ----------

test('every outer planet has a design and a deterministic, Mars-shaped profile', () => {
  for (const key of OUTER_KEYS) {
    assert.ok(hasPlanetDesign(key), `${key} missing PLANET_DESIGN`);
    const entry = planetSeedFor(key);
    const planet = PLANETS.find((p) => p.key === key);
    const a = generatePlanetProfile(entry, planet);
    const b = generatePlanetProfile(entry, planet);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)),
      `${key} profile must be deterministic`);
    assert.equal(a.planetKey, key);
    assert.equal(a.lifeType, entry.lifeType);
    assert.ok(a.worldName && a.worldName.length > 2);
    assert.equal(a.seed, entry.seed);
    // buildWorld needs both basin types present:
    const kinds = new Set(a.basins.map((x) => x.type));
    assert.ok(kinds.has('water') && kinds.has('mercury'), `${key} basins must include water + mercury`);
    // Species catalog: one Mars-shaped record per niche, named and
    // voiced after the planet's life type:
    for (const niche of ['airborne', 'grazer', 'carnivore', 'waterBorne', 'mercuryBorne']) {
      const s = a.speciesCatalog[niche];
      assert.ok(s && typeof s === 'object', `${key} speciesCatalog.${niche}`);
      assert.ok(typeof s.name === 'string' && s.name.length > 2, `${key} ${niche} name`);
      assert.ok(typeof s.niche === 'string' && typeof s.diet === 'string', `${key} ${niche} voice`);
      assert.ok(s.scale > 0, `${key} ${niche} scale`);
      assert.match(s.primaryColor, /^#[0-9a-f]{6}$/i, `${key} ${niche} color`);
    }
    assert.ok(a.counts && a.counts.flora > 0, `${key} counts`);
    assert.ok(!JSON.stringify(a).toLowerCase().includes('dino'), `${key} profile must be dinosaur-free`);
  }
});

test('planet_surface wiring: PlanetBody click, page state, console mount', () => {
  const home = read('components/HomeScene.jsx');
  assert.match(home, /const inPlanet = appState === 'planet_surface';/);
  assert.match(home, /<PlanetRealmContent/);
  assert.match(home, /<BackdropPlanets onPlanetSelect=\{appState === 'hub_freeroam' \? beginPlanetDive : null\} \/>/);
  assert.match(home, /onClick=\{onSelect \? \(e\) => \{ e\.stopPropagation\(\); onSelect\(planet\.key\); \} : undefined\}/);

  const page = read('app/page.jsx');
  assert.match(page, /const beginPlanetDive = \(key\) => \{/);
  assert.match(page, /setAppState\('planet_surface'\)/);
  assert.match(page, /appState === 'planet_surface' && planetProfile && planetSeedEntry/);
  assert.match(page, /appState === 'planet_surface'\) return;/, 'pointer handler must idle in planet_surface');

  const consoleSrc = read('components/PlanetConsole.jsx');
  assert.match(consoleSrc, /RETURN TO ORBIT/);
  assert.match(consoleSrc, /WALK/);
  assert.match(consoleSrc, /FLY/);
  assert.match(consoleSrc, /lifeLabel/);

  const wrapper = read('components/planets/PlanetRealmContent.jsx');
  assert.match(wrapper, /MarsRealmContent/);
});

test('Mars realm files are untouched by the generalization', () => {
  const marsScene = read('components/mars/MarsScene.jsx');
  assert.match(marsScene, /export function MarsRealmContent/);
  const marsConsole = read('components/MarsConsole.jsx');
  assert.match(marsConsole, /MARS/);
});
