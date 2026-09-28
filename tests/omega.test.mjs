// Tests for the /omega module (The OMEGA Arch).
// Run with: node --test tests/omega.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  mulberry32, createStarfield, stepStars, createVortex, stepVortex,
  omegaFootOffsets, omegaLayout, nextArchState, ARCH_STATES, STATE_HINT,
  stateZoom, orbitOffset,
} from '../app/omega/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app', 'omega');
const read = (f) => readFileSync(join(appDir, f), 'utf8');

// --- Seeded RNG -------------------------------------------------------------
test('mulberry32 is deterministic per seed', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
  const c = mulberry32(43);
  assert.notEqual(a(), c());
});

// --- Starfield ---------------------------------------------------------------
test('createStarfield returns the requested count inside bounds', () => {
  const stars = createStarfield(7, 50, 800, 600);
  assert.equal(stars.length, 50);
  for (const s of stars) {
    assert.ok(s.x >= 0 && s.x <= 800);
    assert.ok(s.y >= 0 && s.y <= 600);
    assert.ok(s.r > 0);
  }
});

test('createStarfield is deterministic for the same seed', () => {
  const a = createStarfield(9, 20, 800, 600);
  const b = createStarfield(9, 20, 800, 600);
  assert.deepEqual(a, b);
});

test('stepStars advances twinkle phases', () => {
  const stars = createStarfield(9, 5, 800, 600);
  const before = stars.map((s) => s.phase);
  stepStars(stars, 1);
  stars.forEach((s, i) => assert.ok(s.phase > before[i]));
});

// --- Arch geometry -------------------------------------------------------------
test('omegaFootOffsets matches the source torus endpoint math', () => {
  const r = 80;
  const { offsetX, offsetY } = omegaFootOffsets(r);
  assert.ok(Math.abs(offsetX - r * Math.cos(-Math.PI * 0.3)) < 1e-9);
  assert.ok(Math.abs(offsetY - r * Math.sin(-Math.PI * 0.3)) < 1e-9);
  assert.ok(offsetY < 0, 'gap endpoints sit below center');
  assert.ok(offsetX > 0);
});

test('omegaLayout places two feet and a centered arch', () => {
  const L = omegaLayout(1000, 800);
  assert.equal(L.feet.length, 2);
  assert.ok(L.centerX === 500);
  assert.ok(L.radius > 0 && L.tube > 0);
  assert.ok(L.baseY > L.centerY, 'arch center is above the floor line');
  const xs = L.feet.map((f) => f.x).sort((a, b) => a - b);
  assert.ok(xs[0] < 500 && xs[1] > 500, 'feet flank the center');
});

// --- Vortex ---------------------------------------------------------------------
test('createVortex particles live inside unit radius', () => {
  const parts = createVortex(100, 3);
  assert.equal(parts.length, 100);
  for (const p of parts) assert.ok(p.radius >= 0.15 && p.radius <= 1.0);
});

test('stepVortex swirls angles forward and pulls inward', () => {
  const parts = [{ angle: 0, radius: 0.9, speed: 1, size: 2, hue: 200 }];
  stepVortex(parts, 1, 1);
  assert.ok(parts[0].angle > 0);
  assert.ok(parts[0].radius < 0.9);
});

// --- State machine ----------------------------------------------------------------
test('ARCH_STATES covers the full cinematic loop', () => {
  assert.deepEqual(ARCH_STATES, ['LANDING', 'OUTSIDE', 'ENTERING', 'INSIDE']);
});

test('nextArchState walks the loop and returns', () => {
  assert.equal(nextArchState('LANDING'), 'OUTSIDE');
  assert.equal(nextArchState('OUTSIDE'), 'ENTERING');
  assert.equal(nextArchState('ENTERING'), 'INSIDE');
  assert.equal(nextArchState('INSIDE'), 'OUTSIDE');
  assert.equal(nextArchState('bogus'), 'LANDING');
});

test('every state has a hint', () => {
  for (const s of ARCH_STATES) assert.ok(STATE_HINT[s] && STATE_HINT[s].length > 3);
});

test('stateZoom grows through the approach', () => {
  assert.equal(stateZoom('LANDING', 0), 1);
  assert.equal(stateZoom('OUTSIDE', 0), 1);
  assert.ok(stateZoom('ENTERING', 0.5) > 1 && stateZoom('ENTERING', 0.5) < stateZoom('INSIDE', 0));
});

test('orbitOffset is bounded and periodic-ish', () => {
  const w = 1000;
  for (const t of [0, 5, 17, 100]) {
    assert.ok(Math.abs(orbitOffset(t, w)) <= w * 0.06 + 1e-9);
  }
});

// --- Static security scan ----------------------------------------------------------
test('no telemetry, keys, or external requests in module source', () => {
  const files = readdirSync(appDir).filter((f) => f.endsWith('.js') || f.endsWith('.jsx'));
  assert.ok(files.length >= 2, 'engine.js + page.jsx expected');
  const forbidden = [
    'supabase', 'ipify', 'central_telemetry', 'logBrainAction', 'connected_repos',
    'track_ping', 'brain-uplink', 'eyJhbGciOi', 'api_key', 'apikey',
    'http://', 'https://', 'cdn.jsdelivr', 'catbox', 'file.garden', 'wikimedia',
    '<iframe', '<video', 'mailto:',
  ];
  for (const f of files) {
    const src = read(f);
    for (const pat of forbidden) {
      assert.ok(!src.toLowerCase().includes(pat.toLowerCase()),
        `${f} must not contain "${pat}"`);
    }
  }
});

test('page mentions the offline build and uses reduced-motion', () => {
  const src = read('page.jsx');
  assert.ok(src.includes('prefers-reduced-motion'));
  assert.ok(src.includes('OFFLINE'));
});
