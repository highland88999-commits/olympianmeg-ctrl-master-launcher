// tests/planet-directory.test.mjs
// Every planet by name — built-ins and user-forged, fully automatic.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  builtinPlanets,
  userPlanets,
  planetDirectory,
  arrivalPoint,
} from '../lib/planet-directory.js';

describe('planet directory', () => {
  it('lists built-in planets by name', () => {
    const builtins = builtinPlanets();
    const names = builtins.map((p) => p.name);
    assert.ok(names.includes('Earth'), 'missing Earth');
    assert.ok(names.includes('Mars'), 'missing Mars');
    assert.ok(names.includes('Sun'), 'missing Sun');
    assert.ok(names.includes('Jupiter'), 'missing Jupiter');
    assert.ok(names.includes('Saturn'), 'missing Saturn');
    // Every entry has what the portal needs
    for (const p of builtins) {
      assert.ok(p.key && p.name, `missing key/name: ${JSON.stringify(p)}`);
      assert.ok(p.center && typeof p.center.x === 'number', `missing center: ${p.name}`);
      assert.ok(p.radius > 0, `bad radius: ${p.name}`);
      assert.equal(p.kind, 'builtin');
    }
  });

  it('maps user worlds to spiral positions with names', () => {
    const worlds = [
      { id: 'w1', display_name: 'Merlinia', seed: 'abc', owner_id: 'u1' },
      { id: 'w2', display_name: null, seed: 'xyz', owner_id: 'u2' },
    ];
    const ups = userPlanets(worlds);
    assert.equal(ups.length, 2);
    assert.equal(ups[0].name, 'Merlinia');
    assert.equal(ups[1].name, 'Untitled world'); // fallback
    assert.equal(ups[0].kind, 'user');
    assert.equal(ups[0].worldId, 'w1');
    // Positions differ (spiral)
    assert.notDeepEqual(ups[0].center, ups[1].center);
  });

  it('directory merges built-ins and user planets, built-ins first', () => {
    const dir = planetDirectory([{ id: 'w1', display_name: 'Test', seed: 's' }]);
    assert.ok(dir.length > 10, 'should have built-ins plus user planet');
    assert.equal(dir[0].kind, 'builtin');
    assert.equal(dir[dir.length - 1].kind, 'user');
    assert.equal(dir[dir.length - 1].name, 'Test');
  });

  it('handles empty/undefined user worlds', () => {
    assert.deepEqual(userPlanets([]), []);
    assert.deepEqual(userPlanets(null), []);
    assert.deepEqual(userPlanets(undefined), []);
    const dir = planetDirectory(null);
    assert.ok(dir.length > 0, 'built-ins survive null input');
  });

  it('arrival point sits outside the planet surface', () => {
    const planet = { center: { x: 100, y: 50, z: -200 }, radius: 20 };
    const arr = arrivalPoint(planet);
    const dx = arr.x - planet.center.x;
    const dy = arr.y - planet.center.y;
    const dz = arr.z - planet.center.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    assert.ok(dist > planet.radius, `arrival ${dist} inside planet radius ${planet.radius}`);
    assert.ok(dist === planet.radius * 4, 'arrival should be 4x radius out');
  });
});
