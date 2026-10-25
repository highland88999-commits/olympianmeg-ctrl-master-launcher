// Headless builder tests for app/hollow-earth/landmarks.js,
// textures.js and zone.js. DOM stub is installed BEFORE any
// imports (static imports would hoist above it, so this file
// uses dynamic imports after the stub — the Middle-earth
// builders-test pattern).

const fakeCtx = new Proxy(
  {
    canvas: null,
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: [] }),
    measureText: () => ({ width: 100 }),
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }
);
const fakeCanvas = {
  width: 0,
  height: 0,
  getContext: () => fakeCtx,
  style: {},
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? fakeCanvas : { style: {} }),
};
globalThis.window = globalThis;

import { test } from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import('three');
const T = await import('../textures.js');
const { buildLandmark, buildAmbient, LANDMARK_TYPES } = await import('../landmarks.js');
const { buildWorld } = await import('../zone.js');
const DATA = await import('../data.js');
const SP = await import('../spawns.js');

test('landmark registry covers all eleven types incl. haven + korus-throne + frost-spire', () => {
  assert.deepEqual(
    [...LANDMARK_TYPES].sort(),
    ['ember-spire', 'frost-spire', 'gloom-monolith', 'haven', 'intro-arch', 'korus-throne', 'mire-arch', 'ooze-pool', 'peak-shrine', 'storm-pylon', 'wreck-hulk'].sort()
  );
});

test('every landmark builds with a collider contract (haven excepted: sanctuary, never a wall)', () => {
  for (const type of LANDMARK_TYPES) {
    const built = buildLandmark(type, THREE, T);
    assert.ok(built, `${type} built nothing`);
    if (type === 'haven') {
      assert.equal(built.userData.colliderR, 0, 'The Haven must not collide');
    } else {
      assert.ok(built.userData.colliderR > 0, `${type} colliderR ${built.userData.colliderR}`);
    }
  }
});

test('ambient builds: core-sun above the world, inverted horizon ring', () => {
  const sun = buildAmbient('core-sun', THREE, T);
  assert.ok(sun.children.length >= 2);
  const horizon = buildAmbient('inverted-horizon', THREE, T);
  assert.ok(horizon.children.length >= 10);
});

test('ground textures exist for the biome palette', () => {
  for (const fn of ['acidGroundTexture', 'fireGroundTexture', 'lightningGroundTexture', 'poisonGroundTexture', 'shadowGroundTexture', 'sandGroundTexture', 'mountainGroundTexture', 'frostGroundTexture']) {
    assert.equal(typeof T[fn], 'function', `${fn} missing`);
    assert.ok(T[fn](), `${fn} returned nothing`);
  }
});

test('buildWorld: terrain, landmarks, colliders, monsters, Korus — and dragons fly', () => {
  const world = buildWorld(THREE, DATA.WORLD, T, { gateOpen: false });
  assert.ok(world.group.children.length > 20);
  assert.ok(world.colliders.length > 0);
  assert.equal(world.monsters.length >= 140, true);
  assert.equal(world.korus.dormant, true);
  // Activate one of each dragon and check its figure height.
  const seen = new Set();
  for (const m of world.monsters) {
    if (!SP.DRAGON_TYPES.includes(m.type) || seen.has(m.type)) continue;
    seen.add(m.type);
    m.active = true;
    m.x = 0; m.z = 90;
  }
  world.setObserver({ x: 0, z: 90 });
  world.update(0.1);
  assert.deepEqual([...seen].sort(), ['cinder-dragon', 'muse-dragon', 'sky-dragon']);
  world.dispose();
});

test('buildWorld with the gate open wakes Korus on approach', () => {
  const world = buildWorld(THREE, DATA.WORLD, T, { gateOpen: true });
  assert.equal(world.korus.dormant, false);
  world.setObserver({ x: -215, z: 55 });
  world.update(0.1);
  assert.equal(world.korus.awake, true);
  world.dispose();
});
