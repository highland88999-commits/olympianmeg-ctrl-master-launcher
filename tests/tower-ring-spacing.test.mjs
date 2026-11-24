// tests/tower-ring-spacing.test.mjs
// The god towers moved OUT — twice (Merlin, 2026-11-13). First 110 → 150
// ("move the god towers out further, enough space for them to get by"):
// at 110 the 24 towers were 30.3 wide on 28.7 centres — overlapping
// each other with no space between them at all. At 150 the chord is
// ~39.1, leaving ~8.8 of clear space between adjacent tower boxes —
// but the towers still wore 3 sphere colliders r26 each, which
// overlapped by 12.84 and formed a continuous wall: users could not
// pass between the towers at all.
//
// Then 150 → 159.11 (Merlin: "move the billboards further out ... I
// need enough space for users to easily pass between them to explore
// other places", refined: "perfect the geometry"): the towers stop
// spinning, hold a fixed yaw square to the ring, and wore ONE oriented
// box collider each (lib/tower-collider.js) — the box fits the square
// body, so the gap between adjacent boxes is exactly the chord minus
// the box width: an even 8.00 between every pair (5.60 spare for the
// flyer at r1.2, 2.00 for the bike at r3.0). Since 2026-11-24 (Merlin:
// pass through the billboards and god towers freely) the towers
// register NO collider at all — users fly/walk straight through them
// — while the square bodies, fixed yaw, and 8.00 gaps stay exactly
// as measured. The planet lanes stay at
// 195–231 — they cannot move out (planet 23 would hit Mars; sampled
// over a full assembly rotation, 1440 steps, even +5.83 on the lanes
// drops its Mars clearance to 56.89, below the 58 gate). The bike
// park moves with the ring (175 → 178.09), centred in the window
// between the tower boxes (175.88) and the innermost planet lane's
// accent ring (180.30).
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
import {
  TOWER_BOX_HALF_SIDE,
  TOWER_BOX_Y_CENTER,
  TOWER_BOX_Y_HALF,
  TOWER_GAP_TARGET,
  towerChord,
  towerGap,
  towerCornerRadius,
  towerInnerCornerRadius,
  towerFixedYaw,
  pointToTowerBoxDistance,
} from '../lib/tower-collider.js';

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
const FLYER_R = 1.2; // HomeScene flyer radius
const BIKE_R = 3.0; // HomeScene bike radius
const SAT_RADIUS = 11.8; // GodOrbitRings SAT_RADIUS
const SAT_RING_OUTER = SAT_RADIUS + 2.48 + 0.42; // accent torus + tube

const dist3 = (a, b) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const P = (arr) => ({ x: arr[0], y: arr[1], z: arr[2] });

// Face plane distance from the tower axis (group units), then world
// units via the group scale — the box half-side by construction.
const facePlane = MOUNT + FACE_OFFSET * PANEL_SCALE;
const boxHalfSide = facePlane * GROUP_SCALE;
const faceWidthWorld = FACE_W * PANEL_SCALE * GROUP_SCALE;

// Chord between adjacent tower centres (24 towers, evenly spaced).
const chord = towerChord(TOWER_ORBIT_RADIUS);

describe('tower ring spacing (moved out 150 -> 159.11, box colliders)', () => {
  it('box half-side matches the live face plane (mount + offset, scaled)', () => {
    assert.ok(
      Math.abs(TOWER_BOX_HALF_SIDE - boxHalfSide) < 0.001,
      `module ${TOWER_BOX_HALF_SIDE} vs source ${boxHalfSide.toFixed(3)}`
    );
  });

  it('ring radius is 159.11 and the bike park moved with it to 178.09', () => {
    assert.equal(TOWER_ORBIT_RADIUS, 159.11);
    assert.equal(BIKE_PARK_RADIUS, 178.09);
  });

  it('clear gap between adjacent tower boxes is exactly 8.00', () => {
    const gap = towerGap(TOWER_ORBIT_RADIUS);
    assert.ok(
      Math.abs(gap - TOWER_GAP_TARGET) < 0.01,
      `chord ${chord.toFixed(2)} - box width ${(2 * TOWER_BOX_HALF_SIDE).toFixed(2)} = ${gap.toFixed(2)}`
    );
  });

  it('the 8.00 gap is even across all 24 adjacent pairs', () => {
    for (let i = 0; i < GOD_TOWER_SPOTS.length; i++) {
      const a = P(GOD_TOWER_SPOTS[i].pos);
      const b = P(GOD_TOWER_SPOTS[(i + 1) % GOD_TOWER_SPOTS.length].pos);
      const pairChord = dist3(a, b);
      const pairGap = pairChord - 2 * TOWER_BOX_HALF_SIDE;
      assert.ok(
        Math.abs(pairGap - TOWER_GAP_TARGET) < 0.01,
        `pair ${i}-${(i + 1) % 24}: chord ${pairChord.toFixed(2)} gap ${pairGap.toFixed(2)}`
      );
    }
  });

  it('flyer and bike both fit the gap with room to spare', () => {
    const gap = towerGap(TOWER_ORBIT_RADIUS);
    assert.ok(gap - 2 * FLYER_R >= 5.5, `flyer spare ${(gap - 2 * FLYER_R).toFixed(2)}`);
    assert.ok(gap - 2 * BIKE_R >= 2.0, `bike spare ${(gap - 2 * BIKE_R).toFixed(2)}`);
  });

  it('faces stand apart too: 11.20 between adjacent face ends', () => {
    const gap = chord - faceWidthWorld;
    assert.ok(
      Math.abs(gap - 11.2) < 0.01,
      `chord ${chord.toFixed(2)} - face width ${faceWidthWorld.toFixed(2)} = ${gap.toFixed(2)}`
    );
  });

  it('tower box corners clear the innermost planet lane (accent ring)', () => {
    const innerLaneEdge = GOD_BANDS[0].radius - SAT_RING_OUTER;
    const towerOuter = towerCornerRadius(TOWER_ORBIT_RADIUS);
    assert.ok(
      towerOuter < innerLaneEdge,
      `tower corner ${towerOuter.toFixed(2)} vs lane edge ${innerLaneEdge.toFixed(2)}`
    );
    assert.ok(
      innerLaneEdge - towerOuter > 3.5,
      `corner margin ${(innerLaneEdge - towerOuter).toFixed(2)}`
    );
  });

  it('tower band is the box footprint and stays inside the planet flight surface', () => {
    assert.ok(
      Math.abs(TOWER_BAND.inner - towerInnerCornerRadius(TOWER_ORBIT_RADIUS)) < 0.01,
      `band inner ${TOWER_BAND.inner.toFixed(2)}`
    );
    assert.ok(
      Math.abs(TOWER_BAND.outer - towerCornerRadius(TOWER_ORBIT_RADIUS)) < 0.01,
      `band outer ${TOWER_BAND.outer.toFixed(2)}`
    );
    assert.ok(TOWER_BAND.outer < PLANET_BAND.inner);
    assert.ok(
      TOWER_BAND.outer < GOD_BANDS[0].radius - (SAT_RADIUS + 1.8),
      `band outer ${TOWER_BAND.outer.toFixed(2)} vs flight surface ${(GOD_BANDS[0].radius - (SAT_RADIUS + 1.8)).toFixed(2)}`
    );
  });

  it('GodTower registers NO tower collider (pass-through, Merlin 2026-11-24)', () => {
    // Users fly/walk straight through the towers and their billboards:
    // no box, no sphere, no collider id at all. The square bodies,
    // fixed yaw, and 8.00 gaps are unchanged — only the invisible
    // wall is gone.
    assert.ok(
      !towerSrc.includes('registerBoxCollider('),
      'no box collider registered for towers'
    );
    assert.ok(
      !towerSrc.includes('`tower-${god}`'),
      'no tower collider id at all'
    );
    assert.ok(
      !/(?<![A-Za-z])registerCollider\(`tower-\$\{god\}`/.test(towerSrc),
      'no sphere collider either (unregisterCollider cleanup does not count)'
    );
    assert.ok(
      !towerSrc.includes('tower-${god}-top') && !towerSrc.includes('tower-${god}-bottom'),
      'top/bottom spheres gone'
    );
    assert.ok(
      towerSrc.includes('rotation={[0, fixedYaw, 0]}'),
      'fixed yaw applied to the tower group'
    );
    assert.ok(
      !towerSrc.includes('rotation.y +='),
      'no more in-place spin'
    );
  });

  it('fixed yaw squares each tower to the ring (panel 0 faces the hub centre)', () => {
    for (const s of GOD_TOWER_SPOTS) {
      const yaw = towerFixedYaw(s.pos);
      // Group +Z after yaw must point from the tower at ORBIT_CENTER.
      const dirX = Math.sin(yaw);
      const dirZ = Math.cos(yaw);
      const toCenterX = ORBIT_CENTER.x - s.pos[0];
      const toCenterZ = ORBIT_CENTER.z - s.pos[2];
      const len = Math.hypot(toCenterX, toCenterZ);
      assert.ok(
        Math.abs(dirX - toCenterX / len) < 0.001 &&
          Math.abs(dirZ - toCenterZ / len) < 0.001,
        `${s.god} yaw ${yaw.toFixed(3)}`
      );
    }
  });

  it('box vertical span covers pillar bottom to god-label top, plus the bob', () => {
    // Pillar bottom −22.5 group (−36.00 world), label top +25.3 group
    // (+40.48 world), bob ±0.5 — all inside [centre − half, centre + half].
    const lo = TOWER_BOX_Y_CENTER - TOWER_BOX_Y_HALF;
    const hi = TOWER_BOX_Y_CENTER + TOWER_BOX_Y_HALF;
    assert.ok(lo <= -36.0 - 0.5, `box bottom ${lo.toFixed(2)}`);
    assert.ok(hi >= 40.48 + 0.5, `box top ${hi.toFixed(2)}`);
  });

  it('parked bike clears every tower box (5+ clear of the nearest)', () => {
    const bike = P(BIKE_PARK_POS);
    let min = Infinity;
    let nearest = '';
    for (const s of GOD_TOWER_SPOTS) {
      const d = pointToTowerBoxDistance(bike, s.pos, towerFixedYaw(s.pos));
      assert.ok(d > 0, `${s.god} tower box contains the bike`);
      if (d < min) {
        min = d;
        nearest = s.god;
      }
    }
    assert.ok(min > 5, `nearest tower box (${nearest}) ${min.toFixed(2)} from bike`);
  });

  it('bike parks centred between the tower boxes and the planet lanes', () => {
    const park = ORBIT_CENTER.z - BIKE_PARK_POS[2];
    const boxReach = TOWER_ORBIT_RADIUS + TOWER_BOX_HALF_SIDE;
    const laneEdge = GOD_BANDS[0].radius - SAT_RING_OUTER;
    assert.ok(park > boxReach, `park ${park} vs box reach ${boxReach.toFixed(2)}`);
    assert.ok(park < laneEdge, `park ${park} vs lane edge ${laneEdge.toFixed(2)}`);
    const below = park - boxReach;
    const above = laneEdge - park;
    assert.ok(
      Math.abs(below - above) < 0.05,
      `park centred: ${below.toFixed(2)} below, ${above.toFixed(2)} above`
    );
  });

  it('towers clear Earth, Mars and the Sun', () => {
    const bodies = [
      ['Earth', EARTH_CENTER, EARTH_RADIUS],
      ['Mars', MARS_CENTER, MARS_RADIUS],
      ['Sun', SUN_CENTER, SUN_RADIUS],
    ];
    for (const [name, center, radius] of bodies) {
      for (const s of GOD_TOWER_SPOTS) {
        const d = pointToTowerBoxDistance(center, s.pos, towerFixedYaw(s.pos));
        assert.ok(
          d > radius,
          `${name} vs ${s.god} tower box: ${d.toFixed(1)}`
        );
      }
    }
  });
});
