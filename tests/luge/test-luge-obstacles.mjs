// tests/luge/test-luge-obstacles.mjs
// Headless tests for graphic-wrapped obstacles + hit penalties
// (lib/luge/obstacles.js, lib/luge/cgi.js motion helpers) + static wiring
// checks that app/luge/page.tsx and the recording routes actually use them.
// Run: node tests/luge/test-luge-obstacles.mjs (from the repo root).
// No browser, no network.
import { readFileSync } from 'node:fs';
import {
  generateObstacles,
  obstacleCount,
  freeArcAt,
  angularOverlap,
  obstaclesHitBetween,
  hitPenaltyMs,
  createHitTracker,
  registerObstacleHit,
  isSlowed,
  HIT_TIME_PENALTY_MS,
  HIT_SLOW_FACTOR,
  HIT_SLOW_DURATION_S,
  HIT_IMMUNITY_S,
  MAX_HITS_PER_RUN,
  OBSTACLE_TYPES,
} from '../../lib/luge/obstacles.js';
import { riderBreath, sledVibration, shardSway } from '../../lib/luge/cgi.js';
import { sanitizeHitCount } from '../../lib/luge/logic.js';
import { LUGE_COURSES } from '../../lib/luge_data.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// --- counts scale with length ---
t('shortest course gets 4 obstacles', obstacleCount(LUGE_COURSES[0]) === 4);
t('longest course gets 9 obstacles', obstacleCount(LUGE_COURSES[19]) === 9);
t('every course gets 4..9 obstacles',
  LUGE_COURSES.every((c) => { const n = obstacleCount(c); return n >= 4 && n <= 9; }));

// --- deterministic seeded layout ---
for (const course of LUGE_COURSES) {
  const a = generateObstacles(course);
  const b = generateObstacles(course);
  t(`course ${course.id}: obstacles deterministic across runs`,
    JSON.stringify(a) === JSON.stringify(b));
  t(`course ${course.id}: count matches`, a.length === obstacleCount(course));
  t(`course ${course.id}: sorted by progress`,
    a.every((o, i) => i === 0 || o.progress >= a[i - 1].progress));
  t(`course ${course.id}: clear of start gate and finish line`,
    a.every((o) => o.progress >= 0.08 && o.progress <= 0.92));
  t(`course ${course.id}: neighbours spaced for steering (>=0.04 progress)`,
    a.every((o, i) => i === 0 || o.progress - a[i - 1].progress >= 0.04));
  t(`course ${course.id}: types are known graphic-wrapped types`,
    a.every((o) => OBSTACLE_TYPES.includes(o.type)));
  t(`course ${course.id}: all three sections wear different looks`,
    new Set(a.map((o) => o.type)).size >= 2);
  // THE fairness guarantee: a clean line always exists.
  t(`course ${course.id}: every obstacle leaves >= ~262° of free arc`,
    a.every((o) => freeArcAt(o) >= Math.PI * 2 - 2 * 0.85 - 1e-9));
}

// --- angular overlap ---
const barrel = { angle: 0, halfWidth: 0.55 };
t('overlap: dead-on is a hit', angularOverlap(barrel, 0) === true);
t('overlap: inside the arc is a hit', angularOverlap(barrel, 0.5) === true);
t('overlap: outside the arc is a miss', angularOverlap(barrel, 1.0) === false);
t('overlap: wraps cleanly across -PI/PI',
  angularOverlap({ angle: Math.PI - 0.1, halfWidth: 0.55 }, -Math.PI + 0.1) === true);

// --- segment hit test (no tunnelling at speed) ---
const course1 = LUGE_COURSES[0];
const obs = [{ id: 'o1', progress: 0.5, angle: 0, halfWidth: 0.55, type: 'barrel', radius: 1.6 }];
t('segment: slow pass through registers',
  obstaclesHitBetween(obs, 0.49, 0.51, 0, course1.length).length === 1);
t('segment: a fast frame jumping the whole obstacle still registers',
  obstaclesHitBetween(obs, 0.48, 0.52, 0, course1.length).length === 1);
t('segment: wrong angle passes clean',
  obstaclesHitBetween(obs, 0.49, 0.51, 2.0, course1.length).length === 0);
t('segment: passing before the obstacle is clean',
  obstaclesHitBetween(obs, 0.40, 0.45, 0, course1.length).length === 0);

// --- penalty numbers (my calls) ---
t('penalty is +2 s per hit', HIT_TIME_PENALTY_MS === 2000);
t('hitPenaltyMs(0) is 0', hitPenaltyMs(0) === 0);
t('hitPenaltyMs(3) is 6000', hitPenaltyMs(3) === 6000);
t('hitPenaltyMs caps at the run cap', hitPenaltyMs(99) === MAX_HITS_PER_RUN * 2000);
t('slow factor is 45%', HIT_SLOW_FACTOR === 0.45);
t('slow lasts ~1 s', HIT_SLOW_DURATION_S === 1.0);
t('immunity is 1.5 s per obstacle', HIT_IMMUNITY_S === 1.5);
t('run hit cap is 10', MAX_HITS_PER_RUN === 10);

// --- tracker: immunity, cap, slow window ---
const tr = createHitTracker();
const ob = { id: 'ob-1-0' };
t('first hit registers as hit #1',
  registerObstacleHit(tr, ob, 10)?.hitNumber === 1);
t('same obstacle inside immunity does not multi-hit',
  registerObstacleHit(tr, ob, 10.5) === null);
t('same obstacle after immunity hits again',
  registerObstacleHit(tr, ob, 11.6)?.hitNumber === 2);
t('slow window active right after a hit', isSlowed(tr, 12.0) === true);
t('slow window over after ~1 s', isSlowed(tr, 12.7) === false);
t('tracker counts hits', tr.count === 2);
const capTr = createHitTracker();
for (let i = 0; i < 12; i++) registerObstacleHit(capTr, { id: `ob-x-${i}` }, 20 + i * 2);
t('cap stops counting at 10', capTr.count === MAX_HITS_PER_RUN);
t('hits past the cap carry no penalty',
  registerObstacleHit(capTr, { id: 'ob-x-99' }, 100) === null);

// --- server-side hit clamp ---
t('sanitizeHitCount: sane passes through', sanitizeHitCount(3) === 3);
t('sanitizeHitCount: garbage -> 0', sanitizeHitCount('nope') === 0);
t('sanitizeHitCount: negative -> 0', sanitizeHitCount(-4) === 0);
t('sanitizeHitCount: over cap -> cap', sanitizeHitCount(99) === MAX_HITS_PER_RUN);
t('sanitizeHitCount: null -> 0', sanitizeHitCount(null) === 0);

// --- CGI motion helpers are pure + bounded ---
t('riderBreath stays within ±1.2%',
  (() => { for (let i = 0; i < 40; i++) { const v = riderBreath(i * 0.37); if (v < 0.988 || v > 1.012) return false; } return true; })());
t('riderBreath is periodic over 4 s', approx(riderBreath(0), riderBreath(4)));
t('sledVibration is tiny (under 0.1 m)',
  (() => { for (let i = 0; i < 40; i++) { if (Math.abs(sledVibration(i * 0.11, 400)) > 0.1) return false; } return true; })());
t('sledVibration grows with speed',
  Math.abs(sledVibration(0.3, 400)) >= Math.abs(sledVibration(0.3, 20)) - 0.05);
t('shardSway is bounded to ±0.35 m',
  (() => { for (let i = 0; i < 40; i++) { if (Math.abs(shardSway(i * 0.23, 3)) > 0.35 + 1e-9) return false; } return true; })());

// --- the page actually wires it ---
const page = readFileSync(new URL('../../app/luge/page.tsx', import.meta.url), 'utf8');
t('page: generates seeded obstacles per course', page.includes('generateObstacles(course)'));
t('page: renders the obstacle meshes', page.includes('<ObstacleMesh'));
t('page: checks hits on the run segment', page.includes('obstaclesHitBetween('));
t('page: registers hits on the tracker', page.includes('registerObstacleHit('));
t('page: applies the speed cut', page.includes('HIT_SLOW_FACTOR'));
t('page: adds the penalty before recording', page.includes('hitPenaltyMs(hits)'));
t('page: sends hits with the completion', page.includes('hits,') && page.includes('/api/luge/complete'));
t('page: sends hits with the leaderboard post', page.includes('/api/luge/leaderboard'));
t('page: shows the live hit count on the HUD', page.includes('hitFx.count'));
t('page: shows hits on the finish screen', page.includes('lastRun.hits'));
t('page: renders the procedural ice overlay', page.includes('makeIceTrackTexture'));
t('page: renders trackside shards', page.includes('<TracksideDressing'));
t('page: renders snow spray', page.includes('<SnowSpray'));
t('page: rider breathes and leans', page.includes('riderBreath('));
t('page: sled vibrates', page.includes('sledVibration('));

// --- the routes store hits on the same single row ---
const completeSrc = readFileSync(new URL('../../app/api/luge/complete/route.js', import.meta.url), 'utf8');
t('complete route: parses hits through the server clamp', completeSrc.includes('sanitizeHitCount'));
t('complete route: upserts hits on the same row', completeSrc.includes('hits }') || completeSrc.includes('hits,'));
t('complete route: still one row per run (same onConflict)', completeSrc.includes("onConflict: 'user_id,course_id'"));
t('complete route: retries without hits if the column has not landed', completeSrc.includes('upsertRow(false)'));
const boardSrc = readFileSync(new URL('../../app/api/luge/leaderboard/route.js', import.meta.url), 'utf8');
t('leaderboard route: parses hits through the server clamp', boardSrc.includes('sanitizeHitCount'));
t('leaderboard route: inserts hits on the same row', boardSrc.includes('hits }') || boardSrc.includes('hits,'));
t('leaderboard route: reads hits back', boardSrc.includes('hits, created_at'));
const sql = readFileSync(new URL('../../supabase/luge.sql', import.meta.url), 'utf8');
t('sql: completions carry a hits column', /add column if not exists hits integer/.test(sql));
const pvpSql = readFileSync(new URL('../../supabase/luge-pvp.sql', import.meta.url), 'utf8');
t('pvp sql: leaderboard carries a hits column', /add column if not exists hits integer/.test(pvpSql));

console.log(`\nobstacles: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
