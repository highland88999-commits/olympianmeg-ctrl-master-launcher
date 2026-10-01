// tests/luge/test-luge-sled-stats.mjs
// Headless tests for the premium sled stat curve (sand resistance +
// boost gain) and the zone physics that consumes it.
// Run: node tests/luge/test-luge-sled-stats.mjs (from the repo root).
// No browser, no network.
import { LUGE_SLEDS } from '../../lib/luge_data.js';
import {
  zoneSpeedDelta,
  BOOST_ACCEL,
  SAND_DRAG,
} from '../../lib/luge/track.js';
import {
  sledStats,
  MAX_BOOST_GAIN,
  validateRun,
  minRunMs,
  RUN_CHEAT_MARGIN,
} from '../../lib/luge/logic.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// --- every sled carries both stats, in sane ranges ---
for (const sled of LUGE_SLEDS) {
  t(`${sled.id} sandResist in [0,1]`,
    typeof sled.sandResist === 'number' && sled.sandResist >= 0 && sled.sandResist <= 1);
  t(`${sled.id} boostGain >= 1`, typeof sled.boostGain === 'number' && sled.boostGain >= 1);
}

// --- base sleds are the untuned baseline ---
const g1 = LUGE_SLEDS.find((s) => s.id === 'g1');
const g2 = LUGE_SLEDS.find((s) => s.id === 'g2');
t('g1 is sandResist 0 / boostGain 1.0', g1.sandResist === 0 && g1.boostGain === 1.0);
t('g2 is sandResist 0 / boostGain 1.0', g2.sandResist === 0 && g2.boostGain === 1.0);

// --- premium tiers rise monotonically through the price ladder ---
const premiums = LUGE_SLEDS.filter((s) => s.type === 'premium');
t('28 sleds total', LUGE_SLEDS.length === 28);
t('26 premium sleds', premiums.length === 26);
let monoResist = true;
let monoBoost = true;
for (let i = 1; i < premiums.length; i++) {
  if (premiums[i].sandResist < premiums[i - 1].sandResist) monoResist = false;
  if (premiums[i].boostGain < premiums[i - 1].boostGain) monoBoost = false;
}
t('sand resistance never decreases up the premium ladder', monoResist);
t('boost gain never decreases up the premium ladder', monoBoost);

// --- the top of the ladder: Merlin's Apex ---
const apex = LUGE_SLEDS.find((s) => s.id === 'p26');
t('p26 sandResist is 0.75', apex && apex.sandResist === 0.75);
t('p26 boostGain is 2.0', apex && apex.boostGain === 2.0);
t('MAX_BOOST_GAIN matches the strongest sled shipped',
  MAX_BOOST_GAIN === Math.max(...LUGE_SLEDS.map((s) => s.boostGain)));

// --- sledStats clamps garbage to the base baseline (never a super-sled) ---
t('sledStats(null) degrades to base baseline',
  JSON.stringify(sledStats(null)) === JSON.stringify({ sandResist: 0, boostGain: 1 }));
t('sledStats({}) degrades to base baseline',
  JSON.stringify(sledStats({})) === JSON.stringify({ sandResist: 0, boostGain: 1 }));
t('sledStats clamps sandResist at 0.9', sledStats({ sandResist: 9 }).sandResist === 0.9);
t('sledStats clamps negative sandResist at 0', sledStats({ sandResist: -5 }).sandResist === 0);
t('sledStats floors boostGain at 1', sledStats({ boostGain: 0.2 }).boostGain === 1);

// --- zone physics: boost gain pulls harder, sand resist shrugs drag ---
const DT = 0.5;
t('boost zone applies BOOST_ACCEL * boostGain',
  approx(zoneSpeedDelta('boost', g1, DT), BOOST_ACCEL * 1.0 * DT));
t('Apex pulls twice as hard out of a boost band as a base sled',
  approx(zoneSpeedDelta('boost', apex, DT), 2 * zoneSpeedDelta('boost', g1, DT)));
t('sand zone applies full drag to a base sled',
  approx(zoneSpeedDelta('sand', g1, DT), -SAND_DRAG * DT));
t('sand zone drag shrinks with resistance (Apex takes 25%)',
  approx(zoneSpeedDelta('sand', apex, DT), -SAND_DRAG * 0.25 * DT));
t('unknown zone returns 0', zoneSpeedDelta('mystery', apex, DT) === 0);
t('null zone returns 0', zoneSpeedDelta(null, apex, DT) === 0);
t('zero delta returns 0', zoneSpeedDelta('boost', apex, 0) === 0);
t('garbage sled degrades to baseline physics',
  approx(zoneSpeedDelta('boost', null, DT), BOOST_ACCEL * DT) &&
  approx(zoneSpeedDelta('sand', null, DT), -SAND_DRAG * DT));

// --- anti-cheat floor stays valid at the top boost gain ---
// The floor is sled-independent by design: the client speed clamp caps
// every sled at the same top speed, so boosts only reach it faster.
import { LUGE_COURSES } from '../../lib/luge_data.js';
for (const course of LUGE_COURSES) {
  const floor = minRunMs(course) * RUN_CHEAT_MARGIN;
  const tooFast = Math.floor(floor * 0.9);
  const check = validateRun({ courseId: course.id, runMs: tooFast, sledId: 'p26', ownedSledIds: ['p26'] });
  t(`course ${course.id} rejects a sub-floor Apex run (422)`, !check.ok && check.status === 422);
}
const legit = validateRun({ courseId: LUGE_COURSES[0].id, runMs: minRunMs(LUGE_COURSES[0]) * 2, sledId: 'p26', ownedSledIds: ['p26'] });
t('a plausible Apex run still passes validation', legit.ok === true);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
