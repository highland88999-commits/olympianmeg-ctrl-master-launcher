// tests/realm-surfaces.test.mjs — HELL-REALM ENVIRONMENT WRAPPING
// (Merlin, 2026-11-15): walls, floor, ceiling and objects wrapped
// with textures that are LIGHT SOURCES (emissive-first, zero new
// real lights). Run: node tests/realm-surfaces.test.mjs (repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  REALM_SURFACE_KEYS,
  REALM_SURFACE_SIZE,
  REALM_SKY_SLUGS,
  FLOOR_EMISSIVE_INTENSITY,
  STONE_EMISSIVE_INTENSITY,
  floorSurface,
  stoneSurface,
  surfaceMaps,
  hueForRealm,
  skyUrlForRealm,
  realmSurfaceStats,
} from '../lib/portal/realm-surfaces.js';
import { PORTAL_REALMS } from '../lib/portal/realms.js';

const REALMS = [
  // [route dir, realm key, expected {...floor} spreads, {...stone} spreads]
  ['nether-realm', 'hades', 4, 19],
  ['helheim', 'helheim', 4, 15],
  ['duat', 'duat', 4, 20],
  ['hell', 'hell', 5, 11],
  ['naraka', 'naraka', 4, 13],
  ['yomi', 'yomi', 4, 14],
  ['annwn', 'annwn', 4, 12],
  ['mictlan', 'mictlan', 4, 15],
  ['xibalba', 'xibalba', 4, 17],
  ['kur', 'kur', 4, 14],
  ['nav', 'nav', 5, 14],
  ['diyu', 'diyu', 4, 14],
  ['orun', 'orun', 4, 18],
];

// Functions whose standard materials are deliberately NOT wrapped:
// characters and figures (forge-owned), fire/water/pools, particles,
// shades (left alone by order), torches (already the light sources).
const EXCLUDED_FNS = new Set([
  'Cerberus', 'MedusaFigure', 'SnakeSegments', 'SnakeHair',
  'HeadViewModel', 'FoeFigures', 'ChainFx', 'Torches', 'River',
  'MistWall', 'GroveTrees', 'Dog', 'GuidedShade',
  'LavaPools', 'FrostPools', 'DarkPools', 'FirePools',
  'ObsidianPools', 'BloodPools', 'MistPools',
  'Embers', 'Mist', 'GhostFire', 'Wisps', 'Fireflies', 'DustMotes',
  'CameraRig',
]);

const count = (src, re) => (src.match(re) || []).length;

// ── palettes: from lib/portal/realms.js, never invented ────────────────

test('13 hell realms, hues match lib/portal/realms.js exactly', () => {
  assert.deepEqual([...REALM_SURFACE_KEYS], REALMS.map(([, k]) => k));
  for (const [, key] of REALMS) {
    const realm = PORTAL_REALMS.find((r) => r.key === key);
    assert.ok(realm, `realm ${key} exists in PORTAL_REALMS`);
    assert.equal(hueForRealm(key), realm.hue, `${key} hue`);
  }
  assert.equal(hueForRealm('hades'), '#ffb03a');
  assert.equal(hueForRealm('helheim'), '#8fd8ff');
  assert.equal(hueForRealm('orun'), '#ffd27a');
  assert.equal(hueForRealm('no-such-realm'), null);
});

test('sky URLs: Hades art lives at nether-realm, the rest by key', () => {
  assert.equal(skyUrlForRealm('hades'), '/art/realms/nether-realm-sky.jpg');
  assert.equal(skyUrlForRealm('helheim'), '/art/realms/helheim-sky.jpg');
  assert.equal(skyUrlForRealm('orun'), '/art/realms/orun-sky.jpg');
  assert.equal(Object.keys(REALM_SKY_SLUGS).length, 13);
  assert.throws(() => skyUrlForRealm('no-such-realm'), /unknown realm key/);
});

// ── textures: seeded, deterministic, per-realm ─────────────────────────

test('floor + stone textures are 256x256 seeded DataTextures', () => {
  for (const [, key] of REALMS) {
    for (const kind of ['floor', 'stone']) {
      const { map, bumpMap } = surfaceMaps(kind, key, 2);
      assert.equal(map.image.width, REALM_SURFACE_SIZE, `${key}/${kind} width`);
      assert.equal(map.image.height, REALM_SURFACE_SIZE, `${key}/${kind} height`);
      assert.equal(map.wrapS, THREE.RepeatWrapping, `${key}/${kind} wrapS is RepeatWrapping`);
      assert.equal(map.wrapT, THREE.RepeatWrapping, `${key}/${kind} wrapT is RepeatWrapping`);
      assert.equal(map.repeat.x, 2, `${key}/${kind} repeat`);
      assert.equal(bumpMap.image.width, REALM_SURFACE_SIZE);
    }
  }
  assert.throws(() => surfaceMaps('nope', 'hades'), /unknown kind/);
  assert.throws(() => surfaceMaps('floor', 'nope'), /unknown realm key/);
});

test('textures are deterministic per realm and differ across realms', () => {
  const bytes = (tex) => Buffer.from(tex.image.data.buffer);
  for (const [, key] of REALMS) {
    const a = surfaceMaps('floor', key, 1).map;
    const b = surfaceMaps('floor', key, 1).map;
    assert.ok(bytes(a).equals(bytes(b)), `${key} floor deterministic`);
    const s = surfaceMaps('stone', key, 1).map;
    assert.ok(!bytes(a).equals(bytes(s)), `${key} floor != stone`);
  }
  const hades = bytes(surfaceMaps('floor', 'hades', 1).map);
  const helheim = bytes(surfaceMaps('floor', 'helheim', 1).map);
  assert.ok(!hades.equals(helheim), 'hades floor != helheim floor');
  assert.ok(realmSurfaceStats().textures >= 26, 'base cache holds 26 textures');
});

// ── emissive-first: the same texture is map AND emissiveMap ────────────

test('floor/stone surfaces glow from their own texture (emissive-first)', () => {
  for (const [, key] of REALMS) {
    const floor = floorSurface(key, 6);
    assert.equal(floor.map, floor.emissiveMap, `${key} floor map is emissiveMap`);
    assert.equal(floor.emissive, hueForRealm(key), `${key} floor emissive is the hue`);
    assert.equal(floor.emissiveIntensity, FLOOR_EMISSIVE_INTENSITY);
    assert.ok(floor.bumpMap, `${key} floor has a bump map`);
    const stone = stoneSurface(key, 1);
    assert.equal(stone.map, stone.emissiveMap, `${key} stone map is emissiveMap`);
    assert.equal(stone.emissive, hueForRealm(key), `${key} stone emissive is the hue`);
    assert.equal(stone.emissiveIntensity, STONE_EMISSIVE_INTENSITY);
    assert.ok(stone.emissiveIntensity < floor.emissiveIntensity,
      `${key} stone glows dimmer than the floor`);
  }
  assert.equal(FLOOR_EMISSIVE_INTENSITY, 0.5);
  assert.equal(STONE_EMISSIVE_INTENSITY, 0.3);
  assert.throws(() => floorSurface('nope'), /unknown realm key/);
});

// ── per-realm wiring audits ─────────────────────────────────────────────

function fnOf(src, idx) {
  const fns = [...src.matchAll(/^(?:export )?function (\w+)\(/gm)];
  let cur = '?';
  for (const f of fns) if (f.index <= idx) cur = f[1];
  return cur;
}

for (const [dir, key, floorN, stoneN] of REALMS) {
  const src = readFileSync(`app/${dir}/world3d.js`, 'utf8');
  const worldSrc = readFileSync(`lib/${dir}/world.js`, 'utf8');
  const budget = Number(worldSrc.match(/TORCH_LIGHT_BUDGET = (\d+)/)[1]);

  test(`${dir}: sky dome mounted, surfaces wired, light budget honest`, () => {
    // Imports + dome mount.
    assert.ok(src.includes("from '@/lib/portal/realm-surfaces'"), 'imports realm-surfaces');
    assert.ok(src.includes("import RealmSkyDome from '@/components/RealmSkyDome';"), 'imports RealmSkyDome');
    assert.equal(count(src, /<RealmSkyDome/g), 1, 'one dome mount');
    assert.ok(src.includes(`<RealmSkyDome realmKey="${key}" />`), 'dome mounted with the realm key');
    // Ground uses the shared floor texture at repeat 6; region discs at 2.
    assert.ok(src.includes(`floorSurface('${key}', 6)`), 'Ground repeat 6');
    assert.ok(src.includes(`floorSurface('${key}', 2)`), 'region discs repeat 2');
    assert.ok(src.includes(`stoneSurface('${key}')`), 'stone surfaces');
    assert.ok(!src.includes('function groundTexture()'), 'unseeded groundTexture is gone');
    assert.ok(src.includes('function riverTexture()') || src.includes('function mistTexture()'),
      'water texture kept');

    // Exact wrapped-surface counts (pinned by the wiring run).
    assert.equal(count(src, /\{\.\.\.floor\}/g), floorN, `{...floor} count`);
    assert.equal(count(src, /\{\.\.\.stone\}/g), stoneN, `{...stone} count`);

    // LIGHT BUDGET: zero new real lights. One <pointLight JSX tag in
    // Torches fans out to `budget` lit torches at runtime; every other
    // occurrence is one static region light. Spot/directional lights
    // belong to DayNightRig, never to a realm file.
    const occurrences = count(src, /<pointLight/g);
    const expectedOcc = dir === 'nether-realm' ? 6 : 5;
    assert.equal(occurrences, expectedOcc, '<pointLight occurrences unchanged');
    assert.equal(count(src, /<spotLight/g), 0, 'no spot lights');
    assert.equal(count(src, /<directionalLight/g), 0, 'no directional lights');
    assert.equal(budget, 8, 'torch light budget is 8');
    const runtime = (occurrences - 1) + budget;
    assert.equal(runtime, dir === 'nether-realm' ? 13 : 12,
      `runtime point lights stay ${dir === 'nether-realm' ? 13 : 12}`);

    // Every standard material is accounted for: wrapped, lair floor
    // (map + emissiveMap), water (own map), glass (emissive, Annwn),
    // an excluded function, or a transparent shade cone.
    const geoRe = /<(\w+Geometry)/g;
    for (const m of src.matchAll(/<meshStandardMaterial[\s\S]*?\/>/g)) {
      const tag = m[0];
      const fn = fnOf(src, m.index);
      if (tag.includes('{...floor}') || tag.includes('{...stone}')) continue;
      if (tag.includes('map=') && tag.includes('emissiveMap=')) continue; // lair floor
      if (fn === 'River' || fn === 'MistWall') continue; // water keeps its own map
      if (fn === 'Fortress') {
        assert.ok(tag.includes('emissive='), 'Annwn glass glows (emissive, no map)');
        continue;
      }
      if (EXCLUDED_FNS.has(fn)) continue;
      // Apep's body in DarkWaters (sphere segments + torus coils) is a
      // creature, not a wall — deliberately unwrapped; only the region
      // disc takes the floor texture.
      const before = src.slice(Math.max(0, m.index - 500), m.index);
      const geos = [...before.matchAll(geoRe)];
      if (tag.includes('transparent')) {
        assert.equal(geos[geos.length - 1][1], 'coneGeometry',
          `${dir}/${fn}: transparent standard material is a shade cone, got ${geos[geos.length - 1]}`);
        continue;
      }
      if (fn === 'DarkWaters') {
        const g = geos[geos.length - 1][1];
        assert.ok(g === 'sphereGeometry' || g === 'torusGeometry',
          `duat/DarkWaters: creature part is sphere/torus, got ${g}`);
        continue;
      }
      assert.fail(`${dir}/${fn}: unwrapped standard material: ${tag.slice(0, 120)}`);
    }

    // The arch doorway discs still belong to the arch worker: the
    // shared arch-texture hook is untouched in every realm.
    assert.ok(src.includes('useArchTextures'), 'arch doorway hook untouched');
    assert.ok(!src.includes('Mortal Kombat') && !src.includes('mortal kombat'), 'no MK strings');
  });
}

test('Hades boss chamber: lair floor keeps its snake-scale map and glows', () => {
  const src = readFileSync('app/nether-realm/world3d.js', 'utf8');
  assert.ok(src.includes('function lairFloorTexture()'), 'lair floor texture kept');
  assert.ok(
    src.includes('emissiveMap={tex} emissive={LAIR_GREEN} emissiveIntensity={0.35}'),
    'lair floor is emissive',
  );
  // The Cerberus character is untouched: no surface spread inside it.
  const cerb = src.slice(src.indexOf('function Cerberus()'), src.indexOf('function Gates()'));
  assert.ok(!cerb.includes('{...floor}') && !cerb.includes('{...stone}'),
    'Cerberus character carries no surface wrap');
  assert.ok(cerb.includes('<pointLight'), 'Cerberus keeps its own light');
});

test('app/cerberus is untouched — no 3D world there to wrap', () => {
  assert.ok(!existsSync('app/cerberus/world3d.js'), 'no world3d.js under app/cerberus');
  const page = readFileSync('app/cerberus/page.tsx', 'utf8');
  assert.ok(!page.includes('realm-surfaces'), 'cerberus page does not import realm-surfaces');
  assert.ok(!page.includes('RealmSkyDome'), 'cerberus page has no sky dome');
  assert.ok(!page.includes('floorSurface') && !page.includes('stoneSurface'), 'no surface wiring');
});

test('arch-graphics ownership untouched by this work', () => {
  const arch = readFileSync('lib/portal/arch-graphics.js', 'utf8');
  assert.ok(!arch.includes('realm-surfaces'), 'arch-graphics does not import realm-surfaces');
  assert.ok(arch.includes('useArchTextures'), 'arch hook still there');
});
