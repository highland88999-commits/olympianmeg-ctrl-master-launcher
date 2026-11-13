/*
 * THE FLYING DUTCHMAN module tests — run with: node --test tests/flying-dutchman.test.mjs
 * Covers the 3D naval engine (engine.js): sailing, broadsides, souls,
 * the open world (islands + treasure chests), and static audits of the
 * 3D shell (page.jsx, ship3d.js, world3d.js).
 *
 * The old 2D voyage (sea.js chapters/gate/log) is gone; these tests
 * replace the stale file that imported it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  makeWorld, makeShip, makeAI, waveHeight, stepWorld, fireBroadside,
  makeWind, stepWind, stepShip, stepAI, spawnWave, spawnSouls, stepSouls,
  makeIslands, makeChests, collideIslands, stepChests, makeRng,
  SHIP, SAILS, ISLAND, clamp,
} from '../app/flying-dutchman/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const pageSrc = read('../app/flying-dutchman/page.jsx');
const shipSrc = read('../app/flying-dutchman/ship3d.js');
const worldSrc = read('../app/flying-dutchman/world3d.js');

// ---------- Sea math ----------

test('waveHeight is deterministic', () => {
  assert.equal(waveHeight(100, 5, 1.5), waveHeight(100, 5, 1.5));
  assert.ok(Number.isFinite(waveHeight(-300, 700, 12)));
  let max = 0;
  for (let x = 0; x < 2000; x += 37) max = Math.max(max, Math.abs(waveHeight(x, 5, 0)));
  assert.ok(max > 0, 'waves must have some height');
});

// ---------- The open world ----------

test('makeWorld builds a deterministic island ring with chests', () => {
  const a = makeWorld(1234);
  const b = makeWorld(1234);
  assert.equal(a.islands.length, ISLAND.count);
  assert.deepEqual(a.islands, b.islands, 'same seed must give the same isles');
  assert.deepEqual(a.chests, b.chests, 'same seed must give the same chests');
  assert.ok(a.chests.length >= ISLAND.count, 'at least one chest per isle');
  assert.ok(a.chests.length <= ISLAND.count * 2, 'at most two chests per isle');
});

test('islands sit in a ring around the spawn, clear of it', () => {
  const w = makeWorld(42);
  for (const isl of w.islands) {
    const d = Math.hypot(isl.x, isl.z);
    assert.ok(d >= ISLAND.minDist && d <= ISLAND.maxDist, `isle ${isl.id} at ${d}`);
    assert.ok(isl.r >= ISLAND.minR && isl.r <= ISLAND.maxR);
    assert.ok(isl.h >= ISLAND.minH && isl.h <= ISLAND.maxH);
  }
});

test('chests sit on sandbars just off an island beach', () => {
  const w = makeWorld(42);
  for (const c of w.chests) {
    const isl = w.islands.find((i) => i.id === c.islandId);
    assert.ok(isl, `chest ${c.id} names a real isle`);
    const d = Math.hypot(c.x - isl.x, c.z - isl.z);
    assert.ok(d > isl.r && d < isl.r + 20, `chest ${c.id} ${d} from its isle (r ${isl.r})`);
    assert.equal(c.opened, false);
  }
});

test('collideIslands pushes a ship out of an island and kills its way', () => {
  const w = makeWorld(7);
  const isl = w.islands[0];
  const s = makeShip({ x: isl.x + 5, z: isl.z }); // just off-centre, inside the isle
  s.speed = 10;
  collideIslands(s, w.islands);
  const d = Math.hypot(s.x - isl.x, s.z - isl.z);
  assert.ok(d >= isl.r + ISLAND.shipClearance - 0.001, `ship pushed to ${d}`);
  assert.ok(s.speed < 10, 'speed must drop on grounding');
  // A ship already clear is untouched.
  const s2 = makeShip({ x: isl.x + isl.r + 500, z: isl.z });
  s2.speed = 10;
  collideIslands(s2, w.islands);
  assert.equal(s2.x, isl.x + isl.r + 500);
  assert.equal(s2.speed, 10);
});

test('stepChests pays souls + hull + crew within range, once only', () => {
  const w = makeWorld(99);
  const c = w.chests[0];
  const p = w.player;
  p.hull = 50;
  p.crew = 8;
  p.x = c.x; p.z = c.z;
  const ev = [];
  stepChests(w, ev);
  assert.equal(c.opened, true);
  assert.equal(p.souls, ISLAND.chestSouls);
  assert.equal(p.hull, 50 + ISLAND.chestHull);
  assert.equal(p.crew, 9);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'chest');
  // Second pass: nothing more.
  const ev2 = [];
  stepChests(w, ev2);
  assert.equal(p.souls, ISLAND.chestSouls);
  assert.equal(ev2.length, 0);
});

test('stepChests ignores chests out of range', () => {
  const w = makeWorld(99);
  const c = w.chests[0];
  const p = w.player;
  p.x = c.x + ISLAND.chestPickupR + 100; p.z = c.z;
  const ev = [];
  stepChests(w, ev);
  assert.equal(c.opened, false);
  assert.equal(ev.length, 0);
});

test('stepWorld sails the player into an island and pushes them out', () => {
  const w = makeWorld(5);
  const isl = w.islands[0];
  const p = w.player;
  // Park the player just outside the island, bow-on, full sail.
  p.x = isl.x;
  p.z = isl.z + isl.r + 30;
  p.heading = Math.PI; // bow toward the isle
  p.sails = SAILS.FULL;
  for (let i = 0; i < 600; i++) stepWorld(w, { rudder: 0, sails: SAILS.FULL, fire: null }, 1 / 60);
  const d = Math.hypot(p.x - isl.x, p.z - isl.z);
  assert.ok(d >= isl.r + ISLAND.shipClearance - 0.01, `player ended ${d} from isle centre`);
});

// ---------- Sailing / cannons / souls still work ----------

test('fireBroadside fires six balls and sets the reload', () => {
  const s = makeShip();
  const r = fireBroadside(s, 'port', 0);
  assert.equal(r.fired, true);
  assert.equal(r.balls.length, SHIP.cannonsPerSide);
  assert.ok(s.reloadPort > 0);
  const r2 = fireBroadside(s, 'port', 0);
  assert.equal(r2.fired, false, 'reload must block a second broadside');
});

test('stepWorld spawns a wave and the AI sails without error', () => {
  const w = makeWorld(1234);
  spawnWave(w, 1);
  assert.equal(w.enemies.length, 1);
  for (let i = 0; i < 600; i++) stepWorld(w, { rudder: 0, sails: SAILS.FULL, fire: null }, 1 / 60);
  assert.ok(w.t > 9, 'world time must advance');
  assert.ok(Number.isFinite(w.player.x) && Number.isFinite(w.player.z));
});

test('souls drift to a ship and join the crew', () => {
  const w = makeWorld(1234);
  const p = w.player;
  const souls = [];
  spawnSouls(souls, p.x + 5, p.z, 2, w.rng);
  assert.equal(souls.length, 2);
  const crew0 = p.crew;
  for (let i = 0; i < 1200; i++) stepSouls(souls, [p], 1 / 60, w.t + i / 60, []);
  assert.ok(p.crew >= crew0, 'souls must not lose crew');
});

test('wind steps and a ship gains way under full sail', () => {
  const w = makeWind(3);
  const s = makeShip();
  s.sails = SAILS.FULL;
  for (let i = 0; i < 600; i++) { stepWind(w, 1 / 60); stepShip(s, 1 / 60, w); }
  assert.ok(s.speed > 1, `ship should be moving, speed ${s.speed}`);
  assert.ok(Math.hypot(s.x, s.z) > 10, 'ship must have travelled');
});

// ---------- Static audits (regression guards) ----------

test('ship3d: pennants carry userData.base and animateShip guards a missing base', () => {
  assert.ok(shipSrc.includes('pen.userData.base'), 'pennant must get userData.base');
  assert.ok(shipSrc.includes('if (!base) continue'), 'animateShip must guard a missing base');
});

test('world3d builds islands and chests', () => {
  assert.ok(worldSrc.includes('export function createIslands'));
  assert.ok(worldSrc.includes('export function createChests'));
  assert.ok(worldSrc.includes('sync(list, t)'), 'chests must sync open/bob state');
});

test('page.jsx wires the world: builds isles + chests, syncs them, pays chests', () => {
  assert.ok(pageSrc.includes("from './world3d.js'"), 'must import world3d');
  assert.ok(pageSrc.includes('createIslands(scene, world.islands)'));
  assert.ok(pageSrc.includes('createChests(scene, world.chests)'));
  assert.ok(pageSrc.includes('G.chests.sync(world.chests, t)'));
  assert.ok(pageSrc.includes('G.islands.update(t)'));
  assert.ok(pageSrc.includes("e.type === 'chest'"), 'must handle the chest event');
  assert.ok(pageSrc.includes('collideIslands(p, world.islands)'));
  assert.ok(pageSrc.includes('stepChests(world, ev)'));
});

test('page.jsx JSX is structurally balanced', () => {
  let s = pageSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  for (const ch of s) {
    if ('([{'.includes(ch)) stack.push(ch);
    else if (')]}'.includes(ch)) {
      assert.ok(stack.length > 0, `unbalanced closing ${ch}`);
      assert.equal(stack.pop(), pairs[ch], `mismatched bracket near ${ch}`);
    }
  }
  assert.equal(stack.length, 0, `unclosed brackets remain: ${stack.join('')}`);
});
