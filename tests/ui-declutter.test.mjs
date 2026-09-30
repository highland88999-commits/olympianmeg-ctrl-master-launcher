// tests/ui-declutter.test.mjs
// UI declutter (2026-09-29): launcher shell declutter + transport controls.
//
// Static source assertions for Merlin's 4 directives:
//   1. Transport controls: slim prev/next row directly above the collapsed
//      radio bar (RadioBar.jsx), safe-area aware.
//   2. Floating video button = the single program home; no other program
//      entry points in the shell (page.jsx).
//   3. Homepage restored toward the original composition (no portal gate
//      field; orbit rings visual-only).
//   4. Portals declutter: SpacePortalGates removed from the interface; the
//      original launch-travel portal effects stay.
// Plus: the waste-extraction FEED/SIGNAL label collision fix.
//
// Run: node --test tests/ui-declutter.test.mjs  (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('app/page.jsx', 'utf8');
// Phase 2b (2026-09-30): the home 3D scene was code-split out of app/page.jsx
// into components/HomeScene.jsx. Scene assertions read the scene file.
const scene = readFileSync('components/HomeScene.jsx', 'utf8');
const radioBar = readFileSync('components/radio/RadioBar.jsx', 'utf8');
const rings = readFileSync('components/GodOrbitRings.jsx', 'utf8');
const waste = readFileSync('app/waste-extraction/page.jsx', 'utf8');

test('1. transport strip: prev/next buttons exist above the collapsed bar', () => {
  assert.ok(radioBar.includes("aria-label=\"Previous track\""), 'previous button present');
  assert.ok(radioBar.includes("aria-label=\"Next track\""), 'next button present');
  assert.ok(radioBar.includes('Track transport'), 'transport group labeled');
});

test('1. transport strip uses the real prev control from the radio provider', () => {
  assert.ok(radioBar.includes('next, prev, toggleShuffle'), 'prev destructured from useRadio');
  assert.ok(radioBar.includes('onClick={prev}'), 'previous button wired to prev');
});

test('1. transport strip renders only when the library sheet is closed', () => {
  assert.ok(radioBar.includes('{!sheetOpen && ('), 'strip hidden while sheet open');
});

test('1. transport strip sits above the safe-area-padded bar', () => {
  const stripIdx = radioBar.indexOf('Track transport');
  const barIdx = radioBar.indexOf('COLLAPSED — slim bar');
  assert.ok(stripIdx > -1 && barIdx > -1 && stripIdx < barIdx,
    'strip is positioned above the collapsed bar in the source order');
  assert.ok(radioBar.includes("paddingBottom: 'env(safe-area-inset-bottom)'"),
    'bar keeps safe-area clearance below the strip');
});

test('2/4. portal gate field is gone from the interface', () => {
  assert.ok(!page.includes('SpacePortalGates'), 'no SpacePortalGates in page.jsx');
  assert.ok(!page.includes("from '@/components/SpacePortalGates'"), 'no portal import in page.jsx');
});

test('2/4. launch-travel portals (the original portals) are preserved', () => {
  assert.ok(scene.includes('portalTex={kingHoleTex}'), 'travel portal texture still wired');
  assert.ok(scene.includes('payloadTex={payloadTex}'), 'travel payload portal still wired');
});

test('2. orbit rings are visual-only: no launcher passed from the shell', () => {
  assert.ok(scene.includes('<GodOrbitRings satIndex={satIndex} />'),
    'rings render without canLaunch/onLaunch');
});

test('2. orbit nodes never launch without an explicit launcher', () => {
  assert.ok(rings.includes('if (canLaunch && onLaunch) onLaunch(sat.route, satKey);'),
    'node launch guarded by canLaunch && onLaunch');
});

test('2. floating video button menu is the single program launcher', () => {
  assert.ok(page.includes('<SatelliteMenu'), 'satellite menu rendered from the floating button');
  assert.ok(page.includes('onLaunch={(route, key, pos) => launchPocketUniverse(route, key, pos)}'),
    'menu launches through the one menu-to-satellite function');
});

test('2. stake.com native ad inventory is untouched', () => {
  assert.ok(page.includes('onLaunchExternal'), 'tower ad panels still wired');
});

test('5. waste-extraction FEED/SIGNAL labels share one row, feed name truncates', () => {
  assert.ok(waste.includes('justify-between gap-2'), 'labels in a single spaced row');
  assert.ok(waste.includes('min-w-0 truncate'), 'feed name truncates instead of colliding');
  assert.ok(waste.includes('shrink-0'), 'signal pill never shrinks');
  assert.ok(waste.includes('FEED: {feed.name}'), 'feed label kept');
  assert.ok(waste.includes('SIM SIGNAL {signal}%'), 'signal label kept');
});
