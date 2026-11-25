// Dive round (Merlin, Nov 24 ~16:51): graphic textures on every
// object — landmarks, scatter and dressing wear procedural maps.
// DOM stub is installed BEFORE any imports (static imports would
// hoist above it, so this file uses dynamic imports after the
// stub — the Middle-earth builders-test pattern).

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

/* The twelve dive-round makers and the kind each dresses. */
const DIVE_MAKERS = [
  'darkStoneTexture', 'palePillarTexture', 'woodTexture',
  'rustedMetalTexture', 'iceTexture', 'sandstoneTexture',
  'emberRockTexture', 'acidBubbleTexture', 'poisonStoneTexture',
  'mountainStoneTexture', 'sporeCapTexture', 'stormCrystalTexture',
];

test('dive makers exist and return wrapped sRGB textures', () => {
  for (const fn of DIVE_MAKERS) {
    assert.equal(typeof T[fn], 'function', `${fn} missing`);
    const tex = T[fn]();
    assert.ok(tex, `${fn} returned nothing`);
    assert.equal(tex.wrapS, THREE.RepeatWrapping, `${fn} wrapS`);
    assert.equal(tex.wrapT, THREE.RepeatWrapping, `${fn} wrapT`);
    assert.equal(tex.colorSpace, THREE.SRGBColorSpace, `${fn} colourSpace`);
  }
});

test('sharedTexture caches one instance per maker and returns null for a stub T', () => {
  const a = T.sharedTexture(T, 'darkStoneTexture');
  const b = T.sharedTexture(T, 'darkStoneTexture');
  assert.ok(a, 'sharedTexture returned nothing for a real maker');
  assert.equal(a, b, 'same maker must return the same texture instance');
  assert.equal(T.sharedTexture(T, 'noSuchMaker'), null, 'unknown maker must be null, never a crash');
  assert.equal(T.sharedTexture({}, 'darkStoneTexture'), null, 'a stub T with no makers must be null');
  assert.equal(T.sharedTexture(null, 'darkStoneTexture'), null, 'a null T must be null');
});

/* Glow pieces that stay flat on purpose — a map would fight the
 * glow. Everything else standard in a landmark must wear a map.
 * (MeshBasicMaterial pieces — snow caps, brazier flame/glow —
 * are unlit by design and are not standard materials at all.) */
function isFlatAllowed(type, m) {
  const g = m.geometry;
  const y = m.position.y;
  const p = g.parameters || {};
  if (type === 'ember-spire') return g.type === 'ConeGeometry' && y === 10.5; // burning tip
  if (type === 'storm-pylon') {
    return (g.type === 'TorusGeometry' && y === 11) || (g.type === 'SphereGeometry' && y === 12.6);
  }
  if (type === 'mire-arch') return g.type === 'SphereGeometry' && y === 7.4; // mist orb
  if (type === 'gloom-monolith') return g.type === 'SphereGeometry' && y === 12.5; // rune orb
  if (type === 'korus-throne') return g.type === 'CylinderGeometry' && y === 7 && p.radiusTop === 0.12; // lightning rods
  if (type === 'haven') {
    return (g.type === 'SphereGeometry' && y === 0 && p.radius === 26) // glow dome
      || (g.type === 'CylinderGeometry' && y === 6 && p.radiusTop === 0.4) // gold pole
      || (g.type === 'SphereGeometry' && y === 12.6 && p.radius === 1.1); // crown orb
  }
  if (type === 'intro-arch') return g.type === 'SphereGeometry' && y === 8.6; // arrival orb
  return false;
}

test('every landmark type dresses every standard-material body mesh', () => {
  for (const type of LANDMARK_TYPES) {
    const built = buildLandmark(type, THREE, T);
    let standard = 0;
    let textured = 0;
    built.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial) return;
      standard++;
      if (isFlatAllowed(type, o)) return;
      assert.ok(o.material.map, `${type}: ${o.geometry.type} at y=${o.position.y} wears no texture`);
      assert.equal(o.material.map.wrapS, THREE.RepeatWrapping, `${type}: map must repeat-wrap`);
      textured++;
    });
    assert.ok(standard > 0, `${type} has no standard-material mesh at all`);
    assert.ok(textured > 0, `${type} has no textured mesh at all`);
  }
});

test('landmarks share one texture instance per maker across types', () => {
  // The gloom slab and the throne dais both wear dark stone —
  // the same canvas, not two mintings.
  const gloom = buildLandmark('gloom-monolith', THREE, T);
  const throne = buildLandmark('korus-throne', THREE, T);
  const slab = gloom.children.find((o) => o.geometry && o.geometry.type === 'BoxGeometry' && o.position.y === 7);
  const dais = throne.children.find((o) => o.geometry && o.geometry.type === 'BoxGeometry' && o.position.y === 0.6);
  assert.ok(slab && slab.material.map, 'gloom slab must be textured');
  assert.ok(dais && dais.material.map, 'throne dais must be textured');
  assert.equal(slab.material.map, dais.material.map, 'dark stone must be one shared instance');
});

test('inverted-horizon cones wear dark stone; the core-sun stays flat on purpose', () => {
  const horizon = buildAmbient('inverted-horizon', THREE, T);
  assert.ok(horizon.children.length >= 10);
  for (const peak of horizon.children) {
    assert.ok(peak.material.map, 'horizon peak wears no texture');
    assert.equal(peak.material.map, T.sharedTexture(T, 'darkStoneTexture'), 'horizon peaks wear the shared dark stone');
    assert.equal(peak.material.color.getHex(), 0xffffff, 'horizon peaks go white — the texture carries the dark');
  }
  const sun = buildAmbient('core-sun', THREE, T);
  sun.traverse((o) => {
    if (o.isMesh) assert.equal(o.material.map, null, 'the core-sun is a glow, never a map');
  });
});

/* Scatter kind -> shared texture instance, and the geometry
 * signature that kind builds with (the pieces are direct
 * children of the world group; landmark meshes nest inside
 * their landmark groups). */
const SCATTER_MAP = {
  'ooze-bubble': 'acidBubbleTexture',
  'ember-rock': 'emberRockTexture',
  'storm-crystal': 'stormCrystalTexture',
  'spore-cap': 'sporeCapTexture',
  'gloom-pillar': 'darkStoneTexture',
  'dune-bone': 'sandstoneTexture',
  'peak-rock': 'mountainStoneTexture',
  'frost-shard': 'iceTexture',
};

test('every scatter kind wears its kind texture in the built world', () => {
  const world = buildWorld(THREE, DATA.WORLD, T, { gateOpen: false });
  const wanted = {};
  for (const [kind, maker] of Object.entries(SCATTER_MAP)) wanted[kind] = T.sharedTexture(T, maker);
  const seen = {};
  for (const kind of Object.keys(SCATTER_MAP)) seen[kind] = 0;
  for (const o of world.group.children) {
    if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial) continue;
    const g = o.geometry;
    const p = g.parameters || {};
    const isScatter =
      (g.type === 'SphereGeometry' && p.widthSegments === 8 && p.heightSegments === 6)
      || (g.type === 'ConeGeometry' && p.radialSegments === 5)
      || (g.type === 'CylinderGeometry' && p.radialSegments === 6);
    if (!isScatter) continue;
    const kind = Object.keys(wanted).find((k) => wanted[k] === o.material.map);
    assert.ok(kind, `scatter piece (${g.type}) wears no recognised kind texture`);
    seen[kind]++;
  }
  for (const kind of Object.keys(SCATTER_MAP)) {
    assert.ok(seen[kind] > 0, `no ${kind} scatter built wearing ${SCATTER_MAP[kind]}`);
  }
  world.dispose();
});

test('scatter colour rule: dark kinds go white, light kinds keep their colour', () => {
  const world = buildWorld(THREE, DATA.WORLD, T, { gateOpen: false });
  const ember = T.sharedTexture(T, 'emberRockTexture');
  const gloom = T.sharedTexture(T, 'darkStoneTexture');
  const spore = T.sharedTexture(T, 'sporeCapTexture');
  let emberWhite = 0;
  let gloomWhite = 0;
  let sporeKept = 0;
  for (const o of world.group.children) {
    if (!o.isMesh || !o.material || !o.material.map) continue;
    if (o.material.map === ember) { assert.equal(o.material.color.getHex(), 0xffffff, 'ember-rock must go white'); emberWhite++; }
    if (o.material.map === gloom) { assert.equal(o.material.color.getHex(), 0xffffff, 'gloom-pillar must go white'); gloomWhite++; }
    if (o.material.map === spore) { assert.equal(o.material.color.getHex(), 0xc06ae0, 'spore-cap must keep its violet'); sporeKept++; }
  }
  assert.ok(emberWhite > 0 && gloomWhite > 0 && sporeKept > 0, 'expected textured pieces of each checked kind');
  world.dispose();
});
