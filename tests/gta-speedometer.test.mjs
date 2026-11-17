// tests/gta-speedometer.test.mjs — GTA speedometer: clamped + smoothed.
// Run: node tests/gta-speedometer.test.mjs (from the repo root).
// Sweep item 9 (2026-11-16): all three GTA pages fed raw
// |hud.vehicle.speed| × 3.6 into Speedometer every animation frame and
// the component rendered Math.round of whatever it was handed — no clamp,
// no smoothing (same wild-needle problem Earth 1 had). The fix lives in
// the one shared Speedometer in lib/gta/hud.jsx, so the call sites are
// unchanged. This pins the clamp/smoothing numbers and the helper's
// behaviour, plus source-level checks that the component smooths the
// displayed value and the three pages still feed it through hud.jsx.
//
// lib/gta/hud.jsx is JSX with React imports, so it cannot be imported
// by node directly: esbuild bundles it (React bundled in, no bare
// imports left) to a temp file, which is then imported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const bundlePath = join(tmpdir(), `gta-hud-speedo-${process.pid}.mjs`);

buildSync({
  entryPoints: [join(repo, 'lib/gta/hud.jsx')],
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  platform: 'browser',
  outfile: bundlePath,
});

test.after(() => { rmSync(bundlePath, { force: true }); });

const hud = await import(bundlePath);
const {
  GTA_SPEEDO_TOP_KMH,
  GTA_SPEEDO_SMOOTH_TAU_MS,
  GTA_SPEEDO_MAX_SLEW_KMH_PER_S,
  GTA_SPEEDO_SNAP_KMH,
  smoothSpeedoKmh,
  Speedometer,
} = hud;

const near = (actual, expected, tol, label) => {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: got ${actual}, want ${expected} ± ${tol}`);
};

test('clamp/smoothing constants mirror Earth 1 needle numbers', () => {
  // Fleet top: sports maxSpeed 48 m/s × 3.6 (fastest of the four GTA
  // types — sedan 115.2, taxi 122.4, truck 86.4 km/h).
  assert.equal(GTA_SPEEDO_TOP_KMH, 172.8);
  assert.equal(GTA_SPEEDO_SMOOTH_TAU_MS, 400);
  assert.equal(GTA_SPEEDO_MAX_SLEW_KMH_PER_S, 500);
  assert.equal(GTA_SPEEDO_SNAP_KMH, 1);
});

test('Speedometer is exported from the shared HUD module', () => {
  assert.equal(typeof Speedometer, 'function');
});

test('raw speed above the fleet top is clamped before smoothing', () => {
  // 0 → 9999 in 250 ms: clamped to 172.8, exp step
  // 172.8 × (1 − e^(−250/400)) ≈ 80.3; slew cap 125 does not bind.
  near(smoothSpeedoKmh(0, 9999, 250, 172.8), 80.3, 0.5, 'clamped first step');
  // Repeated steps toward a huge raw value converge on the top, never past it.
  let v = 0;
  for (let i = 0; i < 200; i++) v = smoothSpeedoKmh(v, 9999, 100, 172.8);
  assert.equal(v, 172.8);
});

test('negative and non-finite raw speeds read as 0, never negative', () => {
  assert.equal(smoothSpeedoKmh(50, -20, 100, 172.8) < 50, true);
  let v = 50;
  for (let i = 0; i < 200; i++) v = smoothSpeedoKmh(v, -20, 100, 172.8);
  assert.equal(v, 0);
  let w = 50;
  for (let i = 0; i < 200; i++) w = smoothSpeedoKmh(w, NaN, 100, 172.8);
  assert.equal(w, 0);
});

test('slew cap bounds how fast the needle can travel', () => {
  // Full-dial swing in one 1000 ms step: exp step would be ~1836 km/h
  // toward a 2000 km/h top, but the 500 km/h/s cap holds it to 500.
  assert.equal(smoothSpeedoKmh(0, 9999, 1000, 2000), 500);
  // A 16 ms frame from the top can drop at most 8 km/h.
  const down = smoothSpeedoKmh(172.8, 0, 16, 172.8);
  assert.ok(down >= 164.8, `16 ms drop too far: ${down}`);
  assert.ok(down < 172.8, `needle did not move: ${down}`);
});

test('needle snaps within 1 km/h of the target', () => {
  assert.equal(smoothSpeedoKmh(100, 100.5, 100, 172.8), 100.5);
  assert.equal(smoothSpeedoKmh(100, 99.5, 100, 172.8), 99.5);
});

test('non-positive dt holds the previous reading', () => {
  assert.equal(smoothSpeedoKmh(80, 172.8, 0, 172.8), 80);
  assert.equal(smoothSpeedoKmh(80, 172.8, -50, 172.8), 80);
});

test('invalid top speed falls back to the fleet top', () => {
  near(smoothSpeedoKmh(0, 9999, 250, 0), 80.3, 0.5, 'zero top');
  near(smoothSpeedoKmh(0, 9999, 250, NaN), 80.3, 0.5, 'NaN top');
  near(smoothSpeedoKmh(0, 9999, 250), 80.3, 0.5, 'default top');
});

// ---- Source-level checks: fix in the shared component, call sites untouched ----

const hudSrc = readFileSync(join(repo, 'lib/gta/hud.jsx'), 'utf8');

test('Speedometer renders the smoothed value, never the raw prop', () => {
  assert.ok(hudSrc.includes('Math.round(display)'), 'renders smoothed display value');
  assert.ok(!hudSrc.includes('Math.round(speedKmh)'), 'raw speedKmh must not be rendered');
  assert.ok(hudSrc.includes('smoothSpeedoKmh(displayRef.current, targetRef.current'),
    'rAF loop steps the display through the smoother');
  assert.ok(hudSrc.includes('requestAnimationFrame(tick)'), 'smoothing runs on rAF');
});

test('all three GTA pages feed the shared Speedometer (call sites unchanged)', () => {
  for (const page of [
    'app/mega-city/page.jsx',
    'app/truman/page.jsx',
    'app/babel/page-gta.jsx',
  ]) {
    const src = readFileSync(join(repo, page), 'utf8');
    assert.ok(src.includes("from '@/lib/gta/hud'"), `${page}: still imports HUD from lib/gta/hud`);
    assert.ok(src.includes('<Speedometer speedKmh={Math.abs(hud.vehicle.speed) * 3.6} />'),
      `${page}: raw feed reaches the shared component, which now clamps + smooths it`);
  }
});
