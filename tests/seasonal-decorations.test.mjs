// tests/seasonal-decorations.test.mjs
// Halloween mist removal (Merlin, 2026-10-27: "get rid of the things
// marked with x's from this space entirely, leave the pumpkins"):
// - the hub's Halloween builder builds ZERO mist sprites
// - the pumpkins (meshes, nuggets, harvest proxies, spots) still build
// - update(t) runs without throwing (no dangling mist reference)
// - SeasonalDecor still mounts the builder + PumpkinHarvest in the hub
//   (HomeScene only — the hub is the one space that mounts it)
//
// The builder takes THREE as an argument, so a small stub stands in
// for three.js; makeGlowTexture needs a document canvas stub.
//
// Run: node --test tests/seasonal-decorations.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { BUILDERS } from '../lib/seasonal/decorations.js';
import { getSeason } from '../lib/seasonal/seasons.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

// Minimal document canvas for makeGlowTexture.
globalThis.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      createRadialGradient: () => ({ addColorStop() {} }),
      fillRect() {},
      fillStyle: null,
    }),
  }),
};

class V {
  constructor() { this.x = 0; this.y = 0; this.z = 0; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
}
class Obj {
  constructor() {
    this.position = new V();
    this.scale = new V();
    this.rotation = new V();
    this.userData = {};
  }
  updateMatrix() {}
}
class Group extends Obj {
  constructor() { super(); this.children = []; }
  add(...objs) { this.children.push(...objs); return this; }
  traverse(fn) {
    const walk = (o) => { fn(o); (o.children || []).forEach(walk); };
    walk(this);
  }
}
class Sprite extends Obj {
  constructor(material) { super(); this.material = material; }
}
class Mesh extends Obj {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}
class InstancedMesh extends Mesh {
  constructor(geometry, material, count) {
    super(geometry, material);
    this.count = count;
    this.instanceMatrix = { needsUpdate: false };
    this.instanceColor = null;
  }
  setMatrixAt() {}
  setColorAt() { this.instanceColor = { needsUpdate: false }; }
}
class Dummy {
  constructor(...args) { this.args = args; Object.assign(this, args[0] || {}); }
}
class BufferGeometryStub {
  setAttribute() {}
}
const THREE = {
  Group,
  Sprite,
  SpriteMaterial: Dummy,
  Mesh,
  MeshBasicMaterial: Dummy,
  MeshStandardMaterial: Dummy,
  InstancedMesh,
  SphereGeometry: Dummy,
  CylinderGeometry: Dummy,
  OctahedronGeometry: Dummy,
  BufferGeometry: BufferGeometryStub,
  Float32BufferAttribute: Dummy,
  LineSegments: Dummy,
  LineBasicMaterial: Dummy,
  PointLight: class extends Obj {},
  Object3D: Obj,
  Color: class { setHex() { return this; } },
  Matrix4: class { makeScale() {} },
  CanvasTexture: Dummy,
  AdditiveBlending: 'additive',
};

function walkGroup(group) {
  const out = [];
  group.traverse((o) => out.push(o));
  return out;
}

describe('Halloween season window (why the puffs were live)', () => {
  it('Oct 27 is Halloween season, so the hub builder runs', () => {
    assert.equal(getSeason(new Date(2026, 9, 27)), 'halloween');
  });
});

describe('buildHalloween: mist gone, pumpkins intact', () => {
  const made = BUILDERS.halloween(THREE);
  const nodes = walkGroup(made.group);
  const sprites = nodes.filter((n) => n instanceof Sprite);
  const instanced = nodes.filter((n) => n instanceof InstancedMesh);

  it('builds zero mist sprites (the 0.35-opacity purple-grey puffs)', () => {
    const mist = sprites.filter((s) => s.material && s.material.opacity === 0.35);
    assert.equal(mist.length, 0, 'no mist sprites in the hub group');
  });

  it('keeps the 12 jack-o-lantern face glows (0.85 opacity, additive)', () => {
    const faces = sprites.filter(
      (s) => s.material && s.material.opacity === 0.85 && s.material.blending === 'additive'
    );
    assert.equal(faces.length, 12);
  });

  it('keeps the pumpkin + stem + nugget instanced meshes (12 each)', () => {
    assert.equal(instanced.filter((m) => m.count === 12).length, 3);
    const pumpkins = instanced.find((m) => m.material && m.material.color === 0xd9621e);
    assert.ok(pumpkins, 'pumpkin mesh still built');
    const nuggets = instanced.find((m) => m.material && m.material.color === 0xffd75e);
    assert.ok(nuggets, 'gold nugget mesh still built');
  });

  it('keeps 12 harvest proxies and 12 pumpkin spots', () => {
    assert.equal(made.proxies.length, 12);
    assert.equal(made.pumpkinSpots.length, 12);
    assert.equal(typeof made.setHarvested, 'function');
  });

  it('update(t) runs with no mist reference and harvest still dims', () => {
    assert.doesNotThrow(() => made.update(1.5));
    assert.doesNotThrow(() => made.update(3.0));
    made.setHarvested(0);
    assert.doesNotThrow(() => made.update(4.0));
    const pumpkins = instanced.find((m) => m.material && m.material.color === 0xd9621e);
    assert.ok(pumpkins.instanceColor, 'harvested pumpkin dimmed via setColorAt');
  });
});

describe('static pins: no mist code, hub mounts intact', () => {
  const src = read('lib/seasonal/decorations.js');
  const decor = read('components/SeasonalDecor.jsx');
  const home = read('components/HomeScene.jsx');
  const portalDecor = read('components/PortalSeasonalDecor.jsx');

  it('no mist sprite code remains in the builder', () => {
    assert.ok(!src.includes('mistTex'), 'mist texture gone');
    assert.ok(!src.includes('mists'), 'mist array gone');
    assert.ok(!src.includes('rgba(150,120,200,0.5)'), 'mist colour gone');
  });

  it('SeasonalDecor still mounts the season builder + PumpkinHarvest', () => {
    assert.ok(decor.includes('BUILDERS[season]'), 'builder still mounted');
    assert.ok(decor.includes("season === 'halloween' && built.proxies"), 'harvest still mounted');
    assert.ok(decor.includes('<PumpkinHarvest'), 'PumpkinHarvest still mounted');
  });

  it('HomeScene still mounts SeasonalDecor in the hub (not in a realm)', () => {
    assert.ok(home.includes('<SeasonalDecor'), 'hub mounts SeasonalDecor');
    assert.ok(home.includes('onTreeSelect='), 'hub passes the tree dive handler');
    assert.ok(home.includes('{!inRealm && ('), 'hub-only gating present');
  });

  it('the portal menu garnish never used the 3D mist (untouched, out of scope)', () => {
    assert.ok(!portalDecor.includes('seasonal/decorations'), 'menu garnish is emoji-only');
  });
});
