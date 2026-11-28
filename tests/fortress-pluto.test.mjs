// Fortress of Solitude on Pluto: ground + levitation math.
//
// Verifies lib/fortress/pluto.js — the crystal-floor disc, the ice
// slope, the Pluto plain, and the vertical state machine Merlin
// ordered (Nov 28): land on the crystal floor, walk off the edge and
// you LEVITATE (never fall, never die), gravity-off rises again,
// gravity-on brings you back down.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DISC_FLAT_R,
  DISC_RIM_R,
  DISC_Y,
  ICE_Y,
  RISE_SPEED,
  DESCEND_SPEED,
  MAX_RISE_Y,
  LEVITATE_SPEED,
  AIR_SPEED,
  PLUTO_WALK_SPEED,
  plutoGroundHeight,
  isOnDisc,
  distanceToDisc,
  speedForMode,
  createPlutoState,
  stepPluto,
  crystalColliders,
} from '../lib/fortress/pluto.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('ground: disc top flat, slope mid, ice plain beyond the rim', () => {
  assert.equal(plutoGroundHeight(0, 0), DISC_Y);
  assert.equal(plutoGroundHeight(DISC_FLAT_R, 0), DISC_Y);
  assert.ok(approx(plutoGroundHeight((DISC_FLAT_R + DISC_RIM_R) / 2, 0), (DISC_Y + ICE_Y) / 2));
  assert.equal(plutoGroundHeight(DISC_RIM_R, 0), ICE_Y);
  assert.equal(plutoGroundHeight(200, -150), ICE_Y);
});

test('on-disc test matches the flat radius', () => {
  assert.equal(isOnDisc(0, 0), true);
  assert.equal(isOnDisc(DISC_FLAT_R, 0), true);
  assert.equal(isOnDisc(DISC_FLAT_R + 0.01, 0), false);
  assert.equal(distanceToDisc(0, 0), 0);
  assert.ok(approx(distanceToDisc(DISC_FLAT_R + 5, 0), 5));
});

test('speeds: walk on ground, slow drift while levitating, air speed aloft', () => {
  assert.equal(speedForMode('grounded'), PLUTO_WALK_SPEED);
  assert.equal(speedForMode('levitating'), LEVITATE_SPEED);
  assert.equal(speedForMode('rising'), AIR_SPEED);
  assert.equal(speedForMode('descending'), AIR_SPEED);
});

test('spawn: grounded on the crystal floor, gravity on', () => {
  const s = createPlutoState({ x: 0, z: 12 });
  assert.equal(s.mode, 'grounded');
  assert.equal(s.y, DISC_Y);
  assert.equal(s.gravityOn, true);
  assert.equal(s.onDisc, true);
});

test('walk off the edge: you levitate at disc height, you do not fall', () => {
  const s = createPlutoState({ x: 0, z: 12 });
  // Step across the flat-top edge with gravity on.
  stepPluto(s, { x: 0, z: 13.5, gravityOn: true, dt: 0.016 });
  assert.equal(s.mode, 'levitating');
  assert.equal(s.y, DISC_Y);
  // Keep walking outward: still hovering, never dropping to the ice.
  for (let i = 0; i < 60; i++) {
    stepPluto(s, { x: 0, z: 13.5 + i * 0.2, gravityOn: true, dt: 0.016 });
  }
  assert.equal(s.mode, 'levitating');
  assert.equal(s.y, DISC_Y);
  assert.ok(s.y > ICE_Y, 'levitating stays above the ice plain');
});

test('drift back over the floor while levitating: grounded again', () => {
  const s = createPlutoState({ x: 0, z: 12 });
  stepPluto(s, { x: 0, z: 14, gravityOn: true, dt: 0.016 });
  assert.equal(s.mode, 'levitating');
  stepPluto(s, { x: 0, z: 12, gravityOn: true, dt: 0.016 });
  assert.equal(s.mode, 'grounded');
  assert.equal(s.y, DISC_Y);
});

test('gravity off while levitating: you rise, and the rise caps', () => {
  const s = createPlutoState({ x: 0, z: 12 });
  stepPluto(s, { x: 0, z: 14, gravityOn: true, dt: 0.016 });
  assert.equal(s.mode, 'levitating');
  stepPluto(s, { x: 0, z: 14, gravityOn: false, dt: 0.016 });
  assert.equal(s.mode, 'rising');
  const y0 = s.y;
  stepPluto(s, { x: 0, z: 14, gravityOn: false, dt: 1 });
  assert.ok(approx(s.y, y0 + RISE_SPEED));
  for (let i = 0; i < 60; i++) {
    stepPluto(s, { x: 0, z: 14, gravityOn: false, dt: 1 });
  }
  assert.equal(s.y, MAX_RISE_Y);
  assert.equal(s.mode, 'rising');
});

test('gravity off from the floor: you rise straight up from the crystals', () => {
  const s = createPlutoState({ x: 0, z: 12 });
  stepPluto(s, { x: 0, z: 12, gravityOn: false, dt: 0.016 });
  assert.equal(s.mode, 'rising');
  stepPluto(s, { x: 0, z: 12, gravityOn: false, dt: 1 });
  assert.ok(approx(s.y, DISC_Y + RISE_SPEED));
});

test('gravity back on while rising: you descend and land on the disc', () => {
  const s = createPlutoState({ x: 0, z: 12 });
  stepPluto(s, { x: 0, z: 12, gravityOn: false, dt: 0.016 });
  stepPluto(s, { x: 0, z: 12, gravityOn: false, dt: 2 });
  assert.equal(s.mode, 'rising');
  assert.ok(s.y > DISC_Y);
  stepPluto(s, { x: 0, z: 12, gravityOn: true, dt: 0.016 });
  assert.equal(s.mode, 'descending');
  for (let i = 0; i < 120 && s.mode !== 'grounded'; i++) {
    stepPluto(s, { x: 0, z: 12, gravityOn: true, dt: 0.016 });
  }
  assert.equal(s.mode, 'grounded');
  assert.equal(s.y, DISC_Y);
});

test('descend off the disc: you land on the Pluto ice, grounded', () => {
  const s = createPlutoState({ x: 0, z: 12 });
  stepPluto(s, { x: 0, z: 14, gravityOn: true, dt: 0.016 });
  stepPluto(s, { x: 0, z: 14, gravityOn: false, dt: 0.016 });
  stepPluto(s, { x: 0, z: 14, gravityOn: false, dt: 3 });
  assert.equal(s.mode, 'rising');
  stepPluto(s, { x: 0, z: 20, gravityOn: true, dt: 0.016 });
  assert.equal(s.mode, 'descending');
  for (let i = 0; i < 600 && s.mode !== 'grounded'; i++) {
    stepPluto(s, { x: 0, z: 20, gravityOn: true, dt: 0.016 });
  }
  assert.equal(s.mode, 'grounded');
  assert.equal(s.y, ICE_Y);
});

test('walk back up the slope from the ice: the ground carries you onto the disc', () => {
  const s = createPlutoState({ x: 0, z: 12 });
  // Land on the ice first.
  stepPluto(s, { x: 0, z: 20, gravityOn: true, dt: 0.016 });
  s.mode = 'grounded';
  s.y = ICE_Y;
  s.onDisc = false;
  // Walk inward across the slope.
  let y = ICE_Y;
  for (let z = 20; z >= 0; z -= 0.5) {
    stepPluto(s, { x: 0, z, gravityOn: true, dt: 0.016 });
    assert.equal(s.mode, 'grounded');
    assert.ok(s.y >= y - 1e-9, 'walking up the slope never drops');
    y = s.y;
  }
  assert.equal(s.y, DISC_Y);
  assert.equal(s.onDisc, true);
});

test('toggling gravity mid-descent rises again', () => {
  const s = createPlutoState({ x: 0, z: 12 });
  stepPluto(s, { x: 0, z: 12, gravityOn: false, dt: 0.016 });
  stepPluto(s, { x: 0, z: 12, gravityOn: false, dt: 2 });
  stepPluto(s, { x: 0, z: 12, gravityOn: true, dt: 0.016 });
  assert.equal(s.mode, 'descending');
  const yDown = s.y;
  stepPluto(s, { x: 0, z: 12, gravityOn: false, dt: 0.016 });
  assert.equal(s.mode, 'rising');
  stepPluto(s, { x: 0, z: 12, gravityOn: false, dt: 1 });
  assert.ok(s.y > yDown);
});

test('crystal colliders: one per crystal, on the ring, clear of the centre', () => {
  const matrix = Array.from({ length: 12 }, (_, i) => ({ id: `node_${i}` }));
  const cols = crystalColliders(matrix);
  assert.equal(cols.length, 12);
  for (const c of cols) {
    assert.ok(approx(Math.hypot(c.x, c.z), 11));
    assert.ok(c.r > 0);
  }
  assert.deepEqual(crystalColliders([]), []);
  assert.deepEqual(crystalColliders(null), []);
});

test('descent speed is DESCEND_SPEED per second', () => {
  const s = createPlutoState({ x: 0, z: 12 });
  stepPluto(s, { x: 0, z: 12, gravityOn: false, dt: 0.016 });
  stepPluto(s, { x: 0, z: 12, gravityOn: false, dt: 2 });
  const yTop = s.y;
  stepPluto(s, { x: 0, z: 12, gravityOn: true, dt: 0.016 });
  stepPluto(s, { x: 0, z: 12, gravityOn: true, dt: 1 });
  assert.ok(approx(s.y, yTop - DESCEND_SPEED));
});
