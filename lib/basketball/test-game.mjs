// Headless tests for lib/basketball/game.js — run with: node test-game.mjs
import { BasketballGame } from './game.js';
import { placeBall, shootBall } from './physics.js';
import { RIM_Y, GAME } from './constants.js';

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

// Force a guaranteed swish: drop the ball through the attacked rim.
function forceSwish(game) {
  const rim = game.rim;
  game.startAim();
  placeBall(game.ball, rim.x, RIM_Y + 1.0, rim.z);
  shootBall(game.ball, { x: 0, y: -0.5, z: 0 });
  game.phase = 'flying';
}

// Force a wild miss.
function forceMiss(game) {
  game.startAim();
  const p = game.ballPos;
  placeBall(game.ball, p.x, p.y, p.z);
  shootBall(game.ball, { x: 9, y: 9, z: 9 });
  game.phase = 'flying';
}

function runUntilIdle(game, maxSec = 12) {
  for (let t = 0; t < maxSec; t += 1 / 60) {
    game.update(1 / 60);
    if (game.phase === 'idle' || game.screen === 'over') break;
  }
}

console.log('1) swish scores 3 and alternates ends');
{
  const g = new BasketballGame('shootout');
  const events = [];
  g.onEvent((t, p) => events.push(t));
  forceSwish(g);
  runUntilIdle(g);
  ok('score = 2 base + 1 swish', g.score === 3, `score=${g.score}`);
  ok('makes = 1', g.makes === 1);
  ok('streak = 1', g.streak === 1);
  ok('swish event fired', events.includes('swish'));
  ok('end alternated', g.end === 1, `end=${g.end}`);
  ok('back to idle', g.phase === 'idle');
}

console.log('2) miss resets streak, advances spot, keeps end');
{
  const g = new BasketballGame('shootout');
  g.streak = 2;
  const spot0 = g.spotIndex;
  forceMiss(g);
  runUntilIdle(g);
  ok('streak reset', g.streak === 0);
  ok('no points', g.score === 0);
  ok('attempt counted elsewhere (n/a here)', true);
  ok('spot advanced', g.spotIndex !== spot0, `spot=${g.spotIndex}`);
  ok('end unchanged', g.end === 0);
  ok('back to idle', g.phase === 'idle');
}

console.log('3) streak bonus caps correctly');
{
  const g = new BasketballGame('shootout');
  forceSwish(g); runUntilIdle(g); // +3 (streak 1)
  forceSwish(g); runUntilIdle(g); // +4 (streak 2: 2+1+1)
  forceSwish(g); runUntilIdle(g); // +5 (streak 3: 2+2+1)
  forceSwish(g); runUntilIdle(g); // +6 (streak 4: 2+3+1, capped)
  ok('total = 3+4+5+6 = 18', g.score === 18, `score=${g.score}`);
  ok('bestStreak = 4', g.bestStreak === 4);
}

console.log('4) timer expires -> game over');
{
  const g = new BasketballGame('shootout');
  const events = [];
  g.onEvent((t, p) => events.push([t, p]));
  g.timeLeft = 0.05;
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  ok('screen over', g.screen === 'over');
  ok('over event with stats', events.some(([t, p]) => t === 'over' && p.score === 0));
}

console.log('5) ball in flight at 0:00 -> buzzer-beater slow-mo');
{
  const g = new BasketballGame('shootout');
  const events = [];
  g.onEvent((t) => events.push(t));
  g.timeLeft = 0.05;
  forceSwish(g); // ball live as the clock hits zero
  for (let i = 0; i < 20; i++) g.update(1 / 60);
  ok('slow-mo engaged', g.slowMo === true && g.timeScale === GAME.buzzerSlowMo);
  ok('buzzer sounded', events.includes('buzzer'));
  runUntilIdle(g, 20);
  ok('buzzerBeater celebrated', events.includes('buzzerBeater'));
  ok('time scale restored', g.timeScale === 1 && g.slowMo === false);
  ok('shot counted', g.score === 3, `score=${g.score}`);
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  ok('game over after resolution', g.screen === 'over');
}

console.log('6) free play has no clock');
{
  const g = new BasketballGame('freeplay');
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  ok('still playing', g.screen === 'game');
  ok('timeLeft untouched', g.timeLeft === GAME.shootoutSeconds);
}

console.log('7) pause freezes everything');
{
  const g = new BasketballGame('shootout');
  g.togglePause();
  const t0 = g.timeLeft;
  forceSwish(g);
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  ok('timer frozen', g.timeLeft === t0);
  ok('ball frozen', g.ball.state === 'flying' && g.phase === 'flying');
  g.togglePause();
  runUntilIdle(g);
  ok('resumes and scores', g.score === 3, `score=${g.score}`);
}

console.log('8) aim defaults and shot velocity are sane');
{
  const g = new BasketballGame('shootout');
  g.startAim();
  const v = g.currentShotVelocity();
  const speed = Math.hypot(v.x, v.y, v.z);
  ok('speed in range', speed >= 6.5 && speed <= 15.5, `speed=${speed.toFixed(2)}`);
  g.moveAim(0, 400); // drag down -> more power
  const v2 = g.currentShotVelocity();
  ok('drag down increases speed', Math.hypot(v2.x, v2.y, v2.z) > speed);
  g.releaseShot();
  ok('phase flying', g.phase === 'flying');
  ok('attempt counted', g.attempts === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
