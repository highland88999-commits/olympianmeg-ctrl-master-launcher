// tests/sun-base.test.mjs — THE SUN BASE (Merlin, Nov 13, 2026).
// A base for each user inside the sun. Entry (his design, same
// concept as the Heaven portal): pass through the sun to enter, or
// click/tap it — and clicking PULLS the user into the sun (a visible
// 1.4 s draw-in, accelerating, the sun flaring as you close), then
// the transition, then they arrive inside their base. The interior
// is one of the 3 reserved options (farmhouse / barn / windmill),
// picked by the user on first entry, persisted device-local.
// Run: node tests/sun-base.test.mjs (from the repo root).
// No browser, no network — pure lib checks + wired-source audits
// (same grep style as the portal-system suite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { SUN_CENTER as ARCH_SUN_CENTER, SUN_RADIUS as ARCH_SUN_RADIUS } from '../lib/omega-arch.js';
import {
  SUN_CENTER,
  SUN_RADIUS,
  SUN_BASE_ROUTE,
  SUN_BASE_STORAGE_KEY,
  SUN_BASE_PULL_MS,
  SUN_BASE_TRIGGER_RADIUS,
  SUN_BASE_OPTIONS,
  SUN_BASE_OPTION_LABELS,
  defaultSunBaseAssetId,
  sunBaseOptionFor,
  sanitizeSunBasePick,
  loadSunBasePick,
  saveSunBasePick,
  isSunTriggerPoint,
  pullEasedProgress,
} from '../lib/sun-base.js';
import { sunBaseSpecFor } from '../lib/sun-base-spec.js';
import { RESERVED_SUN_BASE_INTERIORS } from '../lib/earth2/fittings.js';
import { buildInteriorRoom } from '../lib/earth2/interior-room.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// --- 1. The sun is the existing hub sun — never moved, never rebuilt ---

test('the sun base uses the existing hub sun (centre + radius match omega-arch)', () => {
  assert.deepEqual(SUN_CENTER, ARCH_SUN_CENTER);
  assert.equal(SUN_CENTER.x, 0);
  assert.equal(SUN_CENTER.y, 158.75);
  assert.equal(SUN_CENTER.z, 662.5);
  assert.equal(SUN_RADIUS, ARCH_SUN_RADIUS);
  assert.equal(SUN_RADIUS, 67.5);
});

test('the hub scene still registers the sun collider at the same centre', () => {
  const hub = src('../components/HomeScene.jsx');
  assert.ok(
    hub.includes("registerCollider('sun', () => ({ x: 0, y: 158.75, z: 662.5 }), 68)"),
    'StaticColliders must keep the sun solid at (0, 158.75, 662.5) r68'
  );
});

// --- 2. The three reserved interiors are the only options ---

test('exactly three sun-base options, and they are the reserved interiors', () => {
  assert.equal(SUN_BASE_OPTIONS.length, 3);
  assert.deepEqual(
    SUN_BASE_OPTIONS.map((o) => o.assetId).sort(),
    RESERVED_SUN_BASE_INTERIORS.map((r) => r.assetId).sort()
  );
  assert.deepEqual(
    SUN_BASE_OPTIONS.map((o) => o.assetId).sort(),
    ['e021-red-gambrel-barn', 'e023-prairie-farmhouse', 'e024-farm-windmill']
  );
});

test('every option has a label and a reason', () => {
  for (const o of SUN_BASE_OPTIONS) {
    assert.ok(SUN_BASE_OPTION_LABELS[o.assetId], `${o.assetId} needs a label`);
    assert.ok(o.why && o.why.length > 0, `${o.assetId} needs a why`);
  }
});

test('default interior is the farmhouse (most livable)', () => {
  assert.equal(defaultSunBaseAssetId(), 'e023-prairie-farmhouse');
  assert.ok(sunBaseOptionFor(defaultSunBaseAssetId()));
});

test('sanitize keeps only reserved assetIds', () => {
  assert.equal(sanitizeSunBasePick({ assetId: 'e021-red-gambrel-barn' }), 'e021-red-gambrel-barn');
  assert.equal(sanitizeSunBasePick({ assetId: 'e049-eiffel-tower' }), null);
  assert.equal(sanitizeSunBasePick({ assetId: 42 }), null);
  assert.equal(sanitizeSunBasePick(null), null);
  assert.equal(sanitizeSunBasePick('e023-prairie-farmhouse'), null);
  assert.equal(sanitizeSunBasePick({}), null);
});

test('storage is device-local and safe without localStorage (node)', () => {
  assert.equal(SUN_BASE_STORAGE_KEY, 'olympus:sun-base:v1');
  assert.equal(loadSunBasePick(), null);
  assert.equal(saveSunBasePick('e023-prairie-farmhouse'), false);
});

// --- 3. Entry: fly-through trigger + pull timing ---

test('fly-through trigger sits just outside the collider resting distances', () => {
  // Free-fly rests at 68 + 1.2 = 69.2, the bike at 68 + 3 = 71.
  // The trigger must catch both press-ins and ignore a fly-by
  // more than ~3.5 units off the surface.
  assert.equal(SUN_BASE_TRIGGER_RADIUS, SUN_RADIUS + 4);
  assert.ok(SUN_BASE_TRIGGER_RADIUS > 71, 'must catch the bike resting on the sun');
  assert.ok(isSunTriggerPoint({ x: 0, y: 158.75, z: 662.5 - 69 }));
  assert.ok(isSunTriggerPoint({ x: 0, y: 158.75, z: 662.5 - 71 }));
  assert.ok(!isSunTriggerPoint({ x: 0, y: 158.75, z: 662.5 - 80 }));
  assert.ok(!isSunTriggerPoint({ x: 0, y: 35, z: -80 }));
  assert.ok(!isSunTriggerPoint(null));
});

test('the pull is 1400 ms, ease-in (accelerating), clamped', () => {
  assert.equal(SUN_BASE_PULL_MS, 1400);
  assert.equal(pullEasedProgress(0), 0);
  assert.equal(pullEasedProgress(SUN_BASE_PULL_MS), 1);
  assert.equal(pullEasedProgress(SUN_BASE_PULL_MS * 3), 1);
  assert.equal(pullEasedProgress(-100), 0);
  const mid = pullEasedProgress(SUN_BASE_PULL_MS / 2);
  assert.ok(mid > 0 && mid < 0.5, `ease-in: halfway through time must be under halfway there (got ${mid})`);
  assert.ok(pullEasedProgress(350) < pullEasedProgress(700));
  assert.ok(pullEasedProgress(700) < pullEasedProgress(1050));
});

// --- 4. The interiors: specs resolve at the origin, single-floor rooms ---

test('all three reserved interiors resolve to origin specs', () => {
  const expected = {
    'e023-prairie-farmhouse': { w: 9, h: 9, cls: 'house' },
    'e021-red-gambrel-barn': { w: 12, h: 12, cls: 'barn' },
    'e024-farm-windmill': { w: 10, h: 10, cls: 'windmill' },
  };
  for (const [assetId, exp] of Object.entries(expected)) {
    const spec = sunBaseSpecFor(assetId);
    assert.ok(spec, `${assetId} must resolve`);
    assert.equal(spec.x, 0);
    assert.equal(spec.z, 0);
    assert.equal(spec.headingDeg, 0);
    assert.equal(spec.widthM, exp.w);
    assert.equal(spec.depthM, exp.w);
    assert.equal(spec.heightM, exp.h);
    assert.equal(spec.class, exp.cls);
    assert.equal(spec.floors, 1, 'all three sun-base interiors are single-floor');
    assert.ok(spec.lightColor, 'room needs its warm light colour');
  }
});

test('non-reserved assetIds and missing anchors resolve to null', () => {
  assert.equal(sunBaseSpecFor('e049-eiffel-tower'), null);
  assert.equal(sunBaseSpecFor('nope'), null);
  assert.equal(sunBaseSpecFor(null), null);
});

test('the interior factory builds each reserved room', () => {
  for (const o of SUN_BASE_OPTIONS) {
    const spec = sunBaseSpecFor(o.assetId);
    const { group, liftPads } = buildInteriorRoom(spec, 0);
    assert.ok(group.children.length > 0, `${o.assetId} room must have meshes`);
    assert.deepEqual(liftPads, [], 'single-floor rooms have no lift pads');
    assert.equal(group.position.x, 0);
    assert.equal(group.position.z, 0);
  }
});

// --- 5. Wiring: hub entry, pull, route, picker ---

test('the sun in the hub is clickable, labelled, and fly-through checked', () => {
  const hub = src('../components/HomeScene.jsx');
  assert.ok(hub.includes('function SunBackground({ onSelect, freeroam, sunPullRef })'), 'SunBackground takes the entry props');
  assert.ok(hub.includes('SUN BASE'), 'the sun carries a SUN BASE label');
  assert.ok(hub.includes('SUN_BASE_TRIGGER_RADIUS'), 'fly-through uses the trigger radius');
  assert.ok(hub.includes('onSelect()'), 'click and fly-through both start the entry');
  assert.ok(hub.includes('e.delta > 10'), 'clicks use the drag guard, like the portal discs');
  assert.ok(hub.includes('pull.progress'), 'the sun flares with pull progress');
});

test('SequenceController owns the camera for the pull and hands off once', () => {
  const hub = src('../components/HomeScene.jsx');
  assert.ok(hub.includes('sunPullRef'), 'SequenceController receives the pull ref');
  assert.ok(hub.includes('onSunPullDone'), 'SequenceController reports the pull landing');
  assert.ok(hub.includes('pullEasedProgress'), 'the pull eases in');
  assert.ok(hub.includes('camera.lookAt(SUN_CENTER.x, SUN_CENTER.y, SUN_CENTER.z)'), 'the pull looks at the sun');
  assert.ok(hub.includes('pull.done = true'), 'the handoff fires exactly once');
});

test('the page wires click → pull → gold flash → sun-base route', () => {
  const page = src('../app/page.jsx');
  assert.ok(page.includes("SUN_BASE_ROUTE"), 'page imports the sun-base route');
  assert.ok(page.includes('handleSunClick'), 'page starts the pull');
  assert.ok(page.includes('handleSunPullDone'), 'page handles the pull landing');
  assert.ok(page.includes('sunPullRef'), 'page owns the shared pull ref');
  assert.ok(page.includes('sunFlash'), 'page flashes gold on entry');
  assert.ok(page.includes('router.push(SUN_BASE_ROUTE)'), 'the pull lands on /sun-base');
  assert.ok(page.includes('window.__sunBase'), 'headless probe hook exists');
  assert.ok(page.includes('onSunClick={handleSunClick}'), 'HomeScene gets the click handler');
});

test('the sun-base route exists: picker, scene, walk rig, sign-in gate', () => {
  assert.ok(existsSync(new URL('../app/sun-base/page.jsx', import.meta.url)), 'app/sun-base/page.jsx must exist');
  const route = src('../app/sun-base/page.jsx');
  assert.ok(route.includes('supabase.auth'), 'the base is gated to signed-in accounts');
  assert.ok(route.includes('loadSunBasePick'), 'the pick loads from storage');
  assert.ok(route.includes('saveSunBasePick'), 'the pick persists');
  assert.ok(route.includes('Change interior'), 'the interior can be re-picked inside the base');
  assert.ok(route.includes('WalkJoystick'), 'touch walking uses the shared joystick');
  assert.ok(route.includes("router.push('/')"), 'leaving returns to the hub');

  const scene = src('../components/SunBaseScene.jsx');
  assert.ok(scene.includes('buildInteriorRoom'), 'the room is the reserved interior factory');
  assert.ok(scene.includes('SUN_BASE_WALK_SPEED_MPS'), 'the rig walks at the normal-size stride (3.2 m/s)');
  assert.ok(scene.includes('0.94'), 'walking clamps to the room inset');
  assert.ok(scene.includes('SUN_BASE_EYE_HEIGHT_M'), 'eye height is the shrunken eye (0.34 m)');
});

test('menu entry: the sun base is registered in both registries (dual-registry)', () => {
  const menus = src('../lib/god-menus.js');
  const sats = src('../lib/i18n/satellites.ts');
  assert.ok(menus.includes('sun-base'), 'sun base is a god menu');
  assert.ok(sats.includes('sun-base'), 'sun base is a satellite entry');
  assert.equal(SUN_BASE_ROUTE, '/sun-base');
});
