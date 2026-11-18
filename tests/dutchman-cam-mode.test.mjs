/*
 * GHOST VOYAGE CAMERA TOGGLE tests — run with: node --test tests/dutchman-cam-mode.test.mjs
 * Covers lib/flying-dutchman/cam-mode.js (Merlin, Nov 18 2026: a zoom/camera
 * toggle in Ghost Voyage) plus static pins on app/flying-dutchman/page.jsx:
 * the orb exists, the pointer handler branches on the mode, zoom clamps,
 * and the toggle never strands the camera.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CAM_DIST_MIN, CAM_DIST_MAX, CAM_DIST_DEFAULT, CAM_ZOOM_PER_PX,
  ASHORE_CAM_BASE, clampCamDist, zoomDist, lookDrag, ashoreCamScale, nextCamMode,
} from '../lib/flying-dutchman/cam-mode.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const pageSrc = read('../app/flying-dutchman/page.jsx');

// ---------- Limits ----------
test('zoom limits: near 20, far 70, default 36', () => {
  assert.equal(CAM_DIST_MIN, 20);
  assert.equal(CAM_DIST_MAX, 70);
  assert.equal(CAM_DIST_DEFAULT, 36);
  assert.equal(clampCamDist(5), 20);
  assert.equal(clampCamDist(500), 70);
  assert.equal(clampCamDist(36), 36);
});

// ---------- Zoom mapping ----------
test('zoom mode: drag UP zooms in, drag DOWN zooms out', () => {
  assert.equal(zoomDist(36, -100), 28); // up 100 px -> 8 closer
  assert.equal(zoomDist(36, 100), 44); // down 100 px -> 8 farther
  assert.equal(zoomDist(36, -10), 35.2);
  assert.equal(zoomDist(36, 10), 36.8);
});

test('zoom clamps: a huge swipe never strands the camera outside [20, 70]', () => {
  assert.equal(zoomDist(36, -10000), CAM_DIST_MIN);
  assert.equal(zoomDist(36, 10000), CAM_DIST_MAX);
  assert.equal(zoomDist(20, -50), CAM_DIST_MIN);
  assert.equal(zoomDist(70, 50), CAM_DIST_MAX);
});

test('zoom sensitivity matches the pinch feel (0.08 per px)', () => {
  assert.equal(CAM_ZOOM_PER_PX, 0.08);
});

// ---------- Look (unchanged) ----------
test('look mode: horizontal swipe turns, vertical swipe tilts, pitch clamps', () => {
  const cam = { yaw: 1, pitch: 0.34 };
  const turned = lookDrag(cam, 100, 0);
  assert.equal(turned.yaw, 1 - 100 * 0.005);
  assert.equal(turned.pitch, 0.34);
  const tilted = lookDrag(cam, 0, 100);
  assert.equal(tilted.yaw, 1);
  assert.equal(tilted.pitch, 0.34 + 100 * 0.003);
  assert.equal(lookDrag({ yaw: 0, pitch: 1.0 }, 0, 10000).pitch, 1.1);
  assert.equal(lookDrag({ yaw: 0, pitch: 0.2 }, 0, -10000).pitch, 0.08);
});

// ---------- Ashore ----------
test('ashore chase camera: default zoom is exactly as before (scale 1)', () => {
  assert.equal(ASHORE_CAM_BASE, 16);
  assert.equal(ashoreCamScale(CAM_DIST_DEFAULT), 1);
  assert.equal(ashoreCamScale(20), 20 / 36);
  assert.equal(ashoreCamScale(70), 70 / 36);
  // Out-of-range distances clamp first, so the ashore camera never
  // collapses onto the walker or flies away.
  assert.equal(ashoreCamScale(5), 20 / 36);
  assert.equal(ashoreCamScale(500), 70 / 36);
});

// ---------- Toggle ----------
test('the toggle flips look <-> zoom and nothing else', () => {
  assert.equal(nextCamMode('look'), 'zoom');
  assert.equal(nextCamMode('zoom'), 'look');
});

// ---------- Static pins on page.jsx ----------
test('page wires the toggle: orb in the top-right cluster, mode on G.cam', () => {
  assert.match(pageSrc, /onClick=\{toggleCamMode\}/);
  assert.match(pageSrc, /camMode === 'zoom' \? '🔍' : '👁️'/);
  assert.match(pageSrc, /cam: \{ yaw: 0, pitch: 0\.34, dist: CAM_DIST_DEFAULT, mode: 'look' \}/);
  assert.match(pageSrc, /function toggleCamMode\(\)/);
  assert.match(pageSrc, /G\.cam\.mode = next/);
});

test('page branches the swipe on the mode: zoom zooms, look looks', () => {
  assert.match(pageSrc, /G\.cam\.mode === 'zoom'/);
  assert.match(pageSrc, /G\.cam\.dist = zoomDist\(G\.cam\.dist, dy\)/);
  assert.match(pageSrc, /const next = lookDrag\(G\.cam, dx, dy\)/);
  assert.match(pageSrc, /G\.cam\.yaw = next\.yaw;/);
  assert.match(pageSrc, /G\.cam\.pitch = next\.pitch;/);
});

test('pinch and wheel still zoom in both modes, through the same clamp', () => {
  assert.match(pageSrc, /clampCamDist\(G\.cam\.dist - \(d - pinchD\) \* CAM_ZOOM_PER_PX\)/);
  assert.match(pageSrc, /clampCamDist\(G\.cam\.dist \+ ev\.deltaY \* 0\.02\)/);
});

test('ashore camera scales with the zoom instead of staying fixed', () => {
  assert.match(pageSrc, /const s = ashoreCamScale\(G\.cam\.dist\)/);
  assert.match(pageSrc, /ASHORE_CAM_BASE \* s/);
});

test('the orb is a circle in the top-right cluster, clear of the bottom bar', () => {
  // h-11 w-11 rounded-full, sitting in the same flex row as the pause
  // orb — not in the bottom bar with the helm joystick or the cannons.
  const orbIdx = pageSrc.indexOf('onClick={toggleCamMode}');
  const pauseIdx = pageSrc.indexOf("aria-label={paused ? 'Resume' : 'Pause'}");
  const bottomBarIdx = pageSrc.indexOf('Bottom bar: one flex row');
  assert.ok(orbIdx > 0 && pauseIdx > 0 && bottomBarIdx > 0);
  assert.ok(orbIdx < pauseIdx, 'camera orb sits left of the pause orb');
  assert.ok(orbIdx < bottomBarIdx, 'camera orb is in the top bar, not the bottom bar');
});
