// tests/tower-ring-spacing.test.mjs
// The god towers moved OUT (Merlin, 2026-11-13: "move the god towers
// out further, enough space for them to get by"). At ring 110 the 24
// towers were 30.3 wide on 28.7 centres — overlapping each other with
// no space between them at all. At ring 150 the chord is ~39.1,
// leaving ~8.8 of clear space between adjacent tower boxes.
//
// 150 is the LARGEST radius that keeps the hub intact: the tower band
// (150 + 22 = 172) must stay inside the innermost planet lane's
// flight surface (195 − (11.8 hull + 1.8 pad) = 181.4), per
// tests/hub-travel.test.js — any further out and the towers stand in
// the satellite lanes. A fly-through gap between the towers (flight
// colliders clear) would need a ring past 240, which breaks the
// planets, Mars and the ads' readability from spawn — so this move
// buys real daylight between the towers, not a flight lane through
// them; the bike park moves with the ring (145 → 175) so the parked
// bike stays clear of the nearest tower and of the planet lanes.
//
// Run: node --test tests/tower-ring-spacing.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  ORBIT_CENTER,
  EARTH_CENTER,
  EARTH_RADIUS,
  GOD_BANDS,
  MARS_CENTER,
  MARS_RADIUS,
  BIKE_PARK_POS,
  BIKE_PARK_RADIUS,
} from '../lib/god-orbits.js';
import { SUN_CENTER, SUN_RADIUS } from '../lib/omega-arch.js';
import { GOD_TOWER_SPOTS, TOWER_ORBIT_RADIUS } from '../lib/home-positions.js';
import { TOWER_BAND, PLANET_BAND } from '../lib/hub-flight.js';
import { PANEL_SCALE } from '../lib/tower-panels.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const towerSrc = readFileSync(join(repo, 'components/GodTower.jsx'), 'utf8');

// Panel mount + group scale, parsed from the live source (not duplicated).
const mountMatch = towerSrc.match(/<group position=\{\[0, -1, ([\d.]+)\]\}>/);
assert.ok(mountMatch, 'panel mount group found in GodTower.jsx');
const MOUNT = parseFloat(mountMatch[1]);
const scaleMatch = towerSrc.match(/<group ref=\{satelliteRef\} scale=\{\[([\d.]+),/);
assert.ok(scaleMatch, 'tower group scale found in GodTower.jsx');
const GROUP_SCALE = parseFloat(scaleMatch[1]);

const FACE_W = 12.64;
const FACE_OFFSET = 0.24; // face mesh z inside TowerAdPanel
const SAT_RADIUS = 11.8; // GodOrbitRings SAT_RADIUS
const SAT_RING_OUTER = SAT_RADIUS + 2.48 + 0.42; // accent torus + tube
const TOWER_FLIGHT_R = 22; // GodTower flight collider / TOWER_BAND half-width
const TOWER_COMPONENT_R = 26; // GodTower registerCollider radius (post billboard fix)

const dist3 = (a, b) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const P = (arr) => ({ x: arr[0], y: arr[1], z: arr[2] });

// Face plane distance from the tower axis (group units), corner
// distance (group units), then world units via the group scale.
const facePlane = MOUNT + FACE_OFFSET * PANEL_SCALE;
const cornerGroup = facePlane * Math.SQRT2;
const cornerWorld = cornerGroup * GROUP_SCALE;
const faceWidthWorld = FACE_W * PANEL_SCALE * GROUP_SCALE;

// Chord between adjacent tower centres (24 towers, evenly spaced).
const chord =
  2 * TOWER_ORBIT_RADIUS * Math.sin(Math.PI / GOD_TOWER_SPOTS.length);

describe('tower ring spacing (moved out 110 -> 150)', () => {
  it('ring radius is 150 and the bike park moved with it to 175', () => {
    assert.equal(TOWER_ORBIT_RADIUS, 150);
    assert.equal(BIKE_PARK_RADIUS, 175);
  });

  it('adjacent tower boxes stand apart with ~8.8 of clear space', () => {
    const gap = chord - faceWidthWorld;
    assert.ok(
      gap >= 8,
      `chord ${chord.toFixed(2)} - face width ${faceWidthWorld.toFixed(2)} = ${gap.toFixed(2)}`
    );
  });

  it('tower corners clear the innermost planet lane (accent ring)', () => {
    const innerLaneEdge = GOD_BANDS[0].radius - SAT_RING_OUTER;
    const towerOuter = TOWER_ORBIT_RADIUS + cornerWorld;
    assert.ok(
      towerOuter < innerLaneEdge,
      `tower corner ${towerOuter.toFixed(2)} vs lane edge ${innerLaneEdge.toFixed(2)}`
    );
  });

  it('tower band stays inside the innermost planet flight surface', () => {
    assert.equal(TOWER_BAND.inner, TOWER_ORBIT_RADIUS - TOWER_FLIGHT_R);
    assert.equal(TOWER_BAND.outer, TOWER_ORBIT_RADIUS + TOWER_FLIGHT_R);
    assert.ok(TOWER_BAND.outer < PLANET_BAND.inner);
    assert.ok(
      TOWER_ORBIT_RADIUS + TOWER_FLIGHT_R <
        GOD_BANDS[0].radius - (SAT_RADIUS + 1.8)
    );
  });

  it('parked bike clears every tower collider (component radius 26)', () => {
    const bike = P(BIKE_PARK_POS);
    for (const s of GOD_TOWER_SPOTS) {
      const d = dist3(P(s.pos), bike);
      assert.ok(
        d > TOWER_COMPONENT_R,
        `${s.god} tower ${d.toFixed(2)} from bike`
      );
    }
  });

  it('bike parks just outside the tower band, inside the planet lanes', () => {
    const park = ORBIT_CENTER.z - BIKE_PARK_POS[2];
    assert.ok(park > TOWER_ORBIT_RADIUS + TOWER_FLIGHT_R);
    assert.ok(park < TOWER_ORBIT_RADIUS + TOWER_FLIGHT_R + 15);
    assert.ok(park < GOD_BANDS[0].radius - SAT_RING_OUTER);
  });

  it('towers clear Earth, Mars and the Sun', () => {
    const bodies = [
      ['Earth', EARTH_CENTER, EARTH_RADIUS],
      ['Mars', MARS_CENTER, MARS_RADIUS],
      ['Sun', SUN_CENTER, SUN_RADIUS],
    ];
    for (const [name, center, radius] of bodies) {
      for (const s of GOD_TOWER_SPOTS) {
        const d = dist3(P(s.pos), center);
        assert.ok(
          d > radius + TOWER_COMPONENT_R,
          `${name} vs ${s.god} tower: ${d.toFixed(1)}`
        );
      }
    }
  });
});
