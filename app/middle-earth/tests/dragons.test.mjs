// Headless tests for the dragon hunt: the shared-agent brain
// (roam / chase / wind-up / breath / bite), HP + damage, death
// + seeded loot rolls, and the operators life lines.
// Merlin, Nov 26: dragons hunt, are killable ("billable"), and
// drop Dragon Scales or Fire Orbs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const D = await import('../dragons.js');
const O = await import('../orcs.js');
const OPS = await import('../operators.js');

const rng = () => 0.5; // deterministic stand-in for wander rolls
const seeded = (seed) => O.mulberry32(seed);
const flatLos = { losClear: () => true };
const playerAt = (x, z, alive = true) => ({ x, z, alive });

function dragonAt(kind, x, z, px = 0, pz = 0) {
  const d = D.createDragon({ id: `${kind}-1`, kind, x, z, faceYaw: 0 });
  d.name = kind === 'fell-beast' ? 'A Fell Beast' : 'A Dragon of the Wastes';
  return d;
}

test('dragon stats: a step above the Orc Captain, below Saruman', () => {
  assert.equal(D.DRAGON_KINDS.dragon.hp, 400);
  assert.equal(D.DRAGON_KINDS['fell-beast'].hp, 300);
  assert.ok(D.DRAGON_KINDS.dragon.hp > O.ORC_KINDS.captain.hp, 'above the captain (150)');
  assert.ok(D.DRAGON_KINDS.dragon.hp < 600, 'below Saruman (600)');
  // ~12 blade hits (34) / ~16 bow shots (26) for the dragon
  assert.equal(Math.ceil(400 / 34), 12);
  assert.equal(Math.ceil(400 / 26), 16);
  assert.equal(Math.ceil(300 / 34), 9);
  assert.ok(D.isDragonModel('dragon') && D.isDragonModel('fell-beast'));
  assert.ok(!D.isDragonModel('eagle') && !D.isDragonModel('horse') && !D.isDragonModel('warg'));
});

test('hunt: roams its ground far from the player, chases on sight', () => {
  const d = dragonAt('dragon', 0, 0);
  const far = playerAt(200, 0);
  const start = { x: d.x, z: d.z };
  D.stepDragon(d, 1, far, rng, flatLos);
  assert.equal(d.state, 'roam', 'far player: roams');
  assert.ok(Math.hypot(d.x - start.x, d.z - start.z) > 0, 'roaming moves');
  // walk the player into sight range (60 m) — the dragon turns
  const near = playerAt(40, 0);
  const events = D.stepDragon(d, 0.1, near, rng, flatLos);
  assert.equal(d.state, 'chase', 'sighted player: chases');
  assert.ok(events.some((e) => e.type === 'sighted'), 'sighted event fires');
  // chase closes the distance
  const before = Math.hypot(d.x - near.x, d.z - near.z);
  D.stepDragon(d, 1, near, rng, flatLos);
  const after = Math.hypot(d.x - near.x, d.z - near.z);
  assert.ok(after < before, 'chase closes distance');
});

test('hunt: loses the trail when the player dies or gets far away', () => {
  const d = dragonAt('dragon', 0, 0);
  D.stepDragon(d, 0.1, playerAt(40, 0), rng, flatLos);
  assert.equal(d.state, 'chase');
  D.stepDragon(d, 0.1, playerAt(40, 0, false), rng, flatLos);
  assert.equal(d.state, 'roam', 'dead player: trail lost, drifts home');
  D.stepDragon(d, 0.1, playerAt(40, 0), rng, flatLos);
  assert.equal(d.state, 'chase');
  D.stepDragon(d, 0.1, playerAt(200, 0), rng, flatLos);
  assert.equal(d.state, 'roam', 'player past alert x 2.2: trail lost');
});

test('attack: fire breath at range (telegraphed wind-up, then the hit)', () => {
  const d = dragonAt('dragon', 0, 0);
  const p = playerAt(0, 10); // inside breath range (14), outside bite (4.5)
  D.stepDragon(d, 0.1, p, rng, flatLos); // sight + chase
  const windup = D.stepDragon(d, 0.1, p, rng, flatLos);
  assert.equal(d.state, 'windup', 'breath winds up first — the player sees it coming');
  assert.equal(d.windupKind, 'breath');
  assert.ok(windup.some((e) => e.type === 'windup' && e.attack === 'breath'));
  // stepping out of range mid-wind-up cancels the breath, not banks it
  const cancelled = D.stepDragon(d, 0.1, playerAt(0, 40), rng, flatLos);
  assert.equal(d.windupT, 0, 'out of range cancels the wind-up');
  assert.ok(!cancelled.some((e) => e.type === 'hitPlayer'), 'no banked hit');
  // back in range: wind-up completes and the breath lands
  D.stepDragon(d, 0.1, p, rng, flatLos);
  D.stepDragon(d, 0.1, p, rng, flatLos);
  let hit = null;
  for (let i = 0; i < 30 && !hit; i++) {
    const evs = D.stepDragon(d, 0.1, p, rng, flatLos);
    hit = evs.find((e) => e.type === 'hitPlayer');
  }
  assert.ok(hit, 'breath lands after the wind-up');
  assert.equal(hit.dmg, 22, 'dragon breath deals 22');
  assert.equal(hit.attack, 'breath');
});

test('attack: bite up close, weaker than breath, faster wind-up', () => {
  const d = dragonAt('fell-beast', 0, 0);
  const p = playerAt(0, 3); // inside bite range (4.0)
  D.stepDragon(d, 0.1, p, rng, flatLos);
  D.stepDragon(d, 0.1, p, rng, flatLos);
  assert.equal(d.windupKind, 'bite', 'close range picks the bite');
  let hit = null;
  for (let i = 0; i < 30 && !hit; i++) {
    const evs = D.stepDragon(d, 0.1, p, rng, flatLos);
    hit = evs.find((e) => e.type === 'hitPlayer');
  }
  assert.ok(hit, 'bite lands');
  assert.equal(hit.dmg, 10, 'fell-beast bite deals 10');
  assert.ok(d.attackT > 0, 'bite starts its cooldown');
});

test('killable: blade and bow damage, struck dragon turns to hunt', () => {
  const d = dragonAt('dragon', 0, 0);
  assert.equal(D.damageDragon(d, 34, rng), null, 'one blade hit does not kill');
  assert.equal(d.hp, 400 - 34);
  assert.equal(d.state, 'chase', 'a struck dragon hunts its attacker');
  assert.equal(D.damageDragon(d, 26, rng), null, 'a bow shot does not kill either');
  assert.equal(d.hp, 400 - 34 - 26);
});

test('killable: strike() accepts dragons as targets (orcs + boss + dragons)', () => {
  const hunter = O.createHunter();
  const d = dragonAt('dragon', 0, 2);
  const spec = { range: 2.2, arcCos: Math.cos(1.22), cooldown: 0.45 };
  assert.equal(O.strike(hunter, [d], 0, 0, 0, spec, 'melee'), d, 'blade reaches the dragon');
  const hunter2 = O.createHunter();
  const far = dragonAt('dragon', 0, 25);
  const bowSpec = { range: 30, arcCos: Math.cos(0.21), cooldown: 0.8 };
  assert.equal(O.strike(hunter2, [far], 0, 0, 0, bowSpec, 'ranged'), far, 'bow reaches the dragon at range');
  const dead = dragonAt('dragon', 0, 2);
  dead.state = 'dead';
  const hunter3 = O.createHunter();
  assert.equal(O.strike(hunter3, [dead], 0, 0, 0, spec, 'melee'), null, 'dead dragons are not targets');
});

test('death + loot: the killing blow drops scales, maybe orbs (seeded, deterministic)', () => {
  const loot = D.damageDragon(dragonAt('dragon', 0, 0), 400, seeded(7));
  assert.ok(Array.isArray(loot) && loot.length > 0, 'a kill drops loot');
  const scales = loot.find((l) => l.id === 'dragon-scale');
  assert.ok(scales, 'scales always drop');
  assert.ok(scales.qty >= 3 && scales.qty <= 5, `dragon scales 3-5 (got ${scales.qty})`);
  // deterministic: the same seed rolls the same loot
  const again = D.damageDragon(dragonAt('dragon', 0, 0), 400, seeded(7));
  assert.deepEqual(loot, again);
  // both drops are possible across seeds: scales every time, orbs often
  let orbKills = 0;
  let scaleKills = 0;
  for (let s = 0; s < 40; s++) {
    const l = D.damageDragon(dragonAt('dragon', 0, 0), 400, seeded(s));
    if (l.some((e) => e.id === 'fire-orb')) orbKills++;
    if (l.some((e) => e.id === 'dragon-scale')) scaleKills++;
  }
  assert.equal(scaleKills, 40, 'scales on every kill');
  assert.ok(orbKills >= 15 && orbKills <= 35, `fire orbs on a share of kills (got ${orbKills}/40)`);
  // fell-beast: fewer scales, orbs rarer
  const fb = D.damageDragon(dragonAt('fell-beast', 0, 0), 300, seeded(7));
  const fbScales = fb.find((l) => l.id === 'dragon-scale');
  assert.ok(fbScales.qty >= 2 && fbScales.qty <= 3, `fell-beast scales 2-3 (got ${fbScales.qty})`);
  // a dead dragon takes no more damage and drops no more loot
  const d = dragonAt('dragon', 0, 0);
  D.damageDragon(d, 400, rng);
  assert.equal(d.state, 'dead');
  assert.equal(D.damageDragon(d, 34, rng), null, 'no double loot');
});

test('operators: dragon life lines are honest — hunt + HP, not ambient', () => {
  const def = { name: 'A Dragon of the Wastes', model: 'dragon', pod: 'mordor' };
  const line = OPS.placedCreatureLifeFor(def).line;
  assert.ok(line.includes('Hunts'), `tag line hunts: ${line}`);
  assert.ok(line.includes('400 HP'), `tag line carries HP: ${line}`);
  assert.ok(line.includes('Dragon Scales'), `tag line names the loot: ${line}`);
  // the other placed creatures stay ambient
  const eagle = OPS.placedCreatureLifeFor({ name: 'A Great Eagle', model: 'eagle' }).line;
  assert.ok(eagle.includes('Ambient'), `eagle stays ambient: ${eagle}`);
  const warg = OPS.placedCreatureLifeFor({ name: 'A Warg of the Wilds', model: 'warg' }).line;
  assert.ok(warg.includes('Ambient'), `warg stays ambient: ${warg}`);
  // live dragon life: roaming, then hunting, then remains
  const d = dragonAt('dragon', 0, 0);
  assert.ok(OPS.dragonLifeFor(d).line.includes('400/400 HP') || OPS.dragonLifeFor(d).line.includes('400 HP'));
  D.stepDragon(d, 0.1, playerAt(40, 0), rng, flatLos);
  assert.ok(OPS.dragonLifeFor(d).line.includes('Hunting you'), `hunting line: ${OPS.dragonLifeFor(d).line}`);
  D.damageDragon(d, 400, rng);
  const dead = OPS.dragonLifeFor(d, Date.now(), { deadAt: 100, respawnS: 40 });
  assert.ok(dead.line.includes('Remains'), `dead line: ${dead.line}`);
  assert.equal(dead.respawnAt, 140, 'respawn clock: deadAt + respawnS');
  assert.equal(dead.respawnNeedsDistanceM, 65, 'respawn needs the player 65 m away');
  // lifeFor routes a dragon record to the dragon life, not the orc life
  const routed = OPS.lifeFor(dragonAt('dragon', 0, 0));
  assert.equal(routed.isDragon, true);
  assert.equal(routed.maxHp, 400);
});
