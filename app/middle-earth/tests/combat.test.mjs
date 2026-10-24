// Headless tests for the hunt's pure core: orcs.js combat, senses,
// tasks, loot — and the generic strike any hero hand uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const O = await import('../orcs.js');

const rng = () => 0.5; // deterministic stand-in for wander rolls
const flatLos = { losClear: () => true };
const blockedLos = { losClear: () => false };

function orcAt(kind, x, z, yaw) {
  const o = O.createOrc({ x, z, kind, id: 1 }, 0);
  if (yaw != null) o.yaw = yaw;
  return o;
}

test('spawnField: camps + rovers across the disc, spawn point kept clear', () => {
  const cfg = { camps: 7, campSize: [3, 5], rovers: 10, captainChance: 0.3 };
  const recs = O.spawnField(30303, cfg, () => true);
  assert.ok(recs.length >= 7 * 3 + 10, `field size (${recs.length})`);
  assert.ok(recs.length <= 7 * 5 + 10, `field ceiling (${recs.length})`);
  assert.ok(recs.some((r) => r.rove), 'rovers present');
  assert.ok(recs.some((r) => r.kind === 'captain'), 'captains present');
  for (const r of recs) {
    assert.ok(Math.hypot(r.x - O.POD_SPAWN.x, r.z - O.POD_SPAWN.z) >= O.SPAWN_SAFE_R, 'spawn-safe');
  }
  // deterministic: same seed, same field
  const again = O.spawnField(30303, cfg, () => true);
  assert.deepEqual(recs, again);
  // a rejected placement shrinks the field, never lies about it
  const empty = O.spawnField(30303, cfg, () => false);
  assert.equal(empty.length, 0);
});

test('generic strike: blade arc wide + short, bow narrow + long, staff is a ranged hand', () => {
  const hunter = O.createHunter();
  const ahead = orcAt('warrior', 0, 2); // aim yaw 0 faces (sin 0, cos 0) = +z
  const side = orcAt('warrior', 2, 0);
  const far = orcAt('warrior', 0, 25);
  // aim yaw = atan2(fx, fz): forward +z is yaw 0
  const bladeSpec = { range: 2.2, arcCos: Math.cos(1.22), cooldown: 0.45 };
  assert.equal(O.strike(hunter, [ahead, side], 0, 0, 0, bladeSpec, 'melee'), ahead);
  const hunter2 = O.createHunter();
  assert.equal(O.strike(hunter2, [side], 0, 0, 0, bladeSpec, 'melee'), null, 'side orc outside the blade arc');
  const hunter3 = O.createHunter();
  const bowSpec = { range: 30, arcCos: Math.cos(0.21), cooldown: 0.8 };
  assert.equal(O.strike(hunter3, [far], 0, 0, 0, bowSpec, 'ranged'), far);
  assert.equal(hunter3.bowT > 0, true, 'ranged hand spends bowT');
  assert.equal(O.strike(hunter3, [far], 0, 0, 0, bowSpec, 'ranged'), null, 'cooldown blocks');
  // melee and ranged timers are independent
  assert.equal(O.strike(hunter3, [ahead], 0, 0, 0, bladeSpec, 'melee'), ahead);
});

test('strikeBlade / shootBow wrappers keep the house constants', () => {
  const h = O.createHunter();
  const o = orcAt('warrior', 0, 2);
  assert.equal(O.strikeBlade(h, [o], 0, 0, 0), o);
  assert.ok(h.bladeT > 0, 'blade spends bladeT');
  const h2 = O.createHunter();
  const farOrc = orcAt('warrior', 0, 25);
  assert.equal(O.shootBow(h2, [farOrc], 0, 0, 0), farOrc);
  assert.ok(h2.bowT > 0, 'bow spends bowT');
  assert.equal(O.shootBow(h2, [farOrc], 0, 0, 0), null, 'bow cooldown blocks');
});

test('sight: range + cone + line — facing away or a blocked line means no sight', () => {
  // orc at origin facing +z (yaw 0); player 20 m ahead (+z) is seen
  const o = orcAt('warrior', 0, 0, 0);
  const seen = O.stepOrc(o, 0.1, { x: 0, z: 20, alive: true }, rng, flatLos);
  assert.ok(seen.some((e) => e.type === 'sighted'), 'ahead + clear line sights');
  // same geometry, blocked line: no sight, no chase
  const o2 = orcAt('warrior', 0, 0, 0);
  const ev2 = O.stepOrc(o2, 0.1, { x: 0, z: 20, alive: true }, rng, blockedLos);
  assert.ok(!ev2.some((e) => e.type === 'sighted'), 'blocked line blinds');
  assert.equal(o2.state, 'idle');
  // player behind the orc: outside the cone, no sight (beyond alertR too)
  const o3 = orcAt('warrior', 0, 0, 0);
  const ev3 = O.stepOrc(o3, 0.1, { x: 0, z: -20, alive: true }, rng, flatLos);
  assert.ok(!ev3.some((e) => e.type === 'sighted'), 'behind is outside the cone');
  // but inside alertR the proximity rule still catches (no cone on proximity)
  const o4 = orcAt('warrior', 0, 0, 0);
  O.stepOrc(o4, 0.1, { x: 0, z: -10, alive: true }, rng, flatLos);
  assert.equal(o4.state, 'chase', 'proximity alert has no cone');
});

test('quiet heroes shrink the alert radius', () => {
  const loud = orcAt('warrior', 0, 0, 0);
  O.stepOrc(loud, 0.1, { x: 0, z: -15, alive: true, quiet: 1 }, rng, flatLos);
  assert.equal(loud.state, 'chase', '15 m alerts a normal hero');
  const quiet = orcAt('warrior', 0, 0, 0);
  O.stepOrc(quiet, 0.1, { x: 0, z: -15, alive: true, quiet: 0.55 }, rng, flatLos);
  assert.equal(quiet.state, 'idle', '15 m does not alert against a halfling (16 x 0.55 = 8.8)');
});

test('hunting-party task: march, search, then give up and drift home', () => {
  const o = orcAt('warrior', 0, 0, 0);
  o.task = { type: 'seek', x: 30, z: 0, phase: 'go', t: 0, partyId: 7 };
  const player = { x: 200, z: 200, alive: true };
  for (let i = 0; i < 200 && o.task && o.task.phase === 'go'; i++) {
    O.stepOrc(o, 0.1, player, rng, flatLos);
  }
  assert.ok(o.task && o.task.phase === 'search', 'arrived and searching');
  for (let i = 0; i < 300 && o.task; i++) {
    O.stepOrc(o, 0.1, player, rng, flatLos);
  }
  assert.equal(o.task, null, 'trail cold — task dropped');
  assert.equal(o.state, 'idle');
});

test('a tasked orc that spots the player drops the task for a real chase', () => {
  const o = orcAt('warrior', 0, 0, 0);
  o.task = { type: 'seek', x: 30, z: 0, phase: 'go', t: 0, partyId: 7 };
  O.stepOrc(o, 0.1, { x: 0, z: 5, alive: true }, rng, flatLos);
  assert.equal(o.task, null);
  assert.equal(o.state, 'chase');
});

test('hearing: noise turns hearers toward it; near + clear line joins the chase', () => {
  const near = orcAt('warrior', 10, 0, 0);
  const far = orcAt('warrior', 100, 0, 0);
  const joined = O.hearNoise([near, far], 0, 0, 30, flatLos);
  assert.equal(joined, 1, 'only the near orc joins');
  assert.equal(near.state, 'chase');
  assert.equal(far.state, 'idle');
  assert.ok(Math.abs(near.yaw - Math.atan2(-10, 0)) < 1e-9, 'near orc faces the noise');
  // blocked line: turns but does not chase
  const blocked = orcAt('warrior', 10, 0, 0);
  assert.equal(O.hearNoise([blocked], 0, 0, 30, blockedLos), 0);
  assert.equal(blocked.state, 'idle');
});

test('alarm: a kill wakes every live orc inside the radius', () => {
  const a = orcAt('warrior', 5, 0);
  const b = orcAt('warrior', 50, 0);
  assert.equal(O.raiseAlarm([a, b], 0, 0, 40), 1);
  assert.equal(a.state, 'chase');
  assert.equal(b.state, 'idle');
});

test('chase: closes in, swings on cooldown, loses the scent at range', () => {
  const o = orcAt('warrior', 0, 0);
  const player = { x: 0, z: 10, alive: true };
  O.stepOrc(o, 0.1, player, rng, flatLos);
  assert.equal(o.state, 'chase');
  let hits = 0;
  for (let i = 0; i < 100; i++) {
    const evs = O.stepOrc(o, 0.1, player, rng, flatLos);
    hits += evs.filter((e) => e.type === 'hitPlayer').length;
    if (hits > 0) break;
  }
  assert.ok(hits >= 1, 'reached and swung');
  // player flees beyond scent range
  const gone = { x: 0, z: 100, alive: true };
  O.stepOrc(o, 0.1, gone, rng, flatLos);
  assert.equal(o.state, 'idle', 'scent lost');
});

test('damageOrc: kills return loot, the dead stay dead', () => {
  const o = orcAt('warrior', 0, 0);
  assert.equal(O.damageOrc(o, 30, rng), null, 'wounded, not dead');
  assert.equal(o.state, 'chase', 'a struck idle orc turns');
  const loot = O.damageOrc(o, 30, rng);
  assert.ok(Array.isArray(loot) && loot.length >= 1, 'kill drops loot');
  assert.equal(o.state, 'dead');
  assert.equal(O.damageOrc(o, 100, rng), null, 'no double loot');
});

test('hunter: hero HP, damage, death, revive', () => {
  const h = O.createHunter(135);
  assert.equal(h.hp, 135);
  assert.equal(h.maxHp, 135);
  assert.equal(O.hurtHunter(h, 40), false);
  assert.equal(h.hp, 95);
  assert.equal(O.hurtHunter(h, 95), true);
  assert.equal(h.alive, false);
  O.reviveHunter(h);
  assert.equal(h.alive, true);
  assert.equal(h.hp, 135);
});
