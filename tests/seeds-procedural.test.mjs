// tests/seeds-procedural.test.mjs
// Merlin's enforcement order (2026-10-22): "Make sure all world seeds
// use procedural generation." This suite pins the guarantee:
// - every canonical planet seed grows its surface profile through
//   generatePlanetProfile — a pure function of the seed (same seed in,
//   same world out, every time) whose profile echoes the seed it grew
//   from and carries the registry life type;
// - user-world params (generateWorldParams) derive deterministically
//   from their seed and always carry a lifeType from the taxonomy;
// - Mars grows from its canonical seed through generateMarsProfile,
//   deterministically;
// - the Communiverse Earth entry carries Earth's canonical seed
//   (Azure-Harbor-001) as identity — Earth itself is never generated
//   from it (that isolation is pinned in hub-planet-realms);
// - source pins: no Math.random anywhere in the seed-driven
//   generators; in world-seed.js it may appear ONLY inside
//   mintWorldSeed (minting a brand-new seed string is the one place
//   randomness belongs).
//
// Run: node --test tests/seeds-procedural.test.mjs   (from repo root)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PLANETS } from '../lib/god-orbits.js';
import {
  PLANET_SEED_LIST,
  planetSeedFor,
  isLifeType,
} from '../lib/planets/planet-seeds.js';
import { generatePlanetProfile } from '../lib/planets/profiles.js';
import { generateWorldParams } from '../lib/world-engine/world-seed.js';
import { generateMarsProfile } from '../lib/mars/engine.js';
import { EARTH_ENTRY } from '../lib/communiverse.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
// Profiles hold THREE.Color instances; compare their serialized form —
// the same trick tests/hub-planet-realms.test.mjs uses.
const frozen = (v) => JSON.parse(JSON.stringify(v));

test('every canonical planet seed procedurally generates its profile, deterministically', () => {
  assert.ok(PLANET_SEED_LIST.length >= 10, 'registry covers every hub world');
  for (const entry of PLANET_SEED_LIST) {
    const planet = PLANETS.find((p) => p.key === entry.key) || { key: entry.key };
    const a = generatePlanetProfile(entry, planet);
    const b = generatePlanetProfile(entry, planet);
    assert.deepEqual(frozen(a), frozen(b), `${entry.key}: same seed must grow the same world`);
    assert.equal(a.seed, entry.seed, `${entry.key}: profile echoes the seed it grew from`);
    assert.equal(a.lifeType, entry.lifeType, `${entry.key}: profile carries the registry life type`);
  }
  // Note: Earth's entry is exercised here only to prove the generator
  // is a pure function of the seed. The app NEVER generates Earth from
  // it — Earth is real (see the EARTH_ENTRY pin below).
});

test('user-world params derive deterministically from the seed, always with a taxonomy lifeType', () => {
  const seen = new Set();
  for (let i = 1; i <= 120; i += 1) {
    const seed = `Procedural-Probe-${String(i).padStart(3, '0')}`;
    const a = generateWorldParams(seed);
    const b = generateWorldParams(seed);
    assert.deepEqual(a, b, `${seed}: same seed, same params`);
    assert.ok(isLifeType(a.lifeType), `${seed}: lifeType '${a.lifeType}' is in the taxonomy`);
    seen.add(a.lifeType);
  }
  assert.ok(seen.size >= 6, `expected a spread of life types across seeds, saw ${seen.size}`);
});

test('Mars grows from its canonical seed, deterministically', () => {
  const mars = planetSeedFor('mars');
  const a = generateMarsProfile(mars.seed);
  const b = generateMarsProfile(mars.seed);
  assert.deepEqual(frozen(a), frozen(b), 'same Mars seed, same Mars');
});

test('the Communiverse Earth entry carries the canonical Earth seed', () => {
  assert.equal(EARTH_ENTRY.seed, planetSeedFor('earth').seed);
  assert.equal(EARTH_ENTRY.seed, 'Azure-Harbor-001');
});

test('source pins: the seed-driven generators never touch Math.random', () => {
  const pureFiles = [
    'lib/planets/planet-seeds.js',
    'lib/planets/profiles.js',
    'lib/mars/engine.js',
    'lib/earth/heightmap.js',
    'lib/earth/placements.js',
    'lib/earth/interiors.js',
    'lib/earth/aether.js',
    'lib/earth/street-patch.js',
    'lib/world-engine/world-builder.js',
  ];
  for (const f of pureFiles) {
    assert.ok(!read(f).includes('Math.random'), `${f} must stay seed-pure`);
  }
});

test('source pin: in world-seed.js, Math.random lives only inside mintWorldSeed', () => {
  const src = read('lib/world-engine/world-seed.js');
  const mintAt = src.indexOf('export function mintWorldSeed');
  assert.ok(mintAt > 0, 'mintWorldSeed exists');
  assert.ok(
    !src.slice(0, mintAt).includes('Math.random'),
    'no Math.random anywhere before the minter',
  );
  assert.ok(
    src.slice(mintAt).includes('Math.random'),
    'the minter is the one place randomness belongs',
  );
});
