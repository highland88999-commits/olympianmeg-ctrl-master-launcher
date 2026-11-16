// tests/floor-drop.test.mjs — THE SHARED FLOOR-DROP MECHANISM (WS-C, Nov 16, 2026).
//
// Shape (audit §1.3/§6): mirrors the Anti-Life floor portal exactly —
// one disc constant + one isOn… test + one CameraRig guard (own
// once-per-entry state per rig, 1500 ms re-arm) + one page callback.
// NO floor mesh is cut anywhere; the opening is a visible disc on the
// floor + a gravity-timed fall, like the Anti-Life fall and the Hades
// lava drop. Run: node tests/floor-drop.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FLOOR_DROP_DEPTH,
  FLOOR_DROP_DISC_HEAVEN,
  FLOOR_DROP_DISC_NETHER,
  FLOOR_DROP_FALLBACK_ROUTE,
  FLOOR_DROP_GRAVITY,
  FLOOR_DROP_GUARD_REARM_MS,
  FLOOR_DROP_PHASES,
  FLOOR_DROP_ROUTE,
  FLOOR_DROP_STORAGE_KEY,
  clearDropOrigin,
  createFloorDropGuard,
  createFloorDropState,
  dropDestination,
  dropOriginFromSearch,
  fallDistanceAtTime,
  fallTimeForDepth,
  fallVelocityAtTime,
  floorDropDiscForSide,
  floorDropFallSeconds,
  floorDropGuardShouldFire,
  floorDropNext,
  floorDropRealmKeys,
  isKnownRealmKey,
  isOnFloorDropDisc,
  labelForRealmKey,
  readStoredDropOrigin,
  resolveDropOrigin,
  returnRouteForOrigin,
  routeForRealmKey,
  storeDropOrigin,
} from '../lib/world/floor-drop.js';

const REPO = new URL('..', import.meta.url).pathname;

// A fake sessionStorage for the origin tests.
function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    setItem: (k, v) => { store[k] = String(v); },
    getItem: (k) => (k in store ? store[k] : null),
    removeItem: (k) => { delete store[k]; },
    _store: store,
  };
}

// --- the discs: one per side, Anti-Life spot taken in nether only --------

test('the nether disc is the mirror spot (+70, 110) r8 — never the Anti-Life disc', () => {
  assert.deepEqual(
    { x: FLOOR_DROP_DISC_NETHER.x, z: FLOOR_DROP_DISC_NETHER.z, r: FLOOR_DROP_DISC_NETHER.r },
    { x: 70, z: 110, r: 8 },
  );
  assert.notEqual(FLOOR_DROP_DISC_NETHER.x, -70, 'the (-70, 110) disc is the Anti-Life fall in nether realms');
});

test('the heaven disc is the Anti-Life spot itself (-70, 110) r8 — free there', () => {
  assert.deepEqual(
    { x: FLOOR_DROP_DISC_HEAVEN.x, z: FLOOR_DROP_DISC_HEAVEN.z, r: FLOOR_DROP_DISC_HEAVEN.r },
    { x: -70, z: 110, r: 8 },
  );
});

test('floorDropDiscForSide picks the disc by side', () => {
  assert.equal(floorDropDiscForSide('nether'), FLOOR_DROP_DISC_NETHER);
  assert.equal(floorDropDiscForSide('heaven'), FLOOR_DROP_DISC_HEAVEN);
  assert.equal(floorDropDiscForSide('other'), FLOOR_DROP_DISC_NETHER, 'unknown side falls back to nether');
});

test('isOnFloorDropDisc is the disc radius, rim excluded, junk rejected', () => {
  const disc = FLOOR_DROP_DISC_NETHER;
  assert.equal(isOnFloorDropDisc(70, 110, disc), true, 'dead centre is in');
  assert.equal(isOnFloorDropDisc(70, 117, disc), true, '7 m out is in');
  assert.equal(isOnFloorDropDisc(70, 118, disc), false, 'exactly on the rim is not yet in');
  assert.equal(isOnFloorDropDisc(70, 119, disc), false, 'past the rim is out');
  assert.equal(isOnFloorDropDisc(0, 160, disc), false, 'spawn is far from the disc');
  assert.equal(isOnFloorDropDisc(NaN, 110, disc), false);
  assert.equal(isOnFloorDropDisc(70, 110, null), false);
  assert.equal(isOnFloorDropDisc(70, 110, {}), false);
});

test('the two discs never overlap each other', () => {
  const d = Math.hypot(
    FLOOR_DROP_DISC_NETHER.x - FLOOR_DROP_DISC_HEAVEN.x,
    FLOOR_DROP_DISC_NETHER.z - FLOOR_DROP_DISC_HEAVEN.z,
  );
  assert.ok(d > FLOOR_DROP_DISC_NETHER.r + FLOOR_DROP_DISC_HEAVEN.r);
});

// --- the guard: once per entry, 1500 ms re-arm -----------------------------

test('the guard fires once per entry and re-arms after stepping out + 1500 ms', () => {
  const guard = createFloorDropGuard();
  const disc = FLOOR_DROP_DISC_NETHER;
  // First step-on fires (the clock is past the 1500 ms deaf window).
  assert.equal(floorDropGuardShouldFire(guard, 70, 110, disc, 2000), true);
  // Standing on the disc does not re-fire.
  assert.equal(floorDropGuardShouldFire(guard, 70, 110, disc, 3000), false);
  assert.equal(floorDropGuardShouldFire(guard, 70, 110, disc, 9000), false);
  // Stepping off re-arms the guard, but the 1500 ms window still applies.
  assert.equal(floorDropGuardShouldFire(guard, 0, 160, disc, 9500), false);
  assert.equal(floorDropGuardShouldFire(guard, 70, 110, disc, 3400), false, 'only 1400 ms since the last firing');
  assert.equal(floorDropGuardShouldFire(guard, 70, 110, disc, 3600), true, '1600 ms since the last firing');
});

test('the guard re-arm window is the arches’ 1500 ms', () => {
  assert.equal(FLOOR_DROP_GUARD_REARM_MS, 1500);
});

test('the guard fails soft on junk input and never throws', () => {
  const disc = FLOOR_DROP_DISC_NETHER;
  assert.equal(floorDropGuardShouldFire(null, 70, 110, disc, 2000), false);
  assert.equal(floorDropGuardShouldFire(createFloorDropGuard(), 70, 110, null, 2000), false);
  assert.equal(floorDropGuardShouldFire(createFloorDropGuard(), 70, 110, disc, NaN), false);
  assert.equal(floorDropGuardShouldFire(createFloorDropGuard(), 70, 110, disc, undefined), false);
});

test('each rig’s guard is its own state (no cross-talk between realms)', () => {
  const a = createFloorDropGuard();
  const b = createFloorDropGuard();
  const disc = FLOOR_DROP_DISC_NETHER;
  assert.equal(floorDropGuardShouldFire(a, 70, 110, disc, 2000), true);
  assert.equal(floorDropGuardShouldFire(b, 70, 110, disc, 2000), true, 'a second rig fires independently');
  assert.equal(floorDropGuardShouldFire(a, 70, 110, disc, 2100), false, 'but the first stays silent while standing on it');
});

// --- the opening state machine --------------------------------------------

test('drop starts closed and walks closed -> opening -> open -> dropping', () => {
  let s = createFloorDropState('helheim');
  assert.equal(s.phase, 'closed');
  assert.equal(s.origin, 'helheim');
  s = floorDropNext(s, 'open');
  assert.equal(s.phase, 'opening');
  s = floorDropNext(s, 'opened');
  assert.equal(s.phase, 'open');
  s = floorDropNext(s, 'drop');
  assert.equal(s.phase, 'dropping');
  assert.equal(s.origin, 'helheim');
});

test('invalid transitions leave the state untouched (no double-fire)', () => {
  const s = createFloorDropState('helheim');
  assert.equal(floorDropNext(s, 'drop'), s, 'cannot drop from closed');
  assert.equal(floorDropNext(s, 'opened'), s, 'cannot finish opening before it starts');
  const opening = floorDropNext(s, 'open');
  assert.equal(floorDropNext(opening, 'open'), opening, 'opening twice is a no-op');
  assert.equal(floorDropNext(opening, 'drop'), opening, 'cannot drop before the door is open');
  const dropping = floorDropNext(floorDropNext(opening, 'opened'), 'drop');
  assert.equal(floorDropNext(dropping, 'open'), dropping, 'cannot re-open mid-fall');
  assert.equal(floorDropNext(dropping, 'drop'), dropping, 'cannot drop twice');
});

test('reset returns any phase to closed and keeps the origin', () => {
  const s = floorDropNext(floorDropNext(createFloorDropState('duat'), 'open'), 'opened');
  const reset = floorDropNext(s, 'reset');
  assert.equal(reset.phase, 'closed');
  assert.equal(reset.origin, 'duat');
});

test('an unknown origin becomes null — the drop never invents a home', () => {
  assert.equal(createFloorDropState('not-a-realm').origin, null);
  assert.equal(createFloorDropState(undefined).origin, null);
});

test('the four phases are exactly closed, opening, open, dropping', () => {
  assert.deepEqual(FLOOR_DROP_PHASES, ['closed', 'opening', 'open', 'dropping']);
});

// --- gravity: the fall is an integration ------------------------------------

test('fall distance is 1/2 g t^2 (0 at rest, 4.9 m after 1 s)', () => {
  assert.equal(fallDistanceAtTime(0), 0);
  assert.ok(Math.abs(fallDistanceAtTime(1) - 0.5 * FLOOR_DROP_GRAVITY) < 1e-9);
  assert.ok(Math.abs(fallDistanceAtTime(2) - 2 * FLOOR_DROP_GRAVITY) < 1e-9);
  assert.equal(fallDistanceAtTime(-5), 0, 'negative time falls nowhere');
});

test('fall time inverts fall distance for the shaft depth', () => {
  const t = fallTimeForDepth(FLOOR_DROP_DEPTH);
  assert.ok(Math.abs(fallDistanceAtTime(t) - FLOOR_DROP_DEPTH) < 1e-9);
  assert.equal(floorDropFallSeconds(), t);
  assert.ok(t > 2 && t < 3, `a ${FLOOR_DROP_DEPTH} m shaft takes ~2.3 s, got ${t}`);
});

test('fall velocity grows as g t', () => {
  assert.equal(fallVelocityAtTime(0), 0);
  assert.ok(Math.abs(fallVelocityAtTime(1) - FLOOR_DROP_GRAVITY) < 1e-9);
});

// --- the destination carries the origin -------------------------------------

test('the drop destination is the Land of the Dead with ?from=<origin>', () => {
  assert.equal(dropDestination('helheim'), '/land-of-the-dead?from=helheim');
  assert.equal(dropDestination('tir-na-nog'), '/land-of-the-dead?from=tir-na-nog');
  assert.equal(dropDestination('nope'), FLOOR_DROP_ROUTE, 'unknown origin travels bare');
  assert.equal(FLOOR_DROP_ROUTE, '/land-of-the-dead');
});

// --- origin storage: URL first, then sessionStorage, consumed once ----------

test('store / read / clear round-trips the origin in storage', () => {
  const storage = fakeStorage();
  assert.equal(storeDropOrigin('yomi', storage), true);
  assert.equal(storage._store[FLOOR_DROP_STORAGE_KEY], 'yomi');
  assert.equal(readStoredDropOrigin(storage), 'yomi');
  assert.equal(clearDropOrigin(storage), true);
  assert.equal(readStoredDropOrigin(storage), null);
});

test('an unknown origin is never stored', () => {
  const storage = fakeStorage();
  assert.equal(storeDropOrigin('not-a-realm', storage), false);
  assert.equal(readStoredDropOrigin(storage), null);
});

test('a missing storage object fails soft, never throws', () => {
  assert.equal(storeDropOrigin('yomi', null), false);
  assert.equal(readStoredDropOrigin(null), null);
  assert.equal(clearDropOrigin(undefined), false);
});

test('?from= is read only when it names a realm the portals know', () => {
  assert.equal(dropOriginFromSearch('?from=helheim'), 'helheim');
  assert.equal(dropOriginFromSearch('from=duat'), 'duat');
  assert.equal(dropOriginFromSearch('?from=not-a-realm'), null);
  assert.equal(dropOriginFromSearch(''), null);
  assert.equal(dropOriginFromSearch('?other=helheim'), null);
});

test('resolveDropOrigin prefers the URL over storage', () => {
  const storage = fakeStorage({ [FLOOR_DROP_STORAGE_KEY]: 'duat' });
  assert.equal(resolveDropOrigin('?from=helheim', storage), 'helheim');
  assert.equal(resolveDropOrigin('', storage), 'duat');
  assert.equal(resolveDropOrigin('', fakeStorage()), null);
});

// --- the way back: the floor portal returns to the origin realm -------------

test('the return route is the origin realm route', () => {
  assert.equal(returnRouteForOrigin('helheim'), '/helheim');
  assert.equal(returnRouteForOrigin('hades'), '/nether-realm');
  assert.equal(returnRouteForOrigin('elysium'), '/elysium');
  assert.equal(returnRouteForOrigin('orun'), '/orun');
  assert.equal(returnRouteForOrigin('heaven'), '/heaven');
});

test('a missing or unknown origin falls back to the Portals 3D hall, never nowhere', () => {
  assert.equal(returnRouteForOrigin(null), FLOOR_DROP_FALLBACK_ROUTE);
  assert.equal(returnRouteForOrigin(undefined), FLOOR_DROP_FALLBACK_ROUTE);
  assert.equal(returnRouteForOrigin('not-a-realm'), FLOOR_DROP_FALLBACK_ROUTE);
  assert.equal(FLOOR_DROP_FALLBACK_ROUTE, '/?concourse=1&portals3d=1');
});

test('realm keys, routes and labels agree with the portal registry', () => {
  assert.equal(isKnownRealmKey('helheim'), true);
  assert.equal(isKnownRealmKey('not-a-realm'), false);
  assert.equal(routeForRealmKey('hades'), '/nether-realm');
  assert.equal(routeForRealmKey('nope'), null);
  assert.equal(labelForRealmKey('helheim'), 'Helheim');
  assert.equal(labelForRealmKey('nope'), null);
  // 24 keys: the 24 portal realms. The Land of the Dead is NOT one
  // (Merlin, Nov 16 ~04:49 — floor drop only, no portal card): the
  // drop destination is the FLOOR_DROP_ROUTE constant, and the return
  // only ever names a portal realm as the origin.
  assert.equal(floorDropRealmKeys().length, 24);
  assert.equal(new Set(floorDropRealmKeys()).size, 24);
  assert.equal(isKnownRealmKey('land-of-the-dead'), false);
  assert.equal(routeForRealmKey('land-of-the-dead'), null);
});

// --- one shared module: the triple in every realm, no per-realm copies ------

const NETHER_DIRS = ['nether-realm', 'helheim', 'duat', 'hell', 'naraka', 'yomi', 'annwn', 'mictlan', 'xibalba', 'kur', 'nav', 'diyu', 'orun'];
const HEAVEN_DIRS = ['elysium', 'valhalla', 'aaru', 'heaven', 'svarga', 'takamagahara', 'tir-na-nog', 'tlalocan', 'maya-sky', 'vyraj', 'tiangong'];
const ORIGIN_FOR_DIR = {
  'nether-realm': 'hades', helheim: 'helheim', duat: 'duat', hell: 'hell',
  naraka: 'naraka', yomi: 'yomi', annwn: 'annwn', mictlan: 'mictlan',
  xibalba: 'xibalba', kur: 'kur', nav: 'nav', diyu: 'diyu', orun: 'orun',
  elysium: 'elysium', valhalla: 'valhalla', aaru: 'aaru', heaven: 'heaven',
  svarga: 'svarga', takamagahara: 'takamagahara', 'tir-na-nog': 'tir-na-nog',
  tlalocan: 'tlalocan', 'maya-sky': 'maya-sky', vyraj: 'vyraj', tiangong: 'tiangong',
};

test('every realm page wires the ONE shared module (hook + callback + scene prop + overlay)', () => {
  const missing = [];
  for (const dir of [...NETHER_DIRS, ...HEAVEN_DIRS]) {
    const page = join(REPO, 'app', dir, 'page.jsx');
    assert.ok(existsSync(page), `app/${dir}/page.jsx exists`);
    const src = readFileSync(page, 'utf8');
    const origin = ORIGIN_FOR_DIR[dir];
    if (!src.includes("from '@/components/world/FloorDrop'")) missing.push(`${dir}: no FloorDrop import`);
    if (!src.includes(`useFloorDrop({ origin: '${origin}' })`)) missing.push(`${dir}: hook origin is not '${origin}'`);
    if (!src.includes('const onFloorDrop = useCallback(() => {')) missing.push(`${dir}: no onFloorDrop callback`);
    if (!src.includes('onFloorDrop={onFloorDrop}')) missing.push(`${dir}: no onFloorDrop scene prop`);
    if (!src.includes('<FloorDropFallOverlay')) missing.push(`${dir}: no <FloorDropFallOverlay>`);
  }
  assert.deepEqual(missing, [], 'every realm page must wire the shared module');
});

test('every realm scene renders the shared disc and guards it in its CameraRig', () => {
  const missing = [];
  for (const dir of NETHER_DIRS) {
    const src = readFileSync(join(REPO, 'app', dir, 'world3d.js'), 'utf8');
    if (!src.includes('<FloorDropDisc side="nether"')) missing.push(`${dir}: no nether disc`);
    if (!src.includes('FLOOR_DROP_DISC_NETHER')) missing.push(`${dir}: no nether disc constant`);
    if (!src.includes('floorDropGuardShouldFire')) missing.push(`${dir}: no guard call`);
    if (!src.includes('createFloorDropGuard()')) missing.push(`${dir}: no own guard state`);
    if (!src.includes('onFloorDrop')) missing.push(`${dir}: no onFloorDrop prop`);
    if (src.includes('FLOOR_DROP_DISC_HEAVEN')) missing.push(`${dir}: nether realm uses the heaven disc`);
  }
  for (const dir of HEAVEN_DIRS) {
    const src = readFileSync(join(REPO, 'app', dir, 'world3d.js'), 'utf8');
    if (!src.includes('<FloorDropDisc side="heaven"')) missing.push(`${dir}: no heaven disc`);
    if (!src.includes('FLOOR_DROP_DISC_HEAVEN')) missing.push(`${dir}: no heaven disc constant`);
    if (!src.includes('floorDropGuardShouldFire')) missing.push(`${dir}: no guard call`);
    if (!src.includes('createFloorDropGuard()')) missing.push(`${dir}: no own guard state`);
    if (!src.includes('onFloorDrop')) missing.push(`${dir}: no onFloorDrop prop`);
    if (src.includes('FLOOR_DROP_DISC_NETHER')) missing.push(`${dir}: heaven realm uses the nether disc`);
  }
  assert.deepEqual(missing, [], 'every realm scene must render the shared disc + guard');
});

test('no realm page or scene defines its own drop disc, guard, or state machine', () => {
  const offenders = [];
  for (const dir of [...NETHER_DIRS, ...HEAVEN_DIRS]) {
    for (const file of ['page.jsx', 'world3d.js']) {
      const src = readFileSync(join(REPO, 'app', dir, file), 'utf8');
      if (/function floorDropNext|const floorDropNext|createFloorDropState|function isOnFloorDropDisc/.test(src)) {
        offenders.push(`${dir}/${file}: redefines shared logic`);
      }
      if (/FLOOR_DROP_DISC_(NETHER|HEAVEN)\s*=/.test(src)) offenders.push(`${dir}/${file}: redefines a disc constant`);
      if (/FloorDropTrapdoor|FloorDropOrb|floorDropAnchorForSpawn/.test(src)) {
        offenders.push(`${dir}/${file}: v1 trapdoor/orb remnant`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('the shared module exists exactly once (no second floor-drop lib)', () => {
  const libWorld = readdirSync(join(REPO, 'lib', 'world'));
  const copies = libWorld.filter((f) => f.includes('floor-drop') && f !== 'floor-drop.js');
  assert.deepEqual(copies, []);
  assert.ok(existsSync(join(REPO, 'components', 'world', 'FloorDrop.jsx')));
});

test('the Land of the Dead mounts the return at worker B\'s anchor', () => {
  const page = readFileSync(join(REPO, 'app', 'land-of-the-dead', 'page.jsx'), 'utf8');
  const scene = readFileSync(join(REPO, 'app', 'land-of-the-dead', 'world3d.js'), 'utf8');
  // The DOM orb lives at the anchor B left, driven by the shared hook.
  assert.ok(page.includes('id="lotd-return-anchor"'), 'anchor div present');
  assert.ok(page.includes('<LandOfTheDeadReturnOrb'), 'return orb mounted at the anchor');
  assert.ok(page.includes('useLandOfTheDeadReturn()'), 'return hook in use');
  assert.ok(page.includes('onReturn={floorReturn.returnToOrigin}'), 'return threaded into the scene');
  // The floor portal itself lives in the Canvas, on the sphere surface.
  assert.ok(scene.includes('<LandOfTheDeadReturn'), 'floor portal mounted in the scene');
  assert.ok(scene.includes('LandOfTheDeadReturn position={pos} quaternion={q}'), 'portal sits on the sphere surface');
});
