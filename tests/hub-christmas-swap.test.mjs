// tests/hub-christmas-swap.test.mjs
// Hub Christmas swap (Merlin, Nov 25, 2026 — "tree where earth is"):
// - the swap is active exactly when treeVisible() is true
//   (Nov 27 through Twelfth Night Jan 6; gone Jan 8)
// - the swapped tree stands at the Earth's centre, base at the Earth's
//   bottom (y = -85), scaled so its height equals the Earth's diameter
//   (110), crowned with a glowing blue giant sun instead of the gold star
// - mistletoe hangs high above the topper, with a clear gap
// - the Earth hides while the swap is active; the tree keeps the Earth's
//   click behaviour (same handlers, same gating) via an invisible
//   hit-proxy sphere; backdrop planets wear garland, user planets don't
//
// The builders take THREE as an argument, so a small stub stands in
// for three.js; buildChristmasTree needs a document canvas stub.
//
// Run: node --test tests/hub-christmas-swap.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { treeVisible } from '../lib/seasonal/seasons.js';
import {
  TREE_HEIGHT,
  TREE_MAX_RADIUS,
  BLUE_SUN_COLOR,
  MISTLETOE_Y,
  isTreeSwapActive,
  christmasTreeTopper,
  treeSwapPlacement,
  buildChristmasTree,
  buildMistletoe,
} from '../lib/seasonal/tree.js';
import { EARTH_CENTER, EARTH_RADIUS } from '../lib/god-orbits.js';
import { EARTH_RADIUS as GEO_EARTH_RADIUS } from '../lib/geo.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

// Minimal document canvas for makeSprite.
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
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
}
class Obj {
  constructor() {
    this.position = new V();
    this.scale = new V();
    this.scale.setScalar(1);
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
class Dummy {
  constructor(...args) { this.args = args; Object.assign(this, args[0] || {}); }
  dispose() {}
}
function makePositionAttr(count) {
  const xs = new Array(count).fill(0.5);
  const ys = new Array(count).fill(0.5);
  const zs = new Array(count).fill(0.5);
  return {
    count,
    getX: (i) => xs[i],
    getY: (i) => ys[i],
    getZ: (i) => zs[i],
    setX: (i, v) => { xs[i] = v; },
    setZ: (i, v) => { zs[i] = v; },
  };
}
class FakeGeometry {
  constructor(...args) {
    this.args = args;
    this.attributes = { position: makePositionAttr(6) };
  }
  setAttribute() {}
  computeVertexNormals() {}
  center() { return this; }
  dispose() {}
}
class Shape {
  moveTo() {}
  lineTo() {}
  closePath() {}
}
const THREE = {
  Group,
  Sprite,
  SpriteMaterial: Dummy,
  Mesh,
  MeshBasicMaterial: Dummy,
  MeshStandardMaterial: Dummy,
  SphereGeometry: FakeGeometry,
  CylinderGeometry: FakeGeometry,
  ConeGeometry: FakeGeometry,
  BoxGeometry: FakeGeometry,
  ExtrudeGeometry: FakeGeometry,
  Shape,
  PointLight: class extends Obj {},
  Object3D: Obj,
  Color: class {
    constructor(hex) { this.hex = hex; this.r = 1; this.g = 1; this.b = 1; }
    copy() { return this; }
    lerp() { return this; }
    setHex(h) { this.hex = h; return this; }
  },
  MathUtils: { clamp: (v, a, b) => Math.min(b, Math.max(a, v)) },
  Float32BufferAttribute: Dummy,
  CanvasTexture: Dummy,
  AdditiveBlending: 'additive',
};

function walkGroup(group) {
  const out = [];
  group.traverse((o) => out.push(o));
  return out;
}

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

describe('swap gate: active exactly when treeVisible is true', () => {
  it('Nov 27, Dec 25, Jan 6 in; Jan 8 out', () => {
    for (const d of [new Date(2026, 10, 27), new Date(2026, 11, 25), new Date(2027, 0, 6)]) {
      assert.equal(isTreeSwapActive(d), true, `${d.toDateString()} should be in the swap`);
      assert.equal(treeVisible(d), true);
    }
    assert.equal(isTreeSwapActive(new Date(2027, 0, 8)), false, 'Jan 8: tree is gone');
    assert.equal(treeVisible(new Date(2027, 0, 8)), false);
  });

  it('topper follows the swap: blue sun in season, gold star out', () => {
    assert.equal(christmasTreeTopper(new Date(2026, 11, 25)), 'blueSun');
    assert.equal(christmasTreeTopper(new Date(2026, 10, 27)), 'blueSun');
    assert.equal(christmasTreeTopper(new Date(2027, 0, 6)), 'blueSun');
    assert.equal(christmasTreeTopper(new Date(2027, 0, 8)), 'star');
    assert.equal(christmasTreeTopper(new Date(2026, 6, 4)), 'star');
  });
});

describe('treeSwapPlacement: tree stands in the Earth\'s place', () => {
  const swap = treeSwapPlacement(EARTH_CENTER, EARTH_RADIUS);

  it('earth constants agree (god-orbits is the hub source, geo.js matches)', () => {
    assert.equal(EARTH_RADIUS, 55);
    assert.equal(GEO_EARTH_RADIUS, 55);
    assert.deepEqual(EARTH_CENTER, { x: 0, y: -30, z: -80 });
  });

  it('scale makes the tree height equal the Earth diameter (110)', () => {
    assert.ok(approx(swap.scale * TREE_HEIGHT, EARTH_RADIUS * 2),
      `scale ${swap.scale} x height ${TREE_HEIGHT} should be 110`);
    assert.ok(approx(swap.scale, 110 / 31.2), 'scale is 110 / 31.2, computed not hardcoded');
  });

  it('base sits at the Earth bottom, top at the Earth top', () => {
    assert.equal(swap.position[1], EARTH_CENTER.y - EARTH_RADIUS, 'base y = -85');
    assert.ok(approx(swap.position[1] + TREE_HEIGHT * swap.scale, EARTH_CENTER.y + EARTH_RADIUS),
      'top y = 25, the Earth\'s top');
    assert.equal(swap.position[0], EARTH_CENTER.x);
    assert.equal(swap.position[2], EARTH_CENTER.z);
  });

  it('swap topper is the blue sun', () => {
    assert.equal(swap.topper, 'blueSun');
  });

  it('hit-proxy sphere bounds the whole tree (not just the globe)', () => {
    // The tree's corners poke past the globe's 55, so a globe-sized
    // proxy would miss taps on them — the proxy must be bigger.
    assert.ok(swap.hitRadius > EARTH_RADIUS, `hitRadius ${swap.hitRadius} beats the globe 55`);
    assert.ok(swap.hitRadius < 75, `hitRadius ${swap.hitRadius} stays close to the tree`);
    // And the proxy is BIGGER than the spawn camera's 65 from the Earth
    // centre — the camera sits inside it, which is why the proxy
    // material must be DoubleSide (a FrontSide sphere raycasts nothing
    // from inside, so spawn taps would miss). ORBIT_CENTER y 35 vs
    // EARTH_CENTER y -30: 65 apart, same x/z.
    assert.ok(swap.hitRadius > 65, `hitRadius ${swap.hitRadius} swallows the spawn camera at 65`);
    // geometric proof: distance from the Earth centre to the tree's
    // farthest built points, in world units — topper top and the base
    // foliage corner — must both sit inside the proxy.
    const topperTop = Math.abs((TREE_HEIGHT + 1.6) * swap.scale - EARTH_RADIUS);
    assert.ok(topperTop < swap.hitRadius, `topper top ${topperTop} inside ${swap.hitRadius}`);
    const baseCorner = Math.hypot(
      TREE_MAX_RADIUS * swap.scale,
      0.75 * swap.scale - EARTH_RADIUS
    );
    assert.ok(baseCorner < swap.hitRadius, `base foliage corner ${baseCorner} inside ${swap.hitRadius}`);
  });
});

describe('buildChristmasTree: blue-sun topper option, gold star default', () => {
  it('default build wears the gold star (unchanged behaviour)', () => {
    const made = buildChristmasTree(THREE);
    const nodes = walkGroup(made.group);
    const gold = nodes.filter((n) => n instanceof Mesh && n.material && n.material.color === 0xffd700);
    assert.ok(gold.length >= 1, 'gold star mesh present');
    const blue = nodes.filter((n) => n instanceof Mesh && n.material && n.material.color === BLUE_SUN_COLOR);
    assert.equal(blue.length, 0, 'no blue sun in the default build');
    assert.doesNotThrow(() => made.update(2.0));
    // the star spins with the beat
    assert.equal(gold[0].rotation.y, 2.0 * 0.6);
  });

  it('blueSun build wears a glowing blue giant sun, no gold star', () => {
    const made = buildChristmasTree(THREE, { topper: 'blueSun' });
    const nodes = walkGroup(made.group);
    const suns = nodes.filter((n) => n instanceof Mesh && n.material && n.material.color === BLUE_SUN_COLOR);
    assert.equal(suns.length, 1, 'exactly one blue sun sphere');
    assert.ok(suns[0].geometry instanceof FakeGeometry, 'sun is a sphere geometry');
    assert.equal(suns[0].geometry.args[0], 1.6, 'sun radius matches the star\'s outer radius');
    assert.equal(suns[0].position.y, TREE_HEIGHT, 'sun sits at the topper height');
    const gold = nodes.filter((n) => n instanceof Mesh && n.material && n.material.color === 0xffd700);
    assert.equal(gold.length, 0, 'no gold star in the swap build');
    const glows = nodes.filter((n) => n instanceof Sprite && n.material && n.material.color === BLUE_SUN_COLOR);
    assert.equal(glows.length, 1, 'one blue sprite glow on the sun');
    assert.doesNotThrow(() => made.update(1.0));
    // the sun swells with the beat instead of spinning
    assert.ok(suns[0].scale.x > 1 && suns[0].scale.x <= 1.2, `sun pulses, scale ${suns[0].scale.x}`);
    assert.doesNotThrow(() => made.dispose());
  });
});

describe('buildMistletoe: high above the topper, clear gap', () => {
  const made = buildMistletoe(THREE);
  const nodes = walkGroup(made.group);

  it('hangs above the topper with a clear gap', () => {
    assert.equal(made.group.position.y, MISTLETOE_Y);
    // topper top is TREE_HEIGHT + sun radius 1.6; the sprig hangs above it
    assert.ok(MISTLETOE_Y > TREE_HEIGHT + 1.6, 'mistletoe clears the topper');
    assert.ok(MISTLETOE_Y - (TREE_HEIGHT + 1.6) >= 4, 'gap is visible, not touching');
  });

  it('is a green-leaf sprig with white berries', () => {
    const leaves = nodes.filter((n) => n instanceof Mesh && n.material && n.material.color === 0x2d8a4e);
    assert.ok(leaves.length >= 4, `${leaves.length} leaves`);
    const berries = nodes.filter((n) => n instanceof Mesh && n.material && n.material.color === 0xffffff);
    assert.ok(berries.length >= 2, `${berries.length} white berries`);
  });
});

describe('static pins: hub wiring for the swap', () => {
  const decor = read('components/SeasonalDecor.jsx');
  const home = read('components/HomeScene.jsx');
  const treeSrc = read('lib/seasonal/tree.js');

  it('SeasonalDecor places the tree via the swap helper, not the old spot', () => {
    assert.ok(decor.includes('treeSwapPlacement'), 'swap placement helper used');
    assert.ok(decor.includes('buildMistletoe'), 'mistletoe mounted');
    assert.ok(!decor.includes('TREE_POS'), 'old satellite-constellation spot gone');
    assert.ok(!decor.includes('TREE_SCALE'), 'old 0.55 scale gone');
  });

  it('SeasonalDecor wires the tree to the Earth handlers via the hit-proxy', () => {
    assert.ok(decor.includes('treeHitProxy'), 'invisible hit-proxy sphere present');
    assert.ok(decor.includes('onTreeSelect'), 'Earth dive handler passed in');
    assert.ok(decor.includes('onTreeGlobeClick'), 'globe-click handler passed in');
    assert.ok(decor.includes('globeWorldPointToLatLon'), 'tap point maps to lat/lon like the globe');
    assert.ok(decor.includes('opacity: 0'), 'proxy is opacity-0, not invisible');
    assert.ok(decor.includes('swap.hitRadius'), 'proxy sized to the swapped tree');
    assert.ok(decor.includes('THREE.DoubleSide'), 'proxy is DoubleSide — spawn camera sits inside it');
    assert.ok(decor.includes('onPointerDown'), 'proxy records the press point for tap-vs-drag');
    assert.ok(decor.includes('treePressRef'), 'press point kept in a ref across the press/click pair');
    assert.ok(decor.includes('> 8) return;'), 'drags (pointer moved) do not open the menu');
    assert.ok(!decor.includes('visible={false}'), 'proxy never uses visible=false (r3f skips it)');
    assert.ok(decor.includes("document.body.style.cursor = 'pointer'"), 'hover cursor matches the globe');
  });

  it('HomeScene hides the Earth while the swap is active and passes the handlers', () => {
    assert.ok(home.includes('earthSwappedForTree'), 'swap gate computed in HomeScene');
    assert.ok(home.includes('!oblivion?.active && !earthSwappedForTree'), 'Earth hidden during the swap');
    assert.ok(home.includes('onTreeSelect={appState === \'hub_freeroam\' && !earthPickMode ? beginEarthDive : null}'),
      'tree dive gated exactly like the globe');
    assert.ok(home.includes('onTreeGlobeClick={onEarthGlobeClick}'), 'globe-click handler passed through');
    assert.ok(home.includes('earthQuatRef={earthQuatRef}'), 'spin quaternion passed for the lat/lon map');
  });

  it('garland wraps the backdrop planets only, gated on the season', () => {
    assert.ok(home.includes('PlanetGarland'), 'garland component exists');
    assert.ok(home.includes('garland={showGarland}'), 'backdrop planets get garland');
    assert.equal((home.match(/garland=\{/g) || []).length, 1, 'garland prop passed exactly once (BackdropPlanets, not UserPlanets)');
    assert.ok(home.includes('treeVisible(new Date())'), 'garland gated on the same season');
    assert.ok(home.includes('garland = false'), 'PlanetBody defaults to no garland (UserPlanets safe)');
  });

  it('no new real lights in the swap pieces', () => {
    assert.ok(!treeSrc.includes('PointLight') || treeSrc.split('PointLight').length - 1 <= 2,
      'tree.js keeps only its two existing point lights');
    const garlandBlock = home.slice(home.indexOf('function PlanetGarland'), home.indexOf('function PlanetBody'));
    assert.ok(!garlandBlock.includes('pointLight'), 'garland adds no lights');
    assert.ok(!garlandBlock.includes('PointLight'), 'garland adds no lights');
  });
});
