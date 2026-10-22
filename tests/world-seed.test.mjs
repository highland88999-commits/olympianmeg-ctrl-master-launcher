// tests/world-seed.test.mjs
// The World Seed (Merlin, 2026-10-22): every forged world carries a
// human-readable seed inside generation_params (lib/world-engine/
// world-seed.js). The seed deterministically derives the world's look
// (terrainType, terrainRoughness, sunColor, atmosphereDensity,
// ambientLightIntensity, weatherType — the EARTH_ENTRY field names):
// - same seed -> identical params, always (determinism is the feature)
// - creation stamps a minted seed WITHOUT repainting the forged world
//   (stampSeed fills only the fields the world does not already carry)
// - an explicit seed edit REGENERATES the derived fields (withSeed)
// - reads borrow missing derived fields from the seed and leave
//   unseeded worlds untouched (fillDerivedFromSeed)
// - the seed surfaces in the Communiverse serializers, the profile
//   creations feed, the forge, the world page and the profile cards —
//   and the seed-edit route is owner-only, like publish and direct.
//
// Run: node --test tests/world-seed.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SEED_KEY,
  DERIVED_KEYS,
  readSeed,
  generateWorldParams,
  stampSeed,
  withSeed,
  fillDerivedFromSeed,
  mintWorldSeed,
} from '../lib/world-engine/world-seed.js';
import { VALID_TERRAIN, VALID_WEATHER } from '../lib/world-engine/aesthetic.js';
import { publicWorldFields, EARTH_ENTRY } from '../lib/communiverse.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

const derivedOf = (params) => {
  const out = {};
  for (const k of DERIVED_KEYS) out[k] = params[k];
  return out;
};

describe('generateWorldParams — deterministic derivation', () => {
  it('produces the identical params object for the same seed', () => {
    const a = generateWorldParams('Amber-Lagoon-742');
    const b = generateWorldParams('Amber-Lagoon-742');
    assert.deepEqual(a, b);
    assert.deepEqual(Object.keys(a).sort(), [...DERIVED_KEYS].sort());
  });

  it('produces different params for different seeds', () => {
    const a = generateWorldParams('Amber-Lagoon-742');
    const b = generateWorldParams('Cobalt-Tundra-101');
    assert.notDeepEqual(a, b);
  });

  it('stays inside the renderers vocabulary and clamps', () => {
    for (const seed of ['Amber-Lagoon-742', 'x', 'MARS-PRIME', 'Velvet-Falls-999', 'Obsidian-Reef-100']) {
      const p = generateWorldParams(seed);
      assert.ok(VALID_TERRAIN.includes(p.terrainType), `terrainType for ${seed}`);
      assert.ok(VALID_WEATHER.includes(p.weatherType), `weatherType for ${seed}`);
      assert.match(p.sunColor, /^#[0-9a-f]{6}$/i);
      assert.ok(p.terrainRoughness >= 0.1 && p.terrainRoughness <= 1.0);
      assert.ok(p.atmosphereDensity >= 0 && p.atmosphereDensity <= 1.0);
      assert.ok(p.ambientLightIntensity >= 0.1 && p.ambientLightIntensity <= 2.0);
    }
  });
});

describe('readSeed', () => {
  it('reads the seed and returns null when there is none', () => {
    assert.equal(SEED_KEY, 'seed');
    assert.equal(readSeed({ seed: 'Amber-Lagoon-742' }), 'Amber-Lagoon-742');
    assert.equal(readSeed({}), null);
    assert.equal(readSeed(null), null);
    assert.equal(readSeed(undefined), null);
    assert.equal(readSeed({ seed: '' }), null);
    assert.equal(readSeed({ seed: '   ' }), null);
    assert.equal(readSeed({ seed: 42 }), null);
    assert.equal(readSeed('seed'), null);
  });
});

describe('withSeed — an explicit seed edit regenerates', () => {
  it('regenerates the derived fields from the new seed', () => {
    const before = { terrainType: 'desert', terrainRoughness: 0.99, custom: 'keep-me' };
    const after = withSeed(before, 'Cobalt-Tundra-101');
    assert.deepEqual(derivedOf(after), generateWorldParams('Cobalt-Tundra-101'));
    assert.equal(readSeed(after), 'Cobalt-Tundra-101');
    // non-derived keys survive untouched
    assert.equal(after.custom, 'keep-me');
    // the original object is not mutated
    assert.equal(before.terrainType, 'desert');
    assert.equal(readSeed(before), null);
  });

  it('round-trips: readSeed(withSeed(params, s)) === s', () => {
    for (const s of ['Amber-Lagoon-742', 'a', 'Any user-typed seed!']) {
      assert.equal(readSeed(withSeed({}, s)), s);
      assert.equal(readSeed(withSeed(null, s)), s);
    }
  });

  it('keeps the Communiverse marker riding along', () => {
    const params = { communiverse: { published: true, at: '2026-10-22T00:00:00.000Z' } };
    const after = withSeed(params, 'Jade-Vale-555');
    assert.deepEqual(after.communiverse, { published: true, at: '2026-10-22T00:00:00.000Z' });
  });

  it('an unusable seed changes nothing', () => {
    const params = { terrainType: 'ocean' };
    assert.deepEqual(withSeed(params, ''), params);
    assert.deepEqual(withSeed(params, '   '), params);
    assert.deepEqual(withSeed(params, null), params);
  });
});

describe('stampSeed — creation fills gaps, never repaints', () => {
  it('keeps fields the world already carries, fills the missing ones', () => {
    const forged = { terrainType: 'desert', sunColor: '#123456' };
    const stamped = stampSeed(forged, 'Amber-Lagoon-742');
    assert.equal(stamped.terrainType, 'desert'); // the forge's own look wins
    assert.equal(stamped.sunColor, '#123456');
    const derived = generateWorldParams('Amber-Lagoon-742');
    assert.equal(stamped.weatherType, derived.weatherType); // missing -> from the seed
    assert.equal(stamped.terrainRoughness, derived.terrainRoughness);
    assert.equal(readSeed(stamped), 'Amber-Lagoon-742');
    assert.equal(readSeed(forged), null); // not mutated
  });
});

describe('fillDerivedFromSeed — read-time resolution', () => {
  it('borrows missing derived fields from the seed, keeps carried ones', () => {
    const params = { seed: 'Amber-Lagoon-742', terrainType: 'ocean' };
    const filled = fillDerivedFromSeed(params);
    assert.equal(filled.terrainType, 'ocean');
    assert.deepEqual(
      { ...generateWorldParams('Amber-Lagoon-742'), terrainType: 'ocean' },
      derivedOf(filled)
    );
    assert.equal(readSeed(filled), 'Amber-Lagoon-742');
  });

  it('returns unseeded worlds exactly as they were', () => {
    const params = { terrainType: 'alien', terrainRoughness: 0.4 };
    assert.equal(fillDerivedFromSeed(params), params); // same reference, untouched
    assert.equal(fillDerivedFromSeed(null), null);
    assert.equal(fillDerivedFromSeed(undefined), undefined);
  });
});

describe('mintWorldSeed', () => {
  it('mints two-word-plus-number seeds in the house format', () => {
    for (let i = 0; i < 100; i++) {
      assert.match(mintWorldSeed(), /^[A-Z][a-z]+-[A-Z][a-z]+-\d{3}$/);
    }
  });

  it('every minted seed derives a full world', () => {
    const p = generateWorldParams(mintWorldSeed());
    assert.deepEqual(Object.keys(p).sort(), [...DERIVED_KEYS].sort());
  });
});

describe('serializers surface the seed', () => {
  it('publicWorldFields exposes seed and seed-resolved params', () => {
    const asset = {
      id: 'w1', user_id: 'owner-1', display_name: 'Kepler', category: 'world',
      generation_params: { seed: 'Amber-Lagoon-742', terrainType: 'ocean' },
      prompt: null, created_at: null,
    };
    const w = publicWorldFields(asset);
    assert.equal(w.seed, 'Amber-Lagoon-742');
    assert.equal(w.generation_params.terrainType, 'ocean'); // carried wins
    assert.equal(w.generation_params.weatherType, generateWorldParams('Amber-Lagoon-742').weatherType); // filled
    assert.equal(w.generation_params.seed, 'Amber-Lagoon-742');
  });

  it('unseeded worlds and Earth carry no seed', () => {
    const w = publicWorldFields({ id: 'w2', generation_params: { terrainType: 'desert' } });
    assert.equal(w.seed, null);
    assert.equal(EARTH_ENTRY.seed, null);
  });
});

describe('wiring (source pins)', () => {
  it('the seed-edit route is owner-only and regenerates via withSeed', () => {
    const route = read('app/api/communiverse/world/[id]/route.js');
    assert.ok(route.includes('export const POST'), 'world route gains a POST');
    assert.ok(route.includes('Only the owner of a world can change its seed.'));
    assert.ok(route.includes('withSeed(asset.generation_params, seed)'));
    assert.ok(route.includes("seed.length > 64"), 'seed length is validated');
    assert.ok(route.includes("Give the world a seed first."));
  });

  it('the forge stamps a minted seed onto new worlds only', () => {
    const forge = read('components/world-engine/ForgeSector.jsx');
    assert.ok(forge.includes('mintWorldSeed'));
    assert.ok(forge.includes("category === 'world' && !readSeed(finalParams)"));
    assert.ok(forge.includes('stampSeed(finalParams, mintWorldSeed())'));
    assert.ok(forge.includes('generation_params: finalParams'));
  });

  it('the profile creations feed resolves the seed server-side', () => {
    const route = read('app/api/profiles/[id]/creations/route.js');
    assert.ok(route.includes("a.category === 'world' ? readSeed(a.generation_params) : null"));
    const helpers = read('lib/auction/helpers.js');
    assert.ok(helpers.includes('seed: a.seed ?? null'));
  });

  it('the world page shows the seed to everyone and the panel to the owner', () => {
    const page = read('app/communiverse/world/[id]/page.jsx');
    assert.ok(page.includes('World seed:'));
    assert.ok(page.includes('id="world-seed"'));
    assert.ok(page.includes('mintWorldSeed'));
    assert.ok(page.includes('applySeed(seedInput)'));
    assert.ok(page.includes("method: 'POST'"));
  });

  it('profile world cards show the seed and link to its panel', () => {
    const mine = read('components/profile/MyCreations.jsx');
    assert.ok(mine.includes('asset.seed'));
    assert.ok(mine.includes('Edit seed'));
    assert.ok(mine.includes("'#world-seed'"));
  });
});
