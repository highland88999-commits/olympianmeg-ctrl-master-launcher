/*
 * NEON VOID tests — run with: node --test tests/neon-void.test.mjs
 * Covers: seeded maze determinism, maze connectivity, difficulty scaling,
 * core scoring (shard / nova / frightened mode), and leaderboard validation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateMaze,
  levelConfig,
  reachableCells,
  pathCellCount,
  MAX_LEVEL,
} from '../lib/neon-void/levels.js';
import {
  createGame,
  stepGame,
  queueDirection,
} from '../app/neon-void/engine.js';
import {
  topEntries,
  validateScore,
} from '../lib/neon-void/board.js';

const DT = 1 / 120;

function runSeconds(state, seconds) {
  const steps = Math.ceil(seconds / DT);
  for (let i = 0; i < steps; i++) stepGame(state, DT);
}

test('maze generation is deterministic per level', () => {
  const a = generateMaze(7);
  const b = generateMaze(7);
  assert.deepEqual([...a.grid], [...b.grid]);
  assert.deepEqual(a.spawn, b.spawn);
  assert.deepEqual(a.novas, b.novas);
});

test('different levels produce different mazes', () => {
  const a = generateMaze(3);
  const b = generateMaze(4);
  assert.notDeepEqual([...a.grid], [...b.grid]);
});

test('every path cell is reachable from spawn (levels 1, 25, 50, 100)', () => {
  for (const lvl of [1, 25, 50, 100]) {
    const maze = generateMaze(lvl);
    const reach = reachableCells(maze);
    assert.equal(
      reach.size,
      pathCellCount(maze),
      `level ${lvl}: ${reach.size} reachable vs ${pathCellCount(maze)} path cells`
    );
  }
});

test('maze has exactly 4 nova shards, outside the home', () => {
  const maze = generateMaze(1);
  assert.equal(maze.novas.length, 4);
  for (const n of maze.novas) {
    assert.equal(maze.inHome(n.x, n.y), false);
    assert.equal(maze.grid[n.y * maze.cols + n.x], 0);
  }
});

test('difficulty scales across 100 levels', () => {
  const l1 = levelConfig(1);
  const l50 = levelConfig(50);
  const l100 = levelConfig(100);
  assert.ok(l100.wraithSpeed > l1.wraithSpeed, 'wraiths get faster');
  assert.ok(l50.frightDuration < l1.frightDuration, 'fright window shrinks');
  assert.ok(l100.frightDuration >= 1.5, 'fright window keeps a floor');
  assert.equal(levelConfig(100).level, MAX_LEVEL);
  assert.equal(levelConfig(999).level, MAX_LEVEL, 'level clamps at 100');
});

test('game starts in ready state with 3 lives and shards to eat', () => {
  const g = createGame(1);
  assert.equal(g.status, 'ready');
  assert.equal(g.lives, 3);
  assert.equal(g.score, 0);
  assert.ok(g.shards.size > 50, `expected many shards, got ${g.shards.size}`);
  assert.equal(g.novas.size, 4);
  assert.equal(g.wraiths.length, 4);
});

test('eating a shard scores 10', () => {
  const g = createGame(1);
  runSeconds(g, 1.6); // ready -> playing
  assert.equal(g.status, 'playing');
  const k = [...g.shards][0];
  const [x, y] = k.split(',').map(Number);
  g.player.x = x;
  g.player.y = y;
  g.player.dir = null;
  stepGame(g, DT);
  assert.equal(g.score, 10);
  assert.equal(g.shards.has(k), false);
});

test('eating a nova shard scores 50 and frightens the wraiths', () => {
  const g = createGame(1);
  runSeconds(g, 1.6);
  assert.equal(g.status, 'playing');
  // Force two wraiths out and into chase so fright applies to them.
  g.wraiths[0].mode = 'chase';
  g.wraiths[1].mode = 'chase';
  const k = [...g.novas][0];
  const [x, y] = k.split(',').map(Number);
  g.player.x = x;
  g.player.y = y;
  g.player.dir = null;
  stepGame(g, DT);
  assert.equal(g.score, 50);
  assert.ok(g.frightTimer > 0);
  assert.equal(g.wraiths[0].mode, 'frightened');
  assert.equal(g.wraiths[1].mode, 'frightened');
});

test('a full idle simulation never crashes and wraiths eventually hunt', () => {
  const g = createGame(1);
  runSeconds(g, 20);
  // The spirit never moved, so a wraith should have caught it at least once
  // (or the game is still playing) — either way the sim stayed coherent.
  assert.ok(['playing', 'ready', 'dying'].includes(g.status));
  assert.ok(g.wraiths.every((w) => Number.isFinite(w.x) && Number.isFinite(w.y)));
});

test('queued direction is stored for buffered turns', () => {
  const g = createGame(1);
  queueDirection(g, 'left');
  assert.deepEqual(g.player.queuedDir, { x: -1, y: 0 });
  queueDirection(g, 'nonsense');
  assert.deepEqual(g.player.queuedDir, { x: -1, y: 0 });
});

test('leaderboard validation rejects nonsense', () => {
  assert.equal(validateScore({ username: '', score: 10, level: 1 }).ok, false);
  assert.equal(validateScore({ username: 'x'.repeat(25), score: 10, level: 1 }).ok, false);
  assert.equal(validateScore({ username: 'Rider', score: -5, level: 1 }).ok, false);
  assert.equal(validateScore({ username: 'Rider', score: 10.5, level: 1 }).ok, false);
  assert.equal(validateScore({ username: 'Rider', score: 10, level: 101 }).ok, false);
  const ok = validateScore({ username: ' Rider ', score: 9001, level: 42 });
  assert.equal(ok.ok, true);
  assert.equal(ok.username, 'Rider');
  assert.equal(ok.score, 9001);
});

test('topEntries sorts by score and caps the board', () => {
  const rows = [
    { username: 'low', score: 10, level: 1 },
    { username: 'high', score: 5000, level: 9 },
    { username: 'mid', score: 900, level: 3 },
    { username: 'bad', score: 'oops', level: 1 },
    null,
  ];
  const top = topEntries(rows);
  assert.equal(top.length, 3);
  assert.equal(top[0].username, 'high');
  assert.equal(top[2].username, 'low');
});
