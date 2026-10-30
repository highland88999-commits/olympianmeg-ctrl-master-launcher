// Abyssal Voyage fairness (Merlin, 2026-10-29):
// 1. Gates spawn off-screen and scroll the full distance in —
//    consistent warning time at every speed.
// 2. Three gates cleared without damage restores hull to full.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, WORLD } from '../app/abyssal-voyage/engine.js';

function playingGame() {
  const g = createGame('abyssal', 42);
  g.phase = 'playing';
  g.nextSpawn = 9999; // suppress the random spawner; tests place their own gates
  return g;
}

test('gates spawn off-screen (below in the depths), never mid-screen', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = createGame('abyssal', seed);
    g.phase = 'playing';
    // force several spawns
    for (let i = 0; i < 5; i++) {
      g.nextSpawn = 0;
      stepGame(g, {}, 0.016);
    }
    for (const o of g.obstacles) {
      assert.ok(o.gapY > WORLD.height, `seed ${seed}: gapY ${o.gapY} should be off-screen below`);
    }
  }
});

test('three clean gates restore hull to full', () => {
  const g = playingGame();
  g.hull = 40;
  g.player.x = WORLD.width / 2;
  // place three gates already past the player (above, on the upward dive),
  // unpassed, far from x
  for (let i = 0; i < 3; i++) {
    g.obstacles.push({
      x: 0, w: 50, gapY: g.player.y - 200 - i * 10, gapH: 200, passed: false,
    });
  }
  // player at center (360), gates at x 0-50: no collision possible
  stepGame(g, {}, 0.016);
  assert.equal(g.cleanStreak, 0, 'streak resets after restore');
  assert.equal(g.hull, 100, 'hull restored to full after 3 clean gates');
});

test('damage resets the clean streak', () => {
  const g = playingGame();
  g.cleanStreak = 2;
  g.hull = 80;
  // park the player inside a gate's rock: force a hit
  g.player.x = 200;
  g.obstacles.push({
    x: 150, w: 100, gapY: g.player.y, gapH: 10, passed: false,
  });
  // gapH 10 at player y: gap is 5px tall, player r 22 -> rock hits
  stepGame(g, {}, 0.016);
  assert.ok(g.hull < 80, 'damage taken');
  assert.equal(g.cleanStreak, 0, 'streak broken by damage');
});

test('two clean gates do not restore hull', () => {
  const g = playingGame();
  g.hull = 40;
  for (let i = 0; i < 2; i++) {
    g.obstacles.push({
      x: 0, w: 50, gapY: g.player.y - 200 - i * 10, gapH: 200, passed: false,
    });
  }
  stepGame(g, {}, 0.016);
  assert.equal(g.hull, 40, 'hull untouched before 3 clean gates');
  assert.equal(g.cleanStreak, 2);
});
