// tests/earth-cracks.test.mjs — the 2026-10-26 late-night crack
// rework, pinned in one place (Merlin watched the TRON grid on
// his phone and sent three corrections, then two refinements).
//
//   1. WORLD-LOCKED: the lines must NOT follow the car. The
//      crack field is a pure function of planet-fixed
//      direction — the shader builds it from the grid group's
//      planet-local transform (uGroupPos/uGroupQuat), never
//      from player-relative world vectors. Pins: the JS field
//      takes only the fragment's own coords (arity 2, no
//      player/time argument), and the shader source contains
//      no player-relative origin, no grid fract, no time.
//   2. JAGGED, NOT TRON: domain-warped ridged noise —
//      irregular, branching fractures. Pins: the field varies
//      (cracks exist and gaps exist) and is NOT periodic at
//      any small spacing, including the old 50 m grid spacing.
//   3. STATIC: the cracks do NOT eat, spread, grow, consume or
//      move (his explicit correction). Pins: no time input to
//      the field in JS or GLSL; only the glow color cycles.
//   4. GLOW, VERY SUBTLE BUT CLEARLY VISIBLE: low brightness
//      with a sharp thin core (legible contrast on dark
//      ground) and a whisper halo; the scene light is far
//      dimmer than the old glow and the street lantern. Pins:
//      the exact numbers, so he can judge the balance.
//   5. ORBIT: the same crack field wraps the globe (not
//      lat/lon lines). Pin: the orbit shader reads the same
//      crackField from its own local direction.
//
// The JS field and the GLSL field share the algorithm shape
// (domain-warped ridged fbm) but different hashes, so exact
// VALUES differ between them; the properties pinned here are
// what both guarantee.
//
// Run: node tests/earth-cracks.test.mjs (from the repo root).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CRACK_PALETTE,
  CRACK_COLOR_HOLD_SECONDS,
  CRACK_COLOR_FADE_SECONDS,
  CRACK_CORE_ALPHA_STREET,
  CRACK_CORE_ALPHA_ORBIT,
  CRACK_HALO_ALPHA,
  CRACK_GLOW_INTENSITY,
  crackColorAt,
  crackValueAt,
} from '../lib/earth/earth-cracks.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

check('color cycle holds 7.5 s, fades 2.5 s, loops the palette', () => {
  assert.equal(CRACK_COLOR_HOLD_SECONDS + CRACK_COLOR_FADE_SECONDS, 10, 'one color per 10 s');
  const at = (ms) => crackColorAt(ms);
  const hex = (c) => [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  assert.equal(hex(at(0)), CRACK_PALETTE[0].slice(1), 't=0 is palette[0]');
  assert.equal(hex(at(7400)), CRACK_PALETTE[0].slice(1), 'still holding at 7.4 s');
  assert.equal(hex(at(10000)), CRACK_PALETTE[1].slice(1), 'fully faded to palette[1] at 10 s');
  assert.equal(hex(at(10000 * CRACK_PALETTE.length)), CRACK_PALETTE[0].slice(1), 'cycle loops');
});

check('crack field is deterministic and takes only the fragment coords', () => {
  // Arity 2 = (lat, lon) only. There is deliberately no player
  // position or time argument: the cracks cannot depend on
  // either, which is the world lock and the static rule.
  assert.equal(crackValueAt.length, 2, 'crackValueAt takes (lat, lon) only');
  assert.equal(crackValueAt(53.5, -113.5), crackValueAt(53.5, -113.5), 'same spot, same cracks');
  assert.equal(crackValueAt(0, 0), crackValueAt(0, 0), 'same spot, same cracks (equator)');
  assert.equal(crackValueAt(-33.9, 151.2), crackValueAt(-33.9, 151.2), 'same spot, same cracks (Sydney)');
});

check('cracks exist and vary — thin spaced lines, mostly clear ground', () => {
  // Global grid: the core (ridge value above 0.98, the shader's
  // core band at width 0.02) must cover a small fraction —
  // spaced-out fractures, never a web — while most ground stays
  // uncracked, and some field values fall far from any ridge.
  const values = [];
  for (let lat = -80; lat <= 80; lat += 2) {
    for (let lon = -180; lon < 180; lon += 4) values.push(crackValueAt(lat, lon));
  }
  const coreFrac = values.filter((v) => v > 0.98).length / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  assert.ok(max > 0.98, `ridge lines exist (max ${max.toFixed(3)})`);
  assert.ok(min < 0.35, `some field values fall far from ridges (min ${min.toFixed(3)})`);
  assert.ok(coreFrac > 0.03 && coreFrac < 0.12, `core is spaced, not webby (core fraction ${coreFrac.toFixed(3)})`);
  assert.ok(1 - coreFrac > 0.85, 'most ground stays uncracked');
});

check('crack field is NOT a grid — no periodicity at any small spacing', () => {
  // Sample along a parallel at fine steps, then check that
  // shifting by any small period does NOT reproduce the
  // pattern. A true grid would repeat exactly at its spacing.
  const samples = [];
  for (let i = 0; i < 400; i++) samples.push(crackValueAt(20, -100 + i * 0.05));
  for (let period = 1; period <= 40; period++) {
    let equal = 0;
    for (let i = 0; i + period < samples.length; i++) {
      if (samples[i] === samples[i + period]) equal += 1;
    }
    assert.ok(
      equal / (samples.length - period) < 0.05,
      `period ${period} must not repeat the pattern (equal fraction ${(equal / (samples.length - period)).toFixed(3)})`,
    );
  }
  // The old 50 m grid spacing (0.00045° of longitude) must not
  // reproduce the pattern either.
  let equal50 = 0;
  const n = 200;
  for (let i = 0; i < n; i++) {
    const lon = -100 + i * 0.01;
    if (crackValueAt(20, lon) === crackValueAt(20, lon + 0.00045)) equal50 += 1;
  }
  assert.ok(equal50 / n < 0.05, `old 50 m spacing must not repeat (equal fraction ${(equal50 / n).toFixed(3)})`);
});

check('glow calibration: very subtle, but the core stays legible', () => {
  // Scene light: 0.0002 — 1/3 of the old TRON glow (0.0006)
  // and ~1/4 of the street lantern (0.0009). Barely-there seep.
  assert.equal(CRACK_GLOW_INTENSITY, 0.0002, 'glow light is a faint seep');
  assert.ok(CRACK_GLOW_INTENSITY > 0, 'glow light still exists (not dimmed away)');
  // Crack core: 0.5 peak — low brightness, but a hard-edged
  // core, so the cracks read clearly against dark ground.
  assert.equal(CRACK_CORE_ALPHA_STREET, 0.5, 'street core is low but legible');
  assert.equal(CRACK_CORE_ALPHA_ORBIT, 0.35, 'orbit core is fainter (whole globe visible)');
  assert.equal(CRACK_HALO_ALPHA, 0.05, 'halo is a whisper');
  assert.ok(CRACK_CORE_ALPHA_STREET > CRACK_HALO_ALPHA, 'core dominates the halo (sharp definition)');
});

check('shader builds cracks from planet-local coords, never the player', () => {
  const src = read('components/earth/EarthCracks.jsx');
  assert.ok(src.includes('uGroupPos'), 'street shader takes the group planet-local position');
  assert.ok(src.includes('uGroupQuat'), 'street shader takes the group planet-local rotation');
  assert.ok(src.includes('normalize(vPlanetLocal)'), 'crack field reads planet-local direction');
  assert.ok(src.includes('crackField'), 'shared jagged crack field present');
  assert.ok(!src.includes('uOrigin'), 'no player-relative origin (the old follow bug)');
  assert.ok(!src.includes('uEast'), 'no player-relative east vector');
  assert.ok(!src.includes('uNorth'), 'no player-relative north vector');
  assert.ok(!src.includes('fract(le'), 'no grid fract computation');
  assert.ok(!src.includes('uTime'), 'no time input to the crack pattern (static cracks)');
  assert.ok(!src.includes('earth2'), 'cracks must not touch Earth 2 code');
});

check('orbit shader wraps the same crack field on the globe', () => {
  const src = read('components/earth/EarthCracks.jsx');
  assert.ok(src.includes('EarthOrbitCracks'), 'orbit component exists');
  assert.ok(src.includes('normalize(vLocal)'), 'orbit reads its own local direction');
  assert.ok(!src.includes('TRON_ORBIT_SPACING_DEG'), 'no lat/lon grid spacing left');
  assert.ok(!src.includes('uSpacingRad'), 'no lat/lon grid uniform left');
});

check('old TRON files are gone', () => {
  assert.throws(() => read('lib/earth/tron-grid.js'), 'tron-grid.js must be deleted');
  assert.throws(() => read('components/earth/EarthTronGrid.jsx'), 'EarthTronGrid.jsx must be deleted');
});

console.log(`earth-cracks: ${passed} checks passed`);
