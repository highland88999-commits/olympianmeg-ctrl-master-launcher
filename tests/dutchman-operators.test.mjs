/*
 * THE FLYING DUTCHMAN — operator agents tests.
 * Run with: node --test tests/dutchman-operators.test.mjs
 * Covers app/flying-dutchman/operators.js (Merlin, Nov 14 ~22:56:
 * "Yes — all realms"; population rule Nov 14 ~22:57; behavior
 * logic Nov 14 ~22:59): the agents that operate the Dutchman's
 * creatures — kraken, seagulls, dolphins / flying fish, foe ships
 * with their crews — mirroring the Earth 4 operator pattern
 * (lib/earth4/operators.js): a creature's whole life a pure
 * function of (place, species, device clock), no stored state.
 *
 * The operators READ the existing systems — they do not replace
 * them. Kraken ball-hits are driven through stepBalls, the same
 * code path the live game uses, and the sea-life / gull schedules
 * are verified against the seeded mirrors in operators.js (same
 * seed, same draw order as sea3d.js) plus static audits of the
 * 3D sources. Earth 4's operators are NOT touched by this suite
 * (its laws — no hunting, age-only death — are a carve-out).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  makeWorld, makeAI, stepWorld, stepBalls, damageShip, makeIslands,
  makeRng, spawnWave,
} from '../app/flying-dutchman/engine.js';
import { KRAKEN_HP } from '../app/flying-dutchman/voyage.js';
import {
  KRAKEN_HITS_TO_KILL, KRAKEN_HITS_TO_KILL_BANE,
  lifeFor, lifeRecordFor, deathLawFor, growthFor, activityNow,
  krakenLife, foeShipLife,
  enrichCreatures, lifeLine,
  POPULATION_MINIMUMS, checkPopulation, gullFlocks,
  SEA_LIFE_SEED, simulateSeaLifeSchedule,
  feedingFor, territoryFor, waterFor, userDeathLaw,
} from '../app/flying-dutchman/operators.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const opsSrc = read('../app/flying-dutchman/operators.js');
const seaSrc = read('../app/flying-dutchman/sea3d.js');
const pageSrc = read('../app/flying-dutchman/page.jsx');
const engineSrc = read('../app/flying-dutchman/engine.js');
const voyageSrc = read('../app/flying-dutchman/voyage.js');

const NOW = Date.UTC(2026, 10, 14, 12, 0, 0);

// ---------- Deterministic life ----------

test('lifeFor is deterministic: same (name, key, clock) gives the same life', () => {
  const a = lifeFor('seagull', 'isle-0|gull-1', NOW);
  const b = lifeFor('seagull', 'isle-0|gull-1', NOW);
  assert.deepEqual(a, b);
  assert.equal(a.state, 'alive');
  assert.equal(a.name, 'seagull');
  assert.equal(a.social.groupSize, 3, 'a gull flock is 3, per sea3d.js');
  assert.equal(a.deathLaw.cause, 'age');
});

test('lifeFor: a different key draws a different age; a later clock ages the creature', () => {
  const a = lifeFor('dolphin', 'pod-a', NOW);
  const b = lifeFor('dolphin', 'pod-b', NOW);
  assert.notEqual(a.ageDays, b.ageDays, 'seeded age-at-founding differs per key');
  const later = lifeFor('dolphin', 'pod-a', NOW + 365 * 86400000);
  assert.ok(later.ageDays > a.ageDays, 'the clock moves the age');
  assert.equal(later.generation, a.generation, 'one year on, same generation');
});

test('lifeFor turns over generations on the clock: 40 years on, a gull is a later generation', () => {
  const now = lifeFor('seagull', 'isle-0|gull-1', NOW);
  const far = lifeFor('seagull', 'isle-0|gull-1', NOW + 40 * 365.25 * 86400000);
  assert.ok(far.generation > now.generation, 'gulls (15 y lifespan) turn over');
  assert.ok(['alive', 'decomposing'].includes(far.state));
});

test('lifeFor never throws on an unknown name — the fallback stands in', () => {
  const life = lifeFor('mystery-fish', 'x', NOW);
  assert.equal(life.state, 'alive');
  assert.equal(life.lifespanBasis, 'fallback');
});

test('growthFor: a newborn is at birth size, an adult at adult size, stages in order', () => {
  const rec = lifeRecordFor('dolphin');
  const newborn = growthFor(rec, 0);
  assert.equal(newborn.stageName, 'Calf');
  assert.ok(Math.abs(newborn.sizeM - 1.0) < 0.001);
  const adult = growthFor(rec, 1825);
  assert.equal(adult.stageName, 'Adult');
  assert.ok(Math.abs(adult.sizeM - 2.5) < 0.001);
  assert.deepEqual(adult.stages, ['Calf', 'Juvenile', 'Adult']);
});

test('activityNow reads the device clock: gulls feed by day, rest by night', () => {
  const rec = lifeRecordFor('seagull');
  const noon = activityNow(rec, 'isle-0|gull-1', new Date(Date.UTC(2026, 10, 14, 12, 0, 0)));
  const midnight = activityNow(rec, 'isle-0|gull-1', new Date(Date.UTC(2026, 10, 14, 0, 0, 0)));
  assert.ok(['feeding', 'moving', 'resting', 'other'].includes(noon), `daytime is active, got ${noon}`);
  assert.ok(['sleeping', 'resting'].includes(midnight), `night is rest, got ${midnight}`);
});

// ---------- Death law ----------

test('deathLawFor: kraken dies by cannons (12 hits, 6 with bane); foe ships by cannon fire; sea life by age only', () => {
  assert.equal(deathLawFor('kraken').cause, 'cannons');
  assert.equal(deathLawFor('kraken').hitsToKill, 12);
  assert.equal(deathLawFor('kraken').hitsToKillBane, 6);
  assert.equal(deathLawFor('kraken').drops, 'exactly 1 mega soul');
  assert.equal(deathLawFor('foe-ship').cause, 'cannon fire');
  assert.equal(deathLawFor('foe-ship').drops, 'one soul per crewman aboard');
  assert.equal(deathLawFor('seagull').cause, 'age');
  assert.equal(deathLawFor('dolphin').cause, 'age');
  assert.equal(deathLawFor('flying-fish').cause, 'age');
  assert.match(deathLawFor('seagull').detail, /worker default/);
});

test('kraken: 12 ball-hits slay it — exactly 1 mega soul, krakenKills + 1 (live rule, via stepBalls)', () => {
  assert.equal(KRAKEN_HP, 60, 'kraken hp must be 60 (12 hits at 5 damage)');
  assert.equal(KRAKEN_HITS_TO_KILL, 12);
  const w = makeWorld(77);
  w.krakenThreshold = 10;
  w.krakenTimer = 10;
  stepWorld(w, { rudder: 0 }, 0.1);
  assert.equal(w.kraken.state, 'warning');
  for (let i = 0; i < 8; i++) stepWorld(w, { rudder: 0 }, 1);
  const k = w.kraken;
  assert.equal(k.state, 'attack');
  for (let i = 0; i < 11; i++) {
    const balls = [{ x: k.x, y: 3, z: k.z, vx: 0, vy: 0, vz: 0, fromId: w.player.id, delay: 0, life: 6 }];
    stepBalls(balls, [w.player], w.souls, 1 / 60, 0, [], w.rng, k);
    assert.equal(k.state, 'attack', `after ${i + 1} hits the kraken must still attack`);
  }
  const balls = [{ x: k.x, y: 3, z: k.z, vx: 0, vy: 0, vz: 0, fromId: w.player.id, delay: 0, life: 6 }];
  stepBalls(balls, [w.player], w.souls, 1 / 60, 0, [], w.rng, k);
  assert.equal(k.state, 'dying', 'the 12th hit kills the kraken');
  const before = w.megaSouls.length;
  const ev = stepWorld(w, { rudder: 0 }, 1 / 60);
  assert.ok(ev.some((e) => e.type === 'krakenSlain'), 'the kraken must be slain');
  assert.equal(w.megaSouls.length - before, 1, 'a slain kraken drops exactly 1 mega soul');
  assert.equal(w.captain.krakenKills, 1);
  // The operators only read this: the timer is reset by voyage.js, not by us.
  assert.equal(w.kraken, null);
});

test('krakenLife reads the live kraken: stirring before spawn, attacking with hits left', () => {
  const w = makeWorld(78);
  const stirring = krakenLife(w, NOW);
  assert.equal(stirring.stageName, 'Stirring');
  assert.equal(stirring.hitsLeft, 12);
  assert.ok(stirring.secondsToSpawn > 0, 'the timer counts down to the spawn');
  assert.equal(stirring.territory.state, 'solitary');
  w.kraken = { state: 'attack', x: 100, z: 0, t: 0, hits: 7, hp: 25, tentacles: [] };
  const attacking = krakenLife(w, NOW);
  assert.equal(attacking.stageName, 'Attacking');
  assert.equal(attacking.activity, 'hunting the Dutchman');
  assert.equal(attacking.hitsLeft, 5);
  assert.equal(attacking.territory.state, 'hunting-user');
  assert.equal(attacking.feeding.mode, 'hunting');
  const bane = krakenLife(w, NOW, { krakenBane: true });
  assert.equal(bane.hitsToKill, KRAKEN_HITS_TO_KILL_BANE);
  assert.equal(bane.hitsLeft, Math.max(0, 6 - 7));
});

test('foeShipLife reads the live ship: stage from hull, activity from range, crew as group size', () => {
  const w = makeWorld(79);
  const foe = makeAI(0, 500, 0, 1);
  const far = foeShipLife(foe, w.player, NOW);
  assert.equal(far.stageName, 'Battle-ready');
  assert.equal(far.activity, 'closing to broadside');
  assert.equal(far.social.groupSize, foe.crew);
  assert.equal(far.deathLaw.cause, 'cannon fire');
  assert.equal(far.territory.state, 'not-territorial');
  foe.hull = 20;
  const crippled = foeShipLife(foe, w.player, NOW);
  assert.equal(crippled.stageName, 'Crippled');
  foe.x = w.player.x + 20; foe.z = w.player.z;
  assert.equal(foeShipLife(foe, w.player, NOW).activity, 'turning away');
  // A sunk foe reports remains, not a living stage.
  foe.alive = false;
  foe.hull = 0;
  const sunk = foeShipLife(foe, w.player, NOW);
  assert.equal(sunk.state, 'decomposing');
  assert.equal(sunk.stageName, 'Sinking');
  assert.match(lifeLine(sunk), /^Remains — Sunk$/);
});

test('foe ships sink by cannon fire and release one soul per crewman (live rule)', () => {
  const w = makeWorld(80);
  const foe = makeAI(0, 400, 0, 1);
  w.enemies.push(foe);
  const crewStart = foe._crewStart;
  foe.shield = 0;
  damageShip(foe, foe.hull, w.events, w.souls, w.rng, foe.x, foe.z);
  assert.equal(foe.alive, false);
  assert.equal(foe.sinking, true);
  assert.equal(w.souls.length, Math.max(1, crewStart), 'one soul per crewman aboard');
});

// ---------- Population rule ----------

test('population minimums: seagulls 6 (2 flocks of 3), sea life 1 breach per 90 s, foes 1 live, kraken exempt', () => {
  assert.equal(POPULATION_MINIMUMS.seagull.minLive, 6);
  assert.equal(POPULATION_MINIMUMS.dolphin.minLive, 1);
  assert.equal(POPULATION_MINIMUMS['flying-fish'].minLive, 1);
  assert.equal(POPULATION_MINIMUMS['foe-ship'].minLive, 1);
  assert.match(POPULATION_MINIMUMS.kraken.howMet, /EXEMPT/);
  const ok = checkPopulation({ seagull: 6, dolphinBreachesPer90s: 1, flyingFishBreachesPer90s: 1, liveFoes: 2, krakenActive: 1 });
  assert.ok(Object.values(ok).every((e) => e.meets));
  const short = checkPopulation({ seagull: 3, dolphinBreachesPer90s: 0, flyingFishBreachesPer90s: 0, liveFoes: 0, krakenActive: 2 });
  assert.equal(short.seagull.meets, false);
  assert.equal(short.dolphin.meets, false);
  assert.equal(short['foe-ship'].meets, false);
  assert.equal(short.kraken.meets, false, 'two krakens at once must fail — one at a time by design');
});

test('gullFlocks: 2 flocks of 3 on the first two islands — the existing system already meets the minimum', () => {
  const islands = makeIslands(makeRng(99));
  assert.equal(islands.length, 8);
  const flocks = gullFlocks(islands);
  assert.equal(flocks.length, 2);
  assert.equal(flocks.reduce((n, f) => n + f.gulls, 0), 6);
  assert.notEqual(flocks[0].islandId, flocks[1].islandId, 'the flocks circle different islands');
  assert.notDeepEqual([flocks[0].cx, flocks[0].cz], [flocks[1].cx, flocks[1].cz]);
  assert.equal(flocks[0].radius, islands[0].r + 25);
  assert.equal(flocks[0].height, 25);
  assert.equal(flocks[1].height, 33);
  // Static audit: sea3d.js really does build 2 flocks of 3.
  assert.match(seaSrc, /2 flocks of 3/);
  assert.match(seaSrc, /for \(let f = 0; f < 2; f\+\+\)/);
  assert.match(seaSrc, /for \(let k = 0; k < 3; k\+\+\)/);
});

test('sea-life schedule: a breach every 45–90 s, both kinds, spread bearings and distances — never one spot', () => {
  const sched = simulateSeaLifeSchedule(SEA_LIFE_SEED, 40);
  assert.equal(sched.length, 40);
  let maxGap = 0;
  for (let i = 1; i < sched.length; i++) {
    const gap = sched[i].atS - sched[i - 1].atS;
    assert.ok(gap >= 45 && gap <= 90, `gap ${gap} s must stay inside 45–90 s`);
    maxGap = Math.max(maxGap, gap);
  }
  assert.ok(maxGap <= 90, 'the sea is never empty of sea life for longer than 90 s');
  const kinds = new Set(sched.map((s) => s.kind));
  assert.ok(kinds.has('dolphin') && kinds.has('flying-fish'), 'both kinds appear across a voyage');
  const quadrants = new Set(sched.map((s) => Math.floor(((s.bearing % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 2)) % 4));
  assert.ok(quadrants.size >= 3, 'bearings spread across the compass, not one spot');
  for (const s of sched) assert.ok(s.distM >= 40 && s.distM <= 80, 'breach distance stays 40–80 m off the player');
  // Static audit: sea3d.js really does run this seeded schedule.
  assert.match(seaSrc, /a breach every 45–90 s/);
  assert.match(seaSrc, /mulberry32\(1337\)/);
  assert.match(seaSrc, /rng\(\) < 0\.6 \? 'dolphin' : 'fish'/);
});

test('foe ships: multiple per voyage in waves of 1–3 — the existing system already meets the minimum', () => {
  const w = makeWorld(81);
  assert.equal(w.enemies.length, 0);
  spawnWave(w, 2);
  assert.equal(w.enemies.length, 2, 'a wave spawns more than one foe ship');
  assert.ok(w.enemies.every((e) => e.alive));
  assert.ok(w.enemies.every((e) => e.crew >= 4), 'every foe ship sails with a crew');
  // Waves spawn 1–3: min(1 + floor(wave / 2), 3) — the next wave
  // spawns when the sea is clear (engine.js stepWorld).
  assert.match(engineSrc, /Math\.min\(1 \+ Math\.floor\(world\.wave \/ 2\), 3\)/);
  assert.match(engineSrc, /if \(p\.alive && world\.enemies\.length === 0 && world\.wave > 0\)/);
  const pop = checkPopulation({ seagull: 6, dolphinBreachesPer90s: 1, flyingFishBreachesPer90s: 1, liveFoes: 2, krakenActive: 0 });
  assert.ok(pop['foe-ship'].meets);
});

// ---------- Tap-card life line ----------

test('lifeLine shape: stage · activity, breeding and group size where they apply; Remains for the dead', () => {
  const gull = lifeFor('seagull', 'isle-0|gull-1', NOW);
  const line = lifeLine(gull);
  assert.match(line, /^[A-Za-z]+ · [a-z]+/);
  assert.match(line, /in a group of 3/);
  const dead = lifeFor('seagull', 'isle-0|gull-1', NOW + 40 * 365.25 * 86400000);
  if (dead.state === 'decomposing') {
    assert.match(lifeLine(dead), /^Remains — /);
  } else {
    assert.match(lifeLine(dead), / · /);
  }
  const k = krakenLife({ kraken: { state: 'attack', x: 0, z: 0, hits: 7, hp: 25 }, krakenTimer: 0, krakenThreshold: 400 }, NOW);
  assert.match(lifeLine(k), /Attacking · hunting the Dutchman · 5\/12 hits to kill/);
  const foe = makeAI(0, 500, 0, 1);
  assert.match(lifeLine(foeShipLife(foe, null, NOW)), new RegExp(`crew of ${foe.crew}`));
  assert.equal(lifeLine(null), '');
});

test('lifeLine shows the feeding mode while the creature feeds (diet drives feeding)', () => {
  const hunting = { state: 'alive', kind: 'ambient', stageName: 'Adult', activity: 'feeding', feeding: { mode: 'hunting' }, breeding: false, social: { groupSize: 1 } };
  assert.match(lifeLine(hunting), /Adult · hunting/);
  const grazing = { ...hunting, feeding: { mode: 'grazing' } };
  assert.match(lifeLine(grazing), /Adult · grazing/);
});

test('page.jsx wires the life line into the two existing creature surfaces (kraken banner, foe hull line)', () => {
  assert.match(pageSrc, /from '\.\/operators\.js'/);
  assert.match(pageSrc, /lifeLine\(krakenLife\(world\)\)/);
  assert.match(pageSrc, /lifeLine\(foeShipLife\(foe, p\)\)/);
  assert.match(pageSrc, /hud\.kraken\.lifeLine/);
  assert.match(pageSrc, /hud\.foeHull\.lifeLine/);
});

// ---------- Behavior logic (Merlin, Nov 14 ~22:59) ----------

test('feedingFor: carnivores hunt, herbivores graze, omnivores hunt or graze by seeded day', () => {
  assert.equal(feedingFor('carnivore', 'feeding', 'pod-a', NOW).mode, 'hunting');
  assert.equal(feedingFor('herbivore', 'feeding', 'school-a', NOW).mode, 'grazing');
  assert.match(feedingFor('carnivore', 'feeding', 'pod-a', NOW).detail, /never a spawned creature/);
  const omni = feedingFor('omnivore', 'feeding', 'isle-0|gull-1', NOW);
  assert.ok(['hunting', 'grazing'].includes(omni.mode));
  assert.equal(feedingFor('omnivore', 'feeding', 'isle-0|gull-1', NOW).mode, omni.mode, 'same day, same choice');
  assert.equal(feedingFor('carnivore', 'sleeping', 'pod-a', NOW).mode, null, 'not feeding outside feeding hours');
  // The records carry their diet categories.
  assert.equal(lifeRecordFor('dolphin').dieCat, 'carnivore');
  assert.equal(lifeRecordFor('flying-fish').dieCat, 'herbivore');
  assert.equal(lifeRecordFor('seagull').dieCat, 'omnivore');
});

test('territoryFor: kraken is the only territorial carnivore — solitary, hunts the user, rival branch implemented but unreachable', () => {
  assert.equal(territoryFor('kraken', {}).state, 'solitary');
  assert.match(territoryFor('kraken', {}).detail, /no rival kraken/);
  assert.equal(territoryFor('kraken', { userInRange: true }).state, 'hunting-user');
  assert.equal(territoryFor('kraken', { rivalsInRange: true }).state, 'fighting-rival');
  assert.equal(territoryFor('dolphin', {}).state, 'not-territorial');
  assert.match(territoryFor('dolphin', {}).detail, /not a territorial death-fighter/);
  assert.equal(territoryFor('seagull', {}).state, 'not-territorial');
  assert.equal(territoryFor('flying-fish', {}).state, 'not-territorial');
  assert.equal(territoryFor('foe-ship', {}).state, 'not-territorial');
  assert.match(territoryFor('foe-ship', {}).detail, /never each other for a meal/);
});

test('user death: there is NO corpse in the Dutchman — the ship respawns, the kraken despawns', () => {
  const law = userDeathLaw();
  assert.equal(law.outcome, 'respawn');
  assert.equal(law.corpse, false);
  assert.match(law.detail, /100 m from the wreck/);
  assert.equal(territoryFor('kraken', { userDead: true }).state, 'no-corpse');
  assert.equal(territoryFor('foe-ship', { userDead: true }).state, 'no-corpse');
  // Static audit: the code really does respawn and despawn, not corpse.
  assert.match(voyageSrc, /respawnPlayer/);
  assert.match(voyageSrc, /A kraken that downed her is gone for this voyage leg/);
  assert.match(engineSrc, /respawnPlayer\(world, world\.rng\)/);
});

test('waterFor: every Dutchman creature meets its water need in or on the sea', () => {
  for (const name of ['seagull', 'dolphin', 'flying-fish', 'kraken', 'foe-ship']) {
    const w = waterFor(name);
    assert.ok(w.need && w.detail, `${name} must have a water branch`);
  }
  assert.match(waterFor('dolphin').detail, /lives in the sea/);
  assert.match(waterFor('flying-fish').detail, /lives in the sea/);
  assert.match(waterFor('kraken').detail, /lives in the deep sea/);
  assert.match(waterFor('seagull').detail, /drinks from the sea/);
  assert.match(waterFor('foe-ship').detail, /sails on the sea/);
});

test('life objects carry feeding, territory and water — the agents run every part of the creature', () => {
  for (const name of ['seagull', 'dolphin', 'flying-fish']) {
    const life = lifeFor(name, `key-${name}`, NOW);
    assert.ok(life.feeding && 'mode' in life.feeding, `${name} needs a feeding branch`);
    assert.ok(life.territory && life.territory.state, `${name} needs a territory branch`);
    assert.ok(life.water && life.water.detail, `${name} needs a water branch`);
    assert.ok(life.dietCategory, `${name} needs a diet category`);
  }
  const k = krakenLife({ kraken: { state: 'attack', x: 0, z: 0, hits: 0, hp: 60 }, krakenTimer: 0, krakenThreshold: 400 }, NOW);
  assert.equal(k.feeding.mode, 'hunting');
  assert.equal(k.water.need, 'lives in it');
  const foe = foeShipLife(makeAI(0, 500, 0, 1), null, NOW);
  assert.equal(foe.feeding.mode, 'souls');
  assert.equal(foe.water.need, 'sails on it');
});

// ---------- Conductor / enrich ----------

test('enrichCreatures adds life to ambient, kraken and foe-ship entries and never throws', () => {
  const list = enrichCreatures([
    { name: 'seagull', key: 'isle-0|gull-1' },
    { name: 'dolphin', key: 'pod-a' },
    { name: 'mystery-fish', key: 'x' },
    { kind: 'kraken', world: { kraken: null, krakenTimer: 100, krakenThreshold: 400 } },
    { kind: 'foe-ship', ship: makeAI(0, 500, 0, 1), player: null },
    null,
    { name: 42 },
  ], NOW);
  assert.equal(list[0].life.name, 'seagull');
  assert.equal(list[1].life.name, 'dolphin');
  assert.equal(list[2].life.lifespanBasis, 'fallback');
  assert.equal(list[3].life.kind, 'kraken');
  assert.equal(list[3].life.stageName, 'Stirring');
  assert.equal(list[4].life.kind, 'foe-ship');
  assert.equal(list[5], null);
  assert.equal(list[6].life, undefined);
  assert.equal(enrichCreatures(null), null);
  assert.equal(enrichCreatures('nope'), 'nope');
});

test('operators read the existing systems — they never mutate the world, timer, kraken or ships', () => {
  // No assignment into world/kraken/ship state anywhere in operators.js
  // (reads only — `===` comparisons are reads, not writes).
  assert.ok(!/world\.kraken\s*=[^=]/.test(opsSrc), 'operators must never set world.kraken');
  assert.ok(!/world\.krakenTimer\s*=[^=]/.test(opsSrc), 'operators must never touch the kraken timer');
  assert.ok(!/kraken\.hp\s*=[^=]/.test(opsSrc), 'operators must never touch kraken hp');
  assert.ok(!/ship\.hull\s*=[^=]/.test(opsSrc), 'operators must never touch ship hull');
  assert.ok(!/\.splice\(/.test(opsSrc), 'operators must never remove anything');
  assert.ok(!/import .* from '\.\/engine\.js'/.test(opsSrc), 'operators do not import the engine');
  assert.ok(!/import .* from '\.\/voyage\.js'/.test(opsSrc), 'operators do not import voyage.js');
  assert.match(opsSrc, /from '\.\.\/\.\.\/lib\/earth4\/life-clock\.js'/, 'only the pure clock is shared');
  // Earth 4's operators are untouched by this build — its laws
  // (no hunting, age-only death) stand as Merlin ordered them.
  const e4Src = read('../lib/earth4/operators.js');
  assert.match(e4Src, /DEATH HAS ONE CAUSE: age/);
  assert.ok(!/fighting-rival/.test(e4Src), 'Earth 4 has no territorial death-fights');
  assert.ok(!/hunting-user/.test(e4Src), 'Earth 4 has no user-hunt');
});
