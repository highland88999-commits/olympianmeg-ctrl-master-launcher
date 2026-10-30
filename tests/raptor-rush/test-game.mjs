// tests/raptor-rush/test-game.mjs
// Headless tests for the Raptor Rush rework (vertical dead-ahead runner):
// rabbit spawning/eating/scoring, the escalation curve, party mode timing,
// and the OASIS game registry entry.
// Run: node tests/raptor-rush/test-game.mjs (from the repo root).
// No browser, no network.
import { readFileSync } from 'fs';
import {
  createGame,
  startGame,
  update,
  steerTo,
  nudge,
  escalationAt,
  raptorBox,
  obstacleBox,
  rabbitBox,
  boxesOverlap,
  distanceMeters,
  timeLeft,
  RABBIT_SCORE,
  MAX_HEARTS,
  MATCH_SECONDS,
  ESCALATE_EVERY,
  TRACK_X0,
  TRACK_X1,
  WORLD_W,
  WORLD_H,
} from '../../app/raptor-rush/game.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- dead-ahead orientation: vertical world, track runs into the screen ---
t('world is portrait (taller than wide)', WORLD_H > WORLD_W);
t('track sits inside the world', TRACK_X0 > 0 && TRACK_X1 < WORLD_W && TRACK_X0 < TRACK_X1);

// --- basic lifecycle ---
const g0 = createGame(42);
t('new game starts in ready phase', g0.phase === 'ready');
t('new game starts with 3 hearts', g0.hearts === MAX_HEARTS);
t('raptor starts centered in the track',
  g0.raptor.x === (TRACK_X0 + TRACK_X1) / 2);
startGame(g0);
t('startGame puts the game in running phase', g0.phase === 'running');
t('default mode is solo', g0.mode === 'solo');

// --- steering ---
const gs = createGame(7);
startGame(gs);
t('steerTo clamps past the right wall',
  steerTo(gs, 99999) && gs.raptor.targetX <= TRACK_X1);
t('steerTo clamps past the left wall',
  steerTo(gs, -99999) && gs.raptor.targetX >= TRACK_X0);
steerTo(gs, TRACK_X1 - 30);
for (let i = 0; i < 120; i++) update(gs, 1 / 60);
t('raptor glides toward its steering target', gs.raptor.x > (TRACK_X0 + TRACK_X1) / 2);
const gn = createGame(8);
startGame(gn);
const before = gn.raptor.targetX;
nudge(gn, 1);
t('nudge moves the target right', gn.raptor.targetX > before);
nudge(gn, -1);
t('nudge moves the target left', gn.raptor.targetX < before + 72);

// --- rabbit spawning ---
const gr = createGame(9);
startGame(gr);
gr.rabbitTimer = 0;
update(gr, 1 / 60);
t('a rabbit spawns when the rabbit timer fires', gr.rabbits.length === 1);
t('rabbits spawn above the screen and scroll toward the player',
  (() => {
    const y0 = gr.rabbits[0].y;
    update(gr, 1 / 60);
    return gr.rabbits[0].y > y0;
  })());

// --- eating rabbits scores points ---
const ge = createGame(10);
startGame(ge);
ge.rabbitTimer = 999; // no more spawns during the test
ge.spawnTimer = 999;
const rb = raptorBox(ge);
ge.rabbits.push({ id: 99, x: rb.x + rb.w / 2, y: 792, hopPhase: 0 });
const scoreBefore = ge.score;
const preyBefore = ge.prey;
update(ge, 1 / 60);
t('touching a rabbit eats it', ge.prey === preyBefore + 1);
t('eating a rabbit removes it from the track', ge.rabbits.length === 0);
t('eating a rabbit adds RABBIT_SCORE points',
  ge.score >= scoreBefore + RABBIT_SCORE - 5); // -5 tolerance for distance tick

// --- distance also scores (classic runner pacing) ---
const gd = createGame(11);
startGame(gd);
gd.spawnTimer = 999;
gd.rabbitTimer = 999;
for (let i = 0; i < 600; i++) update(gd, 1 / 60); // 10s of running
t('distance grows while running', distanceMeters(gd) > 0);
t('score grows while running', gd.score > 0);

// --- obstacles hurt ---
const go = createGame(12);
startGame(go);
go.spawnTimer = 999;
go.rabbitTimer = 999;
const rb2 = raptorBox(go);
go.obstacles.push({ id: 50, type: 'boulder', x: rb2.x + rb2.w / 2, y: 792 });
const heartsBefore = go.hearts;
update(go, 1 / 60);
t('hitting an obstacle costs a heart', go.hearts === heartsBefore - 1);
t('one obstacle = one hit (it is removed)', go.obstacles.length === 0);
t('hit grants invincibility frames', go.invincible > 0);
// Third hit ends the run.
go.invincible = 0;
go.hearts = 1;
go.obstacles.push({ id: 51, type: 'boulder', x: rb2.x + rb2.w / 2, y: 792 });
update(go, 1 / 60);
t('losing the last heart ends the run', go.phase === 'over');

// --- escalation curve: rabbits spawn increasingly more, obstacles harder ---
const e0 = escalationAt(0);
const e20 = escalationAt(ESCALATE_EVERY);
const e60 = escalationAt(ESCALATE_EVERY * 3);
const e120 = escalationAt(ESCALATE_EVERY * 6);
t('escalation level rises with time',
  e0.level === 0 && e20.level === 1 && e60.level === 3 && e120.level === 6);
t('rabbits spawn increasingly more (interval shrinks)',
  e60.rabbitEvery < e20.rabbitEvery && e20.rabbitEvery < e0.rabbitEvery);
t('rabbit interval never drops below its floor', e120.rabbitEvery >= 0.7);
t('obstacles get harder (interval shrinks)',
  e60.obstacleEvery < e20.obstacleEvery && e20.obstacleEvery < e0.obstacleEvery);
t('obstacle interval never drops below its floor', e120.obstacleEvery >= 0.5);
t('double-spawn chance rises with escalation',
  e60.doubleChance > e20.doubleChance && e20.doubleChance > e0.doubleChance);
t('double-spawn chance is capped', e120.doubleChance <= 0.55);
t('warren (rabbit cluster) chance rises with escalation',
  e60.warrenChance > e0.warrenChance);
t('no drifting rockfall at level 0', e0.drifters === false);
t('drifting rockfall joins at level 2', escalationAt(ESCALATE_EVERY * 2).drifters === true);
t('scroll speed multiplier rises with escalation', e60.speedBoost > e0.speedBoost);

// Escalation actually drives spawn timers inside update().
const gep = createGame(13, { mode: 'party' });
startGame(gep);
gep.time = ESCALATE_EVERY * 3; // simulate deep into a match (under the 75s clock)
gep.spawnTimer = 999;
gep.rabbitTimer = 0;
gep.obstacles = [];
const rabbitsBefore = gep.rabbits.length;
update(gep, 1 / 60);
t('rabbit timer reset honors the escalated interval',
  gep.rabbitTimer <= escalationAt(gep.time).rabbitEvery * 1.16 + 0.001 &&
  gep.rabbitTimer >= escalationAt(gep.time).rabbitEvery * 0.84 - 0.001 &&
  gep.rabbits.length > rabbitsBefore);

// --- party mode: timed PvP match, high score wins ---
const gp = createGame(14, { mode: 'party' });
t('party mode is stored', gp.mode === 'party');
t('party match has a clock', gp.matchSeconds === MATCH_SECONDS);
t('timeLeft counts down in party mode', timeLeft(gp) === MATCH_SECONDS);
startGame(gp);
gp.time = MATCH_SECONDS - 0.01;
update(gp, 1 / 60);
t('party match ends on the clock', gp.phase === 'over');
t('clock endings are flagged timedOut', gp.timedOut === true);
const gq = createGame(15, { mode: 'party' });
startGame(gq);
t('solo-style death is not a timeout', (() => {
  gq.hearts = 1;
  gq.invincible = 0;
  const rbox = raptorBox(gq);
  gq.obstacles.push({ id: 60, type: 'spire', x: rbox.x + rbox.w / 2, y: 792 });
  update(gq, 1 / 60);
  return gq.phase === 'over' && gq.timedOut === false;
})());
const gsolo = createGame(16);
startGame(gsolo);
t('timeLeft is null in solo mode', timeLeft(gsolo) === null);

// --- OASIS registry wiring (real rooms only, no NPC backfill) ---
const gamesSrc = readFileSync('lib/oasis/games.js', 'utf8');
t('raptor-rush registered in the OASIS games registry',
  /'raptor-rush'/.test(gamesSrc));
t('raptor-rush PvP has no NPC backfill',
  /'raptor-rush'[\s\S]*?npcBackfill:\s*false/.test(gamesSrc));
t('raptor-rush needs at least 2 humans',
  /'raptor-rush'[\s\S]*?minPlayers:\s*2/.test(gamesSrc));

// --- page wiring ---
const pageSrc = readFileSync('app/raptor-rush/page.jsx', 'utf8');
t('page mounts the OASIS lobby', /OasisLobby/.test(pageSrc));
t('page uses the raptor-rush game slug', /gameSlug="raptor-rush"/.test(pageSrc));
t('page persists best score in localStorage', /raptor_rush_best/.test(pageSrc));
t('page blocks 1-human PvP starts (real rooms only)',
  /humans\.length < 2/.test(pageSrc));
t('page submits scores to the room leaderboard in party mode',
  /submitScore\(/.test(pageSrc));
t('page polls party room scores', /fetchRoomScores/.test(pageSrc));

// --- OASIS lobby honors npcBackfill: false (real rooms only) ---
const lobbySrc = readFileSync('components/oasis/Lobby.jsx', 'utf8');
t('lobby reads the npcBackfill flag', /npcBackfill === false/.test(lobbySrc));
t('lobby skips NPC backfill for real-humans-only games',
  /noNpc \? \[\] : pickBackfill/.test(lobbySrc));
t('lobby hides the NPC picker for real-humans-only games',
  /\{!noNpc && \([\s\S]*?NpcPicker/.test(lobbySrc));
t('lobby never promises NPC fill-in for real-humans-only games',
  /noNpc \? 'real hunters only/.test(lobbySrc));
t('lobby disables room start until a real rival joins',
  /noNpc && humans\.length < game\.minPlayers/.test(lobbySrc));

// --- collision helpers ---
t('boxesOverlap detects real overlap',
  boxesOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }));
t('boxesOverlap rejects a miss',
  !boxesOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 }));
t('obstacleBox centers on the entity', (() => {
  const b = obstacleBox({ id: 1, type: 'spire', x: 100, y: 200 });
  return b.x === 100 - b.w / 2 && b.y === 200 - b.h / 2;
})());
t('rabbitBox bakes the hop into y', (() => {
  const low = rabbitBox({ id: 1, x: 50, y: 500, hopPhase: 0 });
  const high = rabbitBox({ id: 2, x: 50, y: 500, hopPhase: Math.PI / 2 });
  return high.y < low.y;
})());

console.log(`\nraptor-rush: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

// Regression (Merlin, 2026-10-29): the page crashed on load with
// "null is not an object (evaluating 'e.getContext')" because the
// renderer effect ran on the menu screen, where no canvas is mounted.
// The effect must bail when canvasRef.current is null.
{
  const src = readFileSync('app/raptor-rush/page.jsx', 'utf8');
  const guard = /const canvas = canvasRef\.current;\s*\n(\s*\/\/[^\n]*\n)*\s*if\s*\(\s*!canvas\s*\)\s*return;/;
  check('renderer setup bails when the menu screen has no canvas', guard.test(src));
}
