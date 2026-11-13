// tests/takamagahara.test.mjs — TAKAMAGAHARA base shell: layout math +
// static audits of the page, the 3D scene.
// Run: node tests/takamagahara.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  WORLD_RADIUS,
  SPAWN,
  ASCENT_PORTAL,
  RIVER,
  GATES,
  CENTER,
  REGIONS,
  PORTALS,
  PORTAL_TRIGGER_RADIUS,
  LIGHT_COLORS,
  LIGHT,
  LIGHT_BUDGET,
  forward,
  makeLights,
  right,
  clampPosition,
  stepBlockedByRiver,
  stepPosition,
  regionAt,
  nearestPortal,
  makeWorld,
} from '../lib/takamagahara/world.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const pageSrc = readFileSync('app/takamagahara/page.jsx', 'utf8');
const sceneSrc = readFileSync('app/takamagahara/world3d.js', 'utf8');

// --- layout constants ------------------------------------------------------

test('world radius and spawn are sane', () => {
  assert.equal(WORLD_RADIUS, 380);
  assert.deepEqual({ x: SPAWN.x, z: SPAWN.z }, { x: 0, z: 160 });
  assert.equal(SPAWN.yaw, 0, 'spawn faces north (-Z) at yaw 0');
});

test('the entry portal is a real portal object, JAPANESE heaven (not just a spawn)', () => {
  assert.equal(ASCENT_PORTAL.id, 'takamagahara-gate');
  assert.equal(ASCENT_PORTAL.key, 'ascent');
  assert.equal(ASCENT_PORTAL.name, 'The Takamagahara Gate');
  assert.equal(ASCENT_PORTAL.mythos, 'japanese', 'this higher realm is japanese heaven');
  assert.deepEqual({ x: ASCENT_PORTAL.x, z: ASCENT_PORTAL.z }, { x: 0, z: 146 });
  assert.equal(ASCENT_PORTAL.radius, 4);
  // The player spawns 14m south of the portal, facing north through it.
  assert.equal(SPAWN.z - ASCENT_PORTAL.z, 14);
  assert.equal(SPAWN.x, ASCENT_PORTAL.x);
  assert.equal(SPAWN.yaw, 0);
  // The portal stands in the Ascent region and clear of the first
  // light station and the arch portals (it is not one of the five).
  assert.equal(regionAt(ASCENT_PORTAL.x, ASCENT_PORTAL.z), 'The Ascent');
  assert.ok(dist(ASCENT_PORTAL.x, ASCENT_PORTAL.z, 4, 140) > 5);
  assert.ok(!PORTALS.some((p) => p.key === ASCENT_PORTAL.key));
});

test('the mythos menu, portal gun, and higher-realms portal are NOT built', () => {
  // Next round only (plan file, "THE PORTAL SYSTEM"). The entry portal
  // is the anchor they will attach to — nothing about them exists in
  // the base build.
  assert.ok(!/MythosChooser|PortalGun|HigherRealms/.test(pageSrc + sceneSrc));
  assert.ok(!pageSrc.includes('/mythos') && !sceneSrc.includes('/mythos'));
});

test('no sound engine in the page (that system plugs in separately later)', () => {
  assert.ok(!pageSrc.includes('createSoundEngine'), 'no sound engine yet');
  assert.ok(!pageSrc.includes('Sound: on'), 'no sound toggle yet');
});

test('the gates stand at the bridge, the centre on the far bank', () => {
  assert.deepEqual({ x: GATES.x, z: GATES.z }, { x: 0, z: 70 });
  assert.deepEqual({ x: CENTER.x, z: CENTER.z }, { x: 0, z: -130 });
  assert.ok(GATES.z > RIVER.zMax, 'Gates are on the near (south) bank');
  assert.ok(CENTER.z < RIVER.zMin, 'Centre is on the far (north) bank');
});

test('five portal arches, unique keys/routes/labels, all live routes', () => {
  assert.equal(PORTALS.length, 5);
  const keys = new Set(PORTALS.map((p) => p.key));
  const routes = new Set(PORTALS.map((p) => p.route));
  assert.equal(keys.size, 5);
  assert.equal(routes.size, 5);
  for (const p of PORTALS) {
    assert.ok(p.label.length > 0, `${p.key} has a plain-words label`);
    assert.ok(p.route.startsWith('/'), `${p.key} route starts with /`);
    const dir = `app${p.route}`;
    assert.ok(existsSync(dir), `${p.route} resolves to ${dir}`);
  }
});

test('portal arc rings the plaza on the far bank — checked against the CENTRE, not just counts', () => {
  // Wave 1 lesson: a centre/radius swap passes count tests while
  // scattering objects to the world edge. Assert each arch's distance
  // from the centre itself.
  for (const p of PORTALS) {
    assert.ok(p.z < RIVER.zMin, `${p.key} is on the far bank`);
    assert.ok(dist(p.x, p.z, 0, 0) < WORLD_RADIUS, `${p.key} is inside the world`);
    assert.ok(approx(dist(p.x, p.z, CENTER.x, CENTER.z), 55, 0.5),
      `${p.key} sits ~55m from the centre (got ${dist(p.x, p.z, CENTER.x, CENTER.z).toFixed(1)}m)`);
  }
  for (let i = 0; i < PORTALS.length; i += 1) {
    for (let j = i + 1; j < PORTALS.length; j += 1) {
      assert.ok(dist(PORTALS[i].x, PORTALS[i].z, PORTALS[j].x, PORTALS[j].z) > 10,
        `${PORTALS[i].key} and ${PORTALS[j].key} are not on top of each other`);
    }
  }
});

test('three regions, in the right corners', () => {
  assert.equal(REGIONS.length, 3);
  const byKey = Object.fromEntries(REGIONS.map((r) => [r.key, r]));
  assert.deepEqual([byKey['high-plain'].x, byKey['high-plain'].z], [-160, -70]);
  assert.deepEqual([byKey['sakura-grove'].x, byKey['sakura-grove'].z], [160, -70]);
  assert.deepEqual([byKey['sun-terrace'].x, byKey['sun-terrace'].z], [0, -230]);
  for (const r of REGIONS) assert.ok(r.line.length > 10, `${r.key} has a plain-English line`);
});

// --- movement math ---------------------------------------------------------

test('forward(0) is north, right(0) is east (three.js camera convention)', () => {
  const f = forward(0);
  assert.ok(approx(f.x, 0) && approx(f.z, -1));
  const r = right(0);
  assert.ok(approx(r.x, 1) && approx(r.z, 0));
  const f2 = forward(Math.PI / 2);
  assert.ok(approx(f2.x, -1) && approx(f2.z, 0));
});

test('the bridge is the only river crossing', () => {
  assert.equal(stepBlockedByRiver(0, 150, 0, -150), false);
  assert.equal(stepBlockedByRiver(50, 150, 50, -150), true);
  assert.equal(stepBlockedByRiver(-50, 150, -50, -150), true);
  assert.equal(stepBlockedByRiver(50, 30, 50, 0), true);
  assert.equal(stepBlockedByRiver(0, 30, 0, 0), false);
  assert.equal(stepBlockedByRiver(0, 150, 100, 150), false);
});

test('stepPosition enforces the river and the world edge', () => {
  const over = stepPosition(50, 30, 0, -60);
  assert.equal(over.blocked, true);
  assert.deepEqual({ x: over.x, z: over.z }, { x: 50, z: 30 });
  const free = stepPosition(0, 150, 0, -10);
  assert.equal(free.blocked, false);
  assert.ok(approx(free.z, 140));
  const edge = clampPosition(400, 0);
  assert.ok(approx(dist(edge.x, edge.z, 0, 0), WORLD_RADIUS));
});

test('regionAt names every place in plain English', () => {
  assert.equal(regionAt(0, 150), 'The Ascent');
  assert.equal(regionAt(0, 70), "The Floating Bridge");
  assert.equal(regionAt(0, 0), 'The Amanogawa');
  assert.equal(regionAt(0, -130), "Amaterasu's Hall");
  assert.equal(regionAt(-160, -70), 'The High Plain');
  assert.equal(regionAt(160, -70), 'The Sacred Sakura Grove');
  assert.equal(regionAt(0, -230), 'The Sun Terrace');
  assert.equal(regionAt(200, 200), 'Takamagahara');
});

test('nearestPortal finds the arch you are standing in', () => {
  assert.equal(nearestPortal(0, -75)?.key, 'mount-olympus');
  assert.equal(nearestPortal(-53.1, -115.8)?.key, 'yomi');
  assert.equal(nearestPortal(0, 150), null);
  assert.equal(nearestPortal(0, -70, 1), null, '5m out, a 1m trigger finds nothing');
});

// --- set dressing ----------------------------------------------------------

test('makeWorld is deterministic per seed', () => {
  const a = makeWorld(1337);
  const b = makeWorld(1337);
  assert.deepEqual(a, b);
  const c = makeWorld(99);
  assert.notDeepEqual(a.cloudPools, c.cloudPools);
});

test('makeWorld dressing stays out of the river, plaza, and spawn', () => {
  const w = makeWorld(1337);
  assert.equal(w.cloudPools.length, 5);
  assert.equal(w.plainStones.length, 10);
  assert.equal(w.sakuraTrees.length, 6);
  assert.equal(w.sunRocks.length, 5);
  assert.equal(w.kami.length, 18);
  for (const p of w.cloudPools) {
    assert.ok(Math.abs(p.z) > 30, 'pool clear of the river');
    assert.ok(dist(p.x, p.z, CENTER.x, CENTER.z) > 75, 'pool clear of the plaza');
    assert.ok(dist(p.x, p.z, SPAWN.x, SPAWN.z) > 40, 'pool clear of the spawn');
  }
  for (const s of w.plainStones) assert.ok(dist(s.x, s.z, -160, -70) < 70);
  for (const p of w.sunRocks) assert.ok(dist(p.x, p.z, 0, -230) < 80);
});

// --- light: real light, Earth 2 torch style, no fire ------------------------

test('makeLights lights the route: 46 posts, 8 real lights', () => {
  const lights = makeLights();
  assert.equal(lights.length, 46);
  assert.equal(lights.filter((t) => t.hue === 'gold').length, 18);
  assert.equal(lights.filter((t) => t.hue === 'sky').length, 28);
  assert.equal(lights.filter((t) => t.lit).length, LIGHT_BUDGET);
  assert.equal(LIGHT_BUDGET, 8, '8 light posts + 4 region lights = 12 total');
});

test('light-post mapping matches Earth 2 (intensity 10, distance 14)', () => {
  assert.equal(LIGHT.intensity, 10);
  assert.equal(LIGHT.distance, 14);
  assert.notEqual(LIGHT_COLORS.gold.light, LIGHT_COLORS.sky.light);
});

test('the ascent path is lined gold, both sides, spawn to gates', () => {
  const path = makeLights().filter((t) => t.place === 'ascent');
  assert.equal(path.length, 10);
  assert.ok(path.every((t) => t.hue === 'gold'));
  assert.deepEqual([...new Set(path.map((t) => t.z))].sort((a, b) => a - b), [80, 95, 110, 125, 140]);
  assert.deepEqual([...new Set(path.map((t) => Math.abs(t.x)))], [4]);
});

test('every portal arch is flanked by two sky posts', () => {
  const lights = makeLights();
  for (const p of PORTALS) {
    const flanks = lights.filter((t) => t.place === 'arch' && Math.abs(t.x - p.x) < 6 && Math.abs(t.z - p.z) < 6);
    assert.equal(flanks.length, 2, `${p.key} has 2 flanks`);
    assert.ok(flanks.every((t) => t.hue === 'sky'));
    for (const f of flanks) assert.ok(dist(f.x, f.z, p.x, p.z) > PORTAL_TRIGGER_RADIUS);
  }
});

test('light posts stay in the world and out of the water', () => {
  for (const t of makeLights()) {
    assert.ok(dist(t.x, t.z, 0, 0) < WORLD_RADIUS, `post ${t.id} inside the world`);
    assert.ok(!(t.z > RIVER.zMin && t.z < RIVER.zMax), `post ${t.id} not in the river`);
  }
  assert.equal(makeLights().filter((t) => t.place === 'sun-terrace').length, 6);
  assert.equal(makeLights().filter((t) => t.place === 'high-plain').length, 4);
  assert.ok(makeLights().filter((t) => t.place === 'high-plain').every((t) => t.hue === 'gold'));
});

test('lit posts are the route-markers, not decoration', () => {
  const lit = makeLights().filter((t) => t.lit);
  const places = new Set(lit.map((t) => t.place));
  assert.ok(places.has('ascent') && places.has('gates') && places.has('river'));
  assert.ok(places.has('center-approach') && places.has('arch') && places.has('sun-terrace'));
});

test('scene carries the Earth 2 light: posts, breathing, both hues', () => {
  assert.ok(sceneSrc.includes('Lights'), 'Lights component in the scene');
  assert.ok(sceneSrc.includes('0.88 + 0.12'), 'Earth 2 breathing wave');
  assert.ok(sceneSrc.includes('LIGHT'), 'light-post mapping');
  assert.ok(sceneSrc.includes('LIGHT_COLORS'), 'two hues');
  // Runtime point lights: 4 region lights + the 8 lit posts = 12.
  // The file holds 5 <pointLight> tags (4 region + 1 inside the post map).
  const tags = (sceneSrc.match(/<pointLight/g) || []).length;
  assert.equal(tags, 5);
  assert.equal(makeLights().filter((t) => t.lit).length + 4, 12);
});

// --- static audits: the page -----------------------------------------------

test('page is a client route with the house 3D stack', () => {
  assert.ok(pageSrc.includes("'use client'"));
  assert.ok(pageSrc.includes('from \'@react-three/fiber\''));
  assert.ok(pageSrc.includes('useSceneContextGuard'));
  assert.ok(pageSrc.includes('useVortexTravel'));
  assert.ok(pageSrc.includes('TakamagaharaScene'));
  assert.ok(pageSrc.includes('<Canvas'));
});

test('page has no auth gate and no router.push (arches use vortex travel)', () => {
  assert.ok(!pageSrc.includes('supabase'), 'no Supabase gate — a public world');
  assert.ok(!pageSrc.includes('router.push'), 'arches navigate via travel(), not router.push');
  assert.ok(pageSrc.includes('travel(portal.route, portal.label)'));
  assert.ok(pageSrc.includes('vortexOverlay'));
});

test('page is mobile-first with a plain-English HUD', () => {
  assert.ok(pageSrc.includes('maxTouchPoints'), 'touch UI detection');
  assert.ok(pageSrc.includes('prefers-reduced-motion'), 'reduced motion respected');
  assert.ok(new RegExp(`<h1[^>]*>\\s*TAKAMAGAHARA\\s*<\\/h1>`).test(pageSrc), 'HUD display title');
  assert.ok(pageSrc.includes('You are in:'));
  assert.ok(pageSrc.includes('Leave Takamagahara'));
  assert.ok(pageSrc.includes('WASD or arrows to walk'));
  assert.ok(pageSrc.includes('Left stick to walk'));
  assert.ok(pageSrc.includes('window.__takamagahara'), 'headless probe hook');
});

test('arch travel fires once per entry (no ride-restart loop)', () => {
  assert.ok(sceneSrc.includes('travelingRef'), 'CameraRig carries a traveling guard');
  assert.ok(sceneSrc.includes('travelingRef.current = false'), 'guard re-arms on exit');
  assert.ok(sceneSrc.includes('!travelingRef.current'), 'travel fires only when not already traveling');
});

test('page exports only the default route component', () => {
  const named = pageSrc.match(/^export (?!default)\w+/gm) || [];
  assert.equal(named.length, 0, `route module must not export extras: ${named}`);
});

// --- static audits: the scene ----------------------------------------------

test('scene builds the whole world shell, procedurally', () => {
  for (const piece of ['Ground', 'River', 'Bridge', 'Gates', 'Center', 'WestRegion',
    'EastRegion', 'NorthRegion', 'PortalArches', 'EntryPortal', 'Lights', 'Motes']) {
    assert.ok(sceneSrc.includes(piece), `scene contains ${piece}`);
  }
  assert.ok(sceneSrc.includes('fogExp2'), 'bright sky via fog');
  assert.ok(sceneSrc.includes('makeWorld'), 'set dressing is seeded + deterministic');
  assert.ok(sceneSrc.includes('{p.label}'), 'arches carry their plain-words label');
  assert.ok(sceneSrc.includes('CameraRig'), 'first-person camera rig');
  assert.ok(!sceneSrc.includes('fetch(') && !sceneSrc.includes('http'), 'no external assets');
});

test('every regionAt name has a visible Html label in the scene — rivers included', () => {
  // Wave 1 lesson: rivers were missed twice. Every name regionAt can
  // return must appear as label text in the scene source.
  const names = [
    "The High Plain", "The Sacred Sakura Grove", "The Sun Terrace",
    "Amaterasu's Hall", "The Floating Bridge", "The Amanogawa",
    "The Takamagahara Gate",
  ];
  for (const n of names) {
    assert.ok(sceneSrc.includes(n), `scene labels ${n}`);
  }
  // And the labels are Html, not just comments or data: 8 <Html> tags
  // render 12 labels (7 singles + the arch map's 5).
  assert.ok((sceneSrc.match(/<Html/g) || []).length >= 8, 'at least 8 Html label tags (rendering 12 labels)');
});

test('the entry portal is a named ring in the scene graph, distinct from the arches', () => {
  assert.ok(sceneSrc.includes('EntryPortal'), 'EntryPortal component');
  assert.ok(sceneSrc.includes('name="takamagahara-gate"'), 'scene-graph id for the next round to find');
  assert.ok(sceneSrc.includes('torusGeometry'), 'a full standing ring, not another pillar arch');
  assert.ok(!sceneSrc.includes('DescentPortal'), 'no nether-realm Descent portal here');
});

test('portal trigger radius is a short walk, not a teleport', () => {
  assert.ok(PORTAL_TRIGGER_RADIUS >= 3 && PORTAL_TRIGGER_RADIUS <= 6);
});
