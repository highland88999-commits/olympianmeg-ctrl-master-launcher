// Headless builder tests for app/middle-earth/landmarks.js + textures.js
// DOM stub is installed BEFORE any imports (static imports would hoist above it,
// so this file uses dynamic imports after the stub).

// --- fake canvas: every 2d-context method is a no-op -------------------------
const fakeCtx = new Proxy(
  {
    canvas: null,
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: [] }),
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
const { buildLandmark, buildAmbient } = await import('../landmarks.js');

const LANDMARK_TYPES = [
  'hobbit-hole', 'party-tree', 'green-dragon', 'rivendell-terrace', 'waterfall',
  'moria-door', 'moria-bridge', 'mallorn-tree', 'galadriel-mirror', 'mirkwood-web',
  'edoras-hall', 'minas-tirith', 'black-gate', 'barad-dur', 'mount-doom', 'arganath',
];

const AMBIENT_TYPES = ['sheep', 'deer', 'horse', 'bird', 'firefly', 'ember', 'orc-sentry'];

const TEXTURE_MAKERS = [
  'grassTexture', 'forestFloorTexture', 'stoneTexture', 'marbleTexture',
  'goldLeafTexture', 'thatchTexture', 'ashTexture', 'lavaTexture',
  'rockTexture', 'barkTexture', 'waterTexture',
];

test('texture makers: each returns a THREE.CanvasTexture', () => {
  for (const name of TEXTURE_MAKERS) {
    assert.equal(typeof T[name], 'function', `T.${name} must be a function`);
    const tex = T[name]();
    assert.ok(tex instanceof THREE.CanvasTexture, `T.${name}() must return THREE.CanvasTexture`);
  }
});

test('landmarks: every type builds, group is THREE.Group, colliders array', () => {
  for (const type of LANDMARK_TYPES) {
    const { group, colliders } = buildLandmark(type, THREE, T);
    assert.ok(group instanceof THREE.Group, `${type}: group must be THREE.Group`);
    assert.ok(Array.isArray(colliders), `${type}: colliders must be an array`);
    assert.ok(group.children.length > 0, `${type}: group should not be empty`);
    for (const c of colliders) {
      assert.ok(typeof c.x === 'number' && typeof c.z === 'number' && typeof c.r === 'number', `${type}: collider needs x,z,r`);
    }
  }
});

test('buildLandmark: unknown type returns empty group + empty colliders', () => {
  const { group, colliders } = buildLandmark('not-a-real-type', THREE, T);
  assert.ok(group instanceof THREE.Group);
  assert.deepEqual(colliders, []);
});

test('buildLandmark: missing texture makers fall back to plain colors', () => {
  for (const type of LANDMARK_TYPES) {
    const { group, colliders } = buildLandmark(type, THREE, {});
    assert.ok(group instanceof THREE.Group, `${type}: must build with empty T module`);
    assert.ok(Array.isArray(colliders));
  }
});

test('ambient: every type builds and exposes update(t, dt)', () => {
  for (const type of AMBIENT_TYPES) {
    const { group, update } = buildAmbient(type, THREE, T);
    assert.ok(group instanceof THREE.Group, `${type}: group must be THREE.Group`);
    assert.equal(typeof update, 'function', `${type}: update must be a function`);
    update(0, 0.016);
    update(1.5, 0.016);
  }
});
