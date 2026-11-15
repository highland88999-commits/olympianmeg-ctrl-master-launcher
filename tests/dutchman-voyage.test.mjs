/*
 * THE FLYING DUTCHMAN — voyage systems tests.
 * Run with: node --test tests/dutchman-voyage.test.mjs
 * Covers voyage.js (levels, shield, mega souls, respawn, kraken, slot
 * machine, merchants, skins, duels, legendary ships, fleet) and
 * voyage-backpack.js, on top of the engine in engine.js.
 *
 * Kraken ball-hits are driven through stepBalls, the same code path the
 * live game uses — one ball per call, aimed at the kraken's centre.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeWorld, makeShip, makeAI, makeWind, stepShip, stepWorld,
  damageShip, stepSouls, stepBalls, SHIP, makeRng,
} from '../app/flying-dutchman/engine.js';
import {
  levelFor, levelStats, applyLevelStats, stepMegaSouls, spawnMegaSoul,
  stepKraken, KRAKEN_HP, slotCanSpin, rollSlotPrize, rollSlotPrizeOwned,
  SLOT_PRIZES, applySlotPrize, prizeToItem, equipStoredPrize,
  buyUpgrade, skinAvailable, buySkin, setSkin,
  makeSwordDuel, swordDuelTick, swordDuelAction,
  makePistolDuel, pistolDuelTap,
  findLegendaryShip, unlockShip, makeFleetShip, switchCommand, stepFleetShip,
} from '../app/flying-dutchman/voyage.js';
import {
  makeVoyageBackpack, loadVoyageBackpack, saveVoyageBackpack,
  addItem, removeItem, findItem,
  syncCaptainFromBackpack, syncBackpackFromCaptain,
} from '../app/flying-dutchman/voyage-backpack.js';

// Sink one enemy ship and let one world tick count it. The shield is
// stripped first so the killing blow reaches the hull (shield rule).
function sinkEnemy(world, enemy) {
  enemy.shield = 0;
  damageShip(enemy, enemy.hull, world.events, world.souls, world.rng, enemy.x, enemy.z);
  return stepWorld(world, { rudder: 0 }, 1 / 60);
}

// Force a kraken to the attack state: timer past threshold, then the
// 8 s warning. Returns the kraken. Driven through stepWorld.
function forceKrakenAttack(world) {
  world.krakenThreshold = 10;
  world.krakenTimer = 10;
  const ev = stepWorld(world, { rudder: 0 }, 0.1);
  assert.ok(ev.some((e) => e.type === 'krakenWarning'), 'kraken must warn on spawn');
  assert.equal(world.kraken.state, 'warning');
  for (let i = 0; i < 8; i++) stepWorld(world, { rudder: 0 }, 1);
  assert.equal(world.kraken.state, 'attack');
  return world.kraken;
}

// One cannonball at the kraken's centre, through stepBalls.
function fireBallAtKraken(world, kraken) {
  const balls = [{
    x: kraken.x, y: 3, z: kraken.z, vx: 0, vy: 0, vz: 0,
    fromId: world.player.id, delay: 0, life: 6,
  }];
  const events = [];
  stepBalls(balls, [world.player], world.souls, 1 / 60, 0, events, world.rng, kraken);
  assert.equal(balls.length, 0, 'the ball must be consumed by the kraken hit');
  return events;
}

// ---------- Levels ----------

test('levelFor: 0 and 4 sinkings are level 1, 5 is level 2, 45 is level 10, capped at 10', () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(4), 1);
  assert.equal(levelFor(5), 2);
  assert.equal(levelFor(10), 3);
  assert.equal(levelFor(45), 10);
  assert.equal(levelFor(500), 10);
});

test('levelStats(2) is 7 cannons, 120 hull, 50 shield, 1.08 size', () => {
  assert.deepEqual(levelStats(2), {
    cannonsPerSide: 7, maxHull: 120, maxShield: 50, sizeScale: 1.08,
  });
});

test('sinking 5 enemy ships raises the player to level 2 and applies the stats', () => {
  const w = makeWorld(41);
  for (let i = 0; i < 5; i++) {
    const e = makeAI(i, 400 + i * 50, 400, 1);
    w.enemies.push(e);
    sinkEnemy(w, e);
  }
  assert.equal(w.captain.sinkings, 5);
  assert.equal(w.captain.level, 2);
  assert.equal(w.player.level, 2);
  assert.equal(w.player.cannonsPerSide, 7);
  assert.equal(w.player.maxHull, 120);
  assert.equal(w.player.maxShield, 50);
  assert.equal(w.player.sizeScale, 1.08);
});

test('sinking the kraken does NOT count toward levels', () => {
  const w = makeWorld(42);
  w.kraken = { state: 'dying', x: 200, z: 0, t: 0, hits: 12, hp: 0 };
  const ev = stepWorld(w, { rudder: 0 }, 1 / 60);
  assert.ok(ev.some((e) => e.type === 'krakenSlain'), 'the kraken must be slain');
  assert.equal(w.captain.krakenKills, 1);
  assert.equal(w.captain.sinkings, 0);
  assert.equal(w.captain.level, 1);
});

test('the player sinking does NOT count toward levels', () => {
  const w = makeWorld(43);
  const p = w.player;
  p.shield = 0;
  damageShip(p, 200, w.events, w.souls, w.rng, p.x, p.z);
  stepWorld(w, { rudder: 0 }, 1 / 60);
  assert.equal(p.alive, false);
  assert.equal(w.captain.sinkings, 0);
  assert.equal(w.captain.level, 1);
});

// ---------- Shield ----------

test('shield absorbs before hull: 5 damage to a fresh ship, 30 damage spills 5 to hull', () => {
  const a = makeShip({ crew: 6 });
  damageShip(a, 5, [], [], () => 0.5, 0, 0);
  assert.equal(a.hull, 100);
  assert.equal(a.shield, 20);

  const b = makeShip({ crew: 6 });
  damageShip(b, 30, [], [], () => 0.5, 0, 0);
  assert.equal(b.shield, 0);
  assert.equal(b.hull, 95);
});

test('crew loss tracks hull damage only, never shield damage', () => {
  // 25 hull damage (shield already gone) kills 1 crew.
  const a = makeShip({ crew: 6 });
  a.shield = 0;
  damageShip(a, 25, [], [], () => 0.5, 0, 0);
  assert.equal(a.hull, 75);
  assert.equal(a.crew, 5);

  // 25 damage fully absorbed by the shield kills nobody.
  const b = makeShip({ crew: 6 });
  damageShip(b, 25, [], [], () => 0.5, 0, 0);
  assert.equal(b.hull, 100);
  assert.equal(b.shield, 0);
  assert.equal(b.crew, 6);
});

test('stepSouls: a soul feeds a low shield first (+15, capped), else heals hull +4', () => {
  const a = makeShip({ x: 0, z: 0, crew: 6 });
  a.hull = 50; a.shield = 10; a.maxShield = 25;
  const souls = [{ x: 0, z: 0, vx: 0, vz: 0, life: SHIP.soulLife, phase: 0 }];
  stepSouls(souls, [a], 1 / 60, 0, []);
  assert.equal(souls.length, 0, 'the soul must be claimed');
  assert.equal(a.shield, 25, 'shield tops up to its cap');
  assert.equal(a.hull, 50, 'hull is untouched while the shield feeds');

  const b = makeShip({ x: 0, z: 0, crew: 6 });
  b.hull = 50; b.shield = 25; b.maxShield = 25;
  const souls2 = [{ x: 0, z: 0, vx: 0, vz: 0, life: SHIP.soulLife, phase: 0 }];
  stepSouls(souls2, [b], 1 / 60, 0, []);
  assert.equal(b.shield, 25);
  assert.equal(b.hull, 54, 'a full shield means the soul heals hull +4');
});

test('the shield does not regenerate over time', () => {
  const wind = makeWind(1);
  const s = makeShip({ crew: 8 });
  s.hull = s.maxHull;
  s.shield = 10;
  for (let i = 0; i < 3600; i++) stepShip(s, 1 / 60, wind);
  assert.equal(s.shield, 10, '60 s with no souls must leave the shield at 10');
});

// ---------- Respawn ----------

test('respawn: the player rises 100 m from the wreck, whole, invulnerable, progress kept', () => {
  const w = makeWorld(11);
  const p = w.player;
  w.captain.level = 2;
  w.captain.souls = 7;
  w.captain.sinkings = 3;
  p.souls = 7;
  p.upgrades = { cannons: 1 };
  p.shield = 0;
  damageShip(p, 500, w.events, w.souls, w.rng, p.x, p.z);
  assert.equal(p.alive, false);
  const wx = p._wreckX, wz = p._wreckZ;

  let respawned = false;
  for (let i = 0; i < 40 && !respawned; i++) {
    stepWorld(w, { rudder: 0 }, 0.5);
    respawned = p.alive;
  }
  assert.equal(respawned, true, 'the player must respawn in a solo world');
  const d = Math.hypot(p.x - wx, p.z - wz);
  assert.ok(Math.abs(d - 100) < 1, `respawn must be 100 m from the wreck, got ${d}`);
  assert.equal(p.hull, p.maxHull);
  assert.equal(p.shield, p.maxShield);
  assert.equal(p.invulnT, 5);
  assert.equal(p.level, 2);
  assert.equal(p.souls, 7);
  assert.equal(p.upgrades.cannons, 1);
  assert.equal(w.captain.sinkings, 3);
});

test('respawn does NOT fire in a duel-mode world', () => {
  const w = makeWorld(12);
  w.mode = 'duel';
  const p = w.player;
  p.shield = 0;
  damageShip(p, 500, w.events, w.souls, w.rng, p.x, p.z);
  for (let i = 0; i < 20; i++) stepWorld(w, { rudder: 0 }, 1);
  assert.equal(p.alive, false, 'a duellist stays dead');
  assert.ok(p.sinkT > SHIP.sinkTime + 1, 'the sinking cinematic must have finished');
});

// ---------- Kraken ----------

test('kraken: timer forces a warning, 8 s later it attacks', () => {
  const w = makeWorld(21);
  w.krakenThreshold = 10;
  w.krakenTimer = 10;
  const ev = stepWorld(w, { rudder: 0 }, 0.1);
  assert.ok(ev.some((e) => e.type === 'krakenWarning'), 'the spawn must warn');
  assert.equal(w.kraken.state, 'warning');
  for (let i = 0; i < 8; i++) stepWorld(w, { rudder: 0 }, 1);
  assert.equal(w.kraken.state, 'attack');
});

test('kraken: 12 ball-hits slay it — 1 mega soul, krakenKills + 1', () => {
  assert.equal(KRAKEN_HP, 60, 'kraken hp must be 60 (12 hits at 5 damage)');
  const w = makeWorld(22);
  const k = forceKrakenAttack(w);
  assert.equal(k.hp, 60);
  for (let i = 0; i < 11; i++) {
    fireBallAtKraken(w, k);
    assert.equal(k.state, 'attack', `after ${i + 1} hits the kraken must still attack`);
  }
  assert.equal(k.hits, 11);
  assert.equal(k.hp, 5);
  fireBallAtKraken(w, k);
  assert.equal(k.hits, 12);
  assert.equal(k.hp, 0);
  assert.equal(k.state, 'dying');
  const ev = [];
  stepKraken(w, 1 / 60, ev, w.rng);
  assert.ok(ev.some((e) => e.type === 'krakenSlain'), 'the kraken must be slain');
  assert.equal(w.megaSouls.length, 1, 'exactly 1 mega soul spawns');
  assert.equal(w.captain.krakenKills, 1);
  assert.equal(w.kraken, null);
});

test('kraken: with kraken-bane, 6 ball-hits slay it', () => {
  const w = makeWorld(23);
  const k = forceKrakenAttack(w);
  w.player.upgrades.krakenBane = true;
  for (let i = 0; i < 5; i++) {
    fireBallAtKraken(w, k);
    assert.equal(k.state, 'attack', `after ${i + 1} bane hits the kraken must still attack`);
  }
  assert.equal(k.hits, 5);
  assert.equal(k.hp, 10);
  fireBallAtKraken(w, k);
  assert.equal(k.hits, 6);
  assert.equal(k.hp, 0);
  assert.equal(k.state, 'dying');
  const ev = [];
  stepKraken(w, 1 / 60, ev, w.rng);
  assert.ok(ev.some((e) => e.type === 'krakenSlain'));
  assert.equal(w.megaSouls.length, 1);
  assert.equal(w.captain.krakenKills, 1);
});

test('kraken strike: within 35 m it deals 8 damage through the shield first', () => {
  const w = makeWorld(24);
  const k = forceKrakenAttack(w);
  const p = w.player;
  k.x = p.x + 20; k.z = p.z;
  k.strikeT = 0;
  const ev = [];
  stepKraken(w, 0.1, ev, w.rng);
  assert.ok(ev.some((e) => e.type === 'krakenStrikeWarn'), 'the strike must telegraph first');
  assert.equal(p.shield, 25, 'no damage lands during the telegraph');
  stepKraken(w, 1, ev, w.rng);
  assert.ok(ev.some((e) => e.type === 'krakenStrike'), 'the strike must land after 1 s');
  assert.equal(p.shield, 17, '8 damage comes off the shield first');
  assert.equal(p.hull, 100);
});

// ---------- Mega souls ----------

test('mega souls: collected within 18 m, ignored beyond it, never by AI', () => {
  const w = makeWorld(31);
  const p = w.player;
  spawnMegaSoul(w, p.x + 10, p.z);
  const ev = [];
  stepMegaSouls(w, 1 / 60, ev);
  assert.equal(w.megaSouls.length, 0, 'a mega soul 10 m off is claimed');
  assert.equal(w.captain.megaSouls, 1);
  assert.equal(ev.filter((e) => e.type === 'megaSoul').length, 1);

  spawnMegaSoul(w, p.x + 30, p.z);
  stepMegaSouls(w, 1 / 60, []);
  assert.equal(w.megaSouls.length, 1, 'a mega soul 30 m off stays floating');
  assert.equal(w.captain.megaSouls, 1);

  const ai = makeAI(0, 200, 200, 1);
  w.enemies.push(ai);
  spawnMegaSoul(w, ai.x, ai.z);
  stepMegaSouls(w, 1 / 60, []);
  assert.equal(w.megaSouls.length, 2, 'an AI ship must not collect a mega soul');
  assert.equal(w.captain.megaSouls, 1);
});

// ---------- Slot machine ----------

test('slot machine: no spin at 0 mega souls, spin at 1; bane never re-rolls when owned', () => {
  assert.equal(slotCanSpin({ megaSouls: 0 }), false);
  assert.equal(slotCanSpin({ megaSouls: 1 }), true);
  const rng = makeRng(99);
  for (let i = 0; i < 50; i++) {
    const prize = rollSlotPrizeOwned(rng, ['mega-krakenbane']);
    assert.notEqual(prize.id, 'mega-krakenbane', 'kraken-bane must never return once owned');
  }
});

test('slot machine CONFIRM path: check, deduct 1, roll — megaSouls 0 and a prize is rolled', () => {
  const captain = { megaSouls: 1 };
  assert.equal(slotCanSpin(captain), true);
  captain.megaSouls -= 1;
  const prize = rollSlotPrizeOwned(makeRng(7), []);
  assert.equal(captain.megaSouls, 0);
  assert.ok(SLOT_PRIZES.some((p) => p.id === prize.id), `rolled prize ${prize.id} must be a real prize`);
  assert.ok(rollSlotPrize(makeRng(7)), 'rollSlotPrize must return a prize');
});

test('slot machine CANCEL path: no deduction, no roll', () => {
  const captain = { megaSouls: 1 };
  // Cancel: the confirm dialog is dismissed — nothing is deducted,
  // nothing is rolled.
  assert.equal(captain.megaSouls, 1);
  assert.equal(slotCanSpin(captain), true);
});

test('slot machine equip: mega-hull +50 max hull, mega-cannons +2 per side', () => {
  const captain = { megaSouls: 0 };
  const a = makeShip({ crew: 6 });
  assert.equal(applySlotPrize(a, captain, 'mega-hull'), true);
  assert.equal(a.maxHull, 150);
  assert.equal(a.hull, 150);

  const b = makeShip({ crew: 6 });
  assert.equal(applySlotPrize(b, captain, 'mega-cannons'), true);
  assert.equal(b.cannonsPerSide, 8);
  assert.equal(applySlotPrize(b, captain, 'no-such-prize'), false);
});

test('slot machine store: prize to backpack changes nothing, equip applies it and removes it', () => {
  const captain = { megaSouls: 0 };
  const bp = makeVoyageBackpack();
  const ship = makeShip({ crew: 6 });
  const prize = SLOT_PRIZES.find((p) => p.id === 'mega-hull');
  const item = prizeToItem(prize);
  assert.equal(addItem(bp, item), item);
  assert.equal(findItem(bp, item.id), item);
  assert.equal(ship.maxHull, 100, 'storing a prize must not change the ship');
  assert.equal(ship.cannonsPerSide, 6);
  assert.equal(equipStoredPrize(ship, captain, item), true);
  assert.equal(removeItem(bp, item.id), true);
  assert.equal(findItem(bp, item.id), null);
  assert.equal(ship.maxHull, 150, 'equipping the stored prize applies it');
});

// ---------- Merchants + skins ----------

test('buyUpgrade: insufficient souls refused, enough souls deduct and apply', () => {
  const poor = { souls: 5 };
  const poorShip = makeShip({ crew: 6 });
  const refused = buyUpgrade(poorShip, poor, 'cannon');
  assert.equal(refused.ok, false);
  assert.equal(poor.souls, 5);
  assert.equal(poorShip.cannonsPerSide, 6);

  const c1 = { souls: 100 };
  const s1 = makeShip({ crew: 6 }); s1.souls = 100;
  assert.equal(buyUpgrade(s1, c1, 'cannon').ok, true);
  assert.equal(c1.souls, 88);
  assert.equal(s1.cannonsPerSide, 7);

  const c2 = { souls: 100 };
  const s2 = makeShip({ crew: 6 }); s2.souls = 100;
  assert.equal(buyUpgrade(s2, c2, 'hull').ok, true);
  assert.equal(c2.souls, 90);
  assert.equal(s2.maxHull, 120);
  assert.equal(s2.hull, 120);

  const c3 = { souls: 100 };
  const s3 = makeShip({ crew: 6 }); s3.souls = 100;
  assert.equal(buyUpgrade(s3, c3, 'shieldcap').ok, true);
  assert.equal(c3.souls, 90);
  assert.equal(s3.maxShield, 50);
  assert.equal(s3.shield, 50);

  const c4 = { souls: 100 };
  const s4 = makeShip({ crew: 6 }); s4.souls = 100;
  assert.equal(buyUpgrade(s4, c4, 'repair').ok, true);
  assert.equal(c4.souls, 92);
  assert.equal(s4.upgrades.repair, 1);

  assert.deepEqual(buyUpgrade(makeShip({ crew: 6 }), { souls: 100 }, 'nope'), { ok: false, reason: 'unknown' });
});

test('buyUpgrade past max is refused with reason maxed', () => {
  const ship = makeShip({ crew: 6 });
  ship.upgrades.cannons = 4; // cannon max is 4
  const captain = { souls: 100 };
  assert.deepEqual(buyUpgrade(ship, captain, 'cannon'), { ok: false, reason: 'maxed' });
  assert.equal(captain.souls, 100, 'no souls are spent on a refused buy');
  assert.equal(ship.cannonsPerSide, 6);
});

test('skins: ghost needs level 2; at level 2 with 0 cost it is available and sets', () => {
  const captain = { level: 1, souls: 0, skinsOwned: ['dutchman'] };
  const ship = makeShip({ crew: 6 });
  const locked = skinAvailable(captain, ship, 'ghost');
  assert.equal(locked.ok, false);
  assert.equal(locked.reason, 'requires level 2');

  captain.level = 2;
  assert.equal(buySkin(captain, 'ghost').ok, true);
  assert.ok(captain.skinsOwned.includes('ghost'));
  assert.equal(captain.souls, 0, 'ghost costs 0 souls');
  assert.equal(skinAvailable(captain, ship, 'ghost').ok, true);
  assert.equal(setSkin(ship, 'ghost'), true);
  assert.equal(ship.skin, 'ghost');
});

// ---------- Backpack ----------

test('backpack: in node save returns false and load returns a fresh backpack', () => {
  const bp = makeVoyageBackpack();
  bp.souls = 5;
  assert.equal(saveVoyageBackpack(bp), false, 'no localStorage in node, so save must report failure');
  assert.deepEqual(loadVoyageBackpack(), makeVoyageBackpack());
});

test('backpack: addItem / removeItem / findItem', () => {
  const bp = makeVoyageBackpack();
  const item = { id: 'item-1', kind: 'mega-upgrade', prizeId: 'mega-hull', name: 'Leviathan Hull' };
  assert.equal(addItem(bp, item), item);
  assert.equal(findItem(bp, 'item-1'), item);
  assert.equal(findItem(bp, 'missing'), null);
  assert.equal(removeItem(bp, 'item-1'), true);
  assert.equal(findItem(bp, 'item-1'), null);
  assert.equal(removeItem(bp, 'item-1'), false);
});

test('backpack: sync moves souls, mega souls, skins and ships both ways', () => {
  const bp = makeVoyageBackpack();
  bp.souls = 10;
  bp.megaSouls = 2;
  bp.skinsOwned = ['dutchman', 'ghost'];
  bp.shipsOwned = ['dutchman', 'mary-celeste'];
  const captain = { souls: 0, megaSouls: 0, skinsOwned: ['dutchman'], shipsOwned: ['dutchman'] };
  syncCaptainFromBackpack(captain, bp);
  assert.equal(captain.souls, 10);
  assert.equal(captain.megaSouls, 2);
  assert.deepEqual(captain.skinsOwned, ['dutchman', 'ghost']);
  assert.deepEqual(captain.shipsOwned, ['dutchman', 'mary-celeste']);

  captain.souls = 99;
  captain.megaSouls = 3;
  captain.skinsOwned = ['dutchman', 'ghost', 'crimson'];
  captain.shipsOwned = ['dutchman', 'queen-anne'];
  syncBackpackFromCaptain(bp, captain);
  assert.equal(bp.souls, 99);
  assert.equal(bp.megaSouls, 3);
  assert.deepEqual(bp.skinsOwned, ['dutchman', 'ghost', 'crimson']);
  assert.deepEqual(bp.shipsOwned, ['dutchman', 'queen-anne']);
});

// ---------- Legendary ships (level-only) ----------

test('legendary unlock table is level-only: Celeste 2, Palatine 4, Anne 5, Caleuche 7, Lovibond 9, Wake 10', () => {
  const expected = {
    'mary-celeste': 2,
    palatine: 4,
    'queen-anne': 5,
    caleuche: 7,
    'lady-lovibond': 9,
    'widows-wake': 10,
  };
  for (const [id, level] of Object.entries(expected)) {
    assert.equal(findLegendaryShip(id).unlock.level, level, id);
  }
  assert.equal(findLegendaryShip('no-such-ship'), null);
});

test('legendary: a rich-but-level-1 captain is REFUSED Queen Anne\'s Revenge', () => {
  const captain = {
    level: 1, souls: 100, megaSouls: 3, krakenKills: 5,
    skinsOwned: ['dutchman'], shipsOwned: ['dutchman'],
  };
  const bp = makeVoyageBackpack();
  assert.deepEqual(unlockShip(captain, bp, 'queen-anne'), { ok: false, reason: 'requires level 5' });
  assert.equal(captain.souls, 100);
  assert.equal(captain.megaSouls, 3);
  assert.equal(captain.krakenKills, 5);
  assert.deepEqual(captain.shipsOwned, ['dutchman']);
  assert.deepEqual(bp.shipsOwned, ['dutchman']);
});

test('legendary: a level-5 captain with 0 souls unlocks it and nothing is deducted', () => {
  const captain = {
    level: 5, souls: 0, megaSouls: 0, krakenKills: 0,
    skinsOwned: ['dutchman'], shipsOwned: ['dutchman'],
  };
  const bp = makeVoyageBackpack();
  assert.equal(unlockShip(captain, bp, 'queen-anne').ok, true);
  assert.equal(captain.souls, 0);
  assert.ok(captain.shipsOwned.includes('queen-anne'));
  assert.ok(bp.shipsOwned.includes('queen-anne'));
  assert.deepEqual(unlockShip(captain, bp, 'no-such-ship'), { ok: false, reason: 'unknown ship' });
});

// ---------- Fleet switching ----------

test('fleet switching swaps command and keeps both ships, the captain, enemies and wave', () => {
  const w = makeWorld(51);
  const oldPlayer = w.player;
  oldPlayer.hull = 77; oldPlayer.shield = 12; oldPlayer.crew = 9;
  const oldStats = {
    x: oldPlayer.x, z: oldPlayer.z, hull: oldPlayer.hull,
    shield: oldPlayer.shield, crew: oldPlayer.crew,
  };
  const fleetShip = makeFleetShip('mary-celeste', 50, 60);
  fleetShip.hull = 90; fleetShip.shield = 40; fleetShip.crew = 7;
  const fleetStats = {
    x: fleetShip.x, z: fleetShip.z, hull: fleetShip.hull,
    shield: fleetShip.shield, crew: fleetShip.crew,
  };
  w.fleet = [fleetShip];
  const foe = makeAI(0, 300, 300, 1);
  w.enemies = [foe];
  w.wave = 2;
  w.captain.level = 3; w.captain.souls = 9; w.captain.sinkings = 4;

  assert.equal(switchCommand(w, fleetShip.id).ok, true);
  assert.equal(w.player, fleetShip, 'the fleet ship is now commanded');
  assert.equal(w.player.x, fleetStats.x);
  assert.equal(w.player.z, fleetStats.z);
  assert.equal(w.player.hull, fleetStats.hull);
  assert.equal(w.player.shield, fleetStats.shield);
  assert.equal(w.player.crew, fleetStats.crew);
  assert.equal(w.fleet.length, 1);
  assert.equal(w.fleet[0].id, oldPlayer.id, 'the old player is now a follower');
  assert.equal(w.fleet[0].x, oldStats.x);
  assert.equal(w.fleet[0].z, oldStats.z);
  assert.equal(w.fleet[0].hull, oldStats.hull);
  assert.equal(w.fleet[0].shield, oldStats.shield);
  assert.equal(w.fleet[0].crew, oldStats.crew);
  assert.equal(w.captain.level, 3);
  assert.equal(w.captain.souls, 9);
  assert.equal(w.captain.sinkings, 4);
  assert.equal(w.enemies.length, 1);
  assert.equal(w.enemies[0].id, foe.id);
  assert.equal(w.wave, 2);
  assert.deepEqual(switchCommand(w, 'no-such-ship'), { ok: false, reason: 'unknown ship' });
});

test('fleet escorts take ball damage, sink, and are pruned without counting toward level', () => {
  const w = makeWorld(52);
  const escort = makeFleetShip('mary-celeste', 50, 60);
  escort.hull = 5; escort.shield = 25;
  w.fleet = [escort];
  w.wave = 0; // no fresh waves while the test runs
  const sinkingsBefore = w.captain.sinkings;

  // A ball crossing the escort's hull band: shield takes it first.
  const ball = (fromId) => ({
    x: escort.x, y: 3, z: escort.z, vx: 0, vy: 0, vz: 0,
    fromId, delay: 0, life: 6,
  });
  w.balls = [ball('enemy-1')];
  let ev = stepWorld(w, {}, 1 / 60);
  assert.equal(escort.hull, 5, 'shield absorbs the hit, hull untouched');
  assert.equal(escort.shield, 20);
  assert.equal(escort.alive, true);

  // Shield stripped: the same hit sinks her, and the sinking is not a
  // level-up — only sunk ENEMY ships count.
  escort.shield = 0;
  w.balls = [ball('enemy-1')];
  ev = stepWorld(w, {}, 1 / 60);
  assert.equal(escort.alive, false, 'the escort goes down');
  assert.equal(escort.sinking, true);
  assert.ok(ev.some((e) => e.type === 'sunk' && e.shipId === escort.id));
  assert.equal(w.captain.sinkings, sinkingsBefore, 'a lost escort is not a sunk enemy');
  assert.equal(w.player.alive, true, 'the commanded ship is untouched');

  // The page steps dead followers so the wreck sinks; the engine then
  // prunes her from the fleet with a fleetSunk event.
  let sawFleetSunk = false;
  for (let i = 0; i < 60 * 12 && !sawFleetSunk; i++) {
    stepFleetShip(escort, w.player, w.enemies, w.wind, 1 / 60, w.rng);
    ev = stepWorld(w, {}, 1 / 60);
    sawFleetSunk = ev.some((e) => e.type === 'fleetSunk' && e.shipId === escort.id);
  }
  assert.equal(sawFleetSunk, true, 'the wreck is pruned with a fleetSunk event');
  assert.equal(w.fleet.length, 0);
  assert.equal(w.captain.sinkings, sinkingsBefore);
});

// ---------- Duels: sword ----------

test('sword duel: attack outside open whiffs, attack during open hits', () => {
  const a = makeSwordDuel(1);
  assert.equal(a.foeState, 'idle');
  swordDuelAction(a, 'attack', 0);
  assert.equal(a.foeHp, 3, 'attacking an idle foe does nothing');

  const b = makeSwordDuel(2);
  b.foeState = 'open';
  swordDuelAction(b, 'attack', 0);
  assert.equal(b.foeHp, 2, 'attacking an open foe lands');
});

test('sword duel: parry during telegraph blocks the strike and leaves the foe open', () => {
  const d = makeSwordDuel(3);
  d.foeState = 'telegraph';
  d.foeT = 1.0;
  swordDuelAction(d, 'parry', 0.5);
  assert.equal(d.foeState, 'open');
  assert.equal(d.foeT, 1.3);
  swordDuelTick(d, 1.3);
  assert.equal(d.playerHp, 3, 'the parried strike never lands');
  assert.equal(d.foeState, 'idle');
});

test('sword duel: win at foe HP 0 pays 3 souls, lose at player HP 0 pays 0', () => {
  const win = makeSwordDuel(4);
  win.foeHp = 1;
  win.foeState = 'open';
  const won = swordDuelAction(win, 'attack', 0);
  assert.equal(won.phase, 'won');
  assert.equal(won.foeHp, 0);
  assert.equal(won.reward, 3);

  const lose = makeSwordDuel(5);
  lose.playerHp = 1;
  lose.foeState = 'telegraph';
  lose.foeT = 2.0;
  const lost = swordDuelTick(lose, 2.0);
  assert.equal(lost.phase, 'lost');
  assert.equal(lost.playerHp, 0);
  assert.equal(lost.reward, 0);
});

// ---------- Duels: pistol ----------

test('pistol duel: tap before the signal loses early', () => {
  const d = makePistolDuel(11);
  const r = pistolDuelTap(d, d.signalAt - 0.5);
  assert.equal(r.phase, 'lost');
  assert.equal(r.result, 'early');
  assert.equal(r.reward, 0);
});

test('pistol duel: tap 0.2 s after the signal wins with 3 souls', () => {
  const d = makePistolDuel(11);
  const r = pistolDuelTap(d, d.signalAt + 0.2);
  assert.equal(r.phase, 'won');
  assert.equal(r.result, 'won');
  assert.equal(r.reward, 3);
  assert.ok(Math.abs(r.reaction - 0.2) < 1e-9);
});

test('pistol duel: tap 0.55 s after the signal wins with 2 souls', () => {
  const d = makePistolDuel(11);
  const r = pistolDuelTap(d, d.signalAt + 0.55);
  assert.equal(r.phase, 'won');
  assert.equal(r.reward, 2);
  assert.ok(Math.abs(r.reaction - 0.55) < 1e-9);
});

test('pistol duel: tap 0.9 s after the signal loses slow', () => {
  const d = makePistolDuel(11);
  const r = pistolDuelTap(d, d.signalAt + 0.9);
  assert.equal(r.phase, 'lost');
  assert.equal(r.result, 'slow');
  assert.equal(r.reward, 0);
});
