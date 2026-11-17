// tests/earth1-aether.test.mjs — Pins for the Earth 1 aether
// shard collect fix (Merlin, 2026-11-16, sweep item 5): the
// interior shard pickup in components/EarthAssets.jsx measured
// the walker-to-shard distance with haversineM (real Earth,
// 6,371,000 m) against a 1.6 m radius, while the walker steps
// in DISPLAY metres over the 55-unit globe (1° ≈ 60 display
// m). 1.6 haversine-m = 0.0009 display m — one walking frame
// covers ~0.23 display m, 266× the old radius, so the walker
// stepped over every shard. The fix mirrors lib/earth/kart.js:
// measure in display metres (haversineDisplayM) against the
// same 1.6 number, now meaning display metres.
// Run: node tests/earth1-aether.test.mjs (from the repo root).
import { readFileSync } from 'fs';
import { haversineM, getInteriors } from '../lib/earth/interiors.js';
import { DISPLAY_UNITS_PER_METRE } from '../lib/earth/placements.js';
import { TERRAIN_RADIUS } from '../lib/terrain.js';
import { ROAM_MAX_SPEED } from '../lib/earth/roam.js';
import {
  DISPLAY_M_PER_DEGREE as KART_DISPLAY_M_PER_DEGREE,
  HAVERSINE_M_PER_DISPLAY_M as KART_RATIO,
  haversineDisplayM as kartHaversineDisplayM,
} from '../lib/earth/kart.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const src = (p) => readFileSync(p, 'utf8');
const near = (a, b, eps) => Math.abs(a - b) <= eps;

const assets = src('components/EarthAssets.jsx');

// --- The fix, as source pins ---
t('collect radius still 1.6 (now display metres)',
  /const AETHER_COLLECT_RADIUS_M = 1\.6;/.test(assets));
t('display-metre scale defined with the kart.js formula',
  /const DISPLAY_M_PER_DEGREE = \(\(2 \* Math\.PI \* TERRAIN_RADIUS\) \/ 360\) \/ DISPLAY_UNITS_PER_METRE;/.test(assets));
t('haversine-to-display ratio defined',
  /const HAVERSINE_M_PER_DISPLAY_M = 111320 \/ DISPLAY_M_PER_DEGREE;/.test(assets));
t('collect check measures in display metres',
  /haversineDisplayM\(roamState\.lat, roamState\.lon, a\.lat, a\.lon\) < AETHER_COLLECT_RADIUS_M/.test(assets));
t('no bare-haversineM collect check remains',
  !/haversineM\(roamState\.lat, roamState\.lon, a\.lat, a\.lon\) < AETHER_COLLECT_RADIUS_M/.test(assets));
t('TERRAIN_RADIUS imported for the display scale',
  /import \{ TERRAIN_RADIUS \} from '@\/lib\/terrain';/.test(assets));

// --- The numbers, recomputed from the lib values ---
const displayMPerDegree = ((2 * Math.PI * TERRAIN_RADIUS) / 360) / DISPLAY_UNITS_PER_METRE;
t('1° ≈ 60 display m on the 55-unit globe', near(displayMPerDegree, 60, 0.01));
t('component formula matches kart.js DISPLAY_M_PER_DEGREE',
  near(displayMPerDegree, KART_DISPLAY_M_PER_DEGREE, 1e-9));
const ratio = 111320 / displayMPerDegree;
t('real-to-display split is ~1,855×', near(ratio, 1855, 1));
t('component ratio matches kart.js HAVERSINE_M_PER_DISPLAY_M',
  near(ratio, KART_RATIO, 1e-9));

// The display-metre distance the component now computes agrees
// with kart.js's haversineDisplayM on real points.
t('haversineDisplayM agrees with kart.js',
  near(haversineM(10, 20, 10.001, 20) / ratio,
    kartHaversineDisplayM(10, 20, 10.001, 20), 1e-9));

// --- The old radius, in the walker's units ---
const OLD_RADIUS_DISPLAY_M = 1.6 / ratio;
t('old 1.6 haversine-m radius was ~0.0009 display m',
  near(OLD_RADIUS_DISPLAY_M, 0.0009, 0.0001));
// One full-tilt walking frame: ROAM_MAX_SPEED hub units/s over
// the 55-unit globe, in display metres (0.22 / 0.016 = 13.75
// display m/s, × 1/60 s per frame).
const frameStepDisplayM = (ROAM_MAX_SPEED / DISPLAY_UNITS_PER_METRE) / 60;
t('one walking frame covers ~0.23 display m', near(frameStepDisplayM, 0.23, 0.01));
t('one walking frame is 266× the old collect radius',
  frameStepDisplayM / OLD_RADIUS_DISPLAY_M > 200);

// --- Walk the shard: old radius vs new radius ---
// Walker approaches a shard from 2 display m out in full-tilt
// frame steps, from 230 starting offsets (one full step of
// phase). Counts how many approaches ever land inside the
// radius.
function approachesCollected(radiusDisplayM) {
  let hits = 0;
  const starts = 230;
  for (let i = 0; i < starts; i++) {
    const phase = (i / starts) * frameStepDisplayM;
    let d = 2 + phase;
    let minD = Infinity;
    while (d > 0) {
      minD = Math.min(minD, d);
      d -= frameStepDisplayM;
    }
    if (minD < radiusDisplayM) hits++;
  }
  return { hits, starts };
}
const oldRun = approachesCollected(OLD_RADIUS_DISPLAY_M);
t(`old radius collects on ~luck only (${oldRun.hits}/${oldRun.starts} approaches)`,
  oldRun.hits / oldRun.starts < 0.05);
const newRun = approachesCollected(1.6);
t(`new 1.6 display-m radius collects on every approach (${newRun.hits}/${newRun.starts})`,
  newRun.hits === newRun.starts);

// --- The fix is sufficient whenever the walker is inside ---
// Shards sit ≤ 0.45 × radiusM real m from the interior centre
// (lib/earth/interiors.js) and the inside gate is haversineM <
// radiusM, so walker-to-shard when inside is at most
// 1.45 × radiusM real m = 1.45 × radiusM / ratio display m.
// That must sit inside the 1.6 display-m collect radius for
// every interior in the registry.
{
  const radii = getInteriors().map((s) => s.radiusM);
  const maxR = Math.max(...radii);
  t(`largest interior radiusM is ${maxR}`,
    Number.isFinite(maxR) && maxR > 0);
  t('worst-case inside walker-to-shard distance fits the 1.6 display-m radius',
    (1.45 * maxR) / ratio < 1.6);
}

console.log(`earth1-aether: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
