// tests/diyu.test.mjs — DIYU base shell: layout math +
// static audits of the page and the 3D scene.
// Run: node tests/diyu.test.mjs   (from the repo root)
// NOTE: registries are merged by the coordinator after the build, so
// this file deliberately does NOT assert registry membership.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  WORLD_RADIUS,
  SPAWN,
  DESCENT_PORTAL,
  RIVER,
  GATES,
  COURT,
  REGIONS,
  PORTALS,
  PORTAL_TRIGGER_RADIUS,
  TORCH_COLORS,
  TORCH_LIGHT,
  TORCH_LIGHT_BUDGET,
  forward,
  makeTorches,
  right,
  clampPosition,
  stepBlockedByRiver,
  stepPosition,
  regionAt,
  nearestPortal,
  makeWorld,
} from '../lib/diyu/world.js';

const pageSrc = readFileSync('app/diyu/page.jsx', 'utf8');
const sceneSrc = readFileSync('app/diyu/world3d.js', 'utf8');

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// --- layout constants ------------------------------------------------------

test('world radius and spawn are sane', () => {
  assert.equal(WORLD_RADIUS, 380);
  assert.deepEqual({ x: SPAWN.x, z: SPAWN.z }, { x: 0, z: 160 });
  assert.equal(SPAWN.yaw, 0, 'spawn faces north (-Z) at yaw 0');
});

test('the Descent is a real portal object, Chinese hell (not just a spawn)', () => {
  assert.equal(DESCENT_PORTAL.id, 'descent-portal');
  assert.equal(DESCENT_PORTAL.key, 'descent');
  assert.equal(DESCENT_PORTAL.name, 'The Descent');
  assert.equal(DESCENT_PORTAL.mythos, 'chinese', 'this nether-realm is Chinese hell');
  assert.deepEqual({ x: DESCENT_PORTAL.x, z: DESCENT_PORTAL.z }, { x: 0, z: 146 });
  assert.equal(DESCENT_PORTAL.radius, 4);
  // The player spawns 14m south of the portal, facing north through it.
  assert.equal(SPAWN.z - DESCENT_PORTAL.z, 14);
  assert.equal(SPAWN.x, DESCENT_PORTAL.x);
  assert.equal(SPAWN.yaw, 0);
  // The portal stands in the Descent region and clear of the first
  // torch station and the arch portals (it is not one of the arches).
  assert.equal(regionAt(DESCENT_PORTAL.x, DESCENT_PORTAL.z), 'The Descent');
  assert.ok(dist(DESCENT_PORTAL.x, DESCENT_PORTAL.z, 4, 140) > 5);
  assert.ok(!PORTALS.some((p) => p.key === DESCENT_PORTAL.key));
});

test('the mythos menu, portal gun, and higher-realms portal are NOT built', () => {
  // Next round only (plan file, "THE PORTAL SYSTEM"). The Descent
  // portal is the anchor they will attach to — nothing about them
  // exists in the base build.
  assert.ok(!/MythosChooser|PortalGun|HigherRealms/.test(pageSrc + sceneSrc));
  assert.ok(!pageSrc.includes('/mythos') && !sceneSrc.includes('/mythos'));
});

test('the Gates stand at the bridge, the landmark on the far bank', () => {
  assert.deepEqual({ x: GATES.x, z: GATES.z }, { x: 0, z: 70 });
  assert.deepEqual({ x: COURT.x, z: COURT.z }, { x: 0, z: -130 });
  assert.ok(GATES.z > RIVER.zMax, 'Gates are on the near (south) bank');
  assert.ok(COURT.z < RIVER.zMin, 'Landmark is on the far (north) bank');
});

test('5 portal arches, unique keys/routes/labels, all live routes', () => {
  assert.equal(PORTALS.length, 5);
  const keys = new Set(PORTALS.map((p) => p.key));
  const routes = new Set(PORTALS.map((p) => p.route));
  assert.equal(keys.size, 5);
  assert.equal(routes.size, 5);
  for (const p of PORTALS) {
    assert.ok(p.label.length > 0, `${p.key} has a plain-words label`);
    assert.ok(p.route.startsWith('/'), `${p.key} route starts with /`);
    // The route's page must exist in the repo.
    const dir = `app${p.route}`;
    assert.ok(existsSync(dir), `${p.route} resolves to ${dir}`);
  }
  // Every world arches back to Hades, the first realm, and only to
  // routes that already exist — never to a sibling nether-realm.
  assert.ok(PORTALS.some((p) => p.route === '/nether-realm'), 'an arch leads home to Hades');
  assert.ok(!PORTALS.some((p) => ['/hell', '/naraka', '/diyu', '/helheim', '/duat', '/yomi'].includes(p.route)),
    'no arch to a sibling nether-realm');
});

test('portal arc rings the plaza on the far bank', () => {
  for (const p of PORTALS) {
    assert.ok(p.z < RIVER.zMin, `${p.key} is on the far bank`);
    assert.ok(dist(p.x, p.z, 0, 0) < WORLD_RADIUS, `${p.key} is inside the world`);
    assert.ok(approx(dist(p.x, p.z, COURT.x, COURT.z), 55, 0.5),
      `${p.key} sits ~55m from the landmark`);
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
  assert.deepEqual([byKey['ten-courts'].x, byKey['ten-courts'].z], [-160, -70]);
  assert.deepEqual([byKey['torment-halls'].x, byKey['torment-halls'].z], [160, -70]);
  assert.deepEqual([byKey['wheel'].x, byKey['wheel'].z], [0, -230]);
  for (const r of REGIONS) assert.ok(r.line.length > 10, `${r.key} has a plain-English line`);
});

// --- movement math ---------------------------------------------------------

test('forward(0) is north, right(0) is east (three.js camera convention)', () => {
  const f = forward(0);
  assert.ok(approx(f.x, 0) && approx(f.z, -1));
  const r = right(0);
  assert.ok(approx(r.x, 1) && approx(r.z, 0));
  // A quarter turn left faces west.
  const f2 = forward(Math.PI / 2);
  assert.ok(approx(f2.x, -1) && approx(f2.z, 0));
});

test('the bridge is the only river crossing', () => {
  // Straight north up the middle crosses on the bridge.
  assert.equal(stepBlockedByRiver(0, 150, 0, -150), false);
  // Straight north 50m east of the bridge is blocked.
  assert.equal(stepBlockedByRiver(50, 150, 50, -150), true);
  assert.equal(stepBlockedByRiver(-50, 150, -50, -150), true);
  // Stepping into the water off the bridge is blocked.
  assert.equal(stepBlockedByRiver(50, 30, 50, 0), true);
  // Stepping onto the bridge itself is fine.
  assert.equal(stepBlockedByRiver(0, 30, 0, 0), false);
  // Walking along the south bank never touches the river.
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
  assert.equal(regionAt(0, 150), 'The Descent');
  assert.equal(regionAt(0, 70), 'The Gates');
  assert.equal(regionAt(0, 0), 'The Wangchuan');
  assert.equal(regionAt(0, -130), 'King Yama\'s Court');
  assert.equal(regionAt(-160, -70), 'The Ten Courts');
  assert.equal(regionAt(160, -70), 'The Torment Halls');
  assert.equal(regionAt(0, -230), 'The Wheel of Rebirth');
  assert.equal(regionAt(200, 200), 'Diyu');
});

test('nearestPortal finds the arch you are standing in', () => {
  const first = PORTALS[0];
  assert.equal(nearestPortal(first.x, first.z)?.key, first.key);
  assert.equal(nearestPortal(0, 150), null);
  assert.equal(nearestPortal(0, -70, 1), null, '5m out, a 1m trigger finds nothing');
});

// --- set dressing ----------------------------------------------------------

test('makeWorld is deterministic per seed', () => {
  const a = makeWorld(1340);
  const b = makeWorld(1340);
  assert.deepEqual(a, b);
  const c = makeWorld(99);
  assert.notDeepEqual(a.lavaPools, c.lavaPools);
});

test('makeWorld dressing stays out of the river, plaza, and spawn', () => {
  const w = makeWorld(1340);
  assert.equal(w.lavaPools.length, 5);
  assert.equal(w.courtPillars.length, 10);
  assert.equal(w.hallBraziers.length, 6);
  assert.equal(w.wheelSpokes.length, 5);
  assert.equal(w.shades.length, 18);
  for (const p of w.lavaPools) {
    assert.ok(Math.abs(p.z) > 30, 'lava pool clear of the river');
    assert.ok(dist(p.x, p.z, COURT.x, COURT.z) > 75, 'lava pool clear of the plaza');
    assert.ok(dist(p.x, p.z, SPAWN.x, SPAWN.z) > 40, 'lava pool clear of the spawn');
  }
  for (const s of w.courtPillars) assert.ok(dist(s.x, s.z, -160, -70) < 70);
  for (const p of w.wheelSpokes) assert.ok(dist(p.x, p.z, 0, -230) < 80);
  // The east region's braziers ring their own region (160,-70) at
  // radius ~34 — a centre/radius swap would scatter them to the
  // world edge (the Kur/Nav/Orun bug).
  for (const p of w.hallBraziers) assert.ok(approx(dist(p.x, p.z, 160, -70), 34, 0.5), 'hall brazier rings the Torment Halls');
});

// --- fire: real light, Earth 2 torch style ----------------------------------

test('makeTorches lights the route: 50 flames, 8 real lights', () => {
  const torches = makeTorches();
  assert.equal(torches.length, 50);
  assert.equal(torches.filter((t) => t.hue === 'red').length, 18);
  assert.equal(torches.filter((t) => t.hue === 'gold').length, 32);
  assert.equal(torches.filter((t) => t.lit).length, TORCH_LIGHT_BUDGET);
  assert.equal(TORCH_LIGHT_BUDGET, 8, '8 torch lights + 4 region lights = 12 total');
});

test('torch-post light mapping matches Earth 2 (intensity 10, distance 14)', () => {
  assert.equal(TORCH_LIGHT.intensity, 10);
  assert.equal(TORCH_LIGHT.distance, 14);
  assert.equal(TORCH_COLORS.gold.light, 0xffc233);
  assert.notEqual(TORCH_COLORS.red.light, TORCH_COLORS.gold.light);
});

test('the Descent path is lined red, both sides, spawn to Gates', () => {
  const path = makeTorches().filter((t) => t.place === 'descent');
  assert.equal(path.length, 10);
  assert.ok(path.every((t) => t.hue === 'red'));
  assert.deepEqual([...new Set(path.map((t) => t.z))].sort((a, b) => a - b), [80, 95, 110, 125, 140]);
  assert.deepEqual([...new Set(path.map((t) => Math.abs(t.x)))], [4]);
});

test('every portal arch is flanked by two gold torches', () => {
  const torches = makeTorches();
  for (const p of PORTALS) {
    const flanks = torches.filter((t) => t.place === 'arch' && Math.abs(t.x - p.x) < 6 && Math.abs(t.z - p.z) < 6);
    assert.equal(flanks.length, 2, `${p.key} has 2 flanks`);
    assert.ok(flanks.every((t) => t.hue === 'gold'));
    // Flanks sit just outside the 4.5m travel trigger — the flame
    // never trips the vortex.
    for (const f of flanks) assert.ok(dist(f.x, f.z, p.x, p.z) > PORTAL_TRIGGER_RADIUS);
  }
});

test('torches stay in the world and out of the water', () => {
  for (const t of makeTorches()) {
    assert.ok(dist(t.x, t.z, 0, 0) < WORLD_RADIUS, `torch ${t.id} inside the world`);
    assert.ok(!(t.z > RIVER.zMin && t.z < RIVER.zMax), `torch ${t.id} not in the river`);
  }
  assert.equal(makeTorches().filter((t) => t.place === 'north').length, 6);
  assert.equal(makeTorches().filter((t) => t.place === 'east').length, 4);
  assert.ok(makeTorches().filter((t) => t.place === 'east').every((t) => t.hue === 'red'));
  assert.equal(makeTorches().filter((t) => t.place === 'landmark').length, 4);
});

test('rings are centred on their own region (no centre/radius swap)', () => {
  // The Kur/Nav/Orun bug: a ring built around the wrong centre
  // scatters its pieces to the world edge. Every torch ring here is
  // asserted against the region it belongs to.
  const torches = makeTorches();
  for (const t of torches.filter((x) => x.place === 'north')) {
    assert.ok(approx(dist(t.x, t.z, 0, -230), 60, 0.5), 'north torch rings the Wheel of Rebirth');
  }
  for (const t of torches.filter((x) => x.place === 'east')) {
    assert.ok(approx(dist(t.x, t.z, 160, -70), 55, 0.5), 'east torch rims the Torment Halls');
  }
  for (const t of torches.filter((x) => x.place === 'landmark')) {
    assert.ok(approx(dist(t.x, t.z, COURT.x, COURT.z), 24, 0.5), "landmark torch rings King Yama's Court");
  }
});

test('lit torches are the route-markers, not decoration', () => {
  const lit = makeTorches().filter((t) => t.lit);
  const places = new Set(lit.map((t) => t.place));
  assert.ok(places.has('descent') && places.has('gates') && places.has('river'));
  assert.ok(places.has('landmark-approach') && places.has('arch') && places.has('north'));
});

test('scene carries the Earth 2 fire: torches, flicker, both hues', () => {
  assert.ok(sceneSrc.includes('Torches'), 'Torches component in the scene');
  assert.ok(sceneSrc.includes('0.88 + 0.12'), 'Earth 2 flicker wave');
  assert.ok(sceneSrc.includes('TORCH_LIGHT'), 'torch-post light mapping');
  assert.ok(sceneSrc.includes('TORCH_COLORS'), 'two hues');
  // Runtime point lights: 4 region lights + the 8 lit torches = 12.
  // The file holds 5 <pointLight> tags (4 region + 1 inside the torch map).
  const tags = (sceneSrc.match(/<pointLight/g) || []).length;
  assert.equal(tags, 5);
  assert.equal(makeTorches().filter((t) => t.lit).length + 4, 12);
});

// --- static audits: the page -----------------------------------------------

test('page is a client route with the house 3D stack', () => {
  assert.ok(pageSrc.includes("'use client'"));
  assert.ok(pageSrc.includes('from \'@react-three/fiber\''));
  assert.ok(pageSrc.includes('useSceneContextGuard'));
  assert.ok(pageSrc.includes('useVortexTravel'));
  assert.ok(pageSrc.includes('DiyuScene'));
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
  assert.ok(new RegExp(`<h1[^>]*>\\s*DIYU\\s*<\\/h1>`).test(pageSrc), 'HUD display title is DIYU');
  assert.ok(pageSrc.includes('You are in:'));
  assert.ok(pageSrc.includes('Leave Diyu'));
  assert.ok(pageSrc.includes('WASD or arrows to walk'));
  assert.ok(pageSrc.includes('Left stick to walk'));
  assert.ok(pageSrc.includes('window.__diyu'), 'headless probe hook');
});

test('arch travel fires once per entry (no ride-restart loop)', () => {
  // Standing inside an arch re-fired travel() every 1.5s; each call
  // re-picked the tube skins and restarted the ride, so it never
  // finished (headless probe, 2026-11-12). The rig must guard with a
  // flag that re-arms only when the player steps back out.
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
  for (const piece of ['Ground', 'River', 'Bridge', 'Gates', 'Landmark',
    'WestRegion', 'EastRegion', 'NorthRegion', 'PortalArches', 'DescentPortal', 'Torches', 'Embers']) {
    assert.ok(sceneSrc.includes(piece), `scene contains ${piece}`);
  }
  assert.ok(sceneSrc.includes('DayNightRig'), 'day/night rig owns the sky + fog now (shared law, 2026-11-14)');
  assert.ok(sceneSrc.includes('makeWorld'), 'set dressing is seeded + deterministic');
  assert.ok(sceneSrc.includes('{p.label}'), 'arches carry their plain-words label');
  assert.ok(sceneSrc.includes('CameraRig'), 'first-person camera rig');
  assert.ok(sceneSrc.includes('The Wangchuan'), 'the river carries its plain-words label');
  assert.ok(!sceneSrc.includes('fetch(') && !sceneSrc.includes('http'), 'no external assets');
});

test('the Descent portal is a named ring in the scene graph, distinct from the arches', () => {
  assert.ok(sceneSrc.includes('DescentPortal'), 'DescentPortal component');
  assert.ok(sceneSrc.includes('name="descent-portal"'), 'scene-graph id for the next round to find');
  assert.ok(sceneSrc.includes('torusGeometry'), 'a full standing ring, not another pillar arch');
  assert.ok(!sceneSrc.includes('DescentMarker'), 'the old marker is gone');
});

test('portal trigger radius is a short walk, not a teleport', () => {
  assert.ok(PORTAL_TRIGGER_RADIUS >= 3 && PORTAL_TRIGGER_RADIUS <= 6);
});

// --- static audits: the registries -----------------------------------------
// Merged by the coordinator (Nov 12, 2026): diyu is homed under DIYU in
// both registries (dual-registry rule) with display strings in en.json.

test('god-menus.js homes diyu under DIYU', () => {
  const src = readFileSync('lib/god-menus.js', 'utf8');
  assert.ok(src.includes("god: 'DIYU'"));
  assert.ok(src.includes("'diyu'"));
  const home = src.split("god: 'DIYU'")[1].split('},')[0];
  assert.ok(home.includes("category: 'Nether-Realms'"), 'DIYU menu category is Nether-Realms');
});

test('satellites.ts registers diyu under DIYU (dual-registry rule)', () => {
  const src = readFileSync('lib/i18n/satellites.ts', 'utf8');
  assert.ok(src.includes('key: "diyu", route: "/diyu", pos: "DIYU"'));
});

test('en.json carries the diyu display strings', () => {
  const en = JSON.parse(readFileSync('lib/i18n/locales/en.json', 'utf8'));
  assert.equal(en['sat.diyu.title'], 'Diyu');
  assert.ok(en['sat.diyu.subtitle'].length > 0);
  assert.equal(en['sat.diyu.subtitle'], "The ten courts of hell");
});
