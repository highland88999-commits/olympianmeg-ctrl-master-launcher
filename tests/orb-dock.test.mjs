// Shared orb dock: free-floating draggable controls (Hollow Earth
// cluster + Jupiter 2 per-orb). Moved here from
// app/hollow-earth/tests/orb-dock.test.mjs when the module moved to
// lib/world/orb-dock.js (Merlin, Nov 16 ~02:35 — ONE shared
// mechanism, not two implementations).
// Run: node tests/orb-dock.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ORB_DOCK_STORAGE_KEY, ORB_DOCK_UI_STATE_KEY,
  ORB_DOCK_WIDTH, ORB_DOCK_HEIGHT, ORB_DOCK_GAP,
  ORB_DOCK_DRAG_THRESHOLD_PX, ORB_DOCK_HOME_LEFT_PX, ORB_DOCK_HOME_BOTTOM_PX,
  sanitizeOrbDockPosition, isOrbDockDrag, resolveOrbDockPosition,
  loadOrbDockPosition, saveOrbDockPosition,
  defaultOrbDockFractions, orbDockFracToPx, orbDockPxToFrac,
  clampOrbDockPx, dragOrbDockTopLeft,
  orbDockStorageKeyFor, orbDockUiStateKeyFor,
  sanitizeOrbDockMap, loadOrbDockMap, saveOrbDockMap, resolveOrbDockMap,
} from '../lib/world/orb-dock.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

function memStore(initial) {
  const data = initial ? { ...initial } : {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    _data: data,
  };
}

test('dock box: 56 wide, 212 tall — Map/Weapon/Spawn/Strike + 8 px gaps', () => {
  assert.equal(ORB_DOCK_WIDTH, 56);
  assert.equal(ORB_DOCK_GAP, 8);
  // 44 + 8 + 44 + 8 + 56 + 8 + 44 = 212.
  assert.equal(ORB_DOCK_HEIGHT, 44 + 8 + 44 + 8 + 56 + 8 + 44);
  assert.equal(ORB_DOCK_DRAG_THRESHOLD_PX, 8);
  // Home: left 142 (= 12 + 118 joystick + 12 gap), bottom 24.
  assert.equal(ORB_DOCK_HOME_LEFT_PX, 12 + 118 + 12);
  assert.equal(ORB_DOCK_HOME_BOTTOM_PX, 24);
  assert.equal(ORB_DOCK_UI_STATE_KEY, 'hollow_earth_orb_dock');
});

test('sanitize: fractions in [0, 1] pass, anything else is null', () => {
  assert.deepEqual(sanitizeOrbDockPosition({ x: 0, y: 1 }), { x: 0, y: 1 });
  assert.deepEqual(sanitizeOrbDockPosition({ x: 0.5, y: 0.5 }), { x: 0.5, y: 0.5 });
  assert.equal(sanitizeOrbDockPosition(null), null);
  assert.equal(sanitizeOrbDockPosition({ x: 1.2, y: 0.5 }), null);
  assert.equal(sanitizeOrbDockPosition({ x: -0.1, y: 0.5 }), null);
  assert.equal(sanitizeOrbDockPosition({ x: '0.5', y: 0.5 }), null);
  assert.equal(sanitizeOrbDockPosition({ x: NaN, y: 0.5 }), null);
});

test('drag threshold: 8 px — a still press stays a tap', () => {
  assert.equal(isOrbDockDrag(0, 0), false);
  assert.equal(isOrbDockDrag(5, 5), false);
  assert.equal(isOrbDockDrag(8, 0), false);
  assert.equal(isOrbDockDrag(9, 0), true);
  assert.equal(isOrbDockDrag(0, 20), true);
});

test('load/save round-trip; corrupt or missing saves return null, never throw', () => {
  const store = memStore();
  assert.equal(loadOrbDockPosition(store), null);
  assert.equal(saveOrbDockPosition({ x: 0.25, y: 0.75 }, store), true);
  assert.deepEqual(loadOrbDockPosition(store), { x: 0.25, y: 0.75 });
  assert.equal(store._data[ORB_DOCK_STORAGE_KEY], JSON.stringify({ x: 0.25, y: 0.75 }));
  assert.equal(saveOrbDockPosition({ x: 2, y: 0.5 }, store), false);
  assert.deepEqual(loadOrbDockPosition(store), { x: 0.25, y: 0.75 });
  const corrupt = memStore({ [ORB_DOCK_STORAGE_KEY]: '{not json' });
  assert.equal(loadOrbDockPosition(corrupt), null);
  const outOfRange = memStore({ [ORB_DOCK_STORAGE_KEY]: JSON.stringify({ x: 3, y: 0.5 }) });
  assert.equal(loadOrbDockPosition(outOfRange), null);
  assert.equal(loadOrbDockPosition(null), null);
  assert.equal(saveOrbDockPosition({ x: 0.5, y: 0.5 }, null), false);
});

test('resolve precedence: server beats local beats fallback; nothing stored is null', () => {
  assert.deepEqual(
    resolveOrbDockPosition({ server: { x: 0.1, y: 0.1 }, local: { x: 0.2, y: 0.2 }, fallback: { x: 0.3, y: 0.3 } }),
    { x: 0.1, y: 0.1 },
  );
  assert.deepEqual(
    resolveOrbDockPosition({ server: null, local: { x: 0.2, y: 0.2 }, fallback: { x: 0.3, y: 0.3 } }),
    { x: 0.2, y: 0.2 },
  );
  assert.deepEqual(resolveOrbDockPosition({ fallback: { x: 0.3, y: 0.3 } }), { x: 0.3, y: 0.3 });
  assert.equal(resolveOrbDockPosition({}), null);
  assert.deepEqual(
    resolveOrbDockPosition({ server: { x: 9, y: 0.1 }, local: { x: 0.2, y: 0.2 } }),
    { x: 0.2, y: 0.2 },
  );
});

test('fractions round-trip through pixels for a phone viewport', () => {
  const vw = 390;
  const vh = 844;
  const frac = { x: 0.3, y: 0.6 };
  const px = orbDockFracToPx(frac, vw, vh);
  assert.deepEqual(orbDockPxToFrac(px, vw, vh), frac);
  // The default home spot converts back to left 142, bottom 24.
  const home = defaultOrbDockFractions(vw, vh);
  const homePx = orbDockFracToPx(home, vw, vh);
  assert.equal(Math.round(homePx.x), ORB_DOCK_HOME_LEFT_PX);
  assert.equal(Math.round(homePx.y), vh - ORB_DOCK_HOME_BOTTOM_PX - ORB_DOCK_HEIGHT);
});

test('clamp keeps the whole 56x212 box on screen with an 8 px margin', () => {
  const vw = 390;
  const vh = 844;
  assert.deepEqual(clampOrbDockPx({ x: -50, y: -50 }, vw, vh), { x: 8, y: 8 });
  assert.deepEqual(
    clampOrbDockPx({ x: 9999, y: 9999 }, vw, vh),
    { x: vw - ORB_DOCK_WIDTH - 8, y: vh - ORB_DOCK_HEIGHT - 8 },
  );
  assert.deepEqual(clampOrbDockPx({ x: 100, y: 100 }, vw, vh), { x: 100, y: 100 });
});

test('mid-drag: the grab offset is kept and the box stays on screen', () => {
  const vw = 390;
  const vh = 844;
  // Grabbed 10 px right / 20 px down from the top-left, finger moves +30 / -40.
  assert.deepEqual(
    dragOrbDockTopLeft({ x: 142, y: 500 }, { x: 152, y: 520 }, { x: 182, y: 480 }, vw, vh),
    { x: 172, y: 460 },
  );
  // Dragged past the top edge: clamped to the 8 px margin, not off-screen.
  assert.deepEqual(
    dragOrbDockTopLeft({ x: 142, y: 100 }, { x: 142, y: 100 }, { x: 142, y: -500 }, vw, vh),
    { x: 142, y: 8 },
  );
});

// ── Jupiter 2 mirror (Merlin, Nov 16 ~02:35): same module, same key
// pattern, per-orb spots instead of one cluster spot ───────────────

test('key pattern: one key per world — Hollow Earth keeps its key, Jupiter 2 follows it', () => {
  assert.equal(orbDockStorageKeyFor('hollow-earth'), ORB_DOCK_STORAGE_KEY);
  assert.equal(orbDockStorageKeyFor('hollow-earth'), 'olympus:hollow-earth:orb-dock:v1');
  assert.equal(orbDockStorageKeyFor('jupiter-2'), 'olympus:jupiter-2:orb-dock:v1');
  assert.equal(orbDockUiStateKeyFor('jupiter-2'), 'jupiter2_orb_dock');
  // Middle-earth mirror (Merlin, Nov 16 ~02:42): same pattern, its
  // own world entry — the melee + ranged orbs persist under it.
  assert.equal(orbDockStorageKeyFor('middle-earth'), 'olympus:middle-earth:orb-dock:v1');
  assert.equal(orbDockUiStateKeyFor('middle-earth'), 'middleearth_orb_dock');
  // Hollow Earth predates the ui-state helper and keeps its own
  // constant ('hollow_earth_orb_dock') — same shape, unchanged.
  assert.equal(ORB_DOCK_UI_STATE_KEY, 'hollow_earth_orb_dock');
});

test('per-orb map: sanitize drops bad entries, load/save round-trip, never throws', () => {
  assert.deepEqual(sanitizeOrbDockMap(null), {});
  assert.deepEqual(sanitizeOrbDockMap({ jump: { x: 0.9, y: 0.1 }, trade: { x: 2, y: 0.5 }, stick: 'nope' }), {
    jump: { x: 0.9, y: 0.1 },
  });
  const key = orbDockStorageKeyFor('jupiter-2');
  const store = memStore();
  assert.deepEqual(loadOrbDockMap(store, key), {});
  assert.equal(saveOrbDockMap({ jump: { x: 0.9, y: 0.1 }, shoot: { x: 0.5, y: 0.5 } }, store, key), true);
  assert.deepEqual(loadOrbDockMap(store, key), { jump: { x: 0.9, y: 0.1 }, shoot: { x: 0.5, y: 0.5 } });
  assert.equal(store._data[key], JSON.stringify({ jump: { x: 0.9, y: 0.1 }, shoot: { x: 0.5, y: 0.5 } }));
  const corrupt = memStore({ [key]: '{not json' });
  assert.deepEqual(loadOrbDockMap(corrupt, key), {});
  assert.deepEqual(loadOrbDockMap(null, key), {});
  assert.equal(saveOrbDockMap({ jump: { x: 0.5, y: 0.5 } }, null, key), false);
  assert.equal(saveOrbDockMap({ jump: { x: 0.5, y: 0.5 } }, store, ''), false);
});

test('per-orb map resolve precedence: server beats local beats fallback; empty is {}', () => {
  assert.deepEqual(
    resolveOrbDockMap({ server: { jump: { x: 0.1, y: 0.1 } }, local: { jump: { x: 0.2, y: 0.2 } } }),
    { jump: { x: 0.1, y: 0.1 } },
  );
  assert.deepEqual(
    resolveOrbDockMap({ server: { bad: { x: 9, y: 0 } }, local: { trade: { x: 0.2, y: 0.2 } } }),
    { trade: { x: 0.2, y: 0.2 } },
  );
  assert.deepEqual(resolveOrbDockMap({}), {});
});

test('Jupiter 2 uses the ONE shared mechanism — no second orb-dock copy anywhere', () => {
  const j2page = read('../app/jupiter-2/page.jsx');
  const j2scene = read('../components/jupiter2/Jupiter2Scene.jsx');
  const hook = read('../components/world/useOrbDock.js');
  const hollow = read('../app/hollow-earth/page.jsx');
  // Both worlds import the same shared module (Hollow Earth's old
  // local './orb-dock.js' is gone).
  assert.match(hollow, /from '@\/lib\/world\/orb-dock'/);
  assert.doesNotMatch(hollow, /from '\.\/orb-dock\.js'/);
  assert.match(j2page, /import \{ useOrbDock \} from "@\/components\/world\/useOrbDock"/);
  assert.match(j2scene, /import \{ useOrbDock \} from '@\/components\/world\/useOrbDock'/);
  assert.match(hook, /from '@\/lib\/world\/orb-dock'/);
  assert.match(hook, /orbDockStorageKeyFor\(world\)/);
  assert.match(hook, /loadOrbDockMap\(undefined, storageKey\)/);
  // The hook, not a copy: the drag math lives in the shared module.
  assert.doesNotMatch(hook, /Math\.hypot\(dx, dy\) > /);
  assert.match(hook, /isOrbDockDrag\(/);
  assert.match(hook, /dragOrbDockTopLeft\(/);
  // Every J2 control is docked except the stick, which is FIXED
  // bottom-left (Merlin, Nov 16 — the J2 layout): it steers, it
  // never moves, it is not dock-owned.
  // (The scene's orbs use `dock`, the touch controls' prop is named
  // `orbDock` — the same hook instance either way.)
  for (const id of ['jump', 'boost', 'shoot', 'summon', 'dismount', 'trade']) {
    assert.match(j2page + j2scene, new RegExp(`(?:orbDock|dock)\\.bind\\('${id}'`));
  }
  assert.doesNotMatch(j2page + j2scene, /(?:orbDock|dock)\.bind\('stick'/);
  assert.doesNotMatch(j2scene, /styleFor\('stick'/);
  assert.match(j2page, /ariaLabel="Enter fullscreen"/);
  assert.doesNotMatch(j2page, /dock\.bind\('fullscreen'/);
  // No button container left holding J2's controls: the top-left
  // column div is gone, and the orbs are free-floating.
  assert.doesNotMatch(j2scene, /display: 'flex', flexDirection: 'column', gap: 8/);
  assert.doesNotMatch(j2scene, /left: 12, top: 12, zIndex: 6, display: 'flex'/);
  // Defaults are the old slots, measured — nothing moves until dragged.
  assert.match(j2scene, /dock\.styleFor\('summon', \{ left: 12, top: 12 \}\)/);
  assert.match(j2scene, /dock\.styleFor\('dismount', \{ left: 12, top: 76 \}\)/);
  assert.match(j2scene, /dock\.styleFor\('trade', \{ left: 12, top: riding \? 148 : 76 \}\)/);
  // The stick is FIXED now, not dock-positioned (Merlin, Nov 16 —
  // the J2 layout): a plain div at left 16, bottom 16, it steers,
  // it never moves.
  assert.match(j2scene, /position: 'absolute', left: 16, bottom: 16, zIndex: 6,/);
  assert.match(j2scene, /orbDock\.styleFor\('boost', \{ right: 104, bottom: 88 \}\)/);
  assert.match(j2scene, /orbDock\.styleFor\('shoot', \{ right: 104, bottom: 12 \}\)/);
  assert.match(j2page, /dock\.styleFor\('jump', \{ right: 12, bottom: 88 \}\)/);
  // Drag-vs-tap: a drag stands the press action down (JUMP's queued
  // jump, BOOST's held key) and the tap guard is checked before
  // click actions fire. The stick has no drag handler any more —
  // it is fixed, not dock-dragged.
  assert.match(j2page, /onDragStart: \(\) => \{ jumpRef\.current = false; \}/);
  assert.match(j2scene, /onDragStart: \(\) => setKey\('boost', false\)/);
  assert.doesNotMatch(j2scene, /onDragStart: \(\) => clearStick\(\)/);
  assert.match(j2scene, /if \(orbDock\.tapGuard\(\)\) return; onShoot\(\)/);
  assert.match(j2scene, /if \(dock\.tapGuard\(\)\) return; summon\(\)/);
  assert.match(j2scene, /if \(dock\.tapGuard\(\)\) return; setTradeOpen\(true\)/);
});

// ── Middle-earth mirror (Merlin, Nov 16 ~02:42): same module, same
// key pattern — the weaponBar row is dissolved, the melee + ranged
// orbs free-float through the shared hook ──────────────────────────

test('Middle-earth uses the ONE shared mechanism — no second orb-dock copy anywhere', () => {
  const me = read('../app/middle-earth/page.jsx');
  assert.match(me, /import \{ useOrbDock \} from '@\/components\/world\/useOrbDock';/);
  assert.match(me, /const dock = useOrbDock\('middle-earth', ME_ORB_SIZES\);/);
  for (const id of ['melee', 'ranged']) {
    assert.match(me, new RegExp(`dock\\.bind\\('${id}'`));
    assert.match(me, new RegExp(`dock\\.styleFor\\('${id}'`));
  }
  // Home slots are the row's old spots at the bottom-right, left of
  // the backpack's own home: ranged nearest the backpack, melee
  // left of it. Nothing moves until dragged.
  assert.match(me, /dock\.styleFor\('melee', \{ right: 'calc\(0\.8rem \+ 112px \+ 0\.9rem\)', bottom: BOTTOM_CLEAR \}\)/);
  assert.match(me, /dock\.styleFor\('ranged', \{ right: 'calc\(0\.8rem \+ 56px \+ 0\.45rem\)', bottom: BOTTOM_CLEAR \}\)/);
  // The weaponBar row is dissolved: no container, no row style.
  assert.doesNotMatch(me, /styles\.weaponBar/);
  assert.doesNotMatch(me, /weaponBar: \{/);
  // The kills chip moved to the top bar; the backpack keeps its own
  // docked home at the row's right end.
  assert.match(me, /<span style=\{styles\.killsChip\}>⚔ \{campaign\.totalKills\}<\/span>/);
  assert.match(me, /<BackpackHud realm="middle-earth"[^>]*docked/);
  // The action column keeps its own mid-right home, untouched by
  // this pass — Strike/Jump/Sprint are NOT dock-bound.
  assert.match(me, /<div style=\{styles\.actionCol\}>/);
  assert.doesNotMatch(me, /dock\.bind\('strike'\)/);
  assert.doesNotMatch(me, /dock\.bind\('jump'\)/);
  assert.doesNotMatch(me, /dock\.bind\('sprint'\)/);
});
