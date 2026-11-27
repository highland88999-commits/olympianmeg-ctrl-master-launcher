// tests/asteroid-belt.test.mjs
// Headless tests for lib/asteroid-belt.js — the belt's seeded
// generation, moved verbatim from components/AsteroidField.jsx
// (Nov 27, 2026) so the renderer, the hub colliders and the baseball
// bounce set all read the same rocks.
// Run: node --test tests/asteroid-belt.test.mjs (from the repo root).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeBelt, makeRng, asteroidPositionAt } from '../lib/asteroid-belt.js';
import {
  ASTEROID_CENTER,
  ASTEROID_COUNT,
  ASTEROID_FIELD_RADIUS,
} from '../lib/hub-layout.js';

const approx = (actual, expected, tol, label) => {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: got ${actual}, want ${expected} ± ${tol}`);
};

describe('makeBelt', () => {
  it('builds 90 rocks', () => {
    assert.equal(makeBelt().length, ASTEROID_COUNT);
    assert.equal(ASTEROID_COUNT, 90);
  });

  it('is deterministic: two builds are identical', () => {
    assert.deepEqual(makeBelt(), makeBelt());
  });

  it('pins the first rock (the seed + draw order are the belt’s identity)', () => {
    const r0 = makeBelt()[0];
    approx(r0.anchor.x, -99.8606, 0.001, 'rock0 anchor x');
    approx(r0.anchor.y, 19.1006, 0.001, 'rock0 anchor y');
    approx(r0.anchor.z, -347.9995, 0.001, 'rock0 anchor z');
    approx(r0.radius, 2.6427, 0.001, 'rock0 radius');
    approx(r0.driftAmp, 7.7777, 0.001, 'rock0 driftAmp');
  });

  it('anchors sit inside the flattened disc around the field centre', () => {
    for (const rock of makeBelt()) {
      const dx = rock.anchor.x - ASTEROID_CENTER.x;
      const dz = rock.anchor.z - ASTEROID_CENTER.z;
      assert.ok(Math.hypot(dx, dz) <= ASTEROID_FIELD_RADIUS, 'anchor inside disc');
      assert.ok(Math.abs(rock.anchor.y - ASTEROID_CENTER.y) <= 35, 'anchor y within ±35');
    }
  });

  it('radii stay in the generated range', () => {
    for (const rock of makeBelt()) {
      assert.ok(rock.radius >= 2.2 && rock.radius <= 9.2, `radius ${rock.radius}`);
    }
  });

  it('spin axes are unit vectors', () => {
    for (const rock of makeBelt()) {
      const l = Math.hypot(rock.spinAxis.x, rock.spinAxis.y, rock.spinAxis.z);
      approx(l, 1, 1e-9, 'spin axis unit');
    }
  });
});

describe('asteroidPositionAt', () => {
  it('is analytic: same rock + same time -> same position', () => {
    const rock = makeBelt()[0];
    assert.deepEqual(asteroidPositionAt(rock, 123.4), asteroidPositionAt(rock, 123.4));
  });

  it('drift stays inside the drift amplitude', () => {
    for (const rock of makeBelt()) {
      for (const t of [0, 100, 500, 1000]) {
        const p = asteroidPositionAt(rock, t);
        assert.ok(Math.abs(p.x - rock.anchor.x) <= rock.driftAmp + 1e-9, 'x drift bounded');
        assert.ok(Math.abs(p.z - rock.anchor.z) <= rock.driftAmp + 1e-9, 'z drift bounded');
        assert.ok(Math.abs(p.y - rock.anchor.y) <= rock.driftAmp * 0.6 + 1e-9, 'y drift bounded');
      }
    }
  });

  it('rocks actually move over time', () => {
    const rock = makeBelt()[0];
    assert.notDeepEqual(asteroidPositionAt(rock, 0), asteroidPositionAt(rock, 500));
  });
});

describe('makeRng', () => {
  it('is the seeded LCG the belt (and the rock texture) uses', () => {
    const a = makeRng(777);
    const b = makeRng(777);
    assert.equal(a(), b());
    assert.notEqual(a(), makeRng(778)());
    const v = makeRng(1)();
    assert.ok(v >= 0 && v < 1, 'output in [0, 1)');
  });
});
