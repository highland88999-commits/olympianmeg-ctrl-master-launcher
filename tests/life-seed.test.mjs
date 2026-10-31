// tests/life-seed.test.mjs
// The Life-Seed Foundation: deterministic flora, fauna, ecosystems.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateLifeSeed,
  lifeSeedFromParams,
  FLORA_KINDS,
  FAUNA_ARCHETYPES,
} from '../lib/world-engine/life-seed.js';

describe('life-seed foundation', () => {
  it('is deterministic — same seed grows the same world', () => {
    const a = generateLifeSeed('Amber-Lagoon-742', 'terran-biosphere');
    const b = generateLifeSeed('Amber-Lagoon-742', 'terran-biosphere');
    assert.deepEqual(a, b);
  });

  it('different seeds grow different worlds', () => {
    const a = generateLifeSeed('Amber-Lagoon-742', 'terran-biosphere');
    const b = generateLifeSeed('Crimson-Deep-913', 'terran-biosphere');
    assert.notDeepEqual(a, b);
  });

  it('grows 3-5 flora kinds from the canonical taxonomy', () => {
    const life = generateLifeSeed('Test-Seed-001', 'fungal-network');
    assert.ok(life.flora.length >= 3 && life.flora.length <= 5,
      `flora count ${life.flora.length} out of range`);
    for (const f of life.flora) {
      assert.ok(FLORA_KINDS.includes(f.kind), `unknown flora kind: ${f.kind}`);
      assert.ok(/^#[0-9a-f]{6}$/.test(f.color), `bad color: ${f.color}`);
      assert.ok(f.density >= 0.2 && f.density <= 0.9, `bad density: ${f.density}`);
      assert.ok(f.elevMin < f.elevMax, 'elevation band inverted');
    }
    // fungal-network should favor fungal kinds
    const kinds = life.flora.map((f) => f.kind);
    assert.ok(kinds.includes('fungal-cap') || kinds.includes('glow-moss'),
      `fungal world grew no fungal flora: ${kinds.join(',')}`);
  });

  it('grows 3-6 fauna archetypes — ten total, exceeding the built-in six', () => {
    assert.equal(FAUNA_ARCHETYPES.length, 10, 'must exceed built-in 6');
    // The four beyond built-ins
    for (const a of ['darter', 'leviathan', 'weaver', 'mimic']) {
      assert.ok(FAUNA_ARCHETYPES.includes(a), `missing beyond-built-in: ${a}`);
    }
    const life = generateLifeSeed('Test-Seed-002', 'hive-insectoid');
    assert.ok(life.fauna.length >= 3 && life.fauna.length <= 6,
      `fauna count ${life.fauna.length} out of range`);
    for (const f of life.fauna) {
      assert.ok(FAUNA_ARCHETYPES.includes(f.archetype), `unknown: ${f.archetype}`);
      assert.ok(f.bauplan, 'missing bauplan');
      assert.ok(f.bauplan.limbCount >= 0 && f.bauplan.limbCount <= 8, 'bad limbs');
      assert.ok(f.count >= 4 && f.count <= 24, `bad count: ${f.count}`);
    }
  });

  it('life type shapes the ecosystem — silicon worlds grow crystals', () => {
    const life = generateLifeSeed('Test-Seed-003', 'silicon-crystal');
    const kinds = life.flora.map((f) => f.kind);
    assert.ok(kinds.includes('crystal-shard'),
      `silicon world grew no crystals: ${kinds.join(',')}`);
  });

  it('ecosystems cover three elevation regions', () => {
    const life = generateLifeSeed('Test-Seed-004', 'terran-biosphere');
    assert.equal(life.ecosystems.length, 3);
    const regions = life.ecosystems.map((e) => e.region);
    assert.deepEqual(regions, ['lowlands', 'midlands', 'highlands']);
    for (const e of life.ecosystems) {
      assert.ok(Array.isArray(e.flora) && Array.isArray(e.fauna), 'missing assignments');
      assert.ok(e.density > 0 && e.density <= 1, `bad density: ${e.density}`);
    }
  });

  it('falls back to terran-biosphere for unknown life types', () => {
    const life = generateLifeSeed('Test-Seed-005', 'not-a-real-type');
    assert.ok(life.flora.length > 0 && life.fauna.length > 0, 'empty fallback');
  });

  it('lifeSeedFromParams derives from world params, null without seed', () => {
    assert.equal(lifeSeedFromParams(null), null);
    assert.equal(lifeSeedFromParams({}), null);
    assert.equal(lifeSeedFromParams({ seed: '' }), null);
    const life = lifeSeedFromParams({ seed: 'Amber-Lagoon-742', lifeType: 'ammonia-aquatic' });
    assert.ok(life && life.flora.length > 0, 'no life derived');
    // Same as direct generation
    assert.deepEqual(life, generateLifeSeed('Amber-Lagoon-742', 'ammonia-aquatic'));
  });
});
