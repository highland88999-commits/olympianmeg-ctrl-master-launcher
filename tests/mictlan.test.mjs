// tests/mictlan.test.mjs — MICTLAN base shell: layout math +
// static audits of the page and the 3D scene.
// Run: node tests/mictlan.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  WORLD_RADIUS,
  SPAWN,
  DESCENT_PORTAL,
  RIVER,
  GATES,
  PALACE,
  REGIONS,
  PORTALS,
  PORTAL_TRIGGER_RADIUS,
  TORCH_COLORS,
  TORCH_LIGHT,
  TORCH_LIGHT_BUDGET,
  forward,
  makeTorches,
  right,
  stepBlockedByRiver,
  stepPosition,
  regionAt,
  nearestPortal,
  makeWorld,
} from '../lib/mictlan/world.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// --- layout constants ------------------------------------------------------

test('world radius and spawn are sane', () => {
  assert.equal(WORLD_RADIUS, 380);
  assert.deepEqual({ x: SPAWN.x, z: SPAWN.z }, { x: 0, z: 160 });
  assert.equal(SPAWN.yaw, 0, 'spawn faces north (-Z) at yaw 0');
});

test('the Descent is a real portal object, Aztec hell (not just a spawn)', () => {
  assert.equal(DESCENT_PORTAL.id, 'descent-portal');
  assert.equal(DESCENT_PORTAL.key, 'descent');
  assert.equal(DESCENT_PORTAL.name, 'The Descent');
  assert.equal(DESCENT_PORTAL.mythos, 'aztec', 'this nether-realm is Aztec hell');
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

test('the Gates stand at the bridge, the palace on the far bank', () => {
  assert.deepEqual({ x: GATES.x, z: GATES.z }, { x: 0, z: 70 });
  assert.deepEqual({ x: PALACE.x, z: PALACE.z }, { x: 0, z: -130 });
  assert.ok(GATES.z > RIVER.zMax, 'Gates are on the near (south) bank');
  assert.ok(PALACE.z < RIVER.zMin, 'Palace is on the far (north) bank');
});

test('portal arches: exact set, unique keys/routes/labels, all live routes', () => {
  assert.equal(PORTALS.length, 4);
  assert.deepEqual(PORTALS, [
    { key: 'sanctuary', label: 'Sanctuary', route: '/sanctuary', x: -47.6, z: -102.5 },
    { key: 'nether-realm', label: 'Hades', route: '/nether-realm', x: -18.8, z: -78.3 },
    { key: 'erebus', label: 'Erebus', route: '/erebus', x: 18.8, z: -78.3 },
    { key: 'zeus-v-hades', label: 'Zeus v Hades', route: '/zeus-v-hades', x: 47.6, z: -102.5 },
  ]);
  const keys = new Set(PORTALS.map((p) => p.key));
  const routes = new Set(PORTALS.map((p) => p.route));
  assert.equal(keys.size, 4);
  assert.equal(routes.size, 4);
  assert.ok(PORTALS.some((p) => p.route === '/nether-realm'), 'an arch back to Hades, the first realm');
  for (const p of PORTALS) {
    assert.ok(p.label.length > 0, `${p.key} has a plain-words label`);
    assert.ok(p.route.startsWith('/'), `${p.key} route starts with /`);
    // The route's page must exist in the repo.
    const dir = `app${p.route}`;
    assert.ok(existsSync(dir), `${p.route} resolves to ${dir}`);
    // Never an arch to a sibling nether-realm: they do not exist yet.
    assert.ok(!['/duat', '/mictlan', '/xibalba', '/helheim', '/hell', '/naraka', '/yomi', '/annwn', '/kur', '/nav', '/diyu', '/orun'].includes(p.route), `${p.key} is not a sibling nether-realm`);
  }
});

test('portal arc rings the palace plaza on the far bank', () => {
  for (const p of PORTALS) {
    assert.ok(p.z < RIVER.zMin, `${p.key} is on the far bank`);
    assert.ok(dist(p.x, p.z, 0, 0) < WORLD_RADIUS, `${p.key} is inside the world`);
    assert.ok(approx(dist(p.x, p.z, PALACE.x, PALACE.z), 55, 0.5),
      `${p.key} sits ~55m from the palace`);
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
  assert.deepEqual(REGIONS, [
    { key: 'crashing-mountains', name: 'The Crashing Mountains', x: -160, z: -70, r: 70, line: 'Two mountains slam together — slip through between the crashes.' },
    { key: 'obsidian-wind', name: 'The Obsidian Wind', x: 160, z: -70, r: 70, line: 'A desert of black glass, where the wind cuts like a blade.' },
    { key: 'ninth-level', name: 'The Ninth Level', x: 0, z: -230, r: 80, line: 'The bottom of the nine levels. The Lord of the Dead sits here.' },
  ]);
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

test('stepPosition enforces the river, not the world edge (endless)', () => {
  const over = stepPosition(50, 30, 0, -60);
  assert.equal(over.blocked, true);
  assert.deepEqual({ x: over.x, z: over.z }, { x: 50, z: 30 });
  const free = stepPosition(0, 150, 0, -10);
  assert.equal(free.blocked, false);
  assert.ok(approx(free.z, 140));
  // ENDLESS (Merlin, Nov 18, 2026): a step past the old 380 m rim
  // lands where it lands — no clamp, no wall, no turn-back.
  const past = stepPosition(370, 100, 30, 0);
  assert.equal(past.blocked, false);
  assert.ok(approx(past.x, 400));
  assert.ok(approx(past.z, 100));
  const far = stepPosition(5000, 100, 100, 0);
  assert.equal(far.blocked, false);
  assert.ok(approx(far.x, 5100));
});

test('regionAt names every place in plain English', () => {
  assert.equal(regionAt(0, 150), 'The Descent');
  assert.equal(regionAt(0, 70), 'The First Level');
  assert.equal(regionAt(0, 0), 'The River Apanohuacalhuia');
  assert.equal(regionAt(0, -130), 'The Throne of the Dead');
  assert.equal(regionAt(-160, -70), 'The Crashing Mountains');
  assert.equal(regionAt(160, -70), 'The Obsidian Wind');
  assert.equal(regionAt(0, -230), 'The Ninth Level');
  assert.equal(regionAt(200, 200), 'Mictlan');
});

test('nearestPortal finds the arch you are standing in', () => {
  assert.equal(nearestPortal(-18.8, -78.3)?.key, 'nether-realm');
  assert.equal(nearestPortal(0, 150), null);
  assert.equal(nearestPortal(0, -70, 1), null, '5m out, a 1m trigger finds nothing');
});

// --- set dressing ----------------------------------------------------------

test('makeWorld is deterministic per seed', () => {
  const a = makeWorld(1337);
  const b = makeWorld(1337);
  assert.deepEqual(a, b);
  const c = makeWorld(99);
  assert.notDeepEqual(a.obsidianPools, c.obsidianPools);
});

test('makeWorld dressing stays out of the river, plaza, and spawn', () => {
  const w = makeWorld(1337);
  assert.equal(w.obsidianPools.length, 5);
  assert.equal(w.mountainStones.length, 10);
  assert.equal(w.windSpires.length, 6);
  assert.equal(w.thronePits.length, 5);
  assert.equal(w.shades.length, 18);
  for (const p of w.obsidianPools) {
    assert.ok(Math.abs(p.z) > 30, 'obsidian pool clear of the river');
    assert.ok(dist(p.x, p.z, PALACE.x, PALACE.z) > 75, 'obsidian pool clear of the plaza');
    assert.ok(dist(p.x, p.z, SPAWN.x, SPAWN.z) > 40, 'obsidian pool clear of the spawn');
  }
  for (const s of w.mountainStones) assert.ok(dist(s.x, s.z, -160, -70) < 70);
  for (const s of w.windSpires) assert.ok(dist(s.x, s.z, 160, -70) < 40, 'wind spire rings the desert');
  for (const p of w.thronePits) assert.ok(dist(p.x, p.z, 0, -230) < 80);
});

// --- fire: real light, Earth 2 torch style ----------------------------------

test('makeTorches lights the route: 50 flames, 8 real lights', () => {
  const torches = makeTorches();
  assert.equal(torches.length, 50);
  assert.equal(torches.filter((t) => t.hue === 'turquoise').length, 18);
  assert.equal(torches.filter((t) => t.hue === 'red').length, 32);
  assert.equal(torches.filter((t) => t.lit).length, TORCH_LIGHT_BUDGET);
  assert.equal(TORCH_LIGHT_BUDGET, 8, '8 torch lights + 4 region lights = 12 total');
});

test('torch-post light mapping matches Earth 2 (intensity 10, distance 14)', () => {
  assert.equal(TORCH_LIGHT.intensity, 10);
  assert.equal(TORCH_LIGHT.distance, 14);
  assert.equal(TORCH_COLORS.red.light, 0xff3a1a);
  assert.notEqual(TORCH_COLORS.turquoise.light, TORCH_COLORS.red.light);
});

test('the Descent path is lined turquoise, both sides, spawn to Gates', () => {
  const path = makeTorches().filter((t) => t.place === 'descent');
  assert.equal(path.length, 10);
  assert.ok(path.every((t) => t.hue === 'turquoise'));
  assert.deepEqual([...new Set(path.map((t) => t.z))].sort((a, b) => a - b), [80, 95, 110, 125, 140]);
  assert.deepEqual([...new Set(path.map((t) => Math.abs(t.x)))], [4]);
});

test('every portal arch is flanked by two red torches', () => {
  const torches = makeTorches();
  for (const p of PORTALS) {
    const flanks = torches.filter((t) => t.place === 'arch' && Math.abs(t.x - p.x) < 6 && Math.abs(t.z - p.z) < 6);
    assert.equal(flanks.length, 2, `${p.key} has 2 flanks`);
    assert.ok(flanks.every((t) => t.hue === 'red'));
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
  assert.equal(makeTorches().filter((t) => t.place === 'ninth-level').length, 6);
  assert.equal(makeTorches().filter((t) => t.place === 'obsidian-wind').length, 4);
  assert.ok(makeTorches().filter((t) => t.place === 'obsidian-wind').every((t) => t.hue === 'turquoise'));
});

test('lit torches are the route-markers, not decoration', () => {
  const lit = makeTorches().filter((t) => t.lit);
  const places = new Set(lit.map((t) => t.place));
  assert.ok(places.has('descent') && places.has('gates') && places.has('river'));
  assert.ok(places.has('palace-approach') && places.has('arch') && places.has('ninth-level'));
});

test('scene carries the Earth 2 fire: torches, flicker, both hues', () => {
  assert.ok(sceneSrc.includes('Torches'), 'Torches component in the scene');
  assert.ok(sceneSrc.includes('0.88 + 0.12'), 'Earth 2 flicker wave');
  assert.ok(sceneSrc.includes('TORCH_LIGHT'), 'torch-post light mapping');
  assert.ok(sceneSrc.includes('TORCH_COLORS'), 'both hues');
  // Runtime point lights: 4 region lights + the 8 lit torches = 12.
  // The file holds 5 <pointLight> tags (4 region + 1 inside the torch map).
  const tags = (sceneSrc.match(/<pointLight/g) || []).length;
  assert.equal(tags, 5);
  assert.equal(makeTorches().filter((t) => t.lit).length + 4, 12);
});

// --- static audits: the page -----------------------------------------------

const pageSrc = readFileSync('app/mictlan/page.jsx', 'utf8');
const sceneSrc = readFileSync('app/mictlan/world3d.js', 'utf8');

test('page is a client route with the house 3D stack', () => {
  assert.ok(pageSrc.includes("'use client'"));
  assert.ok(pageSrc.includes('from \'@react-three/fiber\''));
  assert.ok(pageSrc.includes('useSceneContextGuard'));
  assert.ok(pageSrc.includes('useVortexTravel'));
  assert.ok(pageSrc.includes('MictlanScene'));
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
  assert.ok(/<h1[^>]*>\s*MICTLAN\s*<\/h1>/.test(pageSrc), 'HUD display title is MICTLAN');
  assert.ok(pageSrc.includes('You are in:'));
  assert.ok(pageSrc.includes('Leave Mictlan'));
  assert.ok(pageSrc.includes('WASD or arrows to walk'));
  assert.ok(pageSrc.includes('Left stick to walk'));
  assert.ok(pageSrc.includes('window.__mictlan'), 'headless probe hook');
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
  for (const piece of ['Ground', 'ObsidianPools', 'River', 'Bridge', 'Gates', 'Dog', 'Throne', 'CrashingMountains', 'WindDesert', 'NinthLevel', 'PortalArches', 'DescentPortal', 'Torches', 'Embers']) {
    assert.ok(sceneSrc.includes(piece), `scene contains ${piece}`);
  }
  assert.ok(sceneSrc.includes('DayNightRig'), 'day/night rig owns the sky + fog now (shared law, 2026-11-14)');
  assert.ok(sceneSrc.includes('makeWorld'), 'set dressing is seeded + deterministic');
  assert.ok(sceneSrc.includes('{p.label}'), 'arches carry their plain-words label');
  assert.ok(sceneSrc.includes('CameraRig'), 'first-person camera rig');
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
// Merged by the coordinator (Nov 12, 2026): mictlan is homed under MICTLAN in
// both registries (dual-registry rule) with display strings in en.json.

test('god-menus.js homes mictlan under MICTLAN', () => {
  const src = readFileSync('lib/god-menus.js', 'utf8');
  assert.ok(src.includes("god: 'MICTLAN'"));
  assert.ok(src.includes("'mictlan'"));
  const home = src.split("god: 'MICTLAN'")[1].split('},')[0];
  assert.ok(home.includes("category: 'Nether-Realms'"), 'MICTLAN menu category is Nether-Realms');
});

test('satellites.ts registers mictlan under MICTLAN (dual-registry rule)', () => {
  const src = readFileSync('lib/i18n/satellites.ts', 'utf8');
  assert.ok(src.includes('key: "mictlan", route: "/mictlan", pos: "MICTLAN"'));
});

test('en.json carries the mictlan display strings', () => {
  const en = JSON.parse(readFileSync('lib/i18n/locales/en.json', 'utf8'));
  assert.equal(en['sat.mictlan.title'], 'Mictlan');
  assert.ok(en['sat.mictlan.subtitle'].length > 0);
  assert.equal(en['sat.mictlan.subtitle'], "Nine levels down, where the Lord of the Dead keeps his throne");
});
