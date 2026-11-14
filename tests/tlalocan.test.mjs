// tests/tlalocan.test.mjs — TLALOCAN base shell: layout math +
// static audits of the page, the 3D scene, and the probe hook.
// Run: node tests/tlalocan.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  WORLD_RADIUS,
  SPAWN,
  ENTRY_PORTAL,
  RIVER,
  GATES,
  TEMPLE,
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
} from '../lib/tlalocan/world.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const pageSrc = readFileSync('app/tlalocan/page.jsx', 'utf8');
const sceneSrc = readFileSync('app/tlalocan/world3d.js', 'utf8');

// --- layout constants ------------------------------------------------------

test('world radius and spawn are sane', () => {
  assert.equal(WORLD_RADIUS, 380);
  assert.deepEqual({ x: SPAWN.x, z: SPAWN.z }, { x: 0, z: 160 });
  assert.equal(SPAWN.yaw, 0, 'spawn faces north (-Z) at yaw 0');
});

test('the entry portal is a real portal object, aztec heaven (not just a spawn)', () => {
  assert.equal(ENTRY_PORTAL.id, 'rain-gate');
  assert.equal(ENTRY_PORTAL.key, 'entry');
  assert.equal(ENTRY_PORTAL.name, 'The Rain Gate');
  assert.equal(ENTRY_PORTAL.mythos, 'aztec', 'this higher realm is aztec heaven');
  assert.deepEqual({ x: ENTRY_PORTAL.x, z: ENTRY_PORTAL.z }, { x: 0, z: 146 });
  assert.equal(ENTRY_PORTAL.radius, 4);
  // The player spawns 14m south of the portal, facing north through it.
  assert.equal(SPAWN.z - ENTRY_PORTAL.z, 14);
  assert.equal(SPAWN.x, ENTRY_PORTAL.x);
  assert.equal(SPAWN.yaw, 0);
  // The portal stands in the entry region and clear of the first
  // light station and the arch portals (it is not one of the five).
  assert.equal(regionAt(ENTRY_PORTAL.x, ENTRY_PORTAL.z), 'The Rain Gate');
  assert.ok(dist(ENTRY_PORTAL.x, ENTRY_PORTAL.z, 4, 140) > 5);
  assert.ok(!PORTALS.some((p) => p.key === ENTRY_PORTAL.key));
});

test('the mythos menu, portal gun, and higher-realms portal are NOT built', () => {
  // Next round only (plan file, "THE PORTAL SYSTEM"). The entry
  // portal is the anchor they will attach to — nothing about them
  // exists in the base build.
  assert.ok(!/MythosChooser|PortalGun|HigherRealms/.test(pageSrc + sceneSrc));
  assert.ok(!pageSrc.includes('/mythos') && !sceneSrc.includes('/mythos'));
});

test('the gates stand at the bridge, the centre on the far bank', () => {
  assert.deepEqual({ x: GATES.x, z: GATES.z }, { x: 0, z: 70 });
  assert.deepEqual({ x: TEMPLE.x, z: TEMPLE.z }, { x: 0, z: -130 });
  assert.ok(GATES.z > RIVER.zMax, 'Gates are on the near (south) bank');
  assert.ok(TEMPLE.z < RIVER.zMin, 'Centre is on the far (north) bank');
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
    // The route's page must exist in the repo.
    const dir = `app${p.route}`;
    assert.ok(existsSync(dir), `${p.route} resolves to ${dir}`);
  }
});

test('portal arc rings the plaza on the far bank — checked against the CENTRE, not the origin', () => {
  // Wave 1 lesson: a centre/radius swap passes count tests while
  // scattering arches to the world edge. Assert each arch against
  // the centre it is meant to ring.
  for (const p of PORTALS) {
    assert.ok(p.z < RIVER.zMin, `${p.key} is on the far bank`);
    assert.ok(dist(p.x, p.z, 0, 0) < WORLD_RADIUS, `${p.key} is inside the world`);
    assert.ok(approx(dist(p.x, p.z, TEMPLE.x, TEMPLE.z), 55, 0.5),
      `${p.key} sits ~55m from the centre, not from the origin`);
    assert.ok(!approx(dist(p.x, p.z, 0, 0), 55, 0.5) || approx(dist(p.x, p.z, TEMPLE.x, TEMPLE.z), 55, 0.5),
      `${p.key} is not a swapped-centre ring`);
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
  assert.deepEqual([byKey['flower-fields'].x, byKey['flower-fields'].z], [-160, -70]);
  assert.deepEqual([byKey['rain-gardens'].x, byKey['rain-gardens'].z], [160, -70]);
  assert.deepEqual([byKey['green-lake'].x, byKey['green-lake'].z], [0, -230]);
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
  assert.equal(regionAt(0, 150), 'The Rain Gate');
  assert.equal(regionAt(0, 70), 'The Rain Gates');
  assert.equal(regionAt(0, 0), 'The Green River');
  assert.equal(regionAt(0, -130), 'Tlaloc’s Temple');
  assert.equal(regionAt(-160, -70), 'The Flower Fields');
  assert.equal(regionAt(160, -70), 'The Rain Gardens');
  assert.equal(regionAt(0, -230), 'The Green Lake');
  assert.equal(regionAt(200, 200), 'Tlalocan');
});

test('nearestPortal finds the arch you are standing in', () => {
  assert.equal(nearestPortal(0, -75)?.key, 'nether-realm');
  assert.equal(nearestPortal(-47.6, -102.5)?.key, 'mictlan');
  assert.equal(nearestPortal(0, 150), null);
  assert.equal(nearestPortal(0, -70, 1), null, '5m out, a 1m trigger finds nothing');
});

// --- set dressing ----------------------------------------------------------

test('makeWorld is deterministic per seed', () => {
  const a = makeWorld(1337);
  const b = makeWorld(1337);
  assert.deepEqual(a, b);
  const c = makeWorld(99);
  assert.notDeepEqual(a.pools, c.pools);
});

test('makeWorld dressing stays out of the river, plaza, and spawn', () => {
  const w = makeWorld(1337);
  assert.equal(w.pools.length, 5);
  assert.equal(w.westStones.length, 10);
  assert.equal(w.eastPillars.length, 6);
  assert.equal(w.northPits.length, 5);
  assert.equal(w.drifters.length, 18);
  for (const p of w.pools) {
    assert.ok(Math.abs(p.z) > 30, 'pool clear of the river');
    assert.ok(dist(p.x, p.z, TEMPLE.x, TEMPLE.z) > 75, 'pool clear of the plaza');
    assert.ok(dist(p.x, p.z, SPAWN.x, SPAWN.z) > 40, 'pool clear of the spawn');
  }
  for (const s of w.westStones) assert.ok(dist(s.x, s.z, -160, -70) < 70);
  for (const p of w.northPits) assert.ok(dist(p.x, p.z, 0, -230) < 80);
});

// --- light: real light, Earth 2 torch style, as glow-lanterns --------------

test('makeTorches lights the route: 46 glows, 8 real lights', () => {
  const torches = makeTorches();
  assert.equal(torches.length, 46);
  assert.equal(torches.filter((t) => t.hue === 'jade').length, 18);
  assert.equal(torches.filter((t) => t.hue === 'gold').length, 28);
  assert.equal(torches.filter((t) => t.lit).length, TORCH_LIGHT_BUDGET);
  assert.equal(TORCH_LIGHT_BUDGET, 8, '8 torch lights + 4 region lights = 12 total');
});

test('torch-post light mapping matches Earth 2 (10, 14)', () => {
  assert.equal(TORCH_LIGHT.intensity, 10);
  assert.equal(TORCH_LIGHT.distance, 14);
  assert.equal(TORCH_COLORS.jade.light, 0x3affc8);
  assert.notEqual(TORCH_COLORS.gold.light, TORCH_COLORS.jade.light);
});

test('the entry path is lined jade, both sides, spawn to gates', () => {
  const path = makeTorches().filter((t) => t.place === 'entry');
  assert.equal(path.length, 10);
  assert.ok(path.every((t) => t.hue === 'jade'));
  assert.deepEqual([...new Set(path.map((t) => t.z))].sort((a, b) => a - b), [80, 95, 110, 125, 140]);
  assert.deepEqual([...new Set(path.map((t) => Math.abs(t.x)))], [4]);
});

test('every portal arch is flanked by two gold glows', () => {
  const torches = makeTorches();
  for (const p of PORTALS) {
    const flanks = torches.filter((t) => t.place === 'arch' && Math.abs(t.x - p.x) < 6 && Math.abs(t.z - p.z) < 6);
    assert.equal(flanks.length, 2, `${p.key} has 2 flanks`);
    assert.ok(flanks.every((t) => t.hue === 'gold'));
    // Flanks sit just outside the 4.5m travel trigger — the glow
    // never trips the vortex.
    for (const f of flanks) assert.ok(dist(f.x, f.z, p.x, p.z) > PORTAL_TRIGGER_RADIUS);
  }
});

test('glows stay in the world and out of the water', () => {
  for (const t of makeTorches()) {
    assert.ok(dist(t.x, t.z, 0, 0) < WORLD_RADIUS, `glow ${t.id} inside the world`);
    assert.ok(!(t.z > RIVER.zMin && t.z < RIVER.zMax), `glow ${t.id} not in the river`);
  }
  assert.equal(makeTorches().filter((t) => t.place === 'far-region').length, 6);
  assert.equal(makeTorches().filter((t) => t.place === 'west-region').length, 4);
  assert.ok(makeTorches().filter((t) => t.place === 'west-region').every((t) => t.hue === 'jade'));
});

test('lit glows are the route-markers, not decoration', () => {
  const lit = makeTorches().filter((t) => t.lit);
  const places = new Set(lit.map((t) => t.place));
  assert.ok(places.has('entry') && places.has('gates') && places.has('river'));
  assert.ok(places.has('approach') && places.has('arch') && places.has('far-region'));
});

test('scene carries the Earth 2 light: glows, shimmer, both hues', () => {
  assert.ok(sceneSrc.includes('Torches'), 'Torches component in the scene');
  assert.ok(sceneSrc.includes('0.88 + 0.12'), 'Earth 2 shimmer wave');
  assert.ok(sceneSrc.includes('TORCH_LIGHT'), 'torch-post light mapping');
  assert.ok(sceneSrc.includes('TORCH_COLORS'), 'two hues');
  // Runtime point lights: 4 region lights + the 8 lit glows = 12.
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
  assert.ok(pageSrc.includes('TlalocanScene'));
  assert.ok(pageSrc.includes('<Canvas'));
});

test('page has no auth gate, no sound engine, and no router.push (arches use vortex travel)', () => {
  assert.ok(!pageSrc.includes('supabase'), 'no Supabase gate — a public world');
  assert.ok(!pageSrc.includes('router.push'), 'arches navigate via travel(), not router.push');
  assert.ok(!pageSrc.includes('createSoundEngine'), 'no sound engine in the page — it plugs in separately later');
  assert.ok(pageSrc.includes('travel(portal.route, portal.label)'));
  assert.ok(pageSrc.includes('vortexOverlay'));
});

test('page is mobile-first with a plain-English HUD', () => {
  assert.ok(pageSrc.includes('maxTouchPoints'), 'touch UI detection');
  assert.ok(pageSrc.includes('prefers-reduced-motion'), 'reduced motion respected');
  assert.ok(pageSrc.includes('TLALOCAN'), 'HUD display title');
  assert.ok(pageSrc.includes('You are in:'));
  assert.ok(pageSrc.includes('Leave Tlalocan'));
  assert.ok(pageSrc.includes('WASD or arrows to walk'));
  assert.ok(pageSrc.includes('Left stick to walk'));
  assert.ok(pageSrc.includes('window.__tlalocan'), 'headless probe hook');
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
  for (const piece of ['Ground', 'River', 'Bridge', 'Gates', 'Center', 'WestRegion',
    'EastRegion', 'NorthRegion', 'PortalArches', 'EntryPortal', 'Torches', 'Petals']) {
    assert.ok(sceneSrc.includes(piece), `scene contains ${piece}`);
  }
  assert.ok(sceneSrc.includes('<DayNightRig shade="earth" fogDensity={0.0022} />'), 'day/night sky via the shared rig (fog + light)');
  assert.ok(sceneSrc.includes('makeWorld'), 'set dressing is seeded + deterministic');
  assert.ok(sceneSrc.includes('{p.label}'), 'arches carry their plain-words label');
  assert.ok(sceneSrc.includes('CameraRig'), 'first-person camera rig');
  assert.ok(!sceneSrc.includes('fetch(') && !sceneSrc.includes('http'), 'no external assets');
});

test('every regionAt name has a visible label in the scene — rivers included', () => {
  // Wave 1 lesson: every regionAt name needs a visible Html label;
  // rivers were missed twice. regionAt returns the entry, the gates,
  // the river, the centre, the three regions, and the realm itself.
  for (const name of ['The Rain Gate', 'The Rain Gates', 'The Green River', 'Tlaloc’s Temple',
    'The Flower Fields', 'The Rain Gardens', 'The Green Lake']) {
    assert.ok(sceneSrc.includes(name), `scene labels ${name}`);
  }
});

test('the entry portal is a named ring in the scene graph, distinct from the arches', () => {
  assert.ok(sceneSrc.includes('EntryPortal'), 'EntryPortal component');
  assert.ok(sceneSrc.includes('name="rain-gate"'), 'scene-graph id for the next round to find');
  assert.ok(sceneSrc.includes('torusGeometry'), 'a full standing ring, not another pillar arch');
  assert.ok(!sceneSrc.includes('DescentPortal'), 'no leftover Hades component name');
});

test('portal trigger radius is a short walk, not a teleport', () => {
  assert.ok(PORTAL_TRIGGER_RADIUS >= 3 && PORTAL_TRIGGER_RADIUS <= 6);
});
