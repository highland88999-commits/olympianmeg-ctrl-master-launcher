// Hollow Earth elemental effects (WS6, 2026-11-16): typed damage
// secondaries + graphic wraps. Merlin ordered typed damage —
// "the damage type should match their element" — the NUMBERS
// below are the worker's call (audit §4.2), except lightning,
// which is the aura law, and frost chill x0.7, which is the
// built+tested aura value (not the audit draft's x0.6).
// Run: node app/hollow-earth/tests/elemental-effects.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import {
  ELEMENTS, ELEMENT_COLORS, ELEMENT_SECONDARY, secondaryFor,
  MONSTER_TYPES, createMonster, stepMonster,
  createKorus, stepKorus, KORUS_POS,
  applyHitSecondary, tickHunterDot, clearHunterSecondaries,
  poolDpsAt, prunePools, activeSecondary, chillFactorFor,
  createHunterState, applyDamage,
  applyMonsterAuraHit, applyPlayerBoltSecondary, monsterSlowFactor, isMonsterBlinded,
  tickMonsterBurn,
} from '../spawns.js';
import { BURN_DPS, BURN_SECONDS } from '../../../lib/lightning-aura.js';
import { FROST_CHILL_FACTOR } from '../elemental-aura.js';
import { hazeStateFor, HAZE_PRESETS } from '../elemental.js';

const rng = () => 0.5;
const alwaysLos = () => true;
function mon(type, x, z, faceYaw = 0) {
  const m = createMonster({ id: `t-${type}`, type, element: MONSTER_TYPES[type].element, x, z }, rng);
  m.faceYaw = faceYaw;
  m.active = true;
  return m;
}
function typeFor(archetype, element) {
  return Object.entries(MONSTER_TYPES)
    .find(([, t]) => t.archetype === archetype && (!element || t.element === element) && !t.dragon)?.[0];
}

test('secondary table: all 7 elements, audit §4.2 numbers', () => {
  for (const el of ELEMENTS) assert.ok(ELEMENT_SECONDARY[el], `missing secondary for ${el}`);
  assert.deepEqual(
    { kind: ELEMENT_SECONDARY.fire.kind, dps: ELEMENT_SECONDARY.fire.dps, seconds: ELEMENT_SECONDARY.fire.seconds },
    { kind: 'burn', dps: 5, seconds: 3 },
  );
  assert.deepEqual(
    { kind: ELEMENT_SECONDARY.acid.kind, dps: ELEMENT_SECONDARY.acid.dps, seconds: ELEMENT_SECONDARY.acid.seconds, radius: ELEMENT_SECONDARY.acid.radius },
    { kind: 'pool', dps: 4, seconds: 4, radius: 3.5 },
  );
  assert.deepEqual(
    { kind: ELEMENT_SECONDARY.poison.kind, dps: ELEMENT_SECONDARY.poison.dps, seconds: ELEMENT_SECONDARY.poison.seconds },
    { kind: 'venom', dps: 4, seconds: 5 },
  );
  assert.deepEqual(
    { kind: ELEMENT_SECONDARY.frost.kind, dps: ELEMENT_SECONDARY.frost.dps, seconds: ELEMENT_SECONDARY.frost.seconds, speedFactor: ELEMENT_SECONDARY.frost.speedFactor },
    { kind: 'chill', dps: 2, seconds: 3, speedFactor: 0.7 },
  );
  assert.deepEqual(
    { kind: ELEMENT_SECONDARY.shadow.kind, seconds: ELEMENT_SECONDARY.shadow.seconds, color: ELEMENT_SECONDARY.shadow.color, max: ELEMENT_SECONDARY.shadow.max },
    { kind: 'dim', seconds: 4, color: 0x5a5a66, max: 0.30 },
  );
  assert.deepEqual(
    { kind: ELEMENT_SECONDARY.sand.kind, seconds: ELEMENT_SECONDARY.sand.seconds, color: ELEMENT_SECONDARY.sand.color, max: ELEMENT_SECONDARY.sand.max },
    { kind: 'gust', seconds: 2.5, color: 0xc2a15e, max: 0.35 },
  );
});

test('lightning maps to the aura law, never re-typed: 6/s x 3 s, aura-only', () => {
  assert.equal(ELEMENT_SECONDARY.lightning.dps, BURN_DPS, 'lightning dps IS the aura dps');
  assert.equal(ELEMENT_SECONDARY.lightning.seconds, BURN_SECONDS, 'lightning seconds IS the aura seconds');
  assert.equal(ELEMENT_SECONDARY.lightning.auraOnly, true);
  assert.equal(secondaryFor('lightning', 'hit'), null, 'archetype hits do NOT light a burn');
  assert.equal(secondaryFor('lightning', 'hazard'), null, 'hazards do NOT light a burn');
  assert.ok(secondaryFor('lightning', 'aura'), 'aura strikes light the burn');
  assert.equal(secondaryFor('korus', 'hit'), null, 'Korus: no entry, exempt');
  assert.equal(secondaryFor('ghorrum', 'hit'), null, 'Ghorrum: no entry, exempt');
  assert.equal(secondaryFor('unknown-element', 'hit'), null);
  assert.equal(secondaryFor(null, 'hit'), null);
});

test('frost chill is x0.7 — the built aura value, not the audit draft x0.6', () => {
  assert.equal(FROST_CHILL_FACTOR, 0.7, 'aura value is the law');
  assert.equal(ELEMENT_SECONDARY.frost.speedFactor, FROST_CHILL_FACTOR, 'hit chill uses ONE number everywhere');
  assert.equal(HAZE_PRESETS.shadow.max, 0.30);
  assert.equal(HAZE_PRESETS.sand.max, 0.35);
});

test('hit events carry a valid element (melee, short-range, ranged)', () => {
  const cases = [
    { type: typeFor('melee'), player: { x: 2, z: 0 }, faceYaw: Math.PI / 2 },
    { type: typeFor('short-range'), player: { x: 4, z: 0 }, faceYaw: Math.PI / 2 },
    { type: typeFor('ranged'), player: { x: 10, z: 0 }, faceYaw: Math.PI / 2 },
  ];
  for (const c of cases) {
    assert.ok(c.type, `no ${c.type} type found`);
    const m = mon(c.type, 0, 0, c.faceYaw);
    const evs = stepMonster(m, 0.1, c.player, rng, { losClear: alwaysLos });
    const hits = evs.filter((e) => e.kind === 'hit');
    assert.ok(hits.length >= 1, `${c.type} must emit a hit`);
    for (const hit of hits) {
      assert.ok(ELEMENTS.includes(hit.element), `${c.type} hit element ${hit.element} is not a valid element`);
      assert.equal(hit.element, MONSTER_TYPES[c.type].element, 'hit element is the monster element');
    }
  }
});

test('Korus hits stay flat and untyped (exempt by design)', () => {
  const k = createKorus(true);
  const player = { x: KORUS_POS.x + 5, z: KORUS_POS.z };
  stepKorus(k, 0.1, player); // wake
  stepKorus(k, 0.1, player); // start telegraph
  const evs = stepKorus(k, 1.2, player); // telegraph lands: bolt hit at 5 m
  const hits = evs.filter((e) => e.kind === 'hit');
  assert.ok(hits.length >= 1, 'Korus must land a hit here');
  for (const hit of hits) {
    assert.equal('element' in hit, false, 'Korus hits carry no element');
    assert.equal(secondaryFor(hit.element, 'hit'), null);
  }
});

test('DoT slot: refresh-not-stack, higher dps wins (fire 5 vs poison 4)', () => {
  const h = createHunterState();
  applyHitSecondary(h, 'fire', 'hit', 1000);
  assert.equal(h.dotDps, 5);
  assert.equal(h.dotElement, 'fire');
  assert.equal(h.dotRemainingS, 3);
  // Re-hit refreshes the duration, dps unchanged.
  applyHitSecondary(h, 'fire', 'hit', 2000);
  assert.equal(h.dotRemainingS, 3);
  // Poison is weaker: duration refreshes to 5 s, dps stays 5.
  applyHitSecondary(h, 'poison', 'hit', 3000);
  assert.equal(h.dotDps, 5, 'higher dps wins');
  assert.equal(h.dotElement, 'fire', 'the stronger DoT keeps the slot');
  assert.equal(h.dotRemainingS, 5, 'duration refreshes on re-hit');
  // The tick eats 5/s and counts down.
  assert.equal(tickHunterDot(h, 1), 5);
  assert.equal(h.dotRemainingS, 4);
  assert.equal(tickHunterDot(h, 4), 20);
  assert.equal(h.dotRemainingS, 0);
  assert.equal(h.dotDps, 0, 'slot clears when the timer lapses');
  assert.equal(h.dotElement, null);
  assert.equal(tickHunterDot(h, 1), 0, 'no DoT, no damage');
});

test('poison venom alone: 4/s x 5 s, no live deliverer needed to run', () => {
  const h = createHunterState();
  applyHitSecondary(h, 'poison', 'hit', 1000);
  assert.equal(h.dotDps, 4);
  assert.equal(h.dotRemainingS, 5);
  assert.equal(tickHunterDot(h, 5), 20);
});

test('frost chill: x0.7 slow + 2/s chip; a stronger burn keeps its dps', () => {
  const h = createHunterState();
  applyHitSecondary(h, 'frost', 'hit', 1000);
  assert.equal(h.slowUntil, 4000, '3 s chill');
  assert.equal(h.slowFactor, 0.7);
  assert.equal(h.dotDps, 2, 'chip lights the slot when nothing stronger runs');
  assert.equal(chillFactorFor(h, 2000), 0.7);
  assert.equal(chillFactorFor(h, 4000), 1, 'chill ends at the deadline');
  assert.equal(chillFactorFor(h, 5000), 1);
  // Fire burn running: the chill still slows, the burn keeps 5/s.
  const h2 = createHunterState();
  applyHitSecondary(h2, 'fire', 'hit', 1000);
  applyHitSecondary(h2, 'frost', 'hit', 1000);
  assert.equal(h2.dotDps, 5, 'fire keeps the slot');
  assert.equal(h2.dotElement, 'fire');
  assert.equal(chillFactorFor(h2, 2000), 0.7, 'slow applies regardless');
});

test('acid pool: positional, higher-dps-wins, stops on exit and expiry', () => {
  const now = 10000;
  const sec = applyHitSecondary(createHunterState(), 'acid', 'hit', now);
  assert.equal(sec.kind, 'pool');
  assert.equal(sec.radius, 3.5);
  assert.equal(sec.dps, 4);
  const pools = [
    { x: 0, z: 0, radius: 3.5, dps: 4, until: now + 4000 },
    { x: 6, z: 0, radius: 3.5, dps: 4, until: now + 4000 },
  ];
  assert.equal(poolDpsAt(pools, 0, 0, now), 4, 'inside the pool');
  assert.equal(poolDpsAt(pools, 3.5, 0, now), 4, 'on the rim still counts');
  assert.equal(poolDpsAt(pools, -4, 0, now), 0, 'stepping out ends it');
  // Two overlapping pools: the higher dps wins, never adds.
  pools.push({ x: 1, z: 0, radius: 3.5, dps: 6, until: now + 4000 });
  assert.equal(poolDpsAt(pools, 0, 0, now), 6);
  assert.equal(poolDpsAt(pools, 0, 0, now + 4000), 0, 'expired pools deal nothing');
  assert.deepEqual(prunePools(pools, now + 4000), [], 'prune drops expired pools');
  assert.equal(prunePools(pools, now).length, 3);
});

test('shadow dim / sand gust: haze state per hit, Haven suppresses', () => {
  const now = 10000;
  assert.deepEqual(
    hazeStateFor({ dimUntil: now + 4000, nowMs: now }),
    { target: 1, color: 0x5a5a66, max: 0.30 },
    'shadow hit: full grey haze',
  );
  assert.deepEqual(
    hazeStateFor({ gustUntil: now + 2500, nowMs: now }),
    { target: 1, color: 0xc2a15e, max: 0.35 },
    'sand hit: sand-tinted gust',
  );
  assert.deepEqual(
    hazeStateFor({ shadowCombat: true, nowMs: now }),
    { target: 1, color: 0x5a5a66, max: 0.30 },
    'no hit: the old shadow-combat behaviour',
  );
  assert.deepEqual(
    hazeStateFor({ nowMs: now }),
    { target: 0, color: 0x5a5a66, max: 0.30 },
    'nothing: clear',
  );
  assert.deepEqual(
    hazeStateFor({ dimUntil: now + 4000, inBase: true, nowMs: now }),
    { target: 0, color: 0x5a5a66, max: 0.30 },
    'inside The Haven the haze target is 0 — suppression, not cleanse',
  );
  // A dim still running outlives a gust: dim wins the dome.
  assert.equal(hazeStateFor({ dimUntil: now + 4000, gustUntil: now + 2500, nowMs: now }).color, 0x5a5a66);
  const h = createHunterState();
  applyHitSecondary(h, 'shadow', 'hit', now);
  assert.equal(h.dimUntil, now + 4000);
  applyHitSecondary(h, 'sand', 'hit', now);
  assert.equal(h.gustUntil, now + 2500);
});

test('death-respawn clears every secondary (DoT, slow, dim, gust)', () => {
  const h = createHunterState();
  applyHitSecondary(h, 'fire', 'hit', 1000);
  applyHitSecondary(h, 'frost', 'hit', 1000);
  applyHitSecondary(h, 'shadow', 'hit', 1000);
  applyHitSecondary(h, 'sand', 'hit', 1000);
  assert.ok(h.dotRemainingS > 0 && h.slowUntil > 0 && h.dimUntil > 0 && h.gustUntil > 0);
  clearHunterSecondaries(h);
  assert.equal(h.dotDps, 0);
  assert.equal(h.dotRemainingS, 0);
  assert.equal(h.dotElement, null);
  assert.equal(h.slowUntil, 0);
  assert.equal(h.dimUntil, 0);
  assert.equal(h.gustUntil, 0);
  assert.equal(activeSecondary(h, 2000), null);
});

test('HUD pill: active secondary, icon + label + whole seconds', () => {
  const h = createHunterState();
  assert.equal(activeSecondary(h, 1000), null);
  applyHitSecondary(h, 'fire', 'hit', 1000);
  assert.deepEqual(activeSecondary(h, 1000), { icon: '🔥', label: 'burn', seconds: 3 });
  tickHunterDot(h, 1);
  assert.deepEqual(activeSecondary(h, 2000), { icon: '🔥', label: 'burn', seconds: 2 });
  const h2 = createHunterState();
  applyHitSecondary(h2, 'poison', 'hit', 1000);
  assert.deepEqual(activeSecondary(h2, 1000), { icon: '🧪', label: 'venom', seconds: 5 });
  const h3 = createHunterState();
  applyHitSecondary(h3, 'shadow', 'hit', 1000);
  assert.deepEqual(activeSecondary(h3, 1000), { icon: '🌫️', label: 'dim', seconds: 4 });
  const h4 = createHunterState();
  applyHitSecondary(h4, 'sand', 'hit', 1000);
  assert.deepEqual(activeSecondary(h4, 1000), { icon: '💨', label: 'gust', seconds: 3 });
});

test('shield absorbs secondary damage first — no bypass anywhere', () => {
  const h = createHunterState();
  h.shield = 50;
  applyHitSecondary(h, 'fire', 'hit', 1000);
  const dmg = tickHunterDot(h, 1); // 5
  const res = applyDamage(h, dmg);
  assert.equal(res.absorbed, 5, 'the shield eats the burn first');
  assert.equal(res.hpLost, 0);
  assert.equal(h.hp, 100);
  assert.equal(h.shield, 45);
});

test('Sanctuary suppression gates (step 11, Phase 2c): page + zone pin the same gates as damage', () => {
  const page = readFileSync('app/hollow-earth/page.jsx', 'utf8');
  const zone = readFileSync('app/hollow-earth/zone.js', 'utf8');
  // damageHunter early-returns inside ANY sanctuary (no hit, no
  // secondary) — except Korus's own blasts (from === 'korus'):
  // his telegraphed blasts are his own mechanics, so the throne
  // court stays a real fight. Phase 2c generalised the old
  // Haven-only isInBase guard to inSanctuaryAt (zones + rings).
  assert.match(page, /if \(from !== 'korus' && inSanctuaryAt\(walker\.pos\.x, walker\.pos\.z\)\) return true; \/\/ sanctuary: no damage lands/);
  // DoT tick deals damage only outside a sanctuary (the timer still counts down).
  assert.match(page, /if \(dotDmg > 0 && !inSanctuaryAt\(walker\.pos\.x, walker\.pos\.z\)\)/);
  // Pool tick deals damage only outside a sanctuary.
  assert.match(page, /if \(poolDps > 0 && hp2 && hp2\.hp > 0 && !inSanctuaryAt\(walker\.pos\.x, walker\.pos\.z\)\)/);
  // Hazard resolution still requires !sanctuary, and hazards light secondaries.
  assert.match(page, /if \(d <= hz\.radius && !inSanctuaryAt\(walker\.pos\.x, walker\.pos\.z\)\)/);
  assert.match(page, /applyHitSecondary\(h, hz\.element, 'hazard'/);
  // The zone passes the hit-driven haze deadlines with the Haven flag.
  assert.match(zone, /haze: hazeStateFor\(\{/);
  assert.match(zone, /inBase: observer\.inBase/);
  // Element-coloured hazard rings (no more one hardcoded red).
  assert.match(page, /color: ELEMENT_COLORS\[hz\.element\] \|\| 0xff5544/);
  // The aura-strike visual already exists (WS3): the zone draws
  // a sky-bolt at the player on a player-target strike.
  assert.match(zone, /drawStrikeBolt\(ev, observer\.x, observer\.z\)/);
});

test('armed bolt: every element lights its secondary on the monster', () => {
  const cases = [
    ['fire', { kind: 'burn', dps: 5, seconds: 3 }],
    ['lightning', { kind: 'burn', dps: 6, seconds: 3 }],
    ['poison', { kind: 'venom', dps: 4, seconds: 5 }],
    ['acid', { kind: 'pool', dps: 4, seconds: 4, radius: 3.5 }],
  ];
  for (const [el, want] of cases) {
    const m = mon(typeFor('melee'), 0, 0);
    const sec = applyPlayerBoltSecondary(m, el, 1000);
    assert.equal(sec.kind, want.kind, `${el} kind`);
    assert.equal(m.burnDps, want.dps, `${el} dps`);
    assert.equal(m.burnRemainingS, want.seconds, `${el} seconds`);
    assert.equal(m.dotElement, el);
    assert.equal(m.dotByPlayer, true, `${el} kill pays the hunter`);
    if (want.radius) assert.equal(sec.radius, want.radius);
  }
  // Frost: slow + chip.
  const f = mon(typeFor('melee'), 0, 0);
  const fsec = applyPlayerBoltSecondary(f, 'frost', 1000);
  assert.equal(fsec.kind, 'chill');
  assert.equal(f.slowUntil, 4000);
  assert.equal(f.slowFactor, 0.7);
  assert.equal(f.burnDps, 2, 'frost chip lights the slot');
  assert.equal(monsterSlowFactor(f, 2000), 0.7);
  assert.equal(monsterSlowFactor(f, 4000), 1, 'chill ends at the deadline');
  // Shadow / sand: blind, and the monster loses the hunter at once.
  for (const [el, seconds] of [['shadow', 4], ['sand', 2.5]]) {
    const b = mon(typeFor('melee'), 0, 0);
    b.spotted = true; b.state = 'stalk'; b.target = { x: 1, z: 1 };
    const bsec = applyPlayerBoltSecondary(b, el, 1000);
    assert.equal(bsec.kind, 'blind');
    assert.equal(bsec.seconds, seconds);
    assert.equal(b.spotted, false, `${el} blind drops the hunt at once`);
    assert.equal(b.blindUntil, 1000 + seconds * 1000);
    assert.equal(isMonsterBlinded(b, 2000), true);
    assert.equal(isMonsterBlinded(b, 1000 + seconds * 1000), false);
  }
  // Unknown element / dead monster: nothing, never throws.
  assert.equal(applyPlayerBoltSecondary(mon(typeFor('melee'), 0, 0), 'storm', 1000), null);
  assert.equal(applyPlayerBoltSecondary(mon(typeFor('melee'), 0, 0), null, 1000), null);
  const dead = mon(typeFor('melee'), 0, 0);
  dead.dead = true;
  assert.equal(applyPlayerBoltSecondary(dead, 'fire', 1000), null);
});

test('bolt DoT slot: higher dps wins, aura re-strike takes the slot back', () => {
  // A player fire bolt (5/s) cannot steal a lightning aura burn (6/s).
  const m = mon(typeFor('melee'), 0, 0);
  applyMonsterAuraHit(m, { dmg: 8, burnDps: 6, burnSeconds: 3, from: 'aura-1', element: 'lightning' });
  applyPlayerBoltSecondary(m, 'fire', 1000);
  assert.equal(m.burnDps, 6, 'the stronger aura burn keeps the slot');
  assert.equal(m.dotByPlayer, false, 'the player owns nothing here');
  // A player lightning bolt (6/s) wins over a fire aura burn (4/s).
  const m2 = mon(typeFor('melee'), 0, 0);
  applyMonsterAuraHit(m2, { dmg: 4, burnDps: 4, burnSeconds: 3, from: 'aura-2', element: 'fire' });
  applyPlayerBoltSecondary(m2, 'lightning', 1000);
  assert.equal(m2.burnDps, 6);
  assert.equal(m2.dotByPlayer, true);
  // An aura re-strike takes the slot back and clears the player's claim.
  applyMonsterAuraHit(m2, { dmg: 8, burnDps: 6, burnSeconds: 3, from: 'aura-3', element: 'lightning' });
  assert.equal(m2.dotByPlayer, false, 'the aura owns the slot again');
});

test('burn kill ownership: player-lit DoT pays combat, aura burn pays predation', () => {
  const m = mon(typeFor('melee'), 0, 0);
  m.hp = 10;
  applyPlayerBoltSecondary(m, 'fire', 1000); // 5/s x 3 s
  assert.equal(tickMonsterBurn(m, 2), true, 'the burn finishes it');
  assert.equal(m.deathCause, 'combat', 'a hunter-lit burn is a hunter kill');
  assert.equal(m.killerId, null);
  const a = mon(typeFor('melee'), 0, 0);
  a.hp = 10;
  applyMonsterAuraHit(a, { dmg: 0, burnDps: 6, burnSeconds: 3, from: 'aura-9', element: 'lightning' });
  assert.equal(tickMonsterBurn(a, 2), true);
  assert.equal(a.deathCause, 'predation');
  assert.equal(a.killerId, 'aura-9');
});

test('frost bolt slows the hunt; blind blocks spotting and drops a spotted hunter', () => {
  const player = { x: 10, z: 0, hp: 100, maxHp: 100, id: 'hunter' };
  const type = typeFor('melee');
  // Plain chase: one 1 s step toward the player.
  const plain = mon(type, 0, 0, Math.PI / 2);
  stepMonster(plain, 1, player, rng, { losClear: alwaysLos, nowMs: 1000 });
  assert.equal(plain.spotted, true);
  const plainMoved = Math.hypot(plain.x, plain.z);
  assert.ok(plainMoved > 0, 'the unslowed monster closes on the player');
  // Chilled chase: the same step covers x0.7 ground.
  const cold = mon(type, 0, 0, Math.PI / 2);
  applyPlayerBoltSecondary(cold, 'frost', 1000);
  stepMonster(cold, 1, player, rng, { losClear: alwaysLos, nowMs: 1000 });
  const coldMoved = Math.hypot(cold.x, cold.z);
  assert.ok(Math.abs(coldMoved / plainMoved - 0.7) < 0.01, `chilled monster moved ${coldMoved.toFixed(2)} m vs ${plainMoved.toFixed(2)} m plain — expected x0.7`);
  // Blind blocks spotting outright.
  const blind = mon(type, 0, 0, Math.PI / 2);
  applyPlayerBoltSecondary(blind, 'shadow', 1000);
  stepMonster(blind, 0.1, player, rng, { losClear: alwaysLos, nowMs: 1000 });
  assert.equal(blind.spotted, false, 'a blinded monster cannot spot the player');
  assert.ok(Math.abs(blind.x) < 0.5, 'a blinded monster does not close on the player');
  // A spotted monster unspots the moment the blind lands, and
  // spots again once it wears off.
  const hunted = mon(type, 0, 0, Math.PI / 2);
  stepMonster(hunted, 0.1, player, rng, { losClear: alwaysLos, nowMs: 1000 });
  assert.equal(hunted.spotted, true);
  applyPlayerBoltSecondary(hunted, 'sand', 2000);
  assert.equal(hunted.spotted, false, 'sand blind drops the hunt at once');
  stepMonster(hunted, 0.1, player, rng, { losClear: alwaysLos, nowMs: 2000 });
  assert.equal(hunted.spotted, false, 'still blind, still cannot spot');
  stepMonster(hunted, 0.1, player, rng, { losClear: alwaysLos, nowMs: 5000 });
  assert.equal(hunted.spotted, true, 'once the blind wears off it spots again');
});

test('bolt wiring in the page: armed bolt lights the monster secondary, orbs are bone-drop scale', () => {
  const page = readFileSync(new URL('../page.jsx', import.meta.url), 'utf8');
  const zone = readFileSync(new URL('../zone.js', import.meta.url), 'utf8');
  assert.match(page, /applyPlayerBoltSecondary\(m, armed, Date\.now\(\)\)/);
  assert.match(page, /if \(sec && sec\.kind === 'pool'\) createPool\(m\.x, m\.z\)/);
  assert.match(page, /if \(cause === 'combat'\) \{\s*registerHunterKill\(victim, true\);/);
  assert.match(page, /boltColor = \(armedElement && ELEMENT_COLORS\[armedElement\]\) \|\| style\.color/);
  assert.match(page, /onClick=\{\(\) => armBolt\(armed \? null : o\.element\)\}/);
  assert.match(page, /Arm bolt — \{orbHud\.boltElement/);
  assert.match(zone, /new R\.SphereGeometry\(ORB_DROP_SHELL_R, 12, 10\)/);
  assert.match(zone, /new R\.SphereGeometry\(ORB_DROP_CORE_R, 8, 6\)/);
  assert.match(zone, /from '\.\/elemental-orbs\.js'/);
});
