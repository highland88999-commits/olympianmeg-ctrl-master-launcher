// tests/life-game.test.js — Headless tests for the Life PILOT mode.
// Run: node tests/life-game.test.js (from the repo root).
// No browser, no network — asserts on app/life/game.js logic plus
// source-level checks (renderer hooks, HUD wiring, no telemetry).
import { readFileSync } from 'fs';
import {
  PLAYER_R,
  MAX_HULL,
  LEVEL_SECONDS,
  SHIELD_SECONDS,
  levelParams,
  createGame,
  startGame,
  spawnBlocker,
  spawnBoost,
  spawnShieldPickup,
  stepGame,
  drainEvents,
} from '../app/life/game.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name}`);
  }
}
function approx(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

// --- level params: increasingly harder -------------------------------------
{
  const l1 = levelParams(1);
  const l5 = levelParams(5);
  const l9 = levelParams(9);
  t('level 1 sane', l1.spawnInterval > 1 && l1.maxBlockers === 5 && l1.homing === 0);
  t('spawn interval shrinks', l5.spawnInterval < l1.spawnInterval && l9.spawnInterval < l5.spawnInterval);
  t('spawn interval floored', levelParams(99).spawnInterval >= 0.45);
  t('shard speed grows', l5.shardSpeedMin > l1.shardSpeedMin && l9.shardSpeedMax > l5.shardSpeedMax);
  t('max blockers grows then caps', l5.maxBlockers > l1.maxBlockers && levelParams(99).maxBlockers === 14);
  t('no homing before level 4', levelParams(3).homing === 0);
  t('homing at level 4+', l5.homing > 0 && levelParams(9).homing >= l5.homing);
  t('shield cadence occasional', l1.shieldEvery[0] >= 20 && l1.boostEvery[1] <= l1.shieldEvery[0]);
}

// --- game setup -------------------------------------------------------------
{
  const g = createGame(800, 600, 42);
  t('player centered', g.player.x === 400 && g.player.y === 600 / 2);
  t('full hull', g.player.hull === MAX_HULL && MAX_HULL === 3);
  t('idle until start', g.playing === false && g.gameOver === false);
  startGame(g);
  t('start sets playing', g.playing === true && g.gameOver === false);
  t('start resets score/level', g.score === 0 && g.level === 1);
}

// --- blockers ----------------------------------------------------------------
{
  const g = createGame(800, 600, 7);
  startGame(g);
  const p = levelParams(1);
  const b = spawnBlocker(g, p);
  t('blocker spawns', !!b && g.blockers.length === 1);
  t('blocker has velocity', Math.hypot(b.vx, b.vy) > 0);
  for (let i = 0; i < p.maxBlockers + 5; i++) spawnBlocker(g, p);
  t('blocker cap respected', g.blockers.length === p.maxBlockers);
  t('cap returns null', spawnBlocker(g, p) === null);
}

// --- player steering ----------------------------------------------------------
{
  const g = createGame(800, 600, 11);
  startGame(g);
  const p = g.player;
  p.tx = 700;
  p.ty = 500;
  const x0 = p.x;
  stepGame(g, 0.5);
  t('player eases toward target', p.x > x0 && p.x <= 700);
}

// --- collisions: shard hit without shield --------------------------------------
{
  const g = createGame(800, 600, 21);
  startGame(g);
  const p = g.player;
  g.blockers.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 12, spin: 0, rot: 0 });
  const hull0 = p.hull;
  stepGame(g, 0.016);
  t('hit costs hull', p.hull === hull0 - 1);
  t('hit grants invuln', p.invulnT > 0);
  t('hit event queued', drainEvents(g).includes('hit'));
  t('shard removed on hit', g.blockers.length === 0);
}

// --- collisions: shield absorbs -------------------------------------------------
{
  const g = createGame(800, 600, 31);
  startGame(g);
  const p = g.player;
  p.shieldT = SHIELD_SECONDS;
  g.blockers.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 12, spin: 0, rot: 0 });
  const score0 = g.score;
  stepGame(g, 0.016);
  t('shield saves hull', p.hull === MAX_HULL);
  t('shield consumed', p.shieldT === 0);
  t('shatter bonus scored', g.score >= score0 + 40);
  t('shatter event queued', drainEvents(g).includes('shatter'));
}

// --- pickups: boost and shield ring ----------------------------------------------
{
  const g = createGame(800, 600, 41);
  startGame(g);
  const p = g.player;
  g.boosts.push({ x: p.x, y: p.y, r: 9, ttl: 9, ph: 0 });
  const score0 = g.score;
  stepGame(g, 0.016);
  t('boost scores +25', g.score >= score0 + 25);
  t('boost triggers surge', p.surgeT > 0);
  t('boost event queued', drainEvents(g).includes('boost'));

  g.shieldPickups.push({ x: p.x, y: p.y, r: 11, ttl: 12, ph: 0 });
  stepGame(g, 0.016);
  t('shield pickup grants shield', p.shieldT > 0 && p.shieldT <= SHIELD_SECONDS);
  t('shieldup event queued', drainEvents(g).includes('shieldup'));
}

// --- level ramp -------------------------------------------------------------------
{
  const g = createGame(800, 600, 51);
  startGame(g);
  t('starts at level 1', g.level === 1);
  for (let i = 0; i < 250; i++) stepGame(g, 0.1); // 25s of game time in clamped steps
  t('levels up over time', g.level === 2);
  t('levelup event queued', drainEvents(g).includes('levelup'));
}

// --- game over ----------------------------------------------------------------------
{
  const g = createGame(800, 600, 61);
  startGame(g);
  const p = g.player;
  p.hull = 1;
  g.score = 123.9;
  g.blockers.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 12, spin: 0, rot: 0 });
  stepGame(g, 0.016);
  t('game over at zero hull', g.gameOver === true && g.playing === false);
  t('score floored', g.score === 123);
  t('best updated', g.best === 123);
  t('gameover event queued', drainEvents(g).includes('gameover'));
  const before = g.blockers.length;
  stepGame(g, 1); // further steps are no-ops
  t('dead game stays dead', g.gameOver === true && g.blockers.length === before);
}

// --- source-level checks ---------------------------------------------------------------
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
{
  const gameSrc = readFileSync('app/life/game.js', 'utf8');
  const gcode = stripComments(gameSrc);
  t('game.js: no telemetry/fetch', !/central_telemetry|phone.?home|fetch\(|supabase|https?:\/\//i.test(gcode));
  t('game.js: exports pure logic', /export function (levelParams|createGame|stepGame|spawnBlocker)/.test(gameSrc));

  const canvasSrc = readFileSync('app/life/canvas.js', 'utf8');
  t('canvas: tick hook', /opts\.tick/.test(canvasSrc));
  t('canvas: overlay hook', /opts\.overlay/.test(canvasSrc));
  t('canvas: game HUD passthrough', /getGameHud/.test(canvasSrc));
  t('canvas: pilot gates camera drag', /state\.playing/.test(canvasSrc));

  const pageSrc = readFileSync('app/life/page.jsx', 'utf8');
  t('page: pilot wired', /createPilot/.test(pageSrc));
  t('page: play button', /Pilot the spark/.test(pageSrc));
  t('page: game-over panel', /Fly again/.test(pageSrc));
  t('page: hull pips', /Hull/.test(pageSrc));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
