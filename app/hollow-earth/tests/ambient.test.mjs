// WS4 ambient systems (2026-11-16): per-band particles (G-04)
// and procedural ambient life (G-08). No document needed — both
// builders take their texture as an option (null in tests means
// plain points, never a crash) and add zero real lights.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import('three');
const { buildAmbientParticles, AMBIENT_BANDS, AMBIENT_TOTAL } = await import('../ambient.js');
const { buildAmbientLife, AMBIENT_LIFE_COUNTS } = await import('../ambient-life.js');
const { biomeWeights } = await import('../biomes.js');
const { CYCLE_S } = await import('../elemental.js');

test('G-04: one shared Points system, 550 points, every point gated on its band weight', () => {
  const built = buildAmbientParticles(THREE, { heightAt: () => 0, texture: null });
  assert.equal(AMBIENT_TOTAL, 550, `ambient total ${AMBIENT_TOTAL}, expected 550`);
  let points = null;
  let lights = 0;
  built.group.traverse((o) => {
    if (o.isLight) lights++;
    if (o.isPoints) points = o;
  });
  assert.ok(points, 'no THREE.Points in the ambient group');
  assert.equal(lights, 0, 'ambient particles must add zero lights');
  assert.equal(points.geometry.attributes.position.count, AMBIENT_TOTAL);
  const meta = built.group.userData.ambient.meta;
  assert.equal(meta.length, AMBIENT_TOTAL);
  for (const m of meta) {
    const w = biomeWeights(m.x, m.z)[m.band] || 0;
    assert.ok(w >= 0.35, `particle for ${m.band} at (${m.x.toFixed(0)},${m.z.toFixed(0)}) has weight ${w.toFixed(2)} < 0.35`);
  }
  for (const band of Object.keys(AMBIENT_BANDS)) {
    assert.equal(
      meta.filter((m) => m.band === band).length,
      AMBIENT_BANDS[band].count,
      `${band} particle count`
    );
  }
});

test('G-04: update drifts points and recycles them in place', () => {
  const built = buildAmbientParticles(THREE, { heightAt: () => 0, texture: null });
  const pos = built.group.userData.ambient.points.geometry.attributes.position.array;
  const before = [pos[0], pos[1], pos[2]];
  built.update(0.5, 10);
  const after = [pos[0], pos[1], pos[2]];
  assert.ok(after[1] !== before[1] || after[0] !== before[0], 'points must move on update');
  // Recycle: a point driven past its ceiling wraps to its floor.
  const meta = built.group.userData.ambient.meta;
  meta[0].y = meta[0].yMax + 10;
  built.update(0.5, 10);
  assert.ok(meta[0].y <= meta[0].yMax, 'risen point must recycle to its floor');
});

test('G-08: ambient life — 5 sky wings, 16 spore-flies, night fireflies; zero lights, no monsters', () => {
  const built = buildAmbientLife(THREE, { heightAt: () => 0, texture: null });
  let lights = 0;
  let points = 0;
  built.group.traverse((o) => {
    if (o.isLight) lights++;
    if (o.isPoints) points++;
  });
  assert.equal(lights, 0, 'ambient life must add zero lights');
  assert.equal(points, 1, 'exactly one firefly Points system');
  const life = built.group.userData.ambientLife;
  assert.equal(life.wings.length, AMBIENT_LIFE_COUNTS.skyWings);
  assert.equal(life.sporeFlies.length, AMBIENT_LIFE_COUNTS.sporeFlies);
  assert.equal(life.ffCount, AMBIENT_LIFE_COUNTS.fireflies);
  // Nothing here is a monster record or a collider: the group is
  // pure dressing, outside the monster field entirely.
  assert.equal(built.group.children.length, 5 + 16 + 1);
});

test('G-08: wings circle on update; fireflies are dark at noon and lit at midnight', () => {
  const built = buildAmbientLife(THREE, { heightAt: () => 0, texture: null });
  const life = built.group.userData.ambientLife;
  const wing = life.wings[0];
  const before = wing.group.position.clone();
  built.update(0.5, 10);
  assert.ok(!wing.group.position.equals(before), 'sky wing must move on update');
  const ffMat = life.fireflies.material;
  built.update(0.016, CYCLE_S * 0.25); // noon: dayFactor 1
  assert.equal(ffMat.opacity, 0, 'fireflies must be dark at noon');
  built.update(0.016, CYCLE_S * 0.75); // midnight: dayFactor 0
  assert.ok(ffMat.opacity > 0, `fireflies must glow at midnight, opacity ${ffMat.opacity}`);
});
