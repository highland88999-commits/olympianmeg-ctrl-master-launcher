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
  stepBalls, damageShip, distToCenterline2, targetSpeed, sinkDropK,
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

// ---------- Combat: damage must actually land (Merlin, 2026-11-14) ----------
//
// The video showed 147 s of broadsides with zero damage. Two causes,
// both proven by probe before the fix:
//  (a) the hit test only ran when a ball reached the water — balls flew
//      straight through a hull and splashed harmlessly beyond it, so
//      10 broadsides at 80 m abeam scored 0 hits out of 60 balls;
//  (b) hull repair ran at 0.5/6-crew/s, erasing +40 hull a minute.
// The fix: a ball counts a direct hit the moment it crosses the hull
// band, splashes measure to the center line, and repair is slow.

test('distToCenterline2 measures the ship as a line, not a point', () => {
  const s = makeShip({ x: 0, z: 0, heading: 0 }); // center line x=0, z in [-11, 11]
  assert.equal(distToCenterline2(0, 5, s), 0);
  assert.equal(distToCenterline2(10, 5, s), 100);
  assert.equal(distToCenterline2(0, 21, s), 100); // 10 m past the bow
});

test('a ball crossing the hull band mid-flight scores a direct hit', () => {
  const target = makeShip({ x: 0, z: 0, heading: 0 });
  const balls = [{
    x: -30, y: 3.0, z: 0, vx: 58, vy: 0, vz: 0,
    fromId: 'other', delay: 0, life: 6,
  }];
  const events = [];
  for (let i = 0; i < 120 && balls.length; i++) {
    stepBalls(balls, [target], [], 1 / 60, i / 60, events, () => 0.5);
  }
  assert.equal(target.hull, SHIP.maxHull - SHIP.dmgDirect);
  assert.equal(events.filter((e) => e.type === 'hit').length, 1);
  assert.equal(events.find((e) => e.type === 'hit').dmg, SHIP.dmgDirect);
});

test('a ball passing clear of the ship does not hit', () => {
  const target = makeShip({ x: 0, z: 0, heading: 0 });
  // 30 m clear of the center line: outside the 4.2 m direct radius
  // and outside the 12 m splash radius, even if a wave crest drops
  // the ball early.
  const balls = [{
    x: -30, y: 3.0, z: 30, vx: 58, vy: 0, vz: 0,
    fromId: 'other', delay: 0, life: 6,
  }];
  const events = [];
  for (let i = 0; i < 120 && balls.length; i++) {
    stepBalls(balls, [target], [], 1 / 60, i / 60, events, () => 0.5);
  }
  assert.equal(target.hull, SHIP.maxHull);
  assert.equal(events.filter((e) => e.type === 'hit').length, 0);
  assert.equal(events.filter((e) => e.type === 'splash').length, 1);
});

test('a near miss in the water still splashes the hull', () => {
  const target = makeShip({ x: 0, z: 0, heading: 0 });
  // Dropped straight down 6 m off the center line: outside the 4.2 m
  // direct-hit radius, inside the 12 m splash radius.
  const balls = [{
    x: 6, y: 0.5, z: 0, vx: 0, vy: -5, vz: 0,
    fromId: 'other', delay: 0, life: 6,
  }];
  const events = [];
  for (let i = 0; i < 120 && balls.length; i++) {
    stepBalls(balls, [target], [], 1 / 60, i / 60, events, () => 0.5);
  }
  assert.equal(target.hull, SHIP.maxHull - SHIP.dmgSplash);
  assert.equal(events.find((e) => e.type === 'hit').dmg, SHIP.dmgSplash);
});

test('broadsides abeam at 80 m land hits now (was 0 of 60 balls)', () => {
  let hits = 0, direct = 0;
  for (let trial = 0; trial < 10; trial++) {
    const shooter = makeShip({ x: 0, z: 0, heading: 0, crew: 8 });
    const target = makeShip({ x: 80, z: 0, heading: 0, crew: 6 });
    const wind = makeWind(7);
    const balls = [];
    const { balls: b } = fireBroadside(shooter, 'stbd', 0);
    balls.push(...b);
    const events = [];
    for (let i = 0; i < 360 && balls.length; i++) {
      stepShip(target, 1 / 60, wind);
      stepBalls(balls, [shooter, target], [], 1 / 60, i / 60, events, () => 0.5);
    }
    for (const e of events) {
      if (e.type === 'hit') { hits += 1; if (e.dmg === SHIP.dmgDirect) direct += 1; }
    }
  }
  assert.ok(hits >= 10, `expected broadsides to land, got ${hits} hits of 60 balls`);
  assert.ok(direct > 0, 'at least one direct hit, not splashes only');
});

test('hull repair no longer erases a fight', () => {
  const wind = makeWind(7);
  const p = makeShip({ crew: 8 }); p.hull = 50;
  const ai = makeShip({ crew: 6 }); ai.hull = 50;
  for (let i = 0; i < 3600; i++) { stepShip(p, 1 / 60, wind); stepShip(ai, 1 / 60, wind); }
  assert.ok(p.hull - 50 <= 15, `player repaired ${p.hull - 50} in 60 s (was 40)`);
  assert.ok(ai.hull - 50 <= 15, `AI repaired ${ai.hull - 50} in 60 s (was 30)`);
  assert.ok(p.hull > 50, 'repair still exists, just slow');
});

// ---------- Wreck: fire, sink, souls ----------

test('a wreck burns, sinks, and releases one soul per crewman aboard', () => {
  const souls = [];
  const ev = [];
  const ai = makeAI(0, 100, 100, 1); // crew 6, hull 80
  assert.equal(ai.crew, 6);
  damageShip(ai, ai.hull, ev, souls, () => 0.5, ai.x, ai.z);
  assert.equal(ai.hull, 0);
  assert.equal(ai.alive, false);
  assert.equal(ai.sinking, true);
  assert.equal(ai.burning, true);
  assert.equal(ev.filter((e) => e.type === 'sunk').length, 1);
  assert.equal(souls.length, 6, 'one soul per crewman aboard');
  assert.ok(souls.every((s) => s.life === SHIP.soulLife));
});

test('the player wreck burns and sinks on the same path', () => {
  const p = makeShip({ isPlayer: true, crew: 8 });
  damageShip(p, 200, [], [], () => 0.5, 0, 0);
  assert.equal(p.alive, false);
  assert.equal(p.sinking, true);
  assert.equal(p.burning, true);
  const wind = makeWind(1);
  stepShip(p, 1, wind);
  assert.ok(p.sinkT > 0, 'the wreck settles over time');
});

test('a close fight wrecks an AI ship in about a minute of action', () => {
  const wind = makeWind(7);
  const shooter = makeShip({ x: 0, z: 0, heading: 0, crew: 8 });
  const target = makeShip({ x: 70, z: 0, heading: 0, crew: 6 });
  target.maxHull = 87; target.hull = 87; target._hullAtCrewLoss = 87;
  const souls = [];
  const balls = [];
  let t = 0, broadsides = 0;
  while (target.alive && t < 120) {
    const dt = 1 / 60; t += dt;
    stepShip(shooter, dt, wind);
    stepShip(target, dt, wind);
    // Hold the shooter abeam at 70 m — a chase, not a sitting duck.
    shooter.x = target.x - 70; shooter.z = target.z; shooter.heading = target.heading;
    if (shooter.reloadStbd <= 0) {
      const r = fireBroadside(shooter, 'stbd', t);
      if (r.fired) { balls.push(...r.balls); broadsides += 1; }
    }
    stepBalls(balls, [shooter, target], souls, dt, t, [], () => 0.5);
  }
  assert.equal(target.alive, false, `AI should be wrecked within 120 s (t=${t.toFixed(1)}, broadsides=${broadsides})`);
  assert.equal(target.burning, true);
  assert.equal(souls.length, 6, 'one soul per crewman aboard');
  assert.ok(broadsides >= 5, 'several broadsides, not one lucky shot');
});

// ---------- Helm: the joystick drives forwards and back (Merlin, 2026-11-14)
//
// The 35 s video showed the stick steering only — speed was fully
// automatic. Now the stick's up/down axis is the throttle: push up for
// way ahead, pull down to brake, stop, then back her astern. The
// throttle stays where you leave it (a lever, not a spring) and the
// rudder still springs back to centre.

test('throttle drives the ship: full ahead, half at rest, astern in reverse', () => {
  // Fixed running wind: dead astern, strength 1 — target is full speed.
  const wind = { dir: 0, strength: 1, _t: 0 };
  const tgt = targetSpeed(makeShip({ crew: 8 }), wind); // ~15.6 m/s
  assert.ok(tgt > 14, `running target should be near max, got ${tgt}`);

  const ahead = makeShip({ crew: 8 });
  ahead.throttle = 1;
  for (let i = 0; i < 600; i++) stepShip(ahead, 1 / 60, wind);
  assert.ok(ahead.speed > 14, `full ahead should reach target, got ${ahead.speed}`);

  const half = makeShip({ crew: 8 });
  half.throttle = 0.5;
  for (let i = 0; i < 600; i++) stepShip(half, 1 / 60, wind);
  assert.ok(half.speed > 6.5 && half.speed < 9, `half throttle should hold half way, got ${half.speed}`);

  const stopped = makeShip({ crew: 8 });
  stopped.throttle = 0;
  for (let i = 0; i < 600; i++) stepShip(stopped, 1 / 60, wind);
  assert.ok(Math.abs(stopped.speed) < 0.1, `zero throttle should hold her still, got ${stopped.speed}`);

  const astern = makeShip({ crew: 8 });
  astern.throttle = -1;
  for (let i = 0; i < 600; i++) stepShip(astern, 1 / 60, wind);
  assert.ok(astern.speed < -3.5 && astern.speed > -4.5, `full astern should back at reverseMax, got ${astern.speed}`);
});

test('no throttle in the input keeps the old full-ahead behaviour', () => {
  const w = makeWorld(5);
  const isl = w.islands[0];
  const p = w.player;
  p.x = isl.x;
  p.z = isl.z + isl.r + 30;
  p.heading = Math.PI;
  p.sails = SAILS.FULL;
  for (let i = 0; i < 600; i++) stepWorld(w, { rudder: 0, sails: SAILS.FULL, fire: null }, 1 / 60);
  const d = Math.hypot(p.x - isl.x, p.z - isl.z);
  assert.ok(d >= isl.r + ISLAND.shipClearance - 0.01, `player must still reach the isle, ended ${d}`);
});

test('pulling the stick down brakes, then backs her', () => {
  const wind = { dir: 0, strength: 1, _t: 0 };
  const s = makeShip({ crew: 8 });
  s.speed = 10;
  s.throttle = -1;
  for (let i = 0; i < 60; i++) stepShip(s, 1 / 60, wind);
  assert.ok(s.speed < 5, `one second of reverse throttle should brake hard, got ${s.speed}`);
  for (let i = 0; i < 240; i++) stepShip(s, 1 / 60, wind);
  assert.ok(s.speed < -3, `she should be moving astern after 5 s, got ${s.speed}`);
});

// ---------- Anchor: drop it to pivot, weigh it to sail (Merlin, 2026-11-14)

test('the anchor kills her way fast and lets her pivot at zero speed', () => {
  const wind = { dir: 0, strength: 1, _t: 0 };
  const s = makeShip({ crew: 8 });
  s.speed = 12;
  s.rudder = 1;
  s.anchored = true;
  s.throttle = 1;
  for (let i = 0; i < 120; i++) stepShip(s, 1 / 60, wind);
  assert.ok(Math.abs(s.speed) < 0.5, `anchored she should be dead in the water, got ${s.speed}`);
  // Turn rate anchored: 0.55 * 0.8 (full sail) * 2.2 (anchor) * 1 (full
  // authority at zero way) ≈ 0.97 rad/s — a sharp pivot, not a drift.
  assert.ok(s.heading > 1.5, `anchored she should pivot sharply, turned ${s.heading} rad in 2 s`);
});

test('anchored she stays stopped even at full throttle', () => {
  const wind = { dir: 0, strength: 1, _t: 0 };
  const s = makeShip({ crew: 8 });
  s.anchored = true;
  s.throttle = 1;
  for (let i = 0; i < 300; i++) stepShip(s, 1 / 60, wind);
  assert.ok(Math.abs(s.speed) < 0.5, `anchored + full throttle must stay stopped, got ${s.speed}`);
});

test('firing while anchored is allowed', () => {
  const s = makeShip({ crew: 8 });
  s.anchored = true;
  const r = fireBroadside(s, 'port', 0);
  assert.equal(r.fired, true, 'the guns must still fire at anchor');
  assert.equal(r.balls.length, SHIP.cannonsPerSide);
});

// ---------- Sinking: downed ships actually go under (Merlin, 2026-11-14)
//
// The old wreck dropped 9 m in 6 s, but the main masthead stands
// 20.6 m above the water — the masts never went under, and the enemy
// then popped out of existence. Now the drop clears the masthead,
// the hull goes under early and the masthead last, and the wreck
// keeps her way while she goes down.

test('a wreck keeps her way while she goes down', () => {
  const wind = { dir: 0, strength: 1, _t: 0 };
  const s = makeShip({ crew: 8 });
  s.speed = 10;
  damageShip(s, 200, [], [], () => 0.5, 0, 0);
  assert.equal(s.alive, false);
  for (let i = 0; i < 60; i++) stepShip(s, 1 / 60, wind);
  assert.ok(s.sinkT > 0.9, 'the wreck must settle over time');
  assert.ok(s.z > 5, `a wreck should glide forward as she sinks, moved ${s.z} m`);
  assert.ok(s.speed < 10 && s.speed > 0, `her way should decay, not freeze, speed ${s.speed}`);
});

test('sinkDropK puts the hull under early and the masthead under last', () => {
  assert.equal(sinkDropK(0), 0);
  // Deck and rails (~5 m) are under by 60% of the sink.
  assert.ok(sinkDropK(0.6) > 5, `deck should be under by k=0.6, drop ${sinkDropK(0.6)}`);
  // The masthead (20.6 m) is still up at k = 0.94 and under at k = 0.95.
  assert.ok(sinkDropK(0.94) < SHIP.mastheadY, 'masthead must still stand at k=0.94');
  assert.ok(sinkDropK(0.95) >= SHIP.mastheadY, 'masthead must be under by k=0.95');
  assert.ok(sinkDropK(1) > SHIP.mastheadY, 'nothing of the ship may be left above water');
  assert.equal(sinkDropK(1), SHIP.sinkDrop);
});

test('floating souls cap, last three minutes, and collect at chest range', () => {
  const souls = [];
  spawnSouls(souls, 0, 0, 100, () => 0.5);
  assert.equal(souls.length, SHIP.maxFloatingSouls, 'souls never accumulate without bound');
  assert.ok(souls.every((s) => s.life === SHIP.soulLife));
  assert.equal(SHIP.soulPickupR, ISLAND.chestPickupR, 'souls use the chest collection reach');

  // A soul 15 m off is claimed on the first pass.
  const p = makeShip({ x: 0, z: 0, crew: 8 });
  p.hull = 50;
  const near = [{ x: 15, z: 0, vx: 0, vz: 0, life: SHIP.soulLife, phase: 0 }];
  const ev = [];
  stepSouls(near, [p], 1 / 60, 0, ev);
  assert.equal(near.length, 0, 'a soul 15 m off is claimed');
  assert.equal(p.souls, 1);
  assert.equal(p.crew, 9);
  assert.equal(ev.filter((e) => e.type === 'soul').length, 1);

  // A soul 25 m off stays floating.
  const far = [{ x: 25, z: 0, vx: 0, vz: 0, life: SHIP.soulLife, phase: 0 }];
  const souls0 = p.souls;
  for (let i = 0; i < 300; i++) stepSouls(far, [p], 1 / 60, i / 60, []);
  assert.equal(far.length, 1, 'a soul 25 m off stays floating');
  assert.equal(p.souls, souls0);
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

test('sea3d exports a wreck-fire pool sized to the soul cap', () => {
  const seaSrc = read('../app/flying-dutchman/sea3d.js');
  assert.ok(seaSrc.includes('export function createFirePool'), 'must export the fire pool');
  assert.ok(seaSrc.includes('createSoulPool(scene, max = 60)'), 'soul pool must cover the floating cap');
});

test('page.jsx wires wreck fires, soul feedback, and the foe hull bar', () => {
  assert.ok(pageSrc.includes('createFirePool'), 'must import the fire pool');
  assert.ok(pageSrc.includes('fire: createFirePool(scene)'), 'must create the fire pool');
  assert.ok(pageSrc.includes('G.pools.fire.sync(burning, t)'), 'must sync fires to sinking ships');
  assert.ok(pageSrc.includes("e.type === 'soul'"), 'must handle the soul event');
  assert.ok(pageSrc.includes('foeHull'), 'must show the nearest foe hull in solo');
  assert.ok(pageSrc.includes('FOE —'), 'must label the foe hull bar');
});

test('page.jsx wires the helm throttle, the anchor, and the fitting HUD', () => {
  // Joystick: two axes — rudder plus a sticky throttle lever.
  assert.ok(pageSrc.includes('G.input.throttle = -s.dy'), 'stick up/down must drive the throttle');
  assert.ok(pageSrc.includes('dy: joyState.current.dy'), 'the stick must keep its throttle setting on release');
  assert.ok(pageSrc.includes('throttle: 0.5'), 'the stick at rest must mean half way, not dead stop');
  assert.ok(pageSrc.includes("ev.key === 'ArrowUp'"), 'keyboard must trim the throttle too');
  // Anchor: button, state, 3D marker, and the engine hookup.
  assert.ok(pageSrc.includes('toggleAnchor'), 'must have an anchor toggle');
  assert.ok(pageSrc.includes('⚓ ANCHOR'), 'must show an anchor button');
  assert.ok(pageSrc.includes('aria-pressed={anchored}'), 'the anchor button must read its state');
  assert.ok(pageSrc.includes('G.anchorMark'), 'the anchored state must read in the 3D view');
  assert.ok(pageSrc.includes('anchored: input.anchored'), 'solo must pass the anchor to the engine');
  assert.ok(pageSrc.includes('p.anchored = !!G.input.anchored'), 'duels must pass the anchor too');
  assert.ok(pageSrc.includes("e.type === 'sunk'") && pageSrc.includes('duelEndAt'), 'a duel must end after the wreck goes under, not on the hit');
  // Sinking: the game-over screen waits until the wreck is under.
  assert.ok(pageSrc.includes('p.sinkT > SHIP.sinkTime + 1'), 'the solo game-over must wait for the ship to go under');
  assert.ok(pageSrc.includes('sinkDropK(s.sinkT / SHIP.sinkTime) >= SHIP.mastheadY'), 'the gulp splash must fire as the masthead slips under');
  // Layout: one flex row top, one flex row bottom, safe-area insets —
  // and none of the old absolute clusters that ran off the phone edges.
  assert.ok(!pageSrc.includes('absolute bottom-6 left-4'), 'the old clipped joystick cluster must be gone');
  assert.ok(!pageSrc.includes('absolute bottom-6 right-4'), 'the old clipped cannon cluster must be gone');
  assert.ok(!pageSrc.includes('absolute left-1/2 top-3'), 'the old centred pill that collided with the panel must be gone');
  assert.ok(pageSrc.includes('env(safe-area-inset-left)'), 'the HUD must respect the phone safe area');
  assert.ok(pageSrc.includes('bottom-[188px]'), 'toasts must sit clear of the bottom controls');
});

test('sea3d drops wrecks and their fires on the same law', () => {
  const seaSrc = read('../app/flying-dutchman/sea3d.js');
  assert.ok(seaSrc.includes('sinkDropK(k)'), 'poseShip must drop the wreck on the sink law');
  assert.ok(seaSrc.includes('sinkDropK(sinkK)'), 'the wreck fire must ride the deck down on the same law');
  assert.ok(!seaSrc.includes('sinkK * 9'), 'the old 9 m drop that left the masts standing must be gone');
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
