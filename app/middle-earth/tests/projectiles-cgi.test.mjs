// Headless tests for the Middle-earth CGI enhancement + projectile
// audit (Merlin, Nov 26): every ranged weapon fires a visible CGI
// projectile, the Mordor sky/ground/spires are dressed, and the
// dragon breath/bite visuals build. DOM stub is installed BEFORE
// any imports (static imports would hoist above it, so this file
// uses dynamic imports after the stub) — the builders.test.mjs
// pattern.

// --- fake canvas: every 2d-context method is a no-op -------------------------
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
  },
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
const CGI = await import('../../../lib/weapons/cgi.js');
const ZONE = await import('../zone.js');
const DATA = await import('../data.js');
const DRAGONS = await import('../dragons.js');

const {
  firingForClass, rangedFiringFor, meleeFiringFor, cgiForWeapon,
  cgiForClass, spawnProjectile, stepProjectile, buildProjectileMesh,
  buildProceduralWeapon, normaliseWeaponGroup, THROWN_SPEAR_FIRING,
  buildBreathCone, dragonWindupOutcome, WEAPON_MOUNT, WEAPON_LENGTH_M,
} = CGI;
const {
  buildZone, buildMESkyDome, buildMESkyLayers, buildMEGroundDressing,
  ME_SKY_DOME_RADIUS, ME_SKY_CLOUDS_ASH, ME_SKY_CLOUDS_GREEN,
  ME_SKY_EMBERS, ME_GROUND_CRACKS, ME_GROUND_SCORCH, ME_GROUND_MIST,
  ME_GROUND_SHADE,
} = ZONE;

function zoneFor(podId, opts) {
  return buildZone(THREE, DATA.PODS[podId], T, { freeRoam: true, ...(opts || {}) });
}

function meshCount(g) {
  let n = 0;
  g.traverse((o) => { if (o.isMesh) n += 1; });
  return n;
}

function boxOf(g) {
  return new THREE.Box3().setFromObject(g);
}

/* ── 1. every ranged weapon maps to a projectile kind ── */

test('ranged mapping: revolver bullet, bow arrow, spear thrown, portal-gun bolt, staff blast', () => {
  assert.equal(
    rangedFiringFor({ equippedId: 'preset-revolver', equippedClass: 'firearm', heroKind: 'bow' }).kind,
    'bullet');
  assert.equal(
    rangedFiringFor({ equippedId: 'preset-bow', equippedClass: 'bow', heroKind: 'staff' }).kind,
    'arrow');
  const spear = rangedFiringFor({ equippedId: 'preset-spear', equippedClass: 'spear', heroKind: 'bow' });
  assert.equal(spear.kind, 'spear');
  assert.equal(spear.speedMps, 45);
  assert.equal(spear.rangeM, 40);
  assert.deepEqual(spear, { ...THROWN_SPEAR_FIRING });
  const bolt = rangedFiringFor({ equippedId: 'portal-gun', equippedClass: 'firearm', heroKind: 'bow' });
  assert.equal(bolt.kind, 'bolt');
  assert.equal(bolt.speedMps, 80);
  assert.equal(bolt.tracerColor, '#7df9ff');
  assert.equal(rangedFiringFor({ heroKind: 'staff' }).kind, 'blast');
  assert.equal(rangedFiringFor({ heroKind: 'bow' }).kind, 'arrow');
  // A blade never arms the ranged hand — the hero's own bow stays.
  assert.equal(
    rangedFiringFor({ equippedId: 'preset-sword', equippedClass: 'blade', heroKind: 'bow' }).kind,
    'arrow');
});

test('melee stays melee: spear thrusts in the melee hand, sword swings, revolver never', () => {
  assert.equal(firingForClass('spear').kind, 'thrust');
  assert.equal(firingForClass('blade').kind, 'swing');
  assert.equal(firingForClass('blunt').kind, 'swing');
  assert.equal(firingForClass('cane').kind, 'swing');
  assert.equal(meleeFiringFor({ equippedId: 'preset-spear', equippedClass: 'spear' }).kind, 'thrust');
  assert.equal(meleeFiringFor({ equippedId: 'preset-sword', equippedClass: 'blade' }).kind, 'swing');
  assert.equal(meleeFiringFor({ equippedId: 'preset-revolver', equippedClass: 'firearm' }), null);
  assert.equal(meleeFiringFor({}), null);
});

test('portal gun resolves by id, never as a bullet or a revolver', () => {
  const spec = cgiForWeapon({ id: 'portal-gun', weaponClass: 'firearm' });
  assert.equal(spec.firing.kind, 'bolt');
  assert.equal(spec.model.kind, 'procedural');
  assert.equal(spec.model.build, 'portal');
  assert.equal(cgiForClass('portal').firing.kind, 'bolt');
  const g = buildProceduralWeapon(THREE, 'portal');
  assert.ok(meshCount(g) >= 4, `portal build meshes (${meshCount(g)})`);
  const a = boxOf(g);
  const b = boxOf(buildProceduralWeapon(THREE, 'portal'));
  assert.deepEqual([a.min.x, a.min.y, a.min.z, a.max.x, a.max.y, a.max.z],
    [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]);
  // Fitted like a gun: barrel forward, ~0.5 m in hand.
  assert.equal(WEAPON_LENGTH_M.portal, 0.5);
  assert.ok(WEAPON_MOUNT.portal, 'portal mount');
  const fitted = normaliseWeaponGroup(THREE, buildProceduralWeapon(THREE, 'portal'), { weaponClass: 'portal' });
  const size = new THREE.Vector3();
  boxOf(fitted).getSize(size);
  assert.ok(Math.abs(size.z - 0.5) < 0.05, `portal fitted length (${size.z.toFixed(3)} m)`);
});

/* ── 2. the new projectile kinds fly ── */

test('projectile sim: thrown spear + portal bolt travel and impact at range', () => {
  for (const firing of [THROWN_SPEAR_FIRING, { kind: 'bolt', speedMps: 80, tracerColor: '#7df9ff', rangeM: 60 }]) {
    const s = spawnProjectile(firing, [0, 1.5, 0], [1, 0, 0], 0);
    assert.equal(s.kind, firing.kind);
    assert.equal(stepProjectile(s, 0.5), false);
    assert.ok(Math.abs(s.pos[0] - firing.speedMps * 0.5) < 1e-9, `${firing.kind} travels`);
    assert.equal(s.alive, true);
    const over = firing.rangeM / firing.speedMps + 0.1;
    assert.equal(stepProjectile(s, over), true, `${firing.kind} impacts at range`);
    assert.equal(s.alive, false);
    const pos = [...s.pos];
    assert.equal(stepProjectile(s, 1), false);
    assert.deepEqual(s.pos, pos, 'a dead projectile never moves again');
  }
});

test('projectile meshes: spear + bolt build visible, placed, deterministic', () => {
  for (const firing of [
    { kind: 'spear', speedMps: 45, tracerColor: '#e8dcc0', rangeM: 40 },
    { kind: 'bolt', speedMps: 80, tracerColor: '#7df9ff', rangeM: 60 },
    { kind: 'bullet', speedMps: 350, tracerColor: '#ffb347', rangeM: 120 },
    { kind: 'arrow', speedMps: 70, tracerColor: '#e8e0c8', rangeM: 90 },
    { kind: 'blast', speedMps: 60, tracerColor: '#b78cff', rangeM: 60 },
  ]) {
    const rec = spawnProjectile(firing, [3, 1.5, -2], [0, 0, -1], 0);
    const a = buildProjectileMesh(THREE, rec);
    assert.ok(a.group.children.length >= 2, `${firing.kind} has visible parts`);
    assert.deepEqual(
      [a.group.position.x, a.group.position.y, a.group.position.z], [3, 1.5, -2]);
    const sizeA = new THREE.Vector3();
    boxOf(a.group).getSize(sizeA);
    const b = buildProjectileMesh(THREE, spawnProjectile(firing, [3, 1.5, -2], [0, 0, -1], 0));
    const sizeB = new THREE.Vector3();
    boxOf(b.group).getSize(sizeB);
    assert.ok(sizeA.distanceTo(sizeB) < 1e-9, `${firing.kind} deterministic`);
    if (firing.kind === 'spear') assert.ok(sizeA.z > 1, `thrown spear reads long (${sizeA.z.toFixed(2)} m)`);
    a.dispose();
    b.dispose();
  }
});

/* ── 3. dragon breath cone + wind-up outcome ── */

test('breath cone: apex at the mouth, length is the breath range, deterministic', () => {
  const a = buildBreathCone(THREE, 14);
  assert.equal(a.rangeM, 14);
  assert.ok(a.outer && a.core && a.glow, 'cone + core + mouth glow');
  const box = boxOf(a.group);
  assert.ok(Math.abs(box.min.z) < 0.05, `apex at origin (min z ${box.min.z.toFixed(3)})`);
  assert.ok(Math.abs(box.max.z - 14) < 0.05, `base at range (max z ${box.max.z.toFixed(3)})`);
  const b = buildBreathCone(THREE, 14);
  const boxB = boxOf(b.group);
  assert.ok(Math.abs(box.max.z - boxB.max.z) < 1e-9, 'deterministic');
  const small = buildBreathCone(THREE, 12);
  assert.ok(Math.abs(boxOf(small.group).max.z - 12) < 0.05, 'fell-beast range builds shorter');
  a.dispose();
  b.dispose();
  small.dispose();
});

test('dragon wind-up outcome: hit in range, cancelled out of range, none when dead', () => {
  const dragon = DRAGONS.DRAGON_KINDS.dragon;
  const beast = DRAGONS.DRAGON_KINDS['fell-beast'];
  assert.equal(dragonWindupOutcome({
    prevKind: 'breath', stats: dragon, dist: 10, alive: true, dead: false,
  }), 'hit');
  assert.equal(dragonWindupOutcome({
    prevKind: 'breath', stats: dragon, dist: 20, alive: true, dead: false,
  }), 'cancelled');
  assert.equal(dragonWindupOutcome({
    prevKind: 'breath', stats: dragon, dist: 10, alive: false, dead: false,
  }), 'cancelled');
  assert.equal(dragonWindupOutcome({
    prevKind: 'bite', stats: beast, dist: 3.5, alive: true, dead: false,
  }), 'hit');
  assert.equal(dragonWindupOutcome({
    prevKind: 'bite', stats: beast, dist: 5, alive: true, dead: false,
  }), 'cancelled');
  assert.equal(dragonWindupOutcome({
    prevKind: 'breath', stats: dragon, dist: 10, alive: true, dead: true,
  }), 'none');
  assert.equal(dragonWindupOutcome({
    prevKind: null, stats: dragon, dist: 10, alive: true, dead: false,
  }), 'none');
});

/* ── 4. new textures ── */

test('new texture makers return textures', () => {
  for (const name of ['scorchTexture', 'meadowShadeTexture', 'cloudSprite']) {
    const tex = T[name]();
    assert.ok(tex && tex.isTexture, `${name} is a texture`);
  }
});

/* ── 5. CGI sky ── */

test('sky dome: Mordor smoulders from its own sky colour, deterministic, radius 1200', () => {
  const def = DATA.PODS.mordor;
  const a = buildMESkyDome(THREE, def);
  assert.equal(a.userData.skyRadius, ME_SKY_DOME_RADIUS);
  assert.equal(a.material.side, THREE.BackSide);
  assert.equal(a.material.fog, false);
  const horizon = new THREE.Color(def.sky);
  const colors = a.geometry.getAttribute('color');
  const pos = a.geometry.getAttribute('position');
  // The horizon band (y ≈ 0) carries the pod's own sky colour.
  let found = false;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getY(i)) < ME_SKY_DOME_RADIUS * 0.02) {
      const cr = colors.getX(i) - horizon.r;
      const cg = colors.getY(i) - horizon.g;
      const cb = colors.getZ(i) - horizon.b;
      assert.ok(Math.hypot(cr, cg, cb) < 0.02, 'horizon is the pod sky');
      found = true;
      break;
    }
  }
  assert.ok(found, 'a horizon vertex exists');
  const b = buildMESkyDome(THREE, def);
  assert.deepEqual([...colors.array], [...b.geometry.getAttribute('color').array]);
  // Green pods grade down from their sky, never smoulder.
  const shire = buildMESkyDome(THREE, DATA.PODS.shire);
  const top = new THREE.Color(
    shire.geometry.getAttribute('color').getX(0),
    shire.geometry.getAttribute('color').getY(0),
    shire.geometry.getAttribute('color').getZ(0));
  assert.ok(top.getHex() !== new THREE.Color(DATA.PODS.shire.sky).getHex(), 'shire top is darkened sky');
});

test('sky layers: Mordor gets clouds + rising embers, the Shire clouds only', () => {
  const mordor = buildMESkyLayers(THREE, DATA.PODS.mordor, T);
  assert.equal(mordor.group.userData.clouds, ME_SKY_CLOUDS_ASH);
  assert.equal(mordor.group.userData.embers, ME_SKY_EMBERS);
  const shire = buildMESkyLayers(THREE, DATA.PODS.shire, T);
  assert.equal(shire.group.userData.clouds, ME_SKY_CLOUDS_GREEN);
  assert.equal(shire.group.userData.embers, 0);
  // Deterministic: same seed, same clouds.
  const again = buildMESkyLayers(THREE, DATA.PODS.mordor, T);
  const posA = mordor.group.children.filter((o) => o.name === 'me-cloud').map((o) => [o.position.x, o.position.y, o.position.z]);
  const posB = again.group.children.filter((o) => o.name === 'me-cloud').map((o) => [o.position.x, o.position.y, o.position.z]);
  assert.deepEqual(posA, posB);
  // The updaters move things: embers climb, clouds drift.
  const embers = mordor.group.children.find((o) => o.name === 'me-embers');
  const y0 = embers.geometry.getAttribute('position').getY(0);
  for (const u of mordor.updaters) u(0, 1);
  const y1 = embers.geometry.getAttribute('position').getY(0);
  assert.ok(y1 > y0, `embers rise (${y0.toFixed(2)} -> ${y1.toFixed(2)})`);
});

/* ── 6. CGI ground ── */

test('ground dressing: Mordor cracks + scorch + mist, the Shire shade only, deterministic', () => {
  const flat = (x, z) => Math.sin(x * 0.1) * 2 + Math.cos(z * 0.07) * 1.5;
  const mordor = buildMEGroundDressing(THREE, DATA.PODS.mordor, flat, T);
  assert.equal(mordor.group.userData.cracks, ME_GROUND_CRACKS);
  assert.equal(mordor.group.userData.scorch, ME_GROUND_SCORCH);
  assert.equal(mordor.group.userData.mist, ME_GROUND_MIST);
  assert.equal(mordor.group.userData.shade, 0);
  const again = buildMEGroundDressing(THREE, DATA.PODS.mordor, flat, T);
  const ribA = mordor.group.children.find((o) => o.name === 'me-crack-ribbon');
  const ribB = again.group.children.find((o) => o.name === 'me-crack-ribbon');
  assert.deepEqual(
    [...ribA.geometry.getAttribute('position').array],
    [...ribB.geometry.getAttribute('position').array]);
  const shire = buildMEGroundDressing(THREE, DATA.PODS.shire, flat, T);
  assert.equal(shire.group.userData.cracks, 0);
  assert.equal(shire.group.userData.shade, ME_GROUND_SHADE);
});

/* ── 7. the built zone carries the enhancement ── */

test('Mordor zone: sky dome + layers + dressing + dressed spires, sky rides the observer', () => {
  const z = zoneFor('mordor');
  try {
    assert.equal(z.cgi.domeRadius, ME_SKY_DOME_RADIUS);
    assert.equal(z.cgi.clouds, ME_SKY_CLOUDS_ASH);
    assert.equal(z.cgi.embers, ME_SKY_EMBERS);
    assert.equal(z.cgi.cracks, ME_GROUND_CRACKS);
    assert.equal(z.cgi.scorch, ME_GROUND_SCORCH);
    assert.equal(z.cgi.mist, ME_GROUND_MIST);
    // Mordor horizon: 20 spires — every one tipped, every second
    // seamed, every third crowned.
    assert.equal(z.cgi.spireTips, 20);
    assert.equal(z.cgi.spireSeams, 10);
    assert.equal(z.cgi.spireCrowns, 7);
    const sky = z.group.getObjectByName('me-sky');
    assert.ok(sky, 'me-sky group');
    assert.ok(sky.getObjectByName('me-sky-dome'), 'dome in the sky group');
    assert.ok(sky.getObjectByName('me-sun-core'), 'sun still rides with the sky');
    assert.ok(z.group.getObjectByName('me-spire-tips'), 'spire tips');
    assert.ok(z.group.getObjectByName('me-spire-seams'), 'spire seams');
    assert.ok(z.group.getObjectByName('me-spire-crowns'), 'spire crowns');
    // ENDLESS: the sky follows the observer, it never stays home.
    z.setObserver(100, -50);
    z.update(0, 0.016);
    assert.deepEqual([sky.position.x, sky.position.z], [100, -50]);
    const dome = sky.getObjectByName('me-sky-dome');
    const world = new THREE.Vector3();
    dome.getWorldPosition(world);
    assert.ok(Math.abs(world.x - 100) < 0.01 && Math.abs(world.z + 50) < 0.01, 'dome over the observer');
  } finally {
    z.dispose();
  }
});

test('Shire zone: green sky, no embers or cracks, shade discs instead', () => {
  const z = zoneFor('shire');
  try {
    assert.equal(z.cgi.clouds, ME_SKY_CLOUDS_GREEN);
    assert.equal(z.cgi.embers, 0);
    assert.equal(z.cgi.cracks, 0);
    assert.equal(z.cgi.shade, ME_GROUND_SHADE);
    assert.equal(z.cgi.spireTips, 0, 'the Shire has no spire ring to dress');
  } finally {
    z.dispose();
  }
});
