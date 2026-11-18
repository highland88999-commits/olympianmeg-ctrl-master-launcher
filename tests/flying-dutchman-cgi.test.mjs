// tests/flying-dutchman-cgi.test.mjs
// FLYING DUTCHMAN CGI — the sea + sky + ship makeover (Merlin, Nov 15, 2026).
// Run: node --test tests/flying-dutchman-cgi.test.mjs
//
// Pins the CGI layer (lib/flying-dutchman/cgi.js) and its wiring into
// page.jsx, without touching any mechanic: sailing, combat, kraken,
// merchants, duels, operators, voyage backpack and PvP sync are all
// covered by the neighbour suites — this suite only asserts the CGI
// exists, behaves, adds no lights, and never edits an existing
// surface (the wraps worker owns the wrapped sea metal).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';

import {
  stormIntensity,
  dutchmanFlashAt,
  boltFor,
  stormWindAt,
  seaColors,
  cloudOpacity,
  stormFog,
  stormCloudTexture,
  seaDetailTexture,
  wornWoodTexture,
  createDutchmanStorm,
  dressShip,
  DUTCHMAN_STORM_SEED,
  DUTCHMAN_FLASH_CHANCE,
  DUTCHMAN_CLOUD_DECK_M,
  DUTCHMAN_SPRAY_COUNT,
  DUTCHMAN_FOAM_SEG,
} from '../lib/flying-dutchman/cgi.js';
import { waveHeight } from '../app/flying-dutchman/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const pageSrc = read('../app/flying-dutchman/page.jsx');
const seaSrc = read('../app/flying-dutchman/sea3d.js');
const shipSrc = read('../app/flying-dutchman/ship3d.js');
const cgiSrc = read('../lib/flying-dutchman/cgi.js');

const meanAlpha = (tex) => {
  const d = tex.image.data;
  let a = 0;
  const n = d.length / 4;
  for (let i = 3; i < d.length; i += 4) a += d[i];
  return a / n / 255;
};

const meanRgb = (tex) => {
  const d = tex.image.data;
  let r = 0; let g = 0; let b = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  return [r / n, g / n, b / n];
};

const countLights = (obj) => {
  let n = 0;
  obj.traverse((o) => { if (o.isLight) n += 1; });
  return n;
};

// ---------- Storm clock: pure functions of the clock ----------

test('stormIntensity breathes 0.35..1 and is deterministic', () => {
  for (const ms of [0, 60000, 3600000, 86400000]) {
    const s = stormIntensity(ms);
    assert.ok(s >= 0.3 && s <= 1.001, `storm ${s} at ${ms}`);
    assert.equal(s, stormIntensity(ms), 'same instant, same storm');
  }
  let lo = 1; let hi = 0;
  for (let ms = 0; ms < 240000; ms += 5000) {
    const s = stormIntensity(ms);
    lo = Math.min(lo, s); hi = Math.max(hi, s);
  }
  assert.ok(hi - lo > 0.5, `storm must breathe, range ${lo}..${hi}`);
});

test('dutchmanFlashAt is deterministic, 0..1, and flashes sometimes', () => {
  assert.equal(dutchmanFlashAt(123456789), dutchmanFlashAt(123456789));
  let flashes = 0; let max = 0;
  for (let ms = 0; ms < 900000; ms += 90) {
    const f = dutchmanFlashAt(ms);
    assert.ok(f >= 0 && f <= 1, `flash ${f}`);
    if (f > 0) flashes += 1;
    max = Math.max(max, f);
  }
  // ~22% of 90 ms slices flash, over 15 min of slices.
  assert.ok(flashes > 1000 && flashes < 4000, `flashes ${flashes} of 10000 slices`);
  assert.ok(max > 0.8, 'some flashes are hard cracks');
  assert.equal(DUTCHMAN_FLASH_CHANCE, 0.22);
});

test('boltFor only draws a bolt while flashing, and it falls from the cloud deck', () => {
  let seen = 0;
  for (let ms = 0; ms < 900000; ms += 90) {
    const b = boltFor(ms);
    assert.equal(b.flash, dutchmanFlashAt(ms));
    if (b.flash < 0.5) {
      assert.equal(b.points.length, 0, 'no bolt below the visible threshold');
    } else {
      seen += 1;
      assert.equal(b.points.length, 9, '8 segments, 9 points');
      assert.equal(b.points[0].y, DUTCHMAN_CLOUD_DECK_M, 'bolt starts at the cloud deck');
      assert.equal(b.points[8].y, 0, 'bolt ends at the sea');
      for (let i = 1; i < b.points.length; i++) {
        assert.ok(b.points[i].y < b.points[i - 1].y, 'bolt descends monotonically');
      }
      // Deterministic per slot.
      assert.deepEqual(boltFor(ms), b);
    }
  }
  assert.ok(seen > 0, 'some slices in 15 min draw a bolt');
  // A staggered second bolt is a different path.
  const ms = 1234567890;
  const a = boltFor(ms, 0);
  const b2 = boltFor(ms, 37);
  if (a.points.length && b2.points.length) assert.notDeepEqual(a.points, b2.points);
});

test('stormWindAt is a gusting NW wind, deterministic', () => {
  for (const ms of [0, 45000, 180000, 7200000]) {
    const w = stormWindAt(ms);
    assert.deepEqual(w, stormWindAt(ms));
    assert.ok(w.speed >= 6 && w.speed <= 18.01, `wind ${w.speed} m/s`);
    assert.ok(w.bearingDeg >= 295 && w.bearingDeg <= 335, `bearing ${w.bearingDeg}`);
    assert.ok(Math.abs(Math.hypot(w.dirX, w.dirZ) - 1) < 1e-9, 'unit travel vector');
    assert.equal(w.storm, stormIntensity(ms), 'wind speed rides the storm');
  }
});

test('seaColors darken with the storm; cloudOpacity and stormFog stay in range', () => {
  const calm = seaColors(0.35, 1);
  const squall = seaColors(1, 1);
  assert.ok(squall.deep < calm.deep, 'a squall darkens the deep water');
  assert.ok(calm.deep > 0 && squall.deep > 0, 'hex colours');
  for (const s of [0, 0.35, 0.65, 1]) {
    assert.ok(cloudOpacity(s, 1) >= 0.3 && cloudOpacity(s, 1) <= 1);
    assert.ok(cloudOpacity(s, 0.15) < cloudOpacity(s, 1), 'clouds thin by day');
    const fg = stormFog(s);
    assert.ok(fg.near > 0 && fg.far > fg.near, `fog ${fg.near}..${fg.far}`);
  }
  assert.ok(stormFog(1).far < stormFog(0.35).far, 'fog closes in with the storm');
});

// ---------- Textures: seeded DataTextures, node-safe ----------

test('stormCloudTexture is a dark billow with real alpha variation', () => {
  const tex = stormCloudTexture();
  assert.ok(tex instanceof THREE.DataTexture);
  assert.equal(tex.image.width, 256);
  assert.equal(tex.image.height, 128);
  const a = meanAlpha(tex);
  assert.ok(a > 0.05 && a < 0.95, `cloud alpha mean ${a} — some sky, some cloud`);
  const [r, g, b] = meanRgb(tex);
  assert.ok(r < 90 && g < 90 && b < 110, `clouds are dark slate, got ${r},${g},${b}`);
  assert.deepEqual(stormCloudTexture().image.data, tex.image.data, 'seeded: same clouds every load');
});

test('seaDetailTexture is mostly clear with pale foam lanes', () => {
  const tex = seaDetailTexture();
  assert.ok(tex instanceof THREE.DataTexture);
  const a = meanAlpha(tex);
  assert.ok(a > 0.02 && a < 0.5, `foam alpha mean ${a} — lanes, not a sheet`);
  const [r, g, b] = meanRgb(tex);
  assert.ok(r > 180 && g > 200 && b > 200, `foam is pale, got ${r},${g},${b}`);
});

test('wornWoodTexture is dark salt-stained wood', () => {
  const tex = wornWoodTexture();
  assert.ok(tex instanceof THREE.DataTexture);
  const [r, g, b] = meanRgb(tex);
  assert.ok(r > g && g > b, `wood is brown, got ${r},${g},${b}`);
  assert.ok(r < 110, `wood is dark, got r=${r}`);
});

// ---------- Storm layer: builds, updates, adds no lights ----------

function buildStorm() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x06121c, 120, 900);
  const storm = createDutchmanStorm(scene);
  return { scene, storm };
}

test('createDutchmanStorm adds a cloud dome, bolts, foam and spray — and zero lights', () => {
  const { scene, storm } = buildStorm();
  assert.equal(countLights(storm.group), 0, 'no new real lights');
  assert.equal(countLights(scene), 0, 'no new real lights in the scene');
  assert.ok(storm.cloudDome, 'cloud dome present');
  assert.ok(storm.cloudDome.geometry.parameters.radius === 2600, 'dome sits inside the gradient dome');
  assert.equal(storm.bolts.length, 2, 'two bolt lines');
  assert.ok(storm.foam, 'foam overlay present');
  assert.equal(
    storm.foam.geometry.attributes.position.count,
    (DUTCHMAN_FOAM_SEG + 1) * (DUTCHMAN_FOAM_SEG + 1),
    'foam rides a displaced grid',
  );
  assert.equal(storm.spray.geometry.userData.sprayCount, DUTCHMAN_SPRAY_COUNT);
});

test('storm update runs frames without throwing and follows the camera', () => {
  const { scene, storm } = buildStorm();
  const player = { x: 100, z: -50, speed: 8, heading: 0.5 };
  // Post-epoch clock: the shared lightningFlash law assumes
  // nowMs >= PLANET_CGI_EPOCH_MS (2026-01-01); earlier dates
  // go negative-modulo in the kit itself.
  const nowBase = 1780000000000; // ~May 2026
  for (let i = 0; i < 30; i++) {
    const out = storm.update(i * 0.5, 0.016, player.x, player.z, player, 1, nowBase + i * 500);
    assert.ok(out.storm >= 0.3 && out.storm <= 1);
    assert.ok(out.flash >= 0 && out.flash <= 1);
    assert.equal(storm.cloudDome.position.x, player.x);
    assert.equal(storm.cloudDome.position.z, player.z);
    assert.equal(storm.foam.position.x, player.x);
    // Foam rides the same swell as the ocean.
    const farr = storm.foam.geometry.attributes.position.array;
    const lx = farr[0];
    const lz = farr[2];
    assert.ok(Math.abs(farr[1] - (waveHeight(player.x + lx, player.z + lz, i * 0.5) + 0.12)) < 1e-5);
    // Fog pulses with the storm.
    const fg = stormFog(out.storm);
    assert.equal(scene.fog.near, fg.near);
    assert.equal(scene.fog.far, fg.far);
  }
  // A bolt that is showing carries real positions near the camera.
  const bolt = storm.bolts[0];
  if (bolt.visible) {
    const arr = bolt.geometry.getAttribute('position').array;
    assert.ok(Math.abs(arr[0] - 100) < 300, 'bolt strikes near the camera');
  }
});

test('storm update survives a missing player and a missing fog', () => {
  const scene = new THREE.Scene(); // no fog
  const storm = createDutchmanStorm(scene);
  const out = storm.update(1, 0.016, 0, 0, null, 1, 1780000000000);
  assert.ok(out.storm >= 0.3 && out.storm <= 1);
});

// ---------- Ship dressing: additive only, idempotent ----------

function buildStubShip() {
  // Mirrors ship3d.js: three vertical mast cylinders + a big sail
  // plane with userData.base + a deck box. No DOM, no canvas.
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x241a10 });
  const masts = [
    { z: -6.5, h: 15 },
    { z: 0.5, h: 19 },
    { z: 6.8, h: 16 },
  ];
  for (const md of masts) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, md.h, 8), wood);
    mast.position.set(0, 1.2 + md.h / 2, md.z);
    g.add(mast);
  }
  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 7, 8), wood);
  bowsprit.rotation.x = Math.PI / 2 - 0.28;
  bowsprit.position.set(0, 3.6, 11 + 2.6);
  g.add(bowsprit);
  const sailGeo = new THREE.PlaneGeometry(10, 5, 8, 6);
  const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({ color: 0xcfd4c8 }));
  sail.userData.base = sailGeo.attributes.position.array.slice();
  sail.position.set(0, 12, 0.5);
  g.add(sail);
  const sail2Geo = new THREE.PlaneGeometry(8.5, 5, 8, 6);
  const sail2 = new THREE.Mesh(sail2Geo, new THREE.MeshStandardMaterial({ color: 0xcfd4c8 }));
  sail2.userData.base = sail2Geo.attributes.position.array.slice();
  sail2.position.set(0, 11, -6.5);
  g.add(sail2);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 20), wood);
  deck.position.y = 1.15;
  g.add(deck);
  g.userData = {};
  return { g, mastTopY: 1.2 + 19, sail, sail2 };
}

test('dressShip adds rigging, weed, patches and clutter — and touches nothing existing', () => {
  const { g, mastTopY, sail } = buildStubShip();
  const before = [];
  g.traverse((o) => { if (o.isMesh) before.push({ mesh: o, color: o.material.color.getHex() }); });
  const beforeCount = g.children.length;
  dressShip(g);
  // Rigging: one LineSegments with stays + shrouds + ratlines.
  let rigging = null;
  let weed = 0; let coils = 0; let barrels = 0;
  g.traverse((o) => {
    if (o.name === 'dutchman-rigging') rigging = o;
    if (o.name === 'dutchman-waterline-weed') weed += 1;
    if (o.name === 'dutchman-rope-coil') coils += 1;
    if (o.name === 'dutchman-barrel') barrels += 1;
  });
  assert.ok(rigging, 'rigging added');
  assert.ok(rigging.isLineSegments, 'rigging is line segments');
  const pts = rigging.geometry.getAttribute('position');
  assert.ok(pts.count >= 2 * (1 + 1 + 2 + 3 * 2 * 6), `rigging has stays, shrouds and ratlines, got ${pts.count} points`);
  // Rigging reaches the main masthead.
  let topY = -Infinity;
  for (let i = 0; i < pts.count; i++) topY = Math.max(topY, pts.array[i * 3 + 1]);
  assert.ok(Math.abs(topY - mastTopY) < 0.01, `rigging reaches the masthead ${mastTopY}, got ${topY}`);
  assert.equal(weed, 2, 'weed band both sides at the waterline');
  assert.equal(coils, 1, 'one rope coil on deck');
  assert.equal(barrels, 2, 'two barrels on deck');
  // Sail patches ride the two biggest sails.
  let patches = 0;
  g.traverse((o) => { if (o.name === 'dutchman-sail-patch') patches += 1; });
  assert.equal(patches, 2, 'one patch per big sail');
  assert.ok(sail.children.some((c) => c.name === 'dutchman-sail-patch'), 'patch is a child of its sail');
  // Nothing existing was edited: same meshes, same colours.
  assert.equal(g.children.length, beforeCount + 1, 'one dressed group added, nothing rebuilt');
  for (const { mesh, color } of before) {
    assert.equal(mesh.material.color.getHex(), color, 'existing material untouched');
  }
  assert.equal(countLights(g), 0, 'dressing adds no lights');
});

test('dressShip is idempotent and safe on a non-ship group', () => {
  const { g } = buildStubShip();
  dressShip(g);
  let n = 0;
  g.traverse((o) => { if (o.name === 'dutchman-rigging') n += 1; });
  dressShip(g);
  let n2 = 0;
  g.traverse((o) => { if (o.name === 'dutchman-rigging') n2 += 1; });
  assert.equal(n2, n, 'second dress adds nothing');
  const empty = new THREE.Group();
  empty.userData = {};
  assert.doesNotThrow(() => dressShip(empty));
  assert.doesNotThrow(() => dressShip(null));
  assert.doesNotThrow(() => dressShip(undefined));
});

// ---------- Wiring: page.jsx calls the CGI, old files untouched ----------

test('page.jsx wires the storm layer and dresses every ship', () => {
  assert.ok(pageSrc.includes("from '../../lib/flying-dutchman/cgi.js'"), 'cgi.js imported');
  assert.ok(pageSrc.includes('createDutchmanStorm(scene)'), 'storm layer created');
  assert.ok(pageSrc.includes('G.storm.update(t, dt, p.x, p.z, p, G.nightF)'), 'storm updated per frame');
  const dresses = (pageSrc.match(/dressShip\(/g) || []).length;
  assert.ok(dresses >= 5, `dressShip called at every ship build site, got ${dresses}`);
  assert.ok(pageSrc.includes('storm, islands, chests'), 'storm kept on the game object');
});

test('every mechanic stays wired in page.jsx', () => {
  for (const token of [
    'createOcean', 'createSky', 'buildShip', 'buildGhostShip', 'buildLegendaryShip',
    'createKraken', 'createGulls', 'createSeaLife', 'createBallPool',
    'createFlashPool', 'createSplashPool', 'createSoulPool', 'createFirePool',
    'createMegaSoulPool', 'poseShip', 'animateShip', 'createIslands', 'createChests',
    'loadVoyageBackpack', 'syncCaptainFromBackpack', 'makeVoyageBackpack',
    'krakenLife', 'crewWatchLine',
  ]) {
    assert.ok(pageSrc.includes(token), `mechanic still wired: ${token}`);
  }
});

test('sea3d.js and ship3d.js are untouched by the CGI work', () => {
  assert.ok(!seaSrc.includes('cgi.js'), 'sea3d.js does not import the CGI module');
  assert.ok(!shipSrc.includes('cgi.js'), 'ship3d.js does not import the CGI module');
  assert.ok(!seaSrc.includes('stormCloudTexture'), 'no cloud code in sea3d.js');
  assert.ok(!shipSrc.includes('dressShip'), 'no dressing code in ship3d.js');
  // The wrapped sea metal is never re-coloured here: the CGI module
  // contains no assignment to an existing material's colour.
  assert.ok(!cgiSrc.includes('.material.color.set'), 'CGI never recolours an existing material');
  assert.ok(!cgiSrc.includes('new THREE.PointLight'), 'no PointLight in the CGI module');
  assert.ok(!cgiSrc.includes('new THREE.DirectionalLight'), 'no DirectionalLight in the CGI module');
  assert.ok(!cgiSrc.includes('new THREE.SpotLight'), 'no SpotLight in the CGI module');
  assert.ok(!cgiSrc.includes('new THREE.AmbientLight'), 'no AmbientLight in the CGI module');
  assert.ok(!cgiSrc.includes('new THREE.HemisphereLight'), 'no HemisphereLight in the CGI module');
});

test('sea3d.js: the Moon is Merlin\'s photo on a sphere, glow kept as halo', () => {
  assert.ok(seaSrc.includes("'/images/moon/moon-surface.jpg'"), 'moon photo loaded');
  assert.ok(seaSrc.includes('new THREE.SphereGeometry(100, 48, 32)'), 'moon is a sphere r100, never a flat disc');
  assert.ok(seaSrc.includes("name = 'dutchman-moon'"), 'moon sphere named');
  assert.ok(seaSrc.includes('moon.position.set(-1400, 1500, -2200)'), 'glow sprite stays at its fixed perch');
  assert.ok(seaSrc.includes('moon.scale.set(320, 320, 1)'), 'glow sprite stays as the halo');
  assert.ok(seaSrc.includes('depthWrite: false'), 'dome does not depth-occlude the moon outside its wall');
});
