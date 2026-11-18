// tests/elysium.test.mjs — ELYSIUM base shell: layout math +
// static audits of the page and the 3D scene.
// Run: node tests/elysium.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  WORLD_RADIUS,
  SPAWN,
  ENTRY_PORTAL,
  RIVER,
  GATES,
  FOUNTAIN,
  REGIONS,
  PORTALS,
  PORTAL_TRIGGER_RADIUS,
  TORCH_COLORS,
  TORCH_LIGHT,
  TORCH_LIGHT_BUDGET,
  KAOS_LOOK,
  forward,
  makeTorches,
  right,
  clampPosition,
  stepBlockedByRiver,
  stepPosition,
  regionAt,
  nearestPortal,
  makeWorld,
} from '../lib/elysium/world.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const pageSrc = readFileSync('app/elysium/page.jsx', 'utf8');
const sceneSrc = readFileSync('app/elysium/world3d.js', 'utf8');

// --- layout constants ------------------------------------------------------

test('world radius and spawn are sane', () => {
  assert.equal(WORLD_RADIUS, 380);
  assert.deepEqual({ x: SPAWN.x, z: SPAWN.z }, { x: 0, z: 160 });
  assert.equal(SPAWN.yaw, 0, 'spawn faces north (-Z) at yaw 0');
});

test('the Ascent is a real portal object, greek heaven (not just a spawn)', () => {
  assert.equal(ENTRY_PORTAL.id, 'ascent-portal');
  assert.equal(ENTRY_PORTAL.key, 'ascent');
  assert.equal(ENTRY_PORTAL.name, 'The Ascent');
  assert.equal(ENTRY_PORTAL.mythos, 'greek', 'this higher realm is greek heaven');
  assert.deepEqual({ x: ENTRY_PORTAL.x, z: ENTRY_PORTAL.z }, { x: 0, z: 146 });
  assert.equal(ENTRY_PORTAL.radius, 4);
  // The player spawns 14m south of the portal, facing north through it.
  assert.equal(SPAWN.z - ENTRY_PORTAL.z, 14);
  assert.equal(SPAWN.x, ENTRY_PORTAL.x);
  assert.equal(SPAWN.yaw, 0);
  assert.equal(regionAt(ENTRY_PORTAL.x, ENTRY_PORTAL.z), 'The Ascent');
  assert.ok(dist(ENTRY_PORTAL.x, ENTRY_PORTAL.z, 4, 140) > 5);
  assert.ok(!PORTALS.some((p) => p.key === ENTRY_PORTAL.key));
});

test('the mythos menu, portal gun, and higher-realms portal are NOT built', () => {
  // Next round only (plan file, "THE PORTAL SYSTEM"). The Ascent
  // portal is the anchor they will attach to — nothing about them
  // exists in the base build.
  assert.ok(!/MythosChooser|PortalGun|HigherRealms/.test(pageSrc + sceneSrc));
  assert.ok(!pageSrc.includes('/mythos') && !sceneSrc.includes('/mythos'));
});

test('Kaos look is flagged pending reference footage (not final)', () => {
  assert.equal(KAOS_LOOK, 'pending-reference-footage');
  assert.ok(sceneSrc.includes('KAOS LOOK FLAG'), 'scene carries the Kaos flag');
});

test('the gates stand at the bridge, The Meander Fountain on the far bank', () => {
  assert.deepEqual({ x: GATES.x, z: GATES.z }, { x: 0, z: 70 });
  assert.deepEqual({ x: FOUNTAIN.x, z: FOUNTAIN.z }, { x: 0, z: -130 });
  assert.ok(GATES.z > RIVER.zMax, 'Gates are on the near (south) bank');
  assert.ok(FOUNTAIN.z < RIVER.zMin, 'Landmark is on the far (north) bank');
});

test('three portal arches, unique keys/routes/labels, all live routes', () => {
  assert.equal(PORTALS.length, 3);
  const keys = new Set(PORTALS.map((p) => p.key));
  const routes = new Set(PORTALS.map((p) => p.route));
  assert.equal(keys.size, 3);
  assert.equal(routes.size, 3);
  for (const p of PORTALS) {
    assert.ok(p.label.length > 0, `${p.key} has a plain-words label`);
    assert.ok(p.route.startsWith('/'), `${p.key} route starts with /`);
    const dir = `app${p.route}`;
    assert.ok(existsSync(dir), `${p.route} resolves to ${dir}`);
  }
});

test('portal arc rings the plaza — measured from the landmark, not the origin', () => {
  // WAVE 1 LESSON (2026-11-12): a centre/radius swap passes count
  // tests while scattering objects to the world edge. The ring is
  // asserted against its OWN centre (The Meander Fountain at 0,-130).
  for (const p of PORTALS) {
    assert.ok(p.z < RIVER.zMin, `${p.key} is on the far bank`);
    assert.ok(dist(p.x, p.z, 0, 0) < WORLD_RADIUS, `${p.key} is inside the world`);
    assert.ok(approx(dist(p.x, p.z, FOUNTAIN.x, FOUNTAIN.z), 55, 0.5),
      `${p.key} sits ~55m from The Meander Fountain`);
    assert.ok(!approx(dist(p.x, p.z, 0, 0), 55, 0.5),
      `${p.key} ring is measured from the landmark, not the world origin`);
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
  assert.deepEqual([byKey['white-gardens'].x, byKey['white-gardens'].z], [-160, -70]);
  assert.deepEqual([byKey['golden-fields'].x, byKey['golden-fields'].z], [160, -70]);
  assert.deepEqual([byKey['far-shore'].x, byKey['far-shore'].z], [0, -230]);
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
  assert.equal(regionAt(0, 70), 'The White Gate');
  assert.equal(regionAt(0, 0), 'The Meander');
  assert.equal(regionAt(0, -130), 'The Meander Fountain');
  assert.equal(regionAt(-160, -70), 'The White Gardens');
  assert.equal(regionAt(160, -70), 'The Golden Fields');
  assert.equal(regionAt(0, -230), "The Far Shore");
  assert.equal(regionAt(200, 200), 'Elysium');
});

test('nearestPortal finds the arch you are standing in', () => {
  assert.equal(nearestPortal(0, -75)?.key, 'nether-realm');
  assert.equal(nearestPortal(-42.1, -94.6)?.key, 'afterlife');
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
  assert.equal(w.shades.length, 18);
  for (const p of w.pools) {
    assert.ok(Math.abs(p.z) > 30, 'pool clear of the river');
    assert.ok(dist(p.x, p.z, FOUNTAIN.x, FOUNTAIN.z) > 75, 'pool clear of the plaza');
    assert.ok(dist(p.x, p.z, SPAWN.x, SPAWN.z) > 40, 'pool clear of the spawn');
  }
  for (const s of w.westStones) assert.ok(dist(s.x, s.z, -160, -70) < 70);
  for (const p of w.northPits) assert.ok(dist(p.x, p.z, 0, -230) < 80);
});

// --- light: real light, Earth 2 torch style --------------------------------

test('makeTorches lights the route: 42 glows, 8 real lights', () => {
  const torches = makeTorches();
  assert.equal(torches.length, 42);
  assert.equal(torches.filter((t) => t.hue === 'gold').length, 24);
  assert.equal(torches.filter((t) => t.hue === 'white').length, 18);
  assert.equal(torches.filter((t) => t.lit).length, TORCH_LIGHT_BUDGET);
  assert.equal(TORCH_LIGHT_BUDGET, 8, '8 post lights + 4 region lights = 12 total');
});

test('light-post mapping matches Earth 2 (intensity 10, distance 14)', () => {
  assert.equal(TORCH_LIGHT.intensity, 10);
  assert.equal(TORCH_LIGHT.distance, 14);
  assert.notEqual(TORCH_COLORS.gold.light, TORCH_COLORS.white.light);
});

test('the Ascent path is lined white, both sides, spawn to gates', () => {
  const path = makeTorches().filter((t) => t.place === 'ascent');
  assert.equal(path.length, 10);
  assert.ok(path.every((t) => t.hue === 'white'));
  assert.deepEqual([...new Set(path.map((t) => t.z))].sort((a, b) => a - b), [80, 95, 110, 125, 140]);
  assert.deepEqual([...new Set(path.map((t) => Math.abs(t.x)))], [4]);
});

test('every portal arch is flanked by two gold lights', () => {
  const torches = makeTorches();
  for (const p of PORTALS) {
    const flanks = torches.filter((t) => t.place === 'arch' && Math.abs(t.x - p.x) < 6 && Math.abs(t.z - p.z) < 6);
    assert.equal(flanks.length, 2, `${p.key} has 2 flanks`);
    assert.ok(flanks.every((t) => t.hue === 'gold'));
    for (const f of flanks) assert.ok(dist(f.x, f.z, p.x, p.z) > PORTAL_TRIGGER_RADIUS);
  }
});

test('light rings are centred on their own regions, not the origin', () => {
  // WAVE 1 LESSON: assert ring positions against their own centre.
  const north = makeTorches().filter((t) => t.place === 'far-shore');
  assert.equal(north.length, 6);
  for (const t of north) {
    assert.ok(approx(dist(t.x, t.z, 0, -230), 60, 0.5), `north ring light ${t.id} sits ~60m from its region centre`);
  }
  const west = makeTorches().filter((t) => t.place === 'white-gardens');
  assert.equal(west.length, 4);
  for (const t of west) {
    assert.ok(approx(dist(t.x, t.z, -160, -70), 55, 0.5), `west rim light ${t.id} sits ~55m from its region centre`);
  }
});

test('torches stay in the world and out of the water', () => {
  for (const t of makeTorches()) {
    assert.ok(dist(t.x, t.z, 0, 0) < WORLD_RADIUS, `torch ${t.id} inside the world`);
    assert.ok(!(t.z > RIVER.zMin && t.z < RIVER.zMax), `torch ${t.id} not in the river`);
  }
  assert.equal(makeTorches().filter((t) => t.place === 'far-shore').length, 6);
  assert.equal(makeTorches().filter((t) => t.place === 'white-gardens').length, 4);
  assert.ok(makeTorches().filter((t) => t.place === 'white-gardens').every((t) => t.hue === 'white'));
});

test('lit torches are the route-markers, not decoration', () => {
  const lit = makeTorches().filter((t) => t.lit);
  const places = new Set(lit.map((t) => t.place));
  assert.ok(places.has('ascent') && places.has('gates') && places.has('meander'));
  assert.ok(places.has('approach') && places.has('arch') && places.has('far-shore'));
});

test('scene carries the Earth 2 light: posts, breathing glow, both hues', () => {
  assert.ok(sceneSrc.includes('Torches'), 'Torches component in the scene');
  assert.ok(sceneSrc.includes('0.88 + 0.12'), 'Earth 2 flicker wave');
  assert.ok(sceneSrc.includes('TORCH_LIGHT'), 'light-post mapping');
  assert.ok(sceneSrc.includes('TORCH_COLORS'), 'two hues');
  // Runtime point lights: 4 region lights + the 8 lit posts = 12.
  // The file holds 5 <pointLight> tags (4 region + 1 inside the post map).
  const tags = (sceneSrc.match(/<pointLight/g) || []).length;
  assert.equal(tags, 5);
  assert.equal(makeTorches().filter((t) => t.lit).length + 4, 12);
});

// --- static audits: the page -----------------------------------------------

test('page is a client route with the house 3D stack', () => {
  assert.ok(pageSrc.includes("'use client'"));
  assert.ok(pageSrc.includes('@react-three/fiber'));
  assert.ok(pageSrc.includes('useSceneContextGuard'));
  assert.ok(pageSrc.includes('useVortexTravel'));
  assert.ok(pageSrc.includes('ElysiumScene'));
  assert.ok(pageSrc.includes('<Canvas'));
});

test('page has no auth gate and no router.push (arches use vortex travel)', () => {
  assert.ok(!pageSrc.includes('supabase'), 'no Supabase gate — a public world');
  assert.ok(!pageSrc.includes('router.push'), 'arches navigate via travel(), not router.push');
  assert.ok(pageSrc.includes('travel(portal.route, portal.label)'));
  assert.ok(pageSrc.includes('vortexOverlay'));
});

test('page has no sound engine (that system plugs in separately)', () => {
  assert.ok(!pageSrc.includes('createSoundEngine') && !pageSrc.includes('soundRef') && !pageSrc.includes('Sound:'), 'no sound wiring in the base shell');
});

test('page is mobile-first with a plain-English HUD', () => {
  assert.ok(pageSrc.includes('maxTouchPoints'), 'touch UI detection');
  assert.ok(pageSrc.includes('prefers-reduced-motion'), 'reduced motion respected');
  assert.ok(/<h1[^>]*>\s*ELYSIUM\s*<\/h1>/.test(pageSrc), 'HUD display title');
  assert.ok(pageSrc.includes('You are in:'));
  assert.ok(pageSrc.includes('Leave Elysium'));
  assert.ok(pageSrc.includes('WASD or arrows to walk'));
  assert.ok(pageSrc.includes('Left stick to walk'));
  assert.ok(pageSrc.includes('window.__elysium'), 'headless probe hook');
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
  for (const piece of ['Ground', 'River', 'Bridge', 'Gates', 'MeanderFountain',
    'WestRegion', 'EastRegion', 'NorthRegion', 'PortalArches', 'AscentPortal', 'Torches', 'Motes']) {
    assert.ok(sceneSrc.includes(piece), `scene contains ${piece}`);
  }
  assert.ok(sceneSrc.includes('<DayNightRig sun moon shade="earth" />'), 'day/night sky via the shared rig (fog + light)');
  assert.ok(sceneSrc.includes('makeWorld'), 'set dressing is seeded + deterministic');
  assert.ok(sceneSrc.includes('{p.label}'), 'arches carry their plain-words label');
  assert.ok(sceneSrc.includes('CameraRig'), 'first-person camera rig');
  assert.ok(!sceneSrc.includes('fetch(') && !sceneSrc.includes('http'), 'no external assets');
});

test('every regionAt name has a visible Html label in the scene', () => {
  // WAVE 1 LESSON: rivers especially were missed twice. Every name
  // regionAt can return (except the whole-world fallback) must appear
  // as a label in the scene source.
  const names = [
    regionAt(0, 150), regionAt(0, 70), regionAt(0, 0), regionAt(0, -130),
    regionAt(-160, -70), regionAt(160, -70), regionAt(0, -230),
  ];
  assert.equal(new Set(names).size, 7, 'seven distinct named places');
  for (const name of names) {
    assert.ok(sceneSrc.includes(name), `scene labels "${name}"`);
  }
  for (const p of PORTALS) {
    assert.ok(sceneSrc.includes('{p.label}'), 'arches render their label');
  }
});

test('the Ascent portal is a named ring in the scene graph, distinct from the arches', () => {
  assert.ok(sceneSrc.includes('AscentPortal'), 'AscentPortal component');
  assert.ok(sceneSrc.includes('name="ascent-portal"'), 'scene-graph id for the next round to find');
  assert.ok(sceneSrc.includes('torusGeometry'), 'a full standing ring, not another pillar arch');
  assert.ok(!sceneSrc.includes('DescentPortal'), 'no nether-realm Descent here');
});

test('portal trigger radius is a short walk, not a teleport', () => {
  assert.ok(PORTAL_TRIGGER_RADIUS >= 3 && PORTAL_TRIGGER_RADIUS <= 6);
});
