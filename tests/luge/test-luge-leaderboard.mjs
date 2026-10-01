// tests/luge/test-luge-leaderboard.mjs
// Headless tests for global-leaderboard submission validation
// (decideLeaderboardPost in lib/luge/logic.js — the same gate the
// POST /api/luge/leaderboard route enforces server-side).
// Run: node tests/luge/test-luge-leaderboard.mjs (from the repo root).
// No browser, no network.
import { LUGE_COURSES, LUGE_SLEDS } from '../../lib/luge_data.js';
import {
  decideLeaderboardPost,
  minRunMs,
  MAX_PLAYER_NAME,
} from '../../lib/luge/logic.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const course = LUGE_COURSES[0];
const saneRun = Math.ceil(minRunMs(course) * 2); // comfortably possible
const owned = ['g1', 'p26'];

// --- happy path ---
const ok = decideLeaderboardPost({ courseId: course.id, runMs: saneRun, sledId: 'g1', ownedSledIds: owned, player: 'Speedy' });
t('a sane solo run posts fine', ok.ok === true && ok.player === 'Speedy' && ok.course.id === course.id);
const okPvp = decideLeaderboardPost({ courseId: course.id, runMs: saneRun, sledId: 'p26', ownedSledIds: owned, player: '  Apex  ' });
t('name is trimmed', okPvp.ok === true && okPvp.player === 'Apex');

// --- name gate: 1..24 printable chars ---
for (const [label, player] of [
  ['empty name rejected', ''],
  ['blank name rejected', '   '],
  ['overlong name rejected', 'x'.repeat(MAX_PLAYER_NAME + 1)],
  ['null name rejected', null],
]) {
  const r = decideLeaderboardPost({ courseId: course.id, runMs: saneRun, sledId: 'g1', ownedSledIds: owned, player });
  t(label, !r.ok && r.status === 400);
}
const edge = decideLeaderboardPost({ courseId: course.id, runMs: saneRun, sledId: 'g1', ownedSledIds: owned, player: 'x'.repeat(MAX_PLAYER_NAME) });
t('24-char name is the edge, accepted', edge.ok === true);

// --- anti-cheat floor (same gate as /api/luge/complete) ---
const impossible = Math.max(1, Math.floor(minRunMs(course) * 0.5));
const cheat = decideLeaderboardPost({ courseId: course.id, runMs: impossible, sledId: 'g1', ownedSledIds: owned, player: 'Speedy' });
t('impossible time rejected with 422', !cheat.ok && cheat.status === 422);

// --- bad references ---
const badCourse = decideLeaderboardPost({ courseId: 999, runMs: saneRun, sledId: 'g1', ownedSledIds: owned, player: 'Speedy' });
t('unknown course rejected', !badCourse.ok && badCourse.status === 400);
const badSled = decideLeaderboardPost({ courseId: course.id, runMs: saneRun, sledId: 'nope', ownedSledIds: owned, player: 'Speedy' });
t('unknown sled rejected', !badSled.ok && badSled.status === 400);
const unowned = decideLeaderboardPost({ courseId: course.id, runMs: saneRun, sledId: 'p1', ownedSledIds: ['g1'], player: 'Speedy' });
t('premium sled you do not own rejected', !unowned.ok && unowned.status === 403);

// --- garbage times ---
for (const [label, runMs] of [
  ['zero rejected', 0],
  ['negative rejected', -5000],
  ['NaN rejected', NaN],
  ['absurd multi-hour rejected', 99_999_999],
]) {
  const r = decideLeaderboardPost({ courseId: course.id, runMs, sledId: 'g1', ownedSledIds: owned, player: 'Speedy' });
  t(label, !r.ok && r.status === 400);
}

// --- the gate is sled-independent: the best sled gets no free pass ---
const apexImpossible = decideLeaderboardPost({ courseId: course.id, runMs: impossible, sledId: 'p26', ownedSledIds: owned, player: 'Apex' });
t('Apex at boostGain 2.0 still cannot beat the floor', !apexImpossible.ok && apexImpossible.status === 422);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
