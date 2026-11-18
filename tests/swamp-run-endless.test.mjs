/*
 * SWAMP RUN — ENDLESS tests (Merlin, Nov 18, 2026).
 * The swamp has no edge: the terrain streams past the old 620 m home
 * square, the player/croc/gator are never clamped, and the croc's
 * patrol follows the player far out. Run with:
 * node --test tests/swamp-run-endless.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  chunkFor,
  chunkKey,
  chunkBounds,
  chunksAround,
  chunkSetDiff,
  chunkHeightField,
  chunkIsFar,
  chunkVegetation,
  groundHeightAt,
  CHUNK_M,
  STREAM_RADIUS_CHUNKS,
  STREAM_CHUNK_COUNT,
} from '../lib/swamp-run/streaming.js';
import { terrainHeight, WORLD_HALF, nearestWater } from '../lib/swamp-run/world.js';
import { createGame, stepGame, setInput, drainEvents } from '../app/swamp-run/engine.js';

const DT = 1 / 120;

function runSeconds(state, seconds) {
  const steps = Math.ceil(seconds / DT);
  for (let i = 0; i < steps; i++) stepGame(state, DT);
}

function playBoated(seed = 7) {
  const g = createGame(seed);
  runSeconds(g, 1.3);
  assert.equal(g.status, 'playing');
  // Board by walking into the canoe's berth: the player starts on foot
  // 2.5 m from the parked canoe, facing it — step forward.
  g.player.heading = Math.atan2(g.canoe.x - g.player.x, g.canoe.z - g.player.z);
  setInput(g, { thrust: 1, turn: 0, sprint: false });
  runSeconds(g, 2);
  drainEvents(g);
  return g;
}

// Boarded, then placed on open water just inside the old north edge
// (z = -290) facing north — close enough that the crossing is a real
// paddle, far enough from the home patrol ring that the croc can't
// spot the quiet paddler mid-test and turn it into a chase.
function playAtEdge(seed = 7) {
  const g = playBoated(seed);
  assert.equal(g.player.mode, 'canoe');
  const spot = nearestWater(seed, g.player.x, -290);
  g.player.x = spot.x;
  g.player.z = spot.z;
  g.canoe.x = spot.x;
  g.canoe.z = spot.z;
  g.player.heading = Math.PI;
  g.canoe.heading = Math.PI;
  return g;
}

function paddleNorth(state, seconds) {
  // Heading 0 faces +z in engine convention (sin/cos); north is -z,
  // i.e. heading PI. Steer straight, full thrust, no sprint.
  state.player.heading = Math.PI;
  setInput(state, { thrust: 1, turn: 0, sprint: false });
  runSeconds(state, seconds);
  drainEvents(state);
}

// ---------------------------------------------------------------- chunk law --
test('chunk law: floors for negatives, ring is centre-first, 5x5 at radius 2', () => {
  assert.deepEqual(chunkFor(-1, -1), { cx: -1, cz: -1 });
  assert.deepEqual(chunkFor(64, 64), { cx: 1, cz: 1 });
  assert.equal(chunkKey(2, -3), '2,-3');
  assert.deepEqual(chunkBounds(1, -1), { x0: 64, z0: -64, x1: 128, z1: 0 });
  const ring = chunksAround(0, 0);
  assert.equal(ring.length, STREAM_CHUNK_COUNT);
  assert.equal(STREAM_CHUNK_COUNT, 25);
  assert.deepEqual({ cx: ring[0].cx, cz: ring[0].cz }, { cx: 0, cz: 0 });
  const far = chunksAround(1000, -1000);
  assert.equal(far[0].cx, 15);
  assert.equal(far[0].cz, -16);
});

test('chunkSetDiff loads the new ring and drops the old', () => {
  const a = chunksAround(0, 0).map((c) => c.key);
  const b = chunksAround(500, 0).map((c) => c.key);
  const d = chunkSetDiff(a, b);
  assert.ok(d.load.length > 0 && d.drop.length > 0);
  assert.equal(new Set([...d.load, ...a.filter((k) => !d.drop.includes(k))]).size, b.length);
});

test('chunk heights match the terrain law everywhere, including far out', () => {
  for (const [seed, cx, cz] of [[7, 0, 0], [7, 40, -25], [7, -120, 300], [42, 9, 9]]) {
    const f = chunkHeightField(seed, cx, cz);
    const n = 33;
    assert.equal(f.positions.length, n * n * 3);
    assert.equal(f.indices.length, 32 * 32 * 6);
    // Corner + centre samples agree with terrainHeight/groundHeightAt.
    const { x0, z0 } = chunkBounds(cx, cz);
    for (const [ix, iz] of [[0, 0], [16, 16], [32, 32], [5, 27]]) {
      const vi = iz * n + ix;
      const wx = x0 + ix * 2;
      const wz = z0 + iz * 2;
      // Float32 storage: compare within float32 epsilon, not exactly.
      assert.ok(Math.abs(f.positions[vi * 3 + 1] - groundHeightAt(seed, wx, wz)) < 1e-6);
      assert.ok(Number.isFinite(f.positions[vi * 3 + 1]));
    }
    // No height blows up far out (the old rim problem, swamp edition).
    let max = -Infinity;
    for (let i = 1; i < f.positions.length; i += 3) max = Math.max(max, f.positions[i]);
    assert.ok(max < 3, `far chunk max height ${max}`);
  }
});

test('chunk field is deterministic per seed and chunk', () => {
  const a = chunkHeightField(7, 40, -25);
  const b = chunkHeightField(7, 40, -25);
  assert.deepEqual(a.positions, b.positions);
  assert.deepEqual(a.colors, b.colors);
  const c = chunkHeightField(8, 40, -25);
  assert.notDeepEqual(a.positions, c.positions);
});

test('chunkIsFar: home chunks are not far, past-edge chunks are', () => {
  assert.equal(chunkIsFar(0, 0), false);
  assert.equal(chunkIsFar(4, 0), false); // 256..320 overlaps the home edge
  assert.equal(chunkIsFar(0, -5), false); // -320..-256 overlaps the home edge
  assert.equal(chunkIsFar(5, 0), true); // 320..384 fully past 310
  assert.equal(chunkIsFar(-5, -5), false); // -320..-256 still overlaps home
  assert.equal(chunkIsFar(-6, -6), true); // -384..-320 fully past -310
});

test('chunk vegetation: deterministic, on the home grid, land + knee trees', () => {
  const a = chunkVegetation(7, 5, 0);
  const b = chunkVegetation(7, 5, 0);
  assert.deepEqual(a, b);
  assert.ok(a.trees.length > 0, 'a far chunk grows trees');
  for (const t of a.trees) {
    assert.ok(t.x >= 320 && t.x < 384, `tree x ${t.x} inside chunk 5,0`);
    assert.ok(t.z >= 0 && t.z < 64, `tree z ${t.z} inside chunk 5,0`);
    const h = terrainHeight(7, t.x, t.z);
    assert.ok(t.water ? (h > -0.16 && h <= 0) : h > 0.06);
  }
  const other = chunkVegetation(7, 6, 0);
  assert.notDeepEqual(a.trees, other.trees);
});

test('nearestWater works far from home (no home-square bound)', () => {
  const p = nearestWater(7, 2000, -1500);
  assert.ok(Math.abs(p.x - 2000) <= 130 && Math.abs(p.z + 1500) <= 130);
});

// ------------------------------------------------------------- no clamp ------
test('the player paddles past the old 310 m edge and keeps going', () => {
  const g = playAtEdge(7);
  paddleNorth(g, 60); // ~6 m/s * 60 s — far past the old edge
  assert.ok(Math.abs(g.player.z) > WORLD_HALF + 100, `z=${g.player.z}`);
  assert.equal(g.status, 'playing');
  // And back: no wall on the return leg either.
  g.player.heading = 0;
  setInput(g, { thrust: 1, turn: 0, sprint: false });
  runSeconds(g, 60);
  assert.ok(Math.abs(g.player.z) < WORLD_HALF + 100, `returned z=${g.player.z}`);
});

test('the croc patrols near a far-out player instead of staying home', () => {
  const g = playAtEdge(7);
  paddleNorth(g, 60);
  const pz = g.player.z;
  assert.ok(Math.abs(pz) > WORLD_HALF + 100);
  // Stop paddling and wait: the croc is in patrol (never spotted the
  // quiet paddler) and must close on the player, not the home
  // waypoints (~240 m from the player at the old edge). The croc
  // patrols at 3.1 m/s, so give it 240 s to cover the ~500–800 m.
  setInput(g, { thrust: 0, turn: 0, sprint: false });
  const dBefore = Math.hypot(g.croc.x - g.player.x, g.croc.z - g.player.z);
  runSeconds(g, 240);
  drainEvents(g);
  const dAfter = Math.hypot(g.croc.x - g.player.x, g.croc.z - g.player.z);
  assert.ok(dAfter < dBefore, `croc closed from ${dBefore.toFixed(0)} to ${dAfter.toFixed(0)} m`);
  assert.ok(dAfter < 200, `croc is near the far-out player (${dAfter.toFixed(0)} m)`);
});

test('the gator resettles near a far-out player', () => {
  const g = playAtEdge(7);
  paddleNorth(g, 60);
  // Force a rest cycle: the gator picks a new lurk spot ringing the player.
  g.gator.mode = 'rest';
  g.gator.restTimer = 0.01;
  runSeconds(g, 0.5);
  assert.equal(g.gator.mode, 'lurk');
  const d = Math.hypot(g.gator.x - g.player.x, g.gator.z - g.player.z);
  assert.ok(d >= 30 && d <= 100, `gator resettled ${d.toFixed(0)} m from the player`);
});
