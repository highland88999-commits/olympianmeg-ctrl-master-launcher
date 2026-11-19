// tests/agora-streetlamps.test.mjs
// AGORA STREET LAMPS (Merlin, Nov 19, 2026): eight lamps ring
// the square between the stalls, every head glowing warm after
// dark, every other lamp carrying a real warm point light (four
// in all) — the Nov 3 real-lights rule, kept to the house
// compromise (Babel: many emissive lamps, few real lights).
// The lamps must never stand in a walkway, overlap another
// element, or block a path (NO-OVERLAP RULE). Run:
// node --test tests/agora-streetlamps.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  WALKER_SPAWN, FOUNTAIN_RADIUS, FOUNTAIN_POSITION,
  SQUARE_RADIUS, stallSites, STOA_SIDES, STOA_COLUMN_COUNT,
  STOA_COLUMN_SPACING, streetLampSites, STREET_LAMP_COUNT,
  STREET_LAMP_RADIUS, STREET_LAMP_HEIGHT, STREET_LAMP_LIGHT_COUNT,
  STREET_LAMP_LIGHT_INTENSITY, STREET_LAMP_LIGHT_DISTANCE,
} from '../lib/agora/world.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

describe('agora street lamps — placement', () => {
  it('eight lamps on a 28 m ring, interleaved between the stalls', () => {
    const sites = streetLampSites();
    assert.equal(sites.length, STREET_LAMP_COUNT);
    assert.equal(STREET_LAMP_COUNT, 8);
    assert.equal(STREET_LAMP_RADIUS, 28);
    for (const s of sites) {
      const r = Math.hypot(s.x, s.z);
      assert.ok(Math.abs(r - STREET_LAMP_RADIUS) < 1e-9, `lamp on the ring: ${r}`);
    }
    // Angles offset 22.5° from the stall ring (stalls at ~0°/45°/…).
    const angles = sites.map((s) => ((s.angle * 180) / Math.PI + 360) % 360);
    for (let i = 0; i < angles.length; i++) {
      assert.ok(Math.abs(angles[i] - (22.5 + i * 45)) < 1e-9, `lamp ${i} at ${angles[i]}°`);
    }
    assert.deepEqual(streetLampSites(), sites, 'lamp layout is deterministic');
  });

  it('no lamp in a walkway, overlapping anything, or blocking a path', () => {
    const sites = streetLampSites();
    const stalls = stallSites();
    const columns = [];
    for (const side of STOA_SIDES) {
      for (let i = 0; i < STOA_COLUMN_COUNT; i++) {
        columns.push({ x: side.x, z: (i - (STOA_COLUMN_COUNT - 1) / 2) * STOA_COLUMN_SPACING });
      }
    }
    for (const s of sites) {
      assert.ok(Math.hypot(s.x - FOUNTAIN_POSITION.x, s.z - FOUNTAIN_POSITION.z) > FOUNTAIN_RADIUS + 10, 'clear of the fountain');
      assert.ok(!(s.z > 24 && Math.abs(s.x) < 9), 'clear of the south gate lane');
      assert.ok(!(s.z < -28 && Math.abs(s.x) < 9), 'clear of the temple approach');
      assert.ok(Math.hypot(s.x - WALKER_SPAWN.x, s.z - WALKER_SPAWN.z) > 10, 'clear of the walker spawn');
      const dStall = Math.min(...stalls.map((t) => Math.hypot(t.x - s.x, t.z - s.z)));
      assert.ok(dStall >= 8, `clear of the stalls (${dStall.toFixed(1)} m)`);
      const dCol = Math.min(...columns.map((c) => Math.hypot(c.x - s.x, c.z - s.z)));
      assert.ok(dCol >= 4, `clear of the stoa columns (${dCol.toFixed(1)} m)`);
      assert.ok(Math.hypot(s.x, s.z) < SQUARE_RADIUS, 'lamps stand inside the square');
    }
  });

  it('four real lights, on alternating lamps', () => {
    const sites = streetLampSites();
    const lit = sites.filter((s) => s.realLight);
    assert.equal(lit.length, STREET_LAMP_LIGHT_COUNT);
    assert.equal(STREET_LAMP_LIGHT_COUNT, 4);
    assert.deepEqual(
      sites.map((s) => s.realLight),
      [true, false, true, false, true, false, true, false],
      'real lights alternate around the ring',
    );
    assert.ok(STREET_LAMP_LIGHT_INTENSITY > 0, 'real lights carry intensity');
    assert.ok(STREET_LAMP_LIGHT_DISTANCE >= 18, 'real lights reach the cobbles around the lamp');
    assert.ok(STREET_LAMP_HEIGHT > 4 && STREET_LAMP_HEIGHT < 6, 'lamp height suits the square (stoa is 5.2 m)');
  });
});

describe('agora street lamps — scene wiring', () => {
  it('the scene mounts the lamps with real point lights and nothing else new', () => {
    const scene = read('components/agora/AgoraScene.jsx');
    for (const needle of ['StreetLamps', 'streetLampSites', 'STREET_LAMP_HEIGHT', 'pointLight']) {
      assert.ok(scene.includes(needle), `scene wires: ${needle}`);
    }
    assert.ok(!scene.includes('spotLight'), 'no spot lights');
    assert.ok(!scene.includes('directionalLight'), 'no directional lights');
    assert.ok(!scene.includes('hemisphereLight'), 'no hemisphere lights');
    assert.ok(!scene.includes('new THREE.PointLight'), 'no imperative point-light constructors');
    assert.ok(!scene.includes('new THREE.SpotLight'), 'no imperative spot-light constructors');
    // The old "no new real lights" header is gone — the lamps are the honest exception.
    assert.ok(!scene.includes('No new real lights anywhere'), 'stale no-lights comment is gone');
  });
});
