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
const { buildLandmark, buildAmbient, applyLandmarkArt, LANDMARK_TYPES } = await import('../landmarks.js');
const { buildWorld, scatterAllowedAt } = await import('../zone.js');
const { artForLandmark, LANDMARK_ART_TYPES } = await import('../landmark-art.js');
const DATA = await import('../data.js');
const { buildSkyDome } = await import('../sky.js');
const SP = await import('../spawns.js');
const { biomeAt, biomeWeights, BIOMES } = await import('../biomes.js');

test('landmark registry covers all twelve types incl. haven + korus-throne + frost-spire + court-brazier', () => {
  assert.deepEqual(
    [...LANDMARK_TYPES].sort(),
    ['court-brazier', 'ember-spire', 'frost-spire', 'gloom-monolith', 'haven', 'intro-arch', 'korus-throne', 'mire-arch', 'ooze-pool', 'peak-shrine', 'storm-pylon', 'wreck-hulk'].sort()
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
  // Activate the placed dragon and check it streams a figure.
  // GLB-ONLY rework: only Stormwing spawns — cinder-dragon
  // and muse-dragon GLBs are truncated, so they have no field
  // presence until their Tripo re-sends land.
  const seen = new Set();
  for (const m of world.monsters) {
    if (!SP.DRAGON_TYPES.includes(m.type) || seen.has(m.type)) continue;
    seen.add(m.type);
    m.active = true;
    m.x = 0; m.z = 90;
  }
  world.setObserver({ x: 0, z: 90 });
  world.update(0.1);
  assert.deepEqual([...seen].sort(), ['sky-dragon']);
  world.dispose();
});

test('buildWorld has no bounds — the inner sphere has no edge to clamp (Nov 16)', () => {
  // The disc's circle clamp retired with the disc: on a sphere
  // walking past the old r550 keeps going and comes back around,
  // so buildWorld returns bounds: null and no clamp exists.
  // (The old test pinned the r295 no-op bug's fix — the object
  // shape { kind: 'circle', max: 550 } — which the sphere
  // conversion deliberately removes.)
  const world = buildWorld(THREE, DATA.WORLD, T, { gateOpen: false });
  assert.equal(world.bounds, null);
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

// ---- WS4 graphics (2026-11-16): ground detail, sky dome, light budget ----

test('WS4 G-01: ground detail textures exist and the terrain wears a map + bumpMap', () => {
  assert.equal(typeof T.groundDetailTexture, 'function', 'groundDetailTexture missing');
  assert.equal(typeof T.acidRiverTexture, 'function', 'acidRiverTexture missing');
  assert.ok(T.groundDetailTexture(), 'ground detail texture returned nothing');
  assert.ok(T.acidRiverTexture(), 'acid river texture returned nothing');
  const world = buildWorld(THREE, DATA.WORLD, T, { gateOpen: false });
  let terrainMat = null;
  world.group.traverse((o) => {
    if (o.isMesh && o.material && o.material.vertexColors && o.geometry
      && o.geometry.attributes && o.geometry.attributes.color) terrainMat = o.material;
  });
  assert.ok(terrainMat, 'no vertex-coloured terrain mesh found');
  assert.ok(terrainMat.map, 'terrain material carries no detail map');
  assert.ok(terrainMat.bumpMap, 'terrain material carries no bumpMap');
  assert.equal(terrainMat.map.repeat.x, 28, 'detail map repeat must be 28 tiles');
  world.dispose();
});

test('WS4 G-02: sky dome present, BackSide, fog off; light budget still 8', () => {
  const world = buildWorld(THREE, DATA.WORLD, T, { gateOpen: false });
  let dome = null;
  let lights = 0;
  world.group.traverse((o) => {
    if (o.isLight) lights++;
    if (o.userData && o.userData.skyDome) dome = o;
  });
  assert.ok(dome, 'no sky dome in the world group');
  assert.equal(dome.material.side, THREE.BackSide, 'dome must be BackSide');
  assert.equal(dome.material.fog, false, 'dome must ignore fog');
  assert.equal(lights, 8, `light budget: ${lights} lights, expected 8`);
  assert.equal(world.skyDome, dome, 'world must expose its sky dome');
  world.dispose();
});

test('WS4 G-03: landmark art map covers eight types, throne/haven/intro-arch excluded', () => {
  assert.deepEqual([...LANDMARK_ART_TYPES].sort(), ['ember-spire', 'frost-spire', 'gloom-monolith', 'mire-arch', 'ooze-pool', 'peak-shrine', 'storm-pylon', 'wreck-hulk'].sort());
  for (const type of LANDMARK_ART_TYPES) {
    const url = artForLandmark(type);
    assert.ok(url && url.startsWith('/art/hollow-earth/landmarks/'), `${type} art URL ${url}`);
  }
  for (const type of ['korus-throne', 'haven', 'intro-arch', 'nope']) {
    assert.equal(artForLandmark(type), undefined, `${type} must take no art`);
  }
  // Hanging art adds exactly one face mesh, once, and never for undressed types.
  const fakeTex = new THREE.Texture();
  const gloom = buildLandmark('gloom-monolith', THREE, T);
  const before = gloom.children.length;
  assert.equal(applyLandmarkArt(gloom, THREE, fakeTex), true);
  assert.equal(gloom.children.length, before + 1, 'art face must be added');
  assert.equal(gloom.userData.artApplied, true);
  assert.equal(applyLandmarkArt(gloom, THREE, fakeTex), false, 'art must hang only once');
  const throne = buildLandmark('korus-throne', THREE, T);
  assert.equal(applyLandmarkArt(throne, THREE, fakeTex), false, 'throne takes no art');
});

test('WS4 G-10: court braziers flank the court, clear of the throne and every landmark', () => {
  const braziers = DATA.WORLD.landmarks.filter((l) => l.type === 'court-brazier');
  assert.equal(braziers.length, 2, 'exactly two court braziers');
  const korus = SP.KORUS_POS;
  for (const b of braziers) {
    const d = Math.hypot(b.x - korus.x, b.z - korus.z);
    assert.ok(d >= 15, `brazier at (${b.x},${b.z}) is ${d.toFixed(1)} m from the throne, must be >= 15`);
    for (const other of DATA.WORLD.landmarks) {
      if (other === b) continue;
      const od = Math.hypot(b.x - other.x, b.z - other.z);
      assert.ok(od >= 10, `brazier at (${b.x},${b.z}) is ${od.toFixed(1)} m from ${other.type}, must be >= 10`);
    }
  }
});

test('WS4 G-06: Poison Groves spore garden — 110 caps in data, spore-garden blurb, denser built field', () => {
  const caps = DATA.WORLD.scatter.find((s) => s.kind === 'spore-cap');
  assert.ok(caps, 'no spore-cap scatter entry');
  assert.equal(caps.count, 110, `spore-cap count ${caps.count}, expected 110`);
  assert.equal(caps.biome, 'poison', 'spore-caps must stay in the poison band');
  assert.match(BIOMES.poison.blurb, /spore garden/i, 'poison blurb must name the deliberate spore garden');
  assert.doesNotMatch(BIOMES.poison.blurb, /dead zone/i, 'no dead-zone fiction — Merlin chose spore garden');
  // Scatter placement is gate-limited (weight > 0.35), so the
  // built yield is below 110 — but it must beat the old field:
  // count 60 yielded ~11 caps, count 110 yields ~21.
  const world = buildWorld(THREE, DATA.WORLD, T, { gateOpen: false });
  let built = 0;
  world.group.traverse((o) => {
    if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === 0xc06ae0
      && o.geometry && o.geometry.type === 'SphereGeometry' && !(o.userData && o.userData.poisonMist)) built++;
  });
  assert.ok(built >= 18, `built spore-caps ${built}, expected >= 18 (old field built ~11)`);
  world.dispose();
});

test('WS4 G-11: transition-band mixed scatter gate', () => {
  // Find a real transition point where the runner-up band holds
  // 0.15–0.35 (below the old 0.35 gate) and a non-transition point
  // where a band holds < 0.15.
  let mixed = null;
  let denied = null;
  for (let x = -280; x <= 280 && (!mixed || !denied); x += 10) {
    for (let z = -280; z <= 280 && (!mixed || !denied); z += 10) {
      const b = biomeAt(x, z);
      const w = biomeWeights(x, z);
      if (!mixed && b.transition && b.second && w[b.second] >= 0.15 && w[b.second] < 0.35) {
        mixed = { x, z, second: b.second, w: w[b.second] };
      }
      if (!denied && !b.transition) {
        const weak = Object.keys(w).find((id) => id !== b.dominant && w[id] < 0.15);
        if (weak) denied = { x, z, weak, w: w[weak] };
      }
    }
  }
  assert.ok(mixed, 'no transition point with a 0.15–0.35 runner-up found on the grid');
  assert.equal(scatterAllowedAt(mixed.x, mixed.z, mixed.second), true,
    `runner-up ${mixed.second} at weight ${mixed.w.toFixed(2)} must spawn on a transition band`);
  assert.ok(denied, 'no non-transition point with a weak band found on the grid');
  assert.equal(scatterAllowedAt(denied.x, denied.z, denied.weak), false,
    `band ${denied.weak} at weight ${denied.w.toFixed(2)} must not spawn off-transition`);
});

test('WS4 sky dome builder: flat tint until a map lands, tint retints', () => {
  const dome = buildSkyDome(THREE, 0x2a1e3f);
  assert.equal(dome.userData.skyDome, true);
  assert.equal(dome.material.color.getHex(), 0x2a1e3f);
  assert.equal(dome.material.map, null);
  assert.equal(dome.material.fog, false);
});
