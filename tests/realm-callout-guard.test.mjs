// tests/realm-callout-guard.test.mjs — Headless tests for the realm-wide
// iOS hold-to-select kill (Merlin's 2026-10-03 scope change: ALL realms,
// not just Tron).
// Run: node tests/realm-callout-guard.test.mjs (from the repo root).
// No browser, no network — asserts on the pure detection math in
// lib/realm-surface.js plus source-level checks that the guard is mounted
// once in the root layout, the CSS exists, and real realm routes render
// the full-viewport canvases the guard detects.
//
// Merlin's directives under test:
//   1. Implemented ONCE in the shared layer (root layout + global CSS) —
//      no per-realm hand-edits.
//   2. A "realm/game view" is recognized structurally: a canvas covering
//      >=70% of the viewport. Chat, forms, stores, text UI keep selection.
//   3. inputs / textareas / [data-selectable] ALWAYS keep native selection,
//      even inside a realm.
//   4. contextmenu (iOS long-press callout) + selectstart suppressed in
//      realms only. Pointer/touch gestures, tilt, gyro, and the iOS
//      first-tap motion-permission listener are untouched (different events).

import { readFileSync, readdirSync } from 'fs';
import assert from 'node:assert/strict';
import {
  REALM_SURFACE_CLASS,
  REALM_CANVAS_COVERAGE,
  REALM_SELECTABLE_SELECTORS,
  canvasCoversViewport,
  isSelectableTarget,
} from '../lib/realm-surface.js';

let pass = 0;
function ok(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

const SRC = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const guardSrc = SRC('../components/RealmCalloutGuard.jsx');
const layoutSrc = SRC('../app/layout.jsx');
const cssSrc = SRC('../app/globals.css');
const libSrc = SRC('../lib/realm-surface.js');

// --- constants ---

ok('surface class + coverage threshold are exported and sane', () => {
  assert.strictEqual(REALM_SURFACE_CLASS, 'realm-surface');
  assert.strictEqual(REALM_CANVAS_COVERAGE, 0.7);
  assert.ok(REALM_SELECTABLE_SELECTORS.includes('input'));
  assert.ok(REALM_SELECTABLE_SELECTORS.includes('[data-selectable]'));
});

// --- canvasCoversViewport ---

const IPHONE = { w: 390, h: 844 }; // Merlin's iPhone viewport, CSS px

ok('full-viewport canvas marks the page as a realm', () => {
  assert.strictEqual(
    canvasCoversViewport([{ width: 390, height: 844 }], IPHONE.w, IPHONE.h),
    true
  );
});

ok('small decorative canvas does NOT mark the page (chat/forms keep selection)', () => {
  assert.strictEqual(
    canvasCoversViewport([{ width: 200, height: 120 }], IPHONE.w, IPHONE.h),
    false
  );
});

ok('no canvases -> not a realm', () => {
  assert.strictEqual(canvasCoversViewport([], IPHONE.w, IPHONE.h), false);
});

ok('one qualifying canvas among several still counts', () => {
  assert.strictEqual(
    canvasCoversViewport(
      [{ width: 50, height: 50 }, { width: 390, height: 844 }],
      IPHONE.w,
      IPHONE.h
    ),
    true
  );
});

ok('exactly at the 70% threshold counts', () => {
  // 390*844*0.7 = 230412; use a rect of exactly that area.
  const area = IPHONE.w * IPHONE.h * 0.7;
  assert.strictEqual(
    canvasCoversViewport([{ width: area, height: 1 }], IPHONE.w, IPHONE.h),
    true
  );
});

ok('just under the threshold does not count', () => {
  const area = IPHONE.w * IPHONE.h * 0.7 - 1;
  assert.strictEqual(
    canvasCoversViewport([{ width: area, height: 1 }], IPHONE.w, IPHONE.h),
    false
  );
});

ok('garbage inputs never throw and never mark', () => {
  assert.strictEqual(canvasCoversViewport(null, IPHONE.w, IPHONE.h), false);
  assert.strictEqual(canvasCoversViewport('x', IPHONE.w, IPHONE.h), false);
  assert.strictEqual(canvasCoversViewport([{ width: NaN, height: 10 }], IPHONE.w, IPHONE.h), false);
  assert.strictEqual(canvasCoversViewport([{ width: 390, height: 844 }], 0, 0), false);
  assert.strictEqual(canvasCoversViewport([{ width: 390, height: 844 }], NaN, 844), false);
});

// --- isSelectableTarget ---

const fakeTarget = (matches) => ({ closest: () => matches });

ok('inputs keep native selection inside a realm', () => {
  assert.strictEqual(isSelectableTarget(fakeTarget(true)), true);
});

ok('plain game UI targets do not', () => {
  assert.strictEqual(isSelectableTarget(fakeTarget(null)), false);
});

ok('odd targets never throw and default to non-selectable', () => {
  assert.strictEqual(isSelectableTarget(null), false);
  assert.strictEqual(isSelectableTarget(undefined), false);
  assert.strictEqual(isSelectableTarget({}), false);
  assert.strictEqual(
    isSelectableTarget({ closest: () => { throw new Error('x'); } }),
    false
  );
});

// --- guard component: mounted once, wired right ---

ok('guard is a client component driven by the route', () => {
  assert.ok(guardSrc.includes("'use client'"), 'use client');
  assert.ok(guardSrc.includes('usePathname'), 're-evaluates on navigation');
});

ok('guard toggles the surface class on body (add AND remove)', () => {
  assert.ok(guardSrc.includes('classList.toggle(REALM_SURFACE_CLASS'), 'toggle on detect');
  assert.ok(guardSrc.includes('classList.remove(REALM_SURFACE_CLASS)'), 'remove on cleanup');
  assert.ok(guardSrc.includes('classList.contains(REALM_SURFACE_CLASS)'), 'gated suppression');
});

ok('guard suppresses contextmenu + selectstart, gated on selectable targets', () => {
  assert.ok(guardSrc.includes("addEventListener('contextmenu'"), 'contextmenu guarded');
  assert.ok(guardSrc.includes("addEventListener('selectstart'"), 'selectstart guarded');
  assert.ok(guardSrc.includes('isSelectableTarget(e.target)'), 'selectable targets exempt');
  assert.ok(guardSrc.includes("removeEventListener('contextmenu'"), 'cleanup contextmenu');
  assert.ok(guardSrc.includes("removeEventListener('selectstart'"), 'cleanup selectstart');
});

ok('guard re-checks when canvases mount late (3D engines)', () => {
  assert.ok(guardSrc.includes('MutationObserver'), 'observes late canvas mounts');
  assert.ok(guardSrc.includes('requestAnimationFrame'), 'debounced measurement');
});

ok('guard never touches gesture/sensor events', () => {
  // Strip comments first — the header documents which events are NOT touched.
  const code = guardSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
  assert.ok(!code.includes('pointerdown'), 'no pointer interception');
  assert.ok(!code.includes('deviceorientation'), 'no sensor interception');
  assert.ok(!code.includes('touchstart'), 'no touch interception');
});

// --- layout: mounted exactly once at the root ---

ok('root layout mounts RealmCalloutGuard once', () => {
  assert.ok(layoutSrc.includes("import RealmCalloutGuard from '@/components/RealmCalloutGuard'"), 'imported');
  const mounts = (layoutSrc.match(/<RealmCalloutGuard \/>/g) || []).length;
  assert.strictEqual(mounts, 1, `mounted ${mounts}x, want exactly 1`);
});

// --- CSS: the one shared definition ---

ok('globals.css defines the realm-surface treatment once', () => {
  assert.ok(cssSrc.includes('.realm-surface'), 'class defined');
  assert.ok(cssSrc.includes('-webkit-touch-callout: none'), 'callout killed');
  assert.ok(cssSrc.includes('-webkit-user-select: none'), 'webkit selection killed');
  assert.ok(cssSrc.includes('user-select: none'), 'selection killed');
});

ok('CSS always exempts inputs and selectable regions', () => {
  const rule = cssSrc.slice(cssSrc.indexOf('.realm-surface'));
  assert.ok(rule.includes(':not(input)'), 'input exempt');
  assert.ok(rule.includes(':not(textarea)'), 'textarea exempt');
  assert.ok(rule.includes(':not([contenteditable])'), 'contenteditable exempt');
  assert.ok(rule.includes(':not([data-selectable])'), '[data-selectable] exempt');
});

// --- real-realm coverage: the guard will detect these ---

const REALMS = [
  'shadow-realm', // Tron realm (Merlin's screenshot)
  'luge',
  'neon-racer',
  'zeus-v-hades',
  'raptor-rush',
  'orbital-ascent',
  'abyssal-voyage',
];

ok('spot-checked realms render canvases the guard detects (no per-realm edits needed)', () => {
  const missing = [];
  for (const r of REALMS) {
    let found = false;
    try {
      const files = readdirSync(new URL(`../app/${r}/`, import.meta.url));
      for (const f of files) {
        if (!/\.(jsx|js|tsx|ts)$/.test(f)) continue;
        const src = SRC(`../app/${r}/${f}`);
        if (/<Canvas|THREE\.WebGLRenderer|<canvas/.test(src)) {
          found = true;
          break;
        }
      }
    } catch {
      /* route dir unreadable */
    }
    if (!found) missing.push(r);
  }
  assert.deepStrictEqual(missing, [], `realms without a canvas: ${missing.join(', ')}`);
});

ok('Tron realm keeps its explicit per-page hardening (defense in depth)', () => {
  const pageSrc = SRC('../app/shadow-realm/page.jsx');
  assert.ok(pageSrc.includes('WebkitTouchCallout'), 'inline callout kill kept');
  assert.ok(pageSrc.includes('onContextMenu'), 'inline contextmenu guard kept');
});

console.log(`\n${pass} passed`);
