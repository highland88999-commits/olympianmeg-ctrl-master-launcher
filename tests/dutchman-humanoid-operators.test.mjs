/*
 * THE FLYING DUTCHMAN — humanoid operator agents tests.
 * Run with: node --test tests/dutchman-humanoid-operators.test.mjs
 * Covers app/flying-dutchman/humanoid-operators.js (Merlin, Nov 14
 * ~23:25: "Do the same thing we did for animals for humanoids
 * please, garments, weapons handling, all of it."): the agents that
 * operate the Dutchman's humanoids — foe-ship crews, island
 * merchants, ashore duel foes — mirroring the animal operator
 * pattern (app/flying-dutchman/operators.js, which mirrors
 * lib/earth4/operators.js): a being's whole life a pure function
 * of (place, kind, device clock), no stored state.
 *
 * The operators READ the existing systems — they do not replace
 * them. Crew loss is driven through damageShip, the same code path
 * the live game uses; duels are driven through the real voyage.js
 * state machines; merchant / duellist placement is verified against
 * seeded mirrors (same seed, same draw order as page.jsx dockAt /
 * voyage.js dressIslands) plus static audits of the 3D sources.
 * Earth 4 and the hub are verified here, not built: Earth 4 has no
 * humanoids (its laws hold), and the hub has no NPCs (no hub file).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  makeShip, makeAI, makeIslands, damageShip, SHIP,
} from '../app/flying-dutchman/engine.js';
import {
  MERCHANT_CATALOGUE, dressIslands,
  makeSwordDuel, swordDuelTick, swordDuelAction,
  makePistolDuel, pistolDuelTap,
} from '../app/flying-dutchman/voyage.js';
import {
  DUTCHMAN_FOUNDING_MS, DAY_MS,
  CREW_PER_HULL_LOSS, SOUL_LIFE_S, MAX_CREW, CANNON_RANGE,
  DUEL_FOE_HP, DUEL_SWORD_REWARD, DUEL_PISTOL_FAST_S, DUEL_PISTOL_SLOW_S,
  lifeRecordFor, deathLawFor, growthFor, activityNow, roleActivityFor,
  feedingFor, garmentFor, weaponFor, territoryFor, waterFor, userDeathLaw,
  lifeFor, merchantLife, duellistCountFor, duellistPlacements, duellistLife,
  crewmanLife, crewLives, crewWatchLine, duelFoeLife,
  enrichHumanoids, lifeLine,
  POPULATION_MINIMUMS, checkPopulation, merchantStalls,
} from '../app/flying-dutchman/humanoid-operators.js';
import { SPECIES_CATALOGUE } from '../lib/earth4/species-catalogue.js';
import { SPECIES_LIFE } from '../lib/earth4/species-life.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const engineSrc = read('../app/flying-dutchman/engine.js');
const voyageSrc = read('../app/flying-dutchman/voyage.js');
const pageSrc = read('../app/flying-dutchman/page.jsx');
const ship3dSrc = read('../app/flying-dutchman/ship3d.js');
const humanoidSrc = read('../app/flying-dutchman/humanoid-operators.js');
const animalSrc = read('../app/flying-dutchman/operators.js');
const earth4OpsSrc = read('../lib/earth4/operators.js');
const hubSrc = read('../components/HomeScene.jsx');
const hubPageSrc = read('../app/page.jsx');
const avatarsSrc = read('../lib/glb/avatars.js');

const NOW = Date.UTC(2026, 10, 14, 12, 0, 0);
const FOUNDING = Date.UTC(2026, 10, 14);

// --- drive a real sword duel to a win: parry every telegraph, strike every opening ---
function driveSwordWin(seed = 7) {
  const duel = makeSwordDuel(seed);
  let now = 0;
  for (let i = 0; i < 2000 && duel.phase === 'fight'; i++) {
    now += 0.1;
    swordDuelTick(duel, now);
    if (duel.phase !== 'fight') break;
    if (duel.foeState === 'telegraph') swordDuelAction(duel, 'parry', now);
    else if (duel.foeState === 'open') swordDuelAction(duel, 'attack', now);
  }
  return { duel, now };
}

// ===========================================================================
// 1. ENUMERATION — the humanoids, read from code
// ===========================================================================

test('enumeration: crews are a soul count on the ship (engine.js)', () => {
  assert.match(engineSrc, /crewPerHullLoss: 25/);
  assert.match(engineSrc, /soulLife: 180/);
  assert.match(engineSrc, /maxCrew: 24/);
  assert.match(engineSrc, /crew: 4 \+ Math\.floor\(difficulty \* 2\)/);
  assert.match(engineSrc, /crew: 8/); // player ship
  assert.equal(SHIP.crewPerHullLoss, CREW_PER_HULL_LOSS);
  assert.equal(SHIP.soulLife, SOUL_LIFE_S);
  assert.equal(SHIP.maxCrew, MAX_CREW);
  const ai = makeAI(0, 0, 0, 1);
  assert.ok(ai.crew >= 4, `foe crew ${ai.crew} must be >= 4`);
  const player = makeShip({ name: 'Flying Dutchman', isPlayer: true, crew: 8 });
  assert.equal(player.crew, 8);
});

test('enumeration: crews render as shared-material soul figures (ship3d.js)', () => {
  assert.match(ship3dSrc, /ConeGeometry\(0\.32, 1\.1, 8\)/);
  assert.match(ship3dSrc, /SphereGeometry\(0\.2, 8, 8\)/);
  assert.match(ship3dSrc, /color: 0xd8fff0/);
  assert.match(ship3dSrc, /opacity: 0\.85/);
  assert.match(pageSrc, /setCrew\(Math\.min\(world\.player\.crew, 12\)\)/);
  assert.match(pageSrc, /setCrew\(Math\.min\(e\.crew, 8\)\)/);
});

test('enumeration: one merchant per island, no rendered figure (voyage.js / page.jsx)', () => {
  assert.match(voyageSrc, /isl\.hasMerchant = true/);
  assert.equal(MERCHANT_CATALOGUE.length, 4);
  assert.deepEqual(MERCHANT_CATALOGUE.map((m) => m.id), ['cannon', 'hull', 'shieldcap', 'repair']);
  // The merchant is a shore position + a 2D panel: no mesh is ever built for one.
  assert.doesNotMatch(pageSrc, /merchant.*new THREE\.Mesh|new THREE\.Mesh.*merchant/i);
  assert.match(pageSrc, /MerchantPanel/);
  assert.match(pageSrc, /const merchant = \{ x: island\.x \+ ux \* \(island\.r - 6\)/);
});

test('enumeration: 2–3 duel foes per island, cone robe figures (page.jsx)', () => {
  assert.match(pageSrc, /const nFoes = 2 \+ \(Math\.abs\(island\.seed \|\| 0\) % 2\)/);
  assert.match(pageSrc, /ConeGeometry\(1\.1, 3\.2, 6\)/);
  assert.match(pageSrc, /color: 0x1a0a12/);
  assert.match(pageSrc, /emissive: new THREE\.Color\(0x400010\)/);
  assert.match(pageSrc, /emissiveIntensity: 0\.6/);
});

test('enumeration: duel law — sword 3 hits +3 souls, pistol timing windows (voyage.js)', () => {
  assert.match(voyageSrc, /foeHp: 3/);
  assert.match(voyageSrc, /duel\.reward = 3/);
  assert.match(voyageSrc, /signalAt: 1\.5 \+ rng\(\) \* 2\.0/);
  assert.match(voyageSrc, /duel\.reaction < 0\.4/);
  assert.match(voyageSrc, /foe falls — player wins/);
  assert.equal(DUEL_FOE_HP, 3);
  assert.equal(DUEL_SWORD_REWARD, 3);
  assert.equal(DUEL_PISTOL_FAST_S, 0.4);
  assert.equal(DUEL_PISTOL_SLOW_S, 0.7);
});

test('enumeration: PvP rival is a real player, not an NPC (pvp-sync.js)', () => {
  const pvpSrc = read('../app/flying-dutchman/pvp-sync.js');
  assert.match(pvpSrc, /Two captains, one room code/);
  assert.match(pvpSrc, /broadcast/);
  // The humanoid operators never operate a rival: no rival kind, no rival life.
  assert.equal(POPULATION_MINIMUMS.rival, undefined);
  assert.doesNotMatch(humanoidSrc, /export function rivalLife/);
  assert.match(humanoidSrc, /a REAL other player, not\n\/\/     an NPC/);
});

// ===========================================================================
// 2. DEATH LAW — exactly as implemented
// ===========================================================================

test('death law: crewman dies by hull damage or sinking; souls released', () => {
  const law = deathLawFor('crewman');
  assert.equal(law.cause, 'hull-damage-or-sinking');
  assert.equal(law.crewPerHullLoss, 25);
  assert.equal(law.soulLingerSeconds, 180);
  // Drive it through the real engine: 50 damage vs 25 shield = 25 hull = 1 crew lost.
  const ship = makeShip({ name: 'Foe', crew: 6 });
  const souls = [];
  damageShip(ship, 50, [], souls, Math.random, 0, 0);
  assert.equal(ship.crew, 5);
  assert.equal(ship.hull, 75);
  // Sinking releases one soul per crewman aboard at sinking (_crewStart).
  ship.shield = 0;
  damageShip(ship, 500, [], souls, Math.random, 0, 0);
  assert.equal(ship.alive, false);
  assert.equal(souls.length, 6);
});

test('death law: a shielded hit costs no crew', () => {
  const ship = makeShip({ name: 'Foe', crew: 6 });
  damageShip(ship, 20, [], [], Math.random, 0, 0); // fully absorbed by the 25 shield
  assert.equal(ship.crew, 6);
  assert.equal(ship.hull, 100);
});

test('death law: merchant never dies; standing duellist age-only (flagged default)', () => {
  assert.equal(deathLawFor('merchant').cause, 'never');
  assert.match(deathLawFor('merchant').detail, /never die/);
  assert.equal(deathLawFor('duellist').cause, 'age');
  assert.match(deathLawFor('duellist').detail, /worker default/);
  assert.equal(deathLawFor('duel-foe').cause, 'duel');
  assert.match(deathLawFor('duel-foe').detail, /No corpse/);
});

test('death law: a duel win falls the foe, a duel loss leaves the foe alive', () => {
  const { duel } = driveSwordWin();
  assert.equal(duel.phase, 'won');
  assert.equal(duel.foeHp, 0);
  assert.equal(duel.reward, 3);
  const won = duelFoeLife(duel, 'sword', NOW);
  assert.equal(won.state, 'decomposing');
  assert.equal(won.stageName, 'Fallen');
  assert.equal(won.decompStageName, 'Fallen — no remains');
  assert.equal(won.reward, 3);
  // Pistol: firing early loses — and the foe lives.
  const early = makePistolDuel(3);
  const res = pistolDuelTap(early, 0.5);
  assert.equal(res.phase, 'lost');
  assert.equal(res.result, 'early');
  const foeAlive = duelFoeLife(early, 'pistol', NOW);
  assert.equal(foeAlive.state, 'alive');
  assert.equal(foeAlive.reward, 0);
  // Pistol: a clean draw wins +3.
  const clean = makePistolDuel(3);
  const res2 = pistolDuelTap(clean, clean.signalAt + 0.2);
  assert.equal(res2.phase, 'won');
  assert.equal(res2.reward, 3);
  const foeOutdrawn = duelFoeLife(clean, 'pistol', NOW);
  assert.equal(foeOutdrawn.state, 'decomposing');
  assert.equal(foeOutdrawn.stageName, 'Outdrawn');
  assert.equal(foeOutdrawn.reaction, res2.reaction);
});

// ===========================================================================
// 3. BIRTH / GROWTH / HABITS / DIET
// ===========================================================================

test('growth: humanoid stages move, bodies do not', () => {
  const rec = lifeRecordFor('merchant');
  assert.deepEqual(rec.stg, ['Apprentice', 'Trader', 'Master merchant']);
  assert.equal(growthFor(rec, 0).stageName, 'Apprentice');
  assert.equal(growthFor(rec, 3650).stageName, 'Master merchant');
  assert.equal(growthFor(rec, 0).sizeM, 1.7);
  assert.equal(growthFor(rec, 3650).sizeM, 1.7);
  assert.deepEqual(lifeRecordFor('crewman').stg, ['New soul', 'Settled', 'Old salt']);
  assert.deepEqual(lifeRecordFor('duellist').stg, ['Greenhorn', 'Seasoned', 'Old blade']);
});

test('habits: activity is a pure function of the device clock; role labels per kind', () => {
  const rec = lifeRecordFor('merchant');
  assert.equal(activityNow(rec, 'isle-0|merchant', new Date(NOW)), activityNow(rec, 'isle-0|merchant', new Date(NOW)));
  assert.equal(roleActivityFor('crewman', 'moving'), 'working the rigging');
  assert.equal(roleActivityFor('crewman', 'sleeping'), 'asleep in their hammocks');
  assert.equal(roleActivityFor('merchant', 'other'), 'trading');
  assert.equal(roleActivityFor('duellist', 'moving'), 'drilling');
  assert.equal(roleActivityFor('crewman', 'moving', true), 'at the guns');
  assert.equal(roleActivityFor('duellist', 'moving', true), 'fighting');
});

test('diet: crews feast on souls, merchants and duellists eat stores and fare', () => {
  assert.equal(feedingFor('crewman', 'feeding', 'k').mode, 'feasting');
  assert.match(feedingFor('crewman', 'feeding', 'k').detail, /never a spawned creature/);
  assert.equal(feedingFor('merchant', 'feeding', 'k').mode, 'eating');
  assert.equal(feedingFor('duellist', 'feeding', 'k').mode, 'eating');
  assert.equal(feedingFor('crewman', 'resting', 'k').mode, null);
});

test('territory: no humanoid rival fights; user-hunt is the cannon branch; no corpse', () => {
  // Default call: no rivals, no user — nobody is territorial here.
  assert.equal(territoryFor('crewman', {}).state, 'not-territorial');
  assert.equal(territoryFor('merchant', {}).state, 'not-territorial');
  assert.equal(territoryFor('duellist', {}).state, 'not-territorial');
  // The user-in-range branch IS live: foe crews hunt the player's ship.
  assert.equal(territoryFor('crewman', { userInRange: true }).state, 'hunting-user');
  assert.equal(territoryFor('duellist', { userInRange: true }).state, 'duelling-user');
  // User death resolves to no-corpse for every kind.
  for (const kind of ['crewman', 'merchant', 'duellist', 'duel-foe']) {
    assert.equal(territoryFor(kind, { userDead: true }).state, 'no-corpse');
  }
  const law = userDeathLaw();
  assert.equal(law.outcome, 'respawn');
  assert.equal(law.corpse, false);
  assert.match(law.detail, /100 m from the wreck/);
  assert.match(animalSrc, /100 m from the wreck/); // same law as the animal pass
});

test('water: every humanoid is on or beside the sea', () => {
  assert.equal(waterFor('crewman').need, 'ship stores');
  assert.equal(waterFor('merchant').need, 'island spring');
  assert.equal(waterFor('duellist').need, 'island spring');
});

// ===========================================================================
// 4. GARMENT AGENT — tied to the real mesh/material, or flagged data-only
// ===========================================================================

test('garment: crewman shroud is the shared crewMat — data-only per crewman', () => {
  const g = garmentFor('crewman', { hullFraction: 1 });
  assert.equal(g.kind, 'soul shroud');
  assert.equal(g.rendered, true);
  assert.equal(g.perFigure, false);
  assert.equal(g.material.color, 0xd8fff0);
  assert.equal(g.material.opacity, 0.85);
  assert.equal(g.material.emissiveIntensity, 1.4);
  assert.equal(g.condition, 'whole');
  assert.equal(garmentFor('crewman', { hullFraction: 0.6 }).condition, 'frayed');
  assert.equal(garmentFor('crewman', { hullFraction: 0.3 }).condition, 'tattered');
  assert.equal(garmentFor('crewman', { hullFraction: 0.1 }).condition, 'in rags');
  assert.match(g.detail, /data-only per crewman/);
});

test('garment: merchant garb is data-only — no figure exists', () => {
  const g = garmentFor('merchant', { tenureYears: 12 });
  assert.equal(g.rendered, false);
  assert.equal(g.mesh, null);
  assert.equal(g.material, null);
  assert.deepEqual(g.pieces, ['apron', 'coin purse', 'ledger', 'wide-brim hat']);
  assert.equal(g.condition, 'worn soft');
  assert.match(g.detail, /DATA-ONLY/);
});

test('garment: duellist robe IS the cone mesh — condition maps to emissiveIntensity', () => {
  const whole = garmentFor('duellist', { foeHp: 3 });
  assert.equal(whole.rendered, true);
  assert.equal(whole.perFigure, true);
  assert.equal(whole.material.color, 0x1a0a12);
  assert.equal(whole.material.emissive, 0x400010);
  assert.equal(whole.material.emissiveIntensity, 0.6);
  assert.equal(whole.condition, 'whole');
  assert.equal(garmentFor('duellist', { foeHp: 2 }).material.emissiveIntensity, 0.45);
  assert.equal(garmentFor('duellist', { foeHp: 1 }).condition, 'torn');
  assert.equal(garmentFor('duellist', { foeHp: 0 }).material.emissiveIntensity, 0);
  assert.equal(garmentFor('duel-foe', { foeHp: 1 }).condition, 'torn');
  assert.match(whole.detail, /Reported, not applied/);
});

// ===========================================================================
// 5. WEAPONS AGENT — reads the combat systems, never drives them
// ===========================================================================

test('weapons: sword stance follows foeState; condition is display-only', () => {
  assert.equal(weaponFor('duellist', { duelKind: 'sword', foeState: 'idle', foeHp: 3 }).stance, 'circling, sword lowered');
  assert.equal(weaponFor('duellist', { duelKind: 'sword', foeState: 'telegraph', foeHp: 3 }).stance, 'blade raised — about to strike');
  assert.equal(weaponFor('duellist', { duelKind: 'sword', foeState: 'open', foeHp: 2 }).stance, 'guard down, exposed — strike now');
  assert.equal(weaponFor('duellist', { duelKind: 'sword', foeState: 'open', foeHp: 2 }).condition, 'nicked');
  assert.equal(weaponFor('duellist', { duelKind: 'sword', foeState: 'idle', foeHp: 1 }).condition, 'notched');
  assert.match(weaponFor('duellist', { duelKind: 'sword', foeHp: 3 }).detail, /3 hits wins \+3 souls/);
});

test('weapons: pistol stance follows the signal; cannon readiness follows range', () => {
  const waiting = weaponFor('duel-foe', { duelKind: 'pistol', phase: 'wait' });
  assert.equal(waiting.stance, 'hand hovering over the holster, waiting for the signal');
  assert.equal(weaponFor('duel-foe', { duelKind: 'pistol', phase: 'won' }).label, 'pistol — clean shot');
  assert.equal(weaponFor('duel-foe', { duelKind: 'pistol', phase: 'lost', result: 'slow' }).condition, 'smoke-fouled');
  const near = weaponFor('crewman', { rangeM: 60 });
  assert.equal(near.label, 'cannon — ready');
  assert.equal(near.stance, 'at the guns, ready to fire');
  const far = weaponFor('crewman', { rangeM: 500 });
  assert.equal(far.label, 'cannon — standing by');
  assert.equal(far.condition, 'sound');
  assert.equal(CANNON_RANGE, SHIP.cannonRange);
});

test('weapons: merchants are unarmed and never fight', () => {
  const w = weaponFor('merchant', {});
  assert.equal(w.weapon, 'none');
  assert.equal(w.label, 'unarmed');
  assert.match(w.stance, /trades, never fights/);
});

// ===========================================================================
// 6. CONDUCTOR — crewman / merchant / duellist / duel-foe lives
// ===========================================================================

test('crewman life: berths exist while index < crew; empty berth is null; deterministic', () => {
  const ship = makeShip({ name: 'The Morrow', crew: 6 });
  const a = crewmanLife(ship, 0, NOW);
  const b = crewmanLife(ship, 0, NOW);
  assert.equal(a.state, 'alive');
  assert.equal(a.kind, 'crewman');
  assert.equal(a.berth, 0);
  assert.equal(a.ageDays, b.ageDays);
  assert.equal(a.stageName, b.stageName);
  assert.equal(crewmanLife(ship, 5, NOW).state, 'alive');
  assert.equal(crewmanLife(ship, 6, NOW), null);
  assert.equal(crewmanLife(ship, 0, NOW).social.groupSize, 6);
  assert.notEqual(crewmanLife(ship, 0, NOW).ageDays, crewmanLife(ship, 1, NOW).ageDays);
});

test('crewman life: at the guns in range, off the clock out of range; sunk is decomposing', () => {
  const player = makeShip({ name: 'Flying Dutchman', isPlayer: true, crew: 8, x: 0, z: 0 });
  const foe = makeShip({ name: 'The Morrow', crew: 6, x: 60, z: 0 });
  assert.equal(crewmanLife(foe, 0, NOW, player).roleActivity, 'at the guns');
  assert.equal(crewmanLife(foe, 0, NOW, player).territory.state, 'hunting-user');
  const far = makeShip({ name: 'The Morrow', crew: 6, x: 500, z: 0 });
  assert.notEqual(crewmanLife(far, 0, NOW, player).roleActivity, 'at the guns');
  // Sinking: every berth reports decomposing, souls released.
  const wreck = makeShip({ name: 'The Morrow', crew: 6 });
  wreck.shield = 0;
  damageShip(wreck, 500, [], [], Math.random, 0, 0);
  assert.equal(wreck.alive, false);
  const lost = crewmanLife(wreck, 0, NOW);
  assert.equal(lost.state, 'decomposing');
  assert.equal(lost.decompStageName, 'Souls released');
  assert.equal(lost.soulLingerSeconds, 180);
  assert.equal(crewLives(wreck, NOW).length, 6);
  assert.equal(crewLives(makeShip({ crew: 6 }), NOW).length, 6);
});

test('crew watch line: the tiny foe-hull wire', () => {
  const player = makeShip({ name: 'Flying Dutchman', isPlayer: true, crew: 8, x: 0, z: 0 });
  const foe = makeShip({ name: 'The Morrow', crew: 6, x: 60, z: 0 });
  assert.equal(crewWatchLine(foe, player, NOW), ' · crew at the guns');
  assert.equal(crewWatchLine(makeShip({ crew: 0 }), player, NOW), '');
  const wreck = makeShip({ crew: 6 });
  wreck.shield = 0;
  damageShip(wreck, 500, [], [], Math.random, 0, 0);
  assert.equal(crewWatchLine(wreck, player, NOW), '');
});

test('merchant life: always alive, one per island, deathless', () => {
  const islands = dressIslands(makeIslands(() => 0.5));
  assert.equal(islands.length, 8);
  assert.ok(islands.every((i) => i.hasMerchant));
  const m = merchantLife(islands[0], NOW);
  assert.equal(m.state, 'alive');
  assert.equal(m.deathLaw.cause, 'never');
  assert.equal(m.lifespanYears, null);
  assert.equal(m.social.groupSize, 1);
  assert.equal(m.weapon.label, 'unarmed');
  assert.equal(m.garment.rendered, false);
  assert.equal(merchantLife(islands[0], NOW).ageDays, m.ageDays); // deterministic
  const stalls = merchantStalls(islands);
  assert.equal(stalls.length, 8);
  // Stall position mirrors page.jsx dockAt: centre + dock bearing x (r - 6).
  const isl = islands[0];
  const dx = isl.dock.x - isl.x, dz = isl.dock.z - isl.z;
  const dl = Math.hypot(dx, dz) || 1;
  assert.equal(stalls[0].x, isl.x + (dx / dl) * (isl.r - 6));
  assert.equal(stalls[0].z, isl.z + (dz / dl) * (isl.r - 6));
});

test('duellist life: 2–3 per island at seeded spots; beyond the count is null', () => {
  const islands = dressIslands(makeIslands(() => 0.5));
  for (const isl of islands) {
    const n = duellistCountFor(isl);
    assert.ok(n === 2 || n === 3, `island ${isl.id} has ${n} foes`);
    const spots = duellistPlacements(isl);
    assert.equal(spots.length, n);
    // Placement mirrors page.jsx dockAt exactly (independent re-implementation).
    for (let i = 0; i < n; i++) {
      const a = (((isl.seed % 1000) / 1000) * Math.PI * 2) + (i / n) * Math.PI * 2;
      const rr = isl.r * (0.35 + 0.15 * (i % 2));
      assert.equal(spots[i].x, isl.x + Math.sin(a) * rr);
      assert.equal(spots[i].z, isl.z + Math.cos(a) * rr);
    }
    const foe = duellistLife(isl, 0, NOW);
    assert.equal(foe.state, 'alive');
    assert.equal(foe.social.groupSize, n);
    assert.equal(foe.x, spots[0].x);
    assert.equal(duellistLife(isl, n, NOW), null);
    assert.equal(duellistLife(isl, 0, NOW).ageDays, foe.ageDays); // deterministic
  }
});

test('duel-foe life: sword states read live off the state machine', () => {
  const fresh = duelFoeLife(makeSwordDuel(7), 'sword', NOW);
  assert.equal(fresh.state, 'alive');
  assert.equal(fresh.stageName, 'Unmarked');
  assert.equal(fresh.foeHp, 3);
  assert.equal(fresh.roleActivity, 'fighting');
  assert.equal(fresh.garment.condition, 'whole');
  const mid = duelFoeLife({ phase: 'fight', foeHp: 1, playerHp: 2, foeState: 'open' }, 'sword', NOW);
  assert.equal(mid.stageName, 'Reeling');
  assert.equal(mid.roleActivity, 'guard down');
  assert.equal(mid.garment.condition, 'torn');
  assert.equal(mid.weapon.stance, 'guard down, exposed — strike now');
  const lost = duelFoeLife({ phase: 'lost', foeHp: 2, playerHp: 0, foeState: 'idle' }, 'sword', NOW);
  assert.equal(lost.state, 'alive'); // the player fell — the foe lives
  assert.equal(duelFoeLife(null, 'sword', NOW).state, 'alive');
});

test('seeded lifeFor: duellists turn over by age; merchants never do', () => {
  const young = lifeFor('duellist', 'isle-0|foe-0', FOUNDING + 365 * DAY_MS);
  // Age at founding is seeded up to a full lifespan, so a year on the
  // foe may already be mid-life or decomposing — either is well-formed.
  assert.ok(['alive', 'decomposing'].includes(young.state));
  assert.equal(young.breeding, false);
  assert.equal(young.offspring, 0);
  // 60 years on: dead or next generation — but always a well-formed life.
  const old = lifeFor('duellist', 'isle-0|foe-0', FOUNDING + 60 * 365.25 * DAY_MS);
  assert.ok(['alive', 'decomposing'].includes(old.state));
  assert.ok(typeof old.stageName === 'string' && old.stageName.length > 0);
  const m = lifeFor('merchant', 'isle-0', FOUNDING + 60 * 365.25 * DAY_MS);
  assert.equal(m.state, 'alive');
  assert.equal(m.deathEpochMs, null);
  assert.equal(m.lifespanBasis, 'never-dies');
});

test('enrichHumanoids: mixed list; empty berth enriches to null', () => {
  const islands = dressIslands(makeIslands(() => 0.5));
  const ship = makeShip({ name: 'The Morrow', crew: 2 });
  const beings = [
    { kind: 'crewman', ship, index: 0 },
    { kind: 'crewman', ship, index: 5 },
    { kind: 'merchant', island: islands[0] },
    { kind: 'duellist', island: islands[0], index: 0 },
    { kind: 'duel-foe', duel: makeSwordDuel(7), duelKind: 'sword' },
  ];
  enrichHumanoids(beings, NOW);
  assert.equal(beings[0].life.state, 'alive');
  assert.equal(beings[1].life, null);
  assert.equal(beings[2].life.kind, 'merchant');
  assert.equal(beings[3].life.kind, 'duellist');
  assert.equal(beings[4].life.kind, 'duel-foe');
  assert.equal(enrichHumanoids(null), null);
  assert.equal(enrichHumanoids('nope'), 'nope');
});

test('lifeLine: stage · activity · role · garment · weapon, or Remains', () => {
  const ship = makeShip({ name: 'The Morrow', crew: 6 });
  const crew = lifeLine(crewmanLife(ship, 0, NOW));
  assert.match(crew, / · /);
  assert.match(crew, /soul shroud — /);
  assert.match(crew, /cannon — /);
  assert.match(crew, /berth 1 of 6/);
  const islands = dressIslands(makeIslands(() => 0.5));
  const merch = lifeLine(merchantLife(islands[0], NOW));
  assert.match(merch, /merchant garb — /);
  assert.match(merch, /unarmed/);
  assert.match(merch, new RegExp(islands[0].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const { duel } = driveSwordWin();
  const fallen = lifeLine(duelFoeLife(duel, 'sword', NOW));
  assert.equal(fallen, 'Remains — Fallen — no remains');
  const mid = lifeLine(duelFoeLife({ phase: 'fight', foeHp: 2, playerHp: 3, foeState: 'idle' }, 'sword', NOW));
  assert.match(mid, /foe 2\/3 hp/);
  assert.equal(lifeLine(null), '');
  assert.equal(lifeLine({ state: 'decomposing', stageName: 'X' }), 'Remains — X');
});

// ===========================================================================
// 7. POPULATION RULE
// ===========================================================================

test('population: crews and duellists meet the rule; merchants and duel-foes are exempt singletons', () => {
  assert.equal(POPULATION_MINIMUMS.crewman.minLive, 4);
  assert.match(POPULATION_MINIMUMS.merchant.howMet, /EXEMPT — singleton by design/);
  assert.match(POPULATION_MINIMUMS['duel-foe'].howMet, /EXEMPT/);
  const check = checkPopulation({ minCrewPerFoe: 6, merchants: 8, minDuellistsPerIsland: 2, duelFoes: 1 });
  assert.equal(check.crewman.meets, true);
  assert.equal(check.merchant.meets, true);
  assert.equal(check.duellist.meets, true);
  assert.equal(check['duel-foe'].meets, true);
  const short = checkPopulation({ minCrewPerFoe: 3, merchants: 7, minDuellistsPerIsland: 1, duelFoes: 2 });
  assert.equal(short.crewman.meets, false);
  assert.equal(short.merchant.meets, false);
  assert.equal(short.duellist.meets, false);
  assert.equal(short['duel-foe'].meets, false);
  // Live counts from the real generators: every foe ship carries 4+.
  for (let wave = 1; wave <= 5; wave++) {
    const ai = makeAI(wave, 0, 0, 1 + wave * 0.35);
    assert.ok(ai.crew >= 4, `wave ${wave} foe crew ${ai.crew}`);
  }
});

// ===========================================================================
// 8. EARTH 4 + HUB — verified, not built
// ===========================================================================

test('earth 4: no humanoids — 2,408 species, no Hominidae, no Homo, only non-human primates', () => {
  assert.equal(SPECIES_CATALOGUE.length, 2408);
  assert.equal(Object.keys(SPECIES_LIFE).length, 2408);
  assert.equal(SPECIES_CATALOGUE.filter((s) => s.family === 'Hominidae').length, 0);
  assert.equal(SPECIES_CATALOGUE.filter((s) => s.name.startsWith('Homo ')).length, 0);
  const primates = SPECIES_CATALOGUE.filter((s) => s.order === 'Primates').map((s) => s.name);
  assert.deepEqual(primates, [
    'Aotus zonalis', 'Carlito syrichta', 'Cebus versicolor',
    'Cheracebus lugens', 'Eulemur albifrons', 'Eulemur collaris',
    'Leontocebus lagonotus', 'Leontocebus leucogenys',
    'Presbytis siberu', 'Propithecus deckenii', 'Sapajus cay',
    'Trachypithecus germaini',
  ]);
  // The "Homo" string hits are Homoscleromorpha sponges, not humans.
  assert.ok(SPECIES_CATALOGUE.filter((s) => s.class === 'Homoscleromorpha').length > 0);
  // Earth 4's laws are untouched: death by age only, no hunting.
  assert.match(earth4OpsSrc, /DEATH HAS ONE CAUSE: age/);
  assert.match(earth4OpsSrc, /no spawned creature is ever\n\/\/ prey/);
  // This module never imports Earth 4's operators or species data —
  // it only names them in comments (the pattern it mirrors).
  assert.doesNotMatch(humanoidSrc, /from '.*earth4\/operators\.js'/);
  assert.doesNotMatch(humanoidSrc, /import \{[^}]*SPECIES_LIFE/);
});

test('hub: no NPCs in the hub scene — NPC models exist but nothing spawns them there', () => {
  assert.match(avatarsSrc, /NPC_MODELS/);
  assert.match(avatarsSrc, /vendor\.glb/);
  assert.doesNotMatch(hubSrc, /NPC_MODELS|npcs\/vendor|npcs\/guard|vendor\.glb|guard\.glb/);
  assert.doesNotMatch(hubSrc, /NPC|non-player|villager/i);
  assert.doesNotMatch(hubPageSrc, /NPC_MODELS/);
  // The hub scene is planets, towers, portals and user worlds — no figures.
  assert.match(hubSrc, /PlanetBody|HubScene/);
});
