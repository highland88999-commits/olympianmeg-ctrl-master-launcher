// tests/earth2-staged-objects.test.mjs
// Staged Earth 1 objects on Earth 2: free parcels only, realm-proportional scales.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGED_SCALE_CAPS,
  scaleForRealm,
  stagedPlacements,
  stagedPlacementCount,
  stagedColliders,
  allOnFreeParcels,
} from '../lib/earth2/staged-objects.js';
import { STAGED_OBJECTS, STAGED_COUNT } from '../lib/earth2/staged-objects-data.js';
import { isOwnableIndex } from '../lib/earth2/parcels.js';

describe('staged object data', () => {
  it('holds all 1,884 staged objects', () => {
    assert.equal(STAGED_COUNT, 1884);
    assert.equal(STAGED_OBJECTS.length, 1884);
  });
});

describe('scaleForRealm', () => {
  it('keeps fitting scales untouched', () => {
    assert.equal(scaleForRealm(12, 'vegetation'), 12);
    assert.equal(scaleForRealm(12, 'building'), 12);
  });
  it('caps landmarks at castle scale (40 m)', () => {
    assert.equal(scaleForRealm(828, 'landmark'), 40);
    assert.equal(scaleForRealm(96, 'landmark'), 40);
    assert.equal(scaleForRealm(30, 'landmark'), 30);
  });
  it('caps terrain features at 50 m', () => {
    assert.equal(scaleForRealm(3776, 'terrain'), 50);
    assert.equal(scaleForRealm(6, 'terrain'), 6);
  });
  it('defaults missing scales to 3 m', () => {
    assert.equal(scaleForRealm(null, 'aether'), 3);
    assert.equal(scaleForRealm(0, 'aether'), 3);
  });
});

describe('stagedPlacements', () => {
  it('places all 1,884 objects', () => {
    assert.equal(stagedPlacementCount(), 1884);
  });
  it('every placement is on a Free Commons parcel (never ownable)', () => {
    assert.ok(allOnFreeParcels());
    for (const p of stagedPlacements()) {
      assert.ok(!isOwnableIndex(p.parcelIndex), `${p.key} on ownable ${p.parcelId}`);
    }
  });
  it('is deterministic across calls', () => {
    const a = stagedPlacements();
    const b = stagedPlacements();
    assert.equal(a[0].parcelId, b[0].parcelId);
    assert.equal(a[1000].parcelId, b[1000].parcelId);
  });
  it('parcelIds are valid E2-XXXX', () => {
    for (const p of stagedPlacements().slice(0, 100)) {
      assert.match(p.parcelId, /^E2-\d{4}$/);
    }
  });
  it('every non-aether object has a solid collider (SOLID LAW)', () => {
    const colliders = stagedColliders();
    const placements = stagedPlacements();
    const solidCount = placements.filter((p) => p.category !== 'aether').length;
    assert.equal(colliders.length, solidCount);
    for (const c of colliders) {
      assert.ok(Number.isFinite(c.x) && Number.isFinite(c.z), 'finite x/z');
      assert.ok(Number.isFinite(c.r) && c.r > 0, 'positive radius');
    }
  });
});

describe('headingDeg — a deliberate 0 is a heading, not a missing value (Merlin, 2026-11-14)', () => {
  it('ladders and elevators face 0, every time (not randomized)', () => {
    const placements = stagedPlacements();
    const fixed = placements.filter((p) => p.key.includes(':ladder:') || p.key.includes(':elevator:'));
    assert.ok(fixed.length > 0, 'there are ladder/elevator placements to check');
    for (const p of fixed) {
      assert.equal(p.headingDeg, 0, `${p.key} must face 0 (its door faces the monument entrance)`);
    }
    // And it is stable across calls — the old `||` code randomized
    // a 0 (0 is falsy), so the same ladder faced a different way
    // on every load.
    const again = stagedPlacements();
    for (let i = 0; i < placements.length; i++) {
      assert.equal(again[i].headingDeg, placements[i].headingDeg, `${placements[i].key} heading must be deterministic`);
    }
  });
});
