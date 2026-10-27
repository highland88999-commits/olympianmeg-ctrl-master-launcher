// Fortress of Solitude — video-QA structural guards (2026-10-26).
//
// These pin the fixes for Merlin's phone report, which no node test can
// exercise directly (they live in JSX, not in pure logic):
//   1. Crystal taps: the menu cluster box itself must NEVER take taps —
//      only its buttons do — or its invisible collapsed box swallows taps
//      on the low crystals. The cluster sits top-right (proven visible in
//      every frame of his video), never bottom-left where the browser's
//      bottom bar pushed it off-screen.
//   2. Tier scroll: the StorageTiers overlay must NOT center its content
//      (flex items-center + overflow-y-auto clips the TOP of a taller
//      panel where no scroll can reach it). It starts at the top.
//   3. Floor drag: the floor disc + crystal ring share one group and the
//      drag path (ground-plane delta, controls parked during the drag)
//      must stay wired.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/fortress-of-solitude/page.tsx', import.meta.url), 'utf8');
const tiers = readFileSync(new URL('../components/fortress/StorageTiers.jsx', import.meta.url), 'utf8');

test('menu cluster box never takes taps; only its buttons do', () => {
  // The cluster wrapper is pointer-events-none; the toggle row takes taps.
  assert.match(page, /fixed top-20 right-6 z-20 flex flex-col items-end gap-3 pointer-events-none/);
  assert.match(page, /<div className="flex gap-3 pointer-events-auto">/);
  // The open list takes taps; the closed list takes none (no dead zone).
  assert.match(page, /scale-100 opacity-100 pointer-events-auto/);
  assert.match(page, /scale-0 opacity-0 pointer-events-none/);
  // No bottom-left menu cluster remains.
  assert.doesNotMatch(page, /fixed bottom-\[max\(1\.5rem,env\(safe-area-inset-bottom\)\)\] left-6/);
});

test('tier overlay starts at the top instead of centering (top-clip bug)', () => {
  assert.match(tiers, /fixed inset-0 z-40 flex items-start justify-center/);
  assert.doesNotMatch(tiers, /fixed inset-0 z-40 flex items-center justify-center/);
});

test('floor disc + crystal ring share one group and the drag path is wired', () => {
  assert.match(page, /floorGroup\.add\(carouselGroup\)/);
  assert.match(page, /floorGroup\.add\(floorMesh\)/);
  assert.match(page, /floorDragRef/);
  assert.match(page, /intersectPlane\(plane, point\)/);
  assert.match(page, /controls\.enabled = false/);
  assert.match(page, /floorGroup\.position\.set\(/);
});

test('tap math uses the canvas rect, not the window', () => {
  assert.match(page, /getBoundingClientRect\(\)/);
  assert.match(page, /canvasMouse\(e\)/);
});
