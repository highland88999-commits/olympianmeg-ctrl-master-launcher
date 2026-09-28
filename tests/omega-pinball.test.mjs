/*
 * Omega Pinball module tests — run with: node --test tests/omega-pinball.test.mjs
 * Covers the shooter lane (the reported "ball goes up but never enters the
 * playfield" bug), serve/plunge flow, and a static no-network audit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  createGame,
  startGame,
  stepGame,
  releasePlunger,
  serveBall,
  TABLE_W,
  TABLE_H,
} from '../app/omega-pinball/physics.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');

// Run the sim, collecting the minimum y reached, whether the ball entered the
// playfield (x < 340), and every event type fired.
function simulate(game, { charge, maxT = 14, dt = 1 / 60 }) {
  game.plunger.charge = charge;
  releasePlunger(game);
  let t = 0;
  let minY = Infinity;
  let enteredPlayfield = false;
  const seen = new Set();
  while (t < maxT && game.mode === 'play') {
    stepGame(game, dt);
    t += dt;
    if (game.ball.y < minY) minY = game.ball.y;
    if (game.ball.x < 340 - game.ball.r) enteredPlayfield = true;
    for (const e of game.events) seen.add(e.type);
  }
  return { t, minY, enteredPlayfield, seen, mode: game.mode, game };
}

function freshGame() {
  const g = createGame();
  startGame(g);
  return g;
}

// ---------- Shooter lane ----------

test('full-power plunge feeds the ball into the playfield via the gate', () => {
  const g = freshGame();
  const r = simulate(g, { charge: 1.0 });
  assert.ok(r.seen.has('gate'), 'expected the one-way lane gate to fire');
  assert.ok(r.enteredPlayfield, 'ball never reached the playfield region');
  assert.equal(g.ballsLeft, 3, 'no ball should be lost on a clean launch');
});

test('full-power ball stays on the table (lane is capped, no off-screen escape)', () => {
  const g = freshGame();
  const r = simulate(g, { charge: 1.0 });
  assert.ok(r.minY >= 0, `ball escaped over the top of the table (minY=${r.minY})`);
});

test('medium plunge enters the playfield through the gate', () => {
  const g = freshGame();
  const r = simulate(g, { charge: 0.3 });
  assert.ok(r.seen.has('gate'), 'expected the one-way lane gate to fire');
  assert.ok(r.enteredPlayfield, 'ball never reached the playfield region');
});

test('weak plunge that falls back is re-served, never soft-locks', () => {
  const g = freshGame();
  const r = simulate(g, { charge: 0.1, maxT: 14 });
  assert.ok(!r.enteredPlayfield, 'weak ball should not reach the playfield');
  assert.equal(r.mode, 'serve', `game soft-locked in mode '${r.mode}' with the ball stuck in the lane`);
  assert.equal(g.ballsLeft, 3, 'a ball that never entered play must not be lost');
  assert.deepEqual([g.ball.x, g.ball.y], [360, 742], 'ball should be back on the plunger');
});

test('barely-sub-threshold plunge also recovers to serve', () => {
  const g = freshGame();
  const r = simulate(g, { charge: 0.2, maxT: 14 });
  assert.equal(r.mode, 'serve', `game soft-locked in mode '${r.mode}'`);
  assert.equal(g.ballsLeft, 3);
});

test('shooter lane behaves across frame rates (60Hz and 120Hz phones)', () => {
  for (const dt of [1 / 60, 1 / 120]) {
    const g = freshGame();
    const r = simulate(g, { charge: 1.0, dt });
    assert.ok(r.seen.has('gate'), `gate did not fire at dt=${dt}`);
    assert.ok(r.enteredPlayfield, `ball never entered play at dt=${dt}`);
    const weak = freshGame();
    const rw = simulate(weak, { charge: 0.1, dt, maxT: 14 });
    assert.equal(rw.mode, 'serve', `weak launch soft-locked at dt=${dt}`);
  }
});

// ---------- Serve / plunge flow ----------

test('releasePlunger launches the ball and enters play mode', () => {
  const g = freshGame();
  assert.equal(g.mode, 'serve');
  g.plunger.charge = 0.5;
  releasePlunger(g);
  assert.equal(g.mode, 'play');
  assert.ok(g.ball.vy < -500, 'ball should leave the plunger moving upward');
  assert.equal(g.ball.vx, 0);
});

test('serveBall resets the ball to the plunger', () => {
  const g = freshGame();
  g.ball.x = 100;
  g.ball.y = 100;
  serveBall(g);
  assert.equal(g.mode, 'serve');
  assert.deepEqual([g.ball.x, g.ball.y, g.ball.vx, g.ball.vy], [360, 742, 0, 0]);
  assert.equal(g.gateArmed, false);
});

// ---------- Static audits ----------

test('module makes no network requests', () => {
  for (const f of ['../app/omega-pinball/page.jsx', '../app/omega-pinball/physics.js', '../app/omega-pinball/render.js']) {
    const src = read(f);
    assert.ok(!src.includes('fetch('), `${f} contains fetch(`);
    assert.ok(!src.includes('XMLHttpRequest'), `${f} contains XMLHttpRequest`);
    assert.ok(!src.includes('https://'), `${f} contains an https:// URL`);
    assert.ok(!src.includes('http://'), `${f} contains an http:// URL`);
  }
});

test('table geometry constants are sane', () => {
  assert.equal(TABLE_W, 400);
  assert.equal(TABLE_H, 800);
});
