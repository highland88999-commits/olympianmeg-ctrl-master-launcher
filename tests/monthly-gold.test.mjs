// Headless tests for lib/babel/monthlyGold.js — plain node, no DOM/three.
import {
  monthKey,
  hashStr,
  pickMonthlySpot,
  claimStorageKey,
  GOLD_BAR_SPOTS,
  GOLDBAR_CLAIM_RADIUS,
} from '../lib/babel/monthlyGold.js';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}

ok('monthKey format YYYY-MM', /^\d{4}-\d{2}$/.test(monthKey(new Date(2026, 9, 1))));
ok('monthKey zero-pads', monthKey(new Date(2026, 0, 5)) === '2026-01');
ok('hashStr deterministic', hashStr('2026-10') === hashStr('2026-10'));
ok('hashStr differs by month (very likely)', hashStr('2026-10') !== hashStr('2026-11'));
ok('hashStr unsigned 32-bit', hashStr('x') >= 0 && hashStr('x') <= 0xffffffff);

const a = pickMonthlySpot(GOLD_BAR_SPOTS, '2026-10');
const b = pickMonthlySpot(GOLD_BAR_SPOTS, '2026-10');
ok('pickMonthlySpot deterministic', a === b);
ok('pickMonthlySpot returns a listed spot', GOLD_BAR_SPOTS.includes(a));
ok('pickMonthlySpot empty → null', pickMonthlySpot([], '2026-10') === null);
ok('pickMonthlySpot non-array → null', pickMonthlySpot(null, '2026-10') === null);

// Every spot must be reachable on foot: inside the tower walk ring
// (r in [12, 62]) and inside the ground disc (r <= 70).
for (const s of GOLD_BAR_SPOTS) {
  const r = Math.hypot(s.x, s.z);
  ok(`spot (${s.x},${s.z}) inside walk ring`, r >= 12 && r <= 62);
  ok(`spot (${s.x},${s.z}) on ground disc`, r <= 70);
  ok(`spot (${s.x},${s.z}) has rotation`, typeof s.rot === 'number');
}
ok('claimStorageKey shape', claimStorageKey('2026-10') === 'babel-goldbar-2026-10');
ok('claim radius sane', GOLDBAR_CLAIM_RADIUS > 0 && GOLDBAR_CLAIM_RADIUS <= 5);

// Spot distribution sanity: 24 consecutive months should not all land
// on the same spot (would indicate a broken hash/mod).
const seen = new Set();
for (let m = 0; m < 24; m++) {
  const d = new Date(2026, m, 1);
  seen.add(pickMonthlySpot(GOLD_BAR_SPOTS, monthKey(d)));
}
ok('spots vary across months', seen.size > 3);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
