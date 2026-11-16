// Hollow Earth monster projectiles: element-matched visible ranged
// attacks (2026-10-26). Damage numbers/cooldowns untouched —
// only the delivery changes from instant to projectile-arrival.
// Run: node app/hollow-earth/tests/monster-projectiles.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import('three');
import {
  MONSTER_PROJECTILE_SPEED, MONSTER_PROJECTILE_HIT_R, MONSTER_PROJECTILE_GRACE_R,
  PROJECTILE_STYLE, PROJECTILE_SPRITE_KIND, projectileStyleFor, projectileSpriteKindFor,
  projectileFlightTime, projectilePath,
  createMonsterProjectiles,
} from '../monster-projectiles.js';
import { WALK_SPEED } from '../../../lib/world/walk-controls.js';

function manager() {
  const group = new THREE.Group();
  const arrivals = [];
  const m = createMonsterProjectiles(THREE, group, {
    groundHeight: () => 0,
    onArrive: (dmg, fromId, element) => arrivals.push({ dmg, fromId, element }),
  });
  return { group, m, arrivals };
}

test('element mapping: all seven elements, Merlin\'s asked looks', () => {
  for (const el of ['acid', 'fire', 'lightning', 'poison', 'shadow', 'sand', 'frost']) {
    assert.ok(PROJECTILE_STYLE[el], `missing style for ${el}`);
  }
  assert.equal(projectileStyleFor('acid').shape, 'ooze');
  assert.equal(projectileStyleFor('acid').label, 'dripping ooze ball');
  assert.equal(projectileStyleFor('fire').shape, 'fireball');
  assert.equal(projectileStyleFor('fire').label, 'fire bomb');
  assert.equal(projectileStyleFor('lightning').shape, 'bolt');
  assert.equal(projectileStyleFor('lightning').label, 'lightning bolt');
  assert.equal(projectileStyleFor('poison').shape, 'glob');
  assert.equal(projectileStyleFor('shadow').shape, 'smoke');
  assert.equal(projectileStyleFor('sand').shape, 'sand');
  assert.equal(projectileStyleFor('frost').shape, 'shard');
  assert.equal(projectileStyleFor('unknown-element').shape, 'smoke', 'unknown falls back to smoke');
});

test('flight math: endpoints exact, balls arc, bolts fly straight', () => {
  const from = { x: 0, y: 1.2, z: 0 };
  const to = { x: 22, y: 1.2, z: 0 };
  assert.deepEqual(projectilePath(from, to, 0, 0), from);
  assert.deepEqual(projectilePath(from, to, 0, 1), to);
  const midBall = projectilePath(from, to, 1.5, 0.5);
  assert.equal(midBall.x, 11);
  assert.equal(midBall.y, 2.7, 'ball peaks mid-flight');
  const midBolt = projectilePath(from, to, 0, 0.5);
  assert.equal(midBolt.y, 1.2, 'bolt flies straight');
});

test('flight time and dodge fairness: faster than walk, sidesteppable', () => {
  assert.equal(MONSTER_PROJECTILE_SPEED, 16, 'speed pinned — do not change silently');
  assert.ok(MONSTER_PROJECTILE_SPEED > WALK_SPEED, 'projectile must beat walk speed or running away saves you');
  assert.equal(projectileFlightTime(22), 1.375, 'max-range flight');
  assert.equal(projectileFlightTime(10), 0.625, 'min-range flight');
  // A sidestep of HIT_R at walk speed takes 0.12 s — well inside
  // even the shortest flight, so a reacting hunter can dodge.
  assert.ok(MONSTER_PROJECTILE_HIT_R / WALK_SPEED < projectileFlightTime(10));
});

test('manager: lightning bolt flies straight and hits on arrival', () => {
  const { group, m, arrivals } = manager();
  m.spawn({
    from: { x: 0, y: 1.2, z: 0 }, to: { x: 22, y: 1.2, z: 0 },
    element: 'lightning', dmg: 13, fromId: 'slot-19',
  });
  assert.equal(m.count(), 1);
  m.update(0.7, { x: 22, z: 0 });
  assert.equal(m.count(), 1, 'still flying mid-flight');
  m.update(0.7, { x: 22, z: 0 });
  assert.equal(m.count(), 0, 'arrived and cleaned up');
  assert.deepEqual(arrivals, [{ dmg: 13, fromId: 'slot-19', element: 'lightning' }], 'exact damage, exact source, exact element');
  assert.equal(group.children.length, 7, 'arrival burst left behind, then fades');
});

test('manager: hunter who sidesteps takes no damage', () => {
  const { m, arrivals } = manager();
  m.spawn({
    from: { x: 0, y: 1.2, z: 0 }, to: { x: 22, y: 1.2, z: 0 },
    element: 'acid', dmg: 12, fromId: 'slot-01',
  });
  m.update(0.7, { x: 22, z: 0 });
  m.update(0.7, { x: 30, z: 0 }); // 8 m past the endpoint
  assert.equal(m.count(), 0);
  assert.deepEqual(arrivals, [], 'a dodge must dodge');
});

test('manager: walking into the shot mid-flight still hurts', () => {
  const { m, arrivals } = manager();
  m.spawn({
    from: { x: 0, y: 1.2, z: 0 }, to: { x: 22, y: 1.2, z: 0 },
    element: 'fire', dmg: 16, fromId: 'slot-07',
  });
  m.update(0.7, { x: 11, z: 0 }); // standing on the flight path
  assert.deepEqual(arrivals, [{ dmg: 16, fromId: 'slot-07', element: 'fire' }], 'intercept hurts');
  assert.equal(m.count(), 0);
});

test('manager: acid ball arcs mid-flight and leaves a drip trail', () => {
  const { group, m } = manager();
  m.spawn({
    from: { x: 0, y: 1.2, z: 0 }, to: { x: 16, y: 1.2, z: 0 },
    element: 'acid', dmg: 12, fromId: 'slot-01',
  });
  m.update(0.5, { x: 16, z: 0 }); // half of the 1.0 s flight
  const shot = group.children.find((c) => c.type === 'Group');
  assert.ok(shot, 'ball mesh present');
  assert.ok(Math.abs(shot.position.y - 2.7) < 0.01, `ball arcs to ${shot.position.y}, expected 2.7`);
  assert.ok(group.children.length > 1, 'drip trail spawned');
});

test('manager: Korus sky-bolt appears and clears itself', () => {
  const { group, m } = manager();
  m.skyBolt({ x: 5, z: 5, groundY: 0, color: 0xffe14d });
  assert.equal(group.children.length, 1);
  m.update(0.4, { x: 0, z: 0 });
  assert.equal(group.children.length, 7, 'bolt gone, impact burst left');
  m.update(0.4, { x: 0, z: 0 });
  assert.equal(group.children.length, 0, 'burst faded, nothing leaks');
});

test('manager: dispose clears everything', () => {
  const { group, m } = manager();
  m.spawn({
    from: { x: 0, y: 1.2, z: 0 }, to: { x: 22, y: 1.2, z: 0 },
    element: 'shadow', dmg: 12, fromId: 'slot-26',
  });
  m.skyBolt({ x: 5, z: 5, groundY: 0, color: 0x8a8a9a });
  m.dispose();
  assert.equal(m.count(), 0);
  assert.equal(group.children.length, 0);
});

test('WS6 sprite map: one kind per element; null texture falls back to plain mesh, never a crash', () => {
  assert.deepEqual(PROJECTILE_SPRITE_KIND, {
    acid: 'bubble', fire: 'ember', lightning: 'spark', poison: 'wisp',
    shadow: 'mist', sand: 'grain', frost: 'flake',
  });
  for (const el of ['acid', 'fire', 'lightning', 'poison', 'shadow', 'sand', 'frost']) {
    assert.ok(projectileSpriteKindFor(el), `missing sprite kind for ${el}`);
  }
  assert.equal(projectileSpriteKindFor('unknown-element'), 'glow', 'unknown falls back to glow');
  // Node has no document, so getParticleTexture returns null:
  // the shot keeps its geometry body with NO sprite child, and
  // the puffs stay plain spheres — the wrap degrades, never throws.
  const { group, m } = manager();
  m.spawn({
    from: { x: 0, y: 1.2, z: 0 }, to: { x: 22, y: 1.2, z: 0 },
    element: 'fire', dmg: 16, fromId: 'slot-07',
  });
  const shot = group.children.find((c) => c.type === 'Group');
  assert.ok(shot, 'ball mesh present');
  assert.ok(!shot.children.some((c) => c.isSprite), 'no sprite when the texture is null');
  m.update(0.5, { x: 22, z: 0 });
  assert.ok(group.children.length > 1, 'drip trail spawned');
  assert.ok(group.children.every((c) => !c.isSprite), 'trail puffs are plain meshes without a texture');
});

test('radii pinned: endpoint hit radius and mid-flight grace', () => {
  assert.equal(MONSTER_PROJECTILE_HIT_R, 1.2);
  assert.equal(MONSTER_PROJECTILE_GRACE_R, 0.8);
});
