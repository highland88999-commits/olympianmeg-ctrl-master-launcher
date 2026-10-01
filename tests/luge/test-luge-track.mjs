// tests/luge/test-luge-track.mjs
// Headless tests for the Luge 360° tube physics + speed zones.
// Run: node tests/luge/test-luge-track.mjs (from the repo root).
// No browser, no network.
import {
  generateZones,
  zoneAt,
  zoneCounts,
  wrapAngle,
  steerAngle,
  seededRandom,
  TUBE_RADIUS,
  RIDE_RADIUS,
  TURN_RATE,
  BOOST_ACCEL,
  SAND_DRAG,
} from '../../lib/luge/track.js';
import { LUGE_COURSES } from '../../lib/luge_data.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// --- structural wall guarantee ---
t('ride radius is strictly inside the tube radius (walls solid by construction)',
  RIDE_RADIUS < TUBE_RADIUS);

// --- zone counts scale with length ---
t('shortest course gets 2 boosts + 2 sands',
  JSON.stringify(zoneCounts(LUGE_COURSES[0])) === JSON.stringify({ boosts: 2, sands: 2 }));
t('longest course gets 5 boosts + 5 sands',
  JSON.stringify(zoneCounts(LUGE_COURSES[19])) === JSON.stringify({ boosts: 5, sands: 5 }));

// --- deterministic layout ---
for (const course of LUGE_COURSES) {
  const a = generateZones(course);
  const b = generateZones(course);
  t(`course ${course.id}: zones deterministic across runs`,
    JSON.stringify(a) === JSON.stringify(b));

  const { boosts, sands } = zoneCounts(course);
  t(`course ${course.id}: boost count matches`, a.boosts.length === boosts);
  t(`course ${course.id}: sand count matches`, a.sands.length === sands);

  const all = [
    ...a.boosts.map((z) => ({ ...z, kind: 'boost' })),
    ...a.sands.map((z) => ({ ...z, kind: 'sand' })),
  ];
  t(`course ${course.id}: every zone inside (0,1)`,
    all.every((z) => z.start > 0 && z.end < 1 && z.end > z.start));
  t(`course ${course.id}: zones clear of the start gate and finish line`,
    all.every((z) => z.start >= 0.02 && z.end <= 0.985));
  const sorted = [...all].sort((x, y) => x.start - y.start);
  t(`course ${course.id}: no two zones overlap`,
    sorted.every((z, i) => i === 0 || z.start >= sorted[i - 1].end));

  // zoneAt agrees with the layout
  const mid = a.boosts[0];
  t(`course ${course.id}: zoneAt finds a boost at its midpoint`,
    zoneAt(a, (mid.start + mid.end) / 2) === 'boost');
  const smid = a.sands[0];
  t(`course ${course.id}: zoneAt finds sand at its midpoint`,
    zoneAt(a, (smid.start + smid.end) / 2) === 'sand');
}
t('zoneAt returns null on open track (before the first zone can start)',
  zoneAt(generateZones(LUGE_COURSES[0]), 0.01) === null);

// --- angle math ---
t('wrapAngle keeps small angles', approx(wrapAngle(0.5), 0.5));
t('wrapAngle wraps past PI', approx(wrapAngle(Math.PI + 0.1), -Math.PI + 0.1));
t('wrapAngle wraps below -PI', approx(wrapAngle(-Math.PI - 0.1), Math.PI - 0.1));
t('steerAngle holds still with no tilt', steerAngle(1.2, 0, 0.016) === 1.2);
t('steerAngle integrates full tilt for one second',
  approx(steerAngle(0, 1, 1), TURN_RATE));
t('steerAngle goes negative with left tilt',
  approx(steerAngle(0, -1, 0.5), -TURN_RATE * 0.5));
t('steerAngle wraps a full roll without discontinuity',
  approx(steerAngle(0, 1, (Math.PI * 2) / TURN_RATE), 0, 1e-6));
t('steerAngle is proportional to tilt magnitude',
  approx(steerAngle(0, 0.5, 1), TURN_RATE * 0.5));

// --- seeded PRNG sanity ---
const r1 = seededRandom(42);
const r2 = seededRandom(42);
t('seededRandom is deterministic', r1() === r2() && r1() === r2());
t('seededRandom stays in [0,1)', (() => { const r = seededRandom(7); for (let i = 0; i < 100; i++) { const v = r(); if (v < 0 || v >= 1) return false; } return true; })());

// --- tuning constants are sane ---
t('turn rate completes a roll in a few seconds', TURN_RATE > 1.5 && TURN_RATE < 4);
t('boost beats normal acceleration', BOOST_ACCEL > 150);
t('sand drag can overwhelm auto-accel', SAND_DRAG > 40);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
