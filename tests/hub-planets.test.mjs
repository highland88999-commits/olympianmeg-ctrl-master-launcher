// Outer planets pins (Merlin, 2026-10-21): eight texture-wrapped
// worlds expanded outward, Jupiter largest, nobody touching anybody.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { PLANETS, ORBIT_CENTER, EARTH_CENTER, EARTH_RADIUS, MARS_CENTER, MARS_RADIUS } from '../lib/god-orbits.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const SUN = { x: 0, y: 158.75, z: 662.5 }; // matches StaticColliders
const OMEGA = { x: 0, y: 158.75, z: 1000 }; // lib/omega-arch OMEGA_POSITION

test('eight planets, unique keys, every texture file present', () => {
  assert.equal(PLANETS.length, 8);
  assert.equal(new Set(PLANETS.map((p) => p.key)).size, 8);
  for (const p of PLANETS) {
    assert.ok(existsSync('public' + p.texture), p.key + ' texture exists');
    if (p.rings) assert.ok(existsSync('public' + p.rings.texture), p.key + ' ring texture exists');
  }
  assert.ok(existsSync('public/planets/mars.jpg'), 'mars rewrap texture exists');
});

test('Jupiter is the largest planet of the set', () => {
  const j = PLANETS.find((p) => p.key === 'jupiter');
  for (const p of PLANETS) assert.ok(j.radius >= p.radius, p.key);
});

test('every planet lives outward: center 300+ from the hub center', () => {
  for (const p of PLANETS) assert.ok(dist(p.center, ORBIT_CENTER) > 300, p.key);
});

test('no planet touches another planet, Earth, Mars, the Sun, or the Omega sightline', () => {
  for (let i = 0; i < PLANETS.length; i++) {
    const p = PLANETS[i];
    for (let j = i + 1; j < PLANETS.length; j++) {
      const q = PLANETS[j];
      assert.ok(dist(p.center, q.center) > p.radius + q.radius + 10, p.key + '/' + q.key);
    }
    assert.ok(dist(p.center, EARTH_CENTER) > p.radius + EARTH_RADIUS + 10, p.key + '/earth');
    assert.ok(dist(p.center, MARS_CENTER) > p.radius + MARS_RADIUS + 10, p.key + '/mars');
    assert.ok(dist(p.center, SUN) > p.radius + 68 + 10, p.key + '/sun');
    assert.ok(dist(p.center, OMEGA) > p.radius + 60, p.key + '/omega');
  }
});

test("Saturn's rings clear its own sphere and carry the strip texture", () => {
  const s = PLANETS.find((p) => p.key === 'saturn');
  assert.ok(s.rings && s.rings.inner > s.radius && s.rings.outer > s.rings.inner);
  assert.equal(s.rings.texture, '/planets/saturn-rings.jpg');
});

test('HomeScene renders the planets, collides them, and re-skins Mars', () => {
  const src = readFileSync('components/HomeScene.jsx', 'utf8');
  // Planet Program (2026-10-22): BackdropPlanets now receives the
  // freeroam-gated dive handler — planets are clickable into their
  // realms, so the old prop-less pin became this wired form.
  assert.match(src, /<BackdropPlanets onPlanetSelect=\{appState === 'hub_freeroam' \? beginPlanetDive : null\} \/>/);
  assert.match(src, /registerCollider\('planet-' \+ p\.key/);
  assert.match(src, /'\/planets\/mars\.jpg'/);
});
