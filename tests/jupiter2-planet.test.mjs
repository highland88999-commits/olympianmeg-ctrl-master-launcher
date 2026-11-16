// tests/jupiter2-planet.test.mjs — Jupiter 2 as a full planet
// (Merlin, Nov 16 ~00:02: "I want a full planet here").
// The sphere geography (deck cap, drop, sub-level shelf, ramp,
// mountain, cave, lever), the deck ↔ sphere maps, the variable-
// radius sphere walker, and the aura ring on the sphere.
// Run: node --test tests/jupiter2-planet.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PLANET_R, SHELF_R, DROP_DEPTH_M, DROP_EDGE_RAD, CLIFF_HALF_RAD,
  STEEP_FALL_GRADIENT, RAMP_AZIMUTH,
  RAMP_HALF_WIDTH_RAD, MOUNTAIN_THETA_RAD, MOUNTAIN_AZIMUTH,
  CAVE_MOUTH_THETA_RAD, CAVE_BACK_THETA_RAD, LEVER_CAVE_THETA_RAD,
  deckToDir, dirToDeck, thetaFromPole, azimuthOf, baseRadiusAt,
  groundRadiusAt, groundPointAt, spherePointFromDeck, isOnDeck,
  isOnShelf, isOnMountain, isInCave, dirAt, leverCavePoint,
  leverCaveMouthPoint, spawnPoint, stepJupiter2Walker, auraRingPoints,
  moveOnSphere,
} from '../lib/jupiter2/planet.js';
import { planetParams } from '../lib/planet-walker.js';
import { JUPITER2_SPHERE_R } from '../lib/jupiter2/profile.js';

const JUPITER = planetParams('jupiter');
const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);

describe('the sphere', () => {
  it('radius 88 — the same number as the old disc, so the deck cap keeps its scale', () => {
    assert.equal(PLANET_R, 88);
    assert.equal(JUPITER2_SPHERE_R, 88);
    assert.equal(SHELF_R, 74);
    assert.equal(DROP_DEPTH_M, 14);
  });
  it('deck coordinates map onto the sphere by surface distance', () => {
    // (0, −88) is 88 m north of spawn: 1.0 rad from the pole, azimuth 0.
    const north = deckToDir(0, -88);
    assert.ok(Math.abs(thetaFromPole(north) - 1.0) < 1e-9);
    assert.ok(Math.abs(azimuthOf(north)) < 1e-9);
    // (88, 0) is 88 m east: 1.0 rad, azimuth π/2.
    const east = deckToDir(88, 0);
    assert.ok(Math.abs(thetaFromPole(east) - 1.0) < 1e-9);
    assert.ok(Math.abs(azimuthOf(east) - Math.PI / 2) < 1e-9);
    // The map is exact both ways.
    for (const [x, z] of [[0, 0], [10, 26], [30, -40], [-70, 60], [0, -150], [100, 100]]) {
      const back = dirToDeck(deckToDir(x, z));
      assert.ok(Math.abs(back.x - x) < 1e-9 && Math.abs(back.z - z) < 1e-9, `roundtrip ${x},${z}`);
    }
  });
  it('spawn sits on the deck cap', () => {
    const s = spawnPoint();
    assert.ok(Math.abs(Math.hypot(s.x, s.y, s.z) - 88) < 1.3, 'spawn on the deck (undulation ±1.2)');
    assert.equal(isOnDeck(s), true);
  });
});

describe('the drop, the shelf and the ramp', () => {
  it('the drop edge is 1.0 rad from spawn — the old world edge, 88 m of surface', () => {
    assert.equal(DROP_EDGE_RAD, 1.0);
    assert.equal(isOnDeck(deckToDir(0, -80)), true);
    assert.equal(isOnShelf(deckToDir(0, -95)), true);
  });
  it('past the edge the ground is 14 m down — except on the north ramp', () => {
    // East: a cliff — 88 → 74 across the edge.
    assert.ok(Math.abs(baseRadiusAt(deckToDir(95, 0)) - 74) < 0.01);
    assert.ok(Math.abs(baseRadiusAt(deckToDir(80, 0)) - 88) < 0.01);
    // North: the ramp eases 88 → 74, no cliff.
    assert.equal(RAMP_AZIMUTH, 0);
    const mid = baseRadiusAt(deckToDir(0, -90));
    assert.ok(mid > 74 && mid < 88, `ramp mid ${mid} is between deck and shelf`);
    assert.ok(Math.abs(baseRadiusAt(deckToDir(0, -100)) - 74) < 0.5, 'ramp bottom is the shelf');
  });
  it('the shelf wraps the whole far side — the planet does not end at the mountain', () => {
    assert.ok(Math.abs(baseRadiusAt(deckToDir(0, 200)) - 74) < 0.01);
    assert.ok(Math.abs(baseRadiusAt(deckToDir(0, -200)) - 74) < 0.01);
    assert.equal(isOnShelf(deckToDir(200, 0)), true);
  });
  it('the ground radius carries the deck undulation (±1.2 m)', () => {
    for (const [x, z] of [[0, 0], [40, -30], [-60, 20]]) {
      const r = groundRadiusAt(deckToDir(x, z));
      assert.ok(Math.abs(r - 88) <= 1.3, `deck ground ${r} at ${x},${z}`);
    }
  });
});

describe('the mountain, the cave and the lever', () => {
  it('the mountain stands on the shelf, due north past the drop', () => {
    assert.equal(MOUNTAIN_THETA_RAD, 1.45);
    assert.equal(MOUNTAIN_AZIMUTH, 0);
    // Off the corridor the mountain rises ~18 m over the shelf.
    const top = baseRadiusAt(deckToDir(15, -128));
    assert.ok(top > 80 && top <= 92, `mountain flank ${top}`);
    assert.equal(isOnMountain(deckToDir(15, -128)), true);
    assert.equal(isOnMountain(deckToDir(0, -128)), false, 'the corridor is not the mountain');
  });
  it('the cave passage runs through the mountain at shelf level', () => {
    assert.equal(CAVE_MOUTH_THETA_RAD, 1.25);
    assert.equal(CAVE_BACK_THETA_RAD, 1.57);
    assert.equal(isInCave(deckToDir(0, -110)), true, 'the mouth');
    assert.equal(isInCave(deckToDir(0, -123)), true, 'inside, at the lever');
    assert.equal(isInCave(deckToDir(0, -100)), false, 'before the mouth');
    assert.equal(isInCave(deckToDir(0, -160)), false, 'past the mountain');
    assert.ok(Math.abs(baseRadiusAt(deckToDir(0, -123)) - 74) < 0.01, 'the passage floor is the shelf');
  });
  it('the lever is INSIDE the cave, not on the deck', () => {
    assert.equal(LEVER_CAVE_THETA_RAD, 1.40);
    const lever = leverCavePoint();
    assert.ok(Math.abs(thetaFromPole(lever) - 1.40) < 1e-9);
    assert.equal(isInCave(lever), true);
    assert.ok(Math.abs(Math.hypot(lever.x, lever.y, lever.z) - 74) < 1.3, 'the lever stands on the shelf floor');
    const mouth = leverCaveMouthPoint();
    assert.ok(Math.abs(thetaFromPole(mouth) - 1.25) < 1e-9);
    // The mouth is south of the lever (closer to the drop), due north of spawn.
    assert.ok(mouth.z > lever.z, 'the mouth faces back toward the drop');
    assert.ok(Math.abs(mouth.x) < 0.01 && Math.abs(lever.x) < 0.01, 'both due north');
  });
});

describe('the sphere walker', () => {
  it('walks the deck under real Jupiter gravity (24.79, take-off 3.0)', () => {
    assert.equal(JUPITER.gravity, 24.79);
    assert.equal(JUPITER.jumpSpeed, 3.0);
    const feet = spawnPoint();
    const next = stepJupiter2Walker(
      { feet, vr: 0, grounded: true },
      { fwd: 1, strafe: 0, jump: false, yaw: 0 }, 0.05, JUPITER,
    );
    assert.equal(next.grounded, true);
    const r = Math.hypot(next.feet.x, next.feet.y, next.feet.z);
    assert.ok(Math.abs(r - groundRadiusAt(next.feet)) < 0.01, 'feet stay on the ground radius');
    const moved = Math.hypot(next.feet.x - feet.x, next.feet.y - feet.y, next.feet.z - feet.z);
    assert.ok(moved > 0.2 && moved < 0.4, `6 m/s for 0.05 s ≈ 0.3 m, got ${moved}`);
  });
  it('jumps a real Jupiter hop (0.18 m apex) and lands back on the sphere', () => {
    const feet = spawnPoint();
    let s = { feet, vr: 0, grounded: true };
    s = stepJupiter2Walker(s, { fwd: 0, strafe: 0, jump: true, yaw: 0 }, 0.05, JUPITER);
    assert.equal(s.grounded, false, 'the jump takes off');
    let apex = 0;
    for (let i = 0; i < 40; i++) {
      s = stepJupiter2Walker(s, { fwd: 0, strafe: 0, jump: false, yaw: 0 }, 0.05, JUPITER);
      const r = Math.hypot(s.feet.x, s.feet.y, s.feet.z);
      apex = Math.max(apex, r - groundRadiusAt(s.feet));
      if (s.grounded) break;
    }
    assert.equal(s.grounded, true, 'lands back on the sphere');
    assert.ok(apex > 0.1 && apex < 0.3, `Jupiter hop apex ${apex} m (real: 0.18)`);
  });
  it('walking off the cliff FALLS to the shelf — it does not teleport down', () => {
    // Start on the deck just inside the east edge and walk east,
    // straight off it (yaw π/2 is the outward tangent there).
    const start = spherePointFromDeck(84, 0);
    let s = { feet: start, vr: 0, grounded: true };
    let fell = false;
    let landed = false;
    for (let i = 0; i < 120; i++) {
      s = stepJupiter2Walker(s, { fwd: 1, strafe: 0, jump: false, yaw: Math.PI / 2 }, 0.05, JUPITER);
      if (!s.grounded) fell = true;
      if (fell && s.grounded) { landed = true; break; }
    }
    assert.equal(fell, true, 'walking off the edge goes airborne');
    assert.equal(landed, true, 'the fall lands on the shelf');
    const r = Math.hypot(s.feet.x, s.feet.y, s.feet.z);
    assert.ok(Math.abs(r - 74) < 1.3, `landed on the shelf, r=${r}`);
  });
  it('the cliff is a slope in the ground law, not a step — no wall in the numbers', () => {
    // Sample the base radius across the east scarp at ~0.26 m
    // spacing: the biggest single-sample change is a fraction of
    // a metre, so no step in the ground can ever block or
    // teleport the walker. Mid-scarp the ground is between deck
    // and shelf — a slope, not a ledge.
    let maxStep = 0;
    let prev = baseRadiusAt(dirAt(0.90, Math.PI / 2));
    for (let t = 0.90 + 0.003; t <= 1.20; t += 0.003) {
      const r = baseRadiusAt(dirAt(t, Math.PI / 2));
      maxStep = Math.max(maxStep, Math.abs(r - prev));
      prev = r;
    }
    assert.ok(maxStep < 1.0, `scarp max step ${maxStep.toFixed(2)} m per 0.26 m`);
    const mid = baseRadiusAt(dirAt(DROP_EDGE_RAD, Math.PI / 2));
    assert.ok(mid > 74 && mid < 88, `mid-scarp ${mid.toFixed(2)} is between shelf and deck`);
    assert.ok(CLIFF_HALF_RAD > 0.01 && CLIFF_HALF_RAD < 0.05, `scarp half-width ${CLIFF_HALF_RAD} rad`);
    assert.ok(STEEP_FALL_GRADIENT > 2 && STEEP_FALL_GRADIENT < 3.2, 'fall gradient sits between flank and scarp');
  });
  it('walking into the cliff face from below CLIMBS it — a slope, not a wall', () => {
    // Start on the shelf east of the edge and walk toward the
    // pole (yaw −π/2 at the east point): the walker climbs the
    // ~72° scarp step by step, stays grounded the whole way, and
    // reaches the deck — never blocked, never teleported up.
    let s = { feet: spherePointFromDeck(95, 0), vr: 0, grounded: true };
    let maxRise = 0;
    let prevR = Math.hypot(s.feet.x, s.feet.y, s.feet.z);
    let everAirborne = false;
    for (let i = 0; i < 300; i++) {
      s = stepJupiter2Walker(s, { fwd: 1, strafe: 0, jump: false, yaw: -Math.PI / 2 }, 0.05, JUPITER);
      const r = Math.hypot(s.feet.x, s.feet.y, s.feet.z);
      maxRise = Math.max(maxRise, r - prevR);
      prevR = r;
      if (!s.grounded) everAirborne = true;
      if (thetaFromPole(s.feet) < 0.95) break;
    }
    assert.ok(thetaFromPole(s.feet) < 0.95, `climbed onto the deck, theta=${thetaFromPole(s.feet).toFixed(3)}`);
    assert.equal(s.grounded, true, 'grounded on arrival');
    assert.equal(everAirborne, false, 'the climb never goes airborne');
    assert.ok(maxRise < 2, `no step rises more than a wall-step (max ${maxRise.toFixed(2)} m)`);
    const r = Math.hypot(s.feet.x, s.feet.y, s.feet.z);
    assert.ok(Math.abs(r - 88) < 1.3, `standing on the deck, r=${r.toFixed(2)}`);
  });
  it('the cave has no walls: stepping sideways out of the passage climbs the shoulder', () => {
    // Inside the passage at (0, −128), walk east (yaw 0 past the
    // basis flip up here): the walker crosses the corridor edge
    // and climbs onto the mountain flank — no block, no teleport.
    let s = { feet: spherePointFromDeck(0, -128), vr: 0, grounded: true };
    let maxJump = 0;
    let prevR = Math.hypot(s.feet.x, s.feet.y, s.feet.z);
    for (let i = 0; i < 120; i++) {
      s = stepJupiter2Walker(s, { fwd: 1, strafe: 0, jump: false, yaw: 0 }, 0.05, JUPITER);
      const r = Math.hypot(s.feet.x, s.feet.y, s.feet.z);
      maxJump = Math.max(maxJump, Math.abs(r - prevR));
      prevR = r;
      if (azimuthOf(s.feet) > 0.2) break;
    }
    assert.ok(azimuthOf(s.feet) > 0.15, `out of the corridor, azimuth=${azimuthOf(s.feet).toFixed(3)}`);
    assert.equal(s.grounded, true);
    assert.ok(maxJump < 2, `no step jumps the ground (max ${maxJump.toFixed(2)} m)`);
  });
  it('the cave has no wall at its back: walking past the lever climbs out over the far side', () => {
    // From the lever, walk on north (yaw −π/2 past the basis
    // flip): through the back of the passage and up the far
    // shoulder of the mountain, grounded throughout.
    let s = { feet: spherePointFromDeck(0, -123), vr: 0, grounded: true };
    let maxJump = 0;
    let prevR = Math.hypot(s.feet.x, s.feet.y, s.feet.z);
    for (let i = 0; i < 200; i++) {
      s = stepJupiter2Walker(s, { fwd: 1, strafe: 0, jump: false, yaw: -Math.PI / 2 }, 0.05, JUPITER);
      const r = Math.hypot(s.feet.x, s.feet.y, s.feet.z);
      maxJump = Math.max(maxJump, Math.abs(r - prevR));
      prevR = r;
      if (thetaFromPole(s.feet) > 1.65) break;
    }
    assert.ok(thetaFromPole(s.feet) > 1.6, `past the mountain, theta=${thetaFromPole(s.feet).toFixed(3)}`);
    assert.equal(s.grounded, true);
    assert.ok(maxJump < 2, `no step jumps the ground (max ${maxJump.toFixed(2)} m)`);
  });
  it('walking down the mountain flank stays grounded — only the scarp is a fall', () => {
    let s = { feet: spherePointFromDeck(30, -128), vr: 0, grounded: true };
    let fell = false;
    for (let i = 0; i < 120; i++) {
      s = stepJupiter2Walker(s, { fwd: 1, strafe: 0, jump: false, yaw: Math.PI / 2 }, 0.05, JUPITER);
      if (!s.grounded) fell = true;
      if (thetaFromPole(s.feet) > 1.7) break;
    }
    assert.equal(fell, false, 'the flank is walked down, not fallen down');
    assert.ok(thetaFromPole(s.feet) > 1.65, 'the walker reaches the shelf past the mountain');
  });
  it('the planet has no far-side wall: the ground law runs to the antipode', () => {
    assert.ok(Math.abs(baseRadiusAt(deckToDir(0, 270)) - 74) < 0.01, 'the far side is shelf, not a void');
    const g = groundRadiusAt(deckToDir(0, 270));
    assert.ok(Number.isFinite(g) && Math.abs(g - 74) <= 1.3, 'ground is defined at the antipode');
    const back = dirToDeck(deckToDir(0, -270));
    assert.ok(Math.abs(back.x) < 1e-9 && Math.abs(back.z + 270) < 1e-9, 'deck maps round-trip past the edge');
  });
  it('the ramp is walkable both ways — up and down without a fall', () => {
    // Down the ramp: start at the ramp top (θ 0.9, due north).
    let s = { feet: spherePointFromDeck(0, -79), vr: 0, grounded: true };
    let fell = false;
    for (let i = 0; i < 120; i++) {
      s = stepJupiter2Walker(s, { fwd: 1, strafe: 0, jump: false, yaw: 0 }, 0.05, JUPITER);
      if (!s.grounded) fell = true;
      if (thetaFromPole(s.feet) > 1.15) break;
    }
    assert.equal(fell, false, 'the ramp never drops the walker');
    assert.ok(thetaFromPole(s.feet) > 1.1, 'the walker reaches the shelf by the ramp');
    // Back up the ramp: walk south from the shelf.
    let up = { feet: spherePointFromDeck(0, -105), vr: 0, grounded: true };
    for (let i = 0; i < 200; i++) {
      up = stepJupiter2Walker(up, { fwd: 1, strafe: 0, jump: false, yaw: Math.PI }, 0.05, JUPITER);
      if (thetaFromPole(up.feet) < 0.9) break;
    }
    assert.ok(thetaFromPole(up.feet) < 0.95, 'the walker climbs back up the ramp');
    assert.equal(up.grounded, true);
  });
});

describe('the aura ring on the sphere', () => {
  it('a 59 m ring hugs the ground — no point sinks below the surface', () => {
    const pts = auraRingPoints(deckToDir(0, 0), 59, 48);
    assert.equal(pts.length, 48);
    for (const p of pts) {
      const r = Math.hypot(p.x, p.y, p.z);
      const ground = groundRadiusAt(p);
      assert.ok(r >= ground - 0.01 && r <= ground + 0.6, `ring point r=${r.toFixed(2)} vs ground ${ground.toFixed(2)}`);
    }
  });
  it('creatures walk the sphere toward a target without cutting through the planet', () => {
    const from = spherePointFromDeck(0, 0);
    const to = spherePointFromDeck(50, -50);
    let p = from;
    for (let i = 0; i < 200; i++) {
      p = moveOnSphere(p, to, 9, 0.05);
      const r = Math.hypot(p.x, p.y, p.z);
      assert.ok(Math.abs(r - groundRadiusAt(p)) < 0.01, `creature stays on the ground, r=${r.toFixed(2)}`);
      if (Math.hypot(p.x - to.x, p.y - to.y, p.z - to.z) < 1) break;
    }
    assert.ok(Math.hypot(p.x - to.x, p.y - to.y, p.z - to.z) < 1, 'the creature arrives');
  });
});

describe('directions', () => {
  it('dirAt builds the direction for an angle + azimuth', () => {
    const d = dirAt(1.25, 0);
    assert.ok(Math.abs(thetaFromPole(d) - 1.25) < 1e-9);
    assert.ok(Math.abs(azimuthOf(d)) < 1e-9);
    assert.ok(Math.abs(Math.hypot(d.x, d.y, d.z) - 1) < 1e-9);
  });
});
