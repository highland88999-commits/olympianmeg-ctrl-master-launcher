// tests/earth3-spawner.test.mjs
// EARTH 3 — THE LOCAL DINO SPAWNER (Merlin, 2026-11-14): the
// pure law in lib/earth3/spawner.js — the species come from
// Earth 2's real registry, placement is seeded per tile,
// spawn/despawn distances and the wild cap hold.
//
// Run: node --test tests/earth3-spawner.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DINO_SPECIES,
  DINO_SLUGS,
  SPAWN_RADIUS_M,
  DESPAWN_RADIUS_M,
  WILD_CAP,
  REFRESH_SECONDS,
  TILE_DINO_CHANCE,
  terrainGround,
  showcaseGround,
  dinosNear,
  shouldDespawn,
  stepDino,
} from '../lib/earth3/spawner.js';
import { EARTH2_MODELS } from '../lib/earth2/models.js';
import { heightAt, biomeAt } from '../lib/earth3/terrain.js';

// A flat land ground (the showcase's shape, minus its water).
const flatLand = { heightAt: () => 0, biomeAt: () => 'plains' };
// An all-water ground: no land dinosaur may ever stand on it.
const allWater = { heightAt: () => -5, biomeAt: () => 'water' };

describe('the cast: Earth 2\u2019s real dinosaurs, nothing invented', () => {
  it('lists exactly the placed Earth 2 dinosaurs', () => {
    const expected = EARTH2_MODELS.filter(
      (m) => m.kind === 'dinosaur' && m.status === 'placed' && m.file
    );
    assert.equal(DINO_SPECIES.length, expected.length);
    assert.equal(DINO_SPECIES.length, 17);
    assert.deepEqual(
      DINO_SLUGS.slice().sort(),
      expected.map((m) => m.slug).sort()
    );
  });
  it('excludes Pachycephalosaurus — its model is still awaiting upload', () => {
    assert.ok(!DINO_SLUGS.includes('pachycephalosaurus'));
    const pachy = EARTH2_MODELS.find((m) => m.slug === 'pachycephalosaurus');
    assert.equal(pachy.status, 'awaiting-upload');
    assert.equal(pachy.file, null);
  });
  it('every species carries the registry\u2019s own size, diet and posture', () => {
    for (const s of DINO_SPECIES) {
      const m = EARTH2_MODELS.find((x) => x.slug === s.slug);
      assert.equal(s.name, m.name);
      assert.equal(s.scaleM, m.scaleM);
      assert.equal(s.diet, m.diet);
      assert.equal(s.social, m.social);
      assert.equal(s.posture, m.posture);
      assert.ok(s.scaleM > 0, `${s.slug} has no size`);
    }
  });
  it('holds Earth 2\u2019s distances and cap', () => {
    assert.equal(SPAWN_RADIUS_M, 150);
    assert.equal(DESPAWN_RADIUS_M, 300);
    assert.equal(WILD_CAP, 150);
    assert.equal(REFRESH_SECONDS, 1);
    assert.ok(TILE_DINO_CHANCE > 0 && TILE_DINO_CHANCE < 1);
  });
});

describe('dinosNear', () => {
  it('finds dinosaurs around the walker on flat land', () => {
    const list = dinosNear(0, 0, 150, flatLand);
    assert.ok(list.length > 0, 'no dinos near the origin on flat land');
    assert.ok(list.length <= WILD_CAP);
    for (const d of list) {
      assert.ok(Math.hypot(d.x - 0, d.z - 0) <= SPAWN_RADIUS_M, `${d.id} too far`);
      assert.ok(DINO_SLUGS.includes(d.slug), `invented slug: ${d.slug}`);
      assert.ok(d.scaleM > 0);
      assert.ok(d.walk && d.walk.r > 0 && d.walk.speed > 0);
      assert.equal(typeof d.heading, 'number');
      assert.equal(typeof d.y, 'number');
    }
  });
  it('is deterministic: the same spot always draws the same herd', () => {
    const a = dinosNear(120, -80, 150, flatLand);
    const b = dinosNear(120, -80, 150, flatLand);
    assert.deepEqual(a, b);
    // And a different spot draws a different herd.
    const c = dinosNear(-400, 300, 150, flatLand);
    assert.notDeepEqual(
      a.map((d) => d.id).sort(),
      c.map((d) => d.id).sort()
    );
  });
  it('returns nearest first and respects the cap', () => {
    const capped = dinosNear(0, 0, 150, flatLand, 3);
    assert.equal(capped.length, 3);
    const full = dinosNear(0, 0, 150, flatLand);
    assert.deepEqual(
      capped.map((d) => d.id),
      full.slice(0, 3).map((d) => d.id)
    );
    for (let i = 1; i < capped.length; i++) {
      assert.ok(capped[i].dist >= capped[i - 1].dist, 'not nearest-first');
    }
  });
  it('never places a land dinosaur on water (the dry-ground rule)', () => {
    assert.equal(dinosNear(0, 0, 150, allWater).length, 0);
    // The showcase ground keeps dinos off the south ocean.
    const sg = showcaseGround();
    assert.equal(sg.biomeAt(0, 250), 'water');
    assert.equal(sg.biomeAt(0, 100), 'plains');
    const south = dinosNear(0, 400, 150, sg);
    assert.equal(south.length, 0, 'dinos standing in the showcase ocean');
  });
  it('works on the real terrain: land holds dinos, water holds none', () => {
    // Find a water point and a land point near the origin.
    let water = null;
    let land = null;
    outer:
    for (let r = 0; r <= 10000; r += 250) {
      for (let a = 0; a < 16; a++) {
        const x = Math.cos((a / 16) * Math.PI * 2) * r;
        const z = Math.sin((a / 16) * Math.PI * 2) * r;
        if (!water && heightAt(x, z) < 0) water = { x, z };
        if (!land && heightAt(x, z) > 5) land = { x, z };
        if (water && land) break outer;
      }
    }
    assert.ok(water, 'no water found near the origin');
    assert.ok(land, 'no land found near the origin');
    assert.equal(biomeAt(water.x, water.z), 'water');
    const inWater = dinosNear(water.x, water.z, 150, terrainGround);
    for (const d of inWater) {
      assert.notEqual(biomeAt(d.x, d.z), 'water', `${d.slug} standing in water`);
    }
    // Land itself holds a herd within a few tries around the point.
    let found = inWater.length;
    if (!found) {
      for (const [dx, dz] of [[300, 0], [-300, 0], [0, 300], [0, -300], [600, 600]]) {
        found += dinosNear(land.x + dx, land.z + dz, 150, terrainGround).length;
      }
    }
    assert.ok(found > 0, 'no dinos anywhere on land near the origin');
  });
  it('never returns more than the wild cap, even at full density', () => {
    // A ground where every tile is land and the chance is forced
    // by the law itself: the cap is the only ceiling.
    const list = dinosNear(0, 0, 150, flatLand, WILD_CAP);
    assert.ok(list.length <= WILD_CAP);
  });
});

describe('despawn', () => {
  it('a dino past 300 m is gone; inside 150 m it stays', () => {
    const [d] = dinosNear(0, 0, 150, flatLand);
    assert.ok(d, 'need a dino to test despawn');
    assert.equal(shouldDespawn(d, 0, 0), false);
    assert.equal(shouldDespawn(d, d.x + 400, d.z), true);
    assert.equal(shouldDespawn(d, d.x + 299, d.z), false);
    assert.equal(shouldDespawn(null, 0, 0), true);
  });
});

describe('stepDino', () => {
  it('walks the dino along its circuit and faces where it walks', () => {
    const [d] = dinosNear(0, 0, 150, flatLand);
    assert.ok(d, 'need a dino to test the walk');
    const moved = stepDino(d, 10, flatLand);
    // Ten seconds at 0.4–1.5 m/s moves it a few metres along its
    // circuit — never more than the arc it can cover (15 m), and
    // never standing still.
    const travelled = Math.hypot(moved.x - d.x, moved.z - d.z);
    assert.ok(travelled > 1 && travelled < 16, `travelled ${travelled} m in 10 s`);
    // It stays on its circuit: same distance from the centre.
    const r0 = Math.hypot(d.x - d.walk.cx, d.z - d.walk.cz);
    const r1 = Math.hypot(moved.x - moved.walk.cx, moved.z - moved.walk.cz);
    assert.ok(Math.abs(r1 - r0) < 0.01, 'left its circuit');
    // The heading is the circuit tangent at the new angle.
    const a = moved.walk.a;
    assert.ok(Math.abs(moved.heading - Math.atan2(-Math.sin(a), Math.cos(a))) < 1e-9);
    // The input is untouched (pure step).
    assert.notEqual(moved, d);
    assert.equal(d.walk.a, dinosNear(0, 0, 150, flatLand)[0].walk.a);
  });
  it('bigger animals walk slower than small ones', () => {
    const list = dinosNear(0, 0, 150, flatLand);
    const big = list.find((d) => d.scaleM >= 20);
    const small = list.find((d) => d.scaleM <= 2);
    if (big && small) {
      assert.ok(big.walk.speed < small.walk.speed, `${big.slug} vs ${small.slug}`);
    }
  });
  it('keeps the dino on the ground it stands on', () => {
    const [d] = dinosNear(0, 0, 150, terrainGround);
    if (!d) return; // terrain near the origin may be water
    const moved = stepDino(d, 5, terrainGround);
    assert.equal(moved.y, heightAt(moved.x, moved.z));
  });
});
