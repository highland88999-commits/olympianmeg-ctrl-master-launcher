// Spawn tables, combat rules, senses, safe base, dragons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MONSTER_TYPES, DRAGON_TYPES, ARCHETYPES, MONSTER_MODELS, TYPES_BY_ELEMENT,
  spawnField, createMonster, stepMonster, damageMonster, strike,
  createHunterState, onMonsterKilled, applyDamage,
  SHIELD_KILLS, SHIELD_ABSORB, HEAL_ON_KILL, PLAYER_MAX_HP,
  KORUS_MAX_HP, KORUS_GATE_KILLS, createKorus, stepKorus, damageKorus,
  SAFE_BASE, isInBase, canTeleport, BASE_TELEPORT_COOLDOWN_S,
  GIVE_UP_S, ELEMENTS, ELEMENT_COLORS,
  monsterColliders, separateFromPlayer, PLAYER_BODY_R,
} from '../spawns.js';
import { MONSTER_FAMILIES, ALL_MONSTER_SLOTS, slotHome, slotKey, FAMILIES_BY_HABITAT } from '../families.js';
import { PLACED_FIELD_KEYS } from '../models.js';
import { AURA_R_M, BURN_HIT_DMG, BURN_DPS, BURN_SECONDS, STRIKE_INTERVAL_S, LIGHTNING_COLORS } from '../../../lib/lightning-aura.js';

const rng = () => 0.5;
function mon(type, x, z, faceYaw = 0) {
  const m = createMonster({ id: `t-${type}`, type, element: MONSTER_TYPES[type].element, x, z }, rng);
  m.faceYaw = faceYaw;
  m.active = true;
  return m;
}
const alwaysLos = () => true;
const neverLos = () => false;

test('every regular monster sits inside the 100–200 HP band', () => {
  for (const [key, t] of Object.entries(MONSTER_TYPES)) {
    assert.ok(t.hp >= 100 && t.hp <= 200, `${key} hp ${t.hp} outside 100–200`);
  }
});

test('every monster carries exactly one of the four archetypes, all four represented', () => {
  const seen = new Set();
  for (const [key, t] of Object.entries(MONSTER_TYPES)) {
    assert.ok(t.archetype in ARCHETYPES, `${key} archetype ${t.archetype} unknown`);
    seen.add(t.archetype);
  }
  assert.deepEqual([...seen].sort(), ['environmental', 'melee', 'ranged', 'short-range']);
});

test('archetype range bands are distinct (melee 2.6 < short-range 5 < ranged 22)', () => {
  assert.ok(ARCHETYPES.melee.range < ARCHETYPES['short-range'].range);
  assert.ok(ARCHETYPES['short-range'].range < ARCHETYPES.ranged.range);
  assert.ok(ARCHETYPES.environmental.hazard === true);
});

test('Korus is exactly 1000 HP and the gate is a documented constant', () => {
  assert.equal(KORUS_MAX_HP, 1000);
  const k = createKorus(false);
  assert.equal(k.hp, 1000);
  assert.equal(k.dormant, true);
  assert.ok(KORUS_GATE_KILLS > 0);
  const open = createKorus(true);
  assert.equal(open.dormant, false);
});

test('spawn field: 153 records (150 + 3 Stormwings), none inside the safe base, placed types only', () => {
  const bands = ['acid', 'fire', 'lightning', 'poison', 'shadow', 'sand', 'mountain', 'frost'];
  const habitatAt = (x, z) => bands[(Math.abs(Math.floor(x / 50)) + Math.abs(Math.floor(z / 50))) % 8];
  const field = spawnField(77701, { habitatAt });
  assert.equal(field.length, 153, `field has ${field.length} records, expected 153`);
  for (const rec of field) {
    assert.ok(Math.hypot(rec.x - SAFE_BASE.x, rec.z - SAFE_BASE.z) >= SAFE_BASE.r + 10, 'spawn inside the Haven');
  }
  // GLB-ONLY: only Stormwing spawns among dragons — cinder
  // and muse GLBs are truncated, so they have no field presence.
  assert.equal(field.filter((r) => r.type === 'sky-dragon').length, 3, 'sky-dragon count');
  assert.equal(field.filter((r) => r.type === 'cinder-dragon').length, 0, 'cinder-dragon must not spawn');
  assert.equal(field.filter((r) => r.type === 'muse-dragon').length, 0, 'muse-dragon must not spawn');
});

test('heal on kill is modest and capped at max HP', () => {
  const h = createHunterState();
  h.hp = PLAYER_MAX_HP - 5;
  const res = onMonsterKilled(h);
  assert.equal(res.heal, 5);
  assert.equal(h.hp, PLAYER_MAX_HP);
  assert.ok(HEAL_ON_KILL <= 20, `heal ${HEAL_ON_KILL} too generous`);
});

test('shield arrives at 30 kills, absorbs 50, one-time until broken', () => {
  const h = createHunterState();
  for (let i = 0; i < SHIELD_KILLS - 1; i++) onMonsterKilled(h);
  assert.equal(h.shield, 0);
  const res = onMonsterKilled(h);
  assert.equal(res.shieldGranted, true);
  assert.equal(h.shield, SHIELD_ABSORB);
  const absorbed = applyDamage(h, 30);
  assert.equal(absorbed.absorbed, 30);
  assert.equal(h.hp, PLAYER_MAX_HP);
  assert.equal(h.shield, 20);
  const absorbed2 = applyDamage(h, 40);
  assert.equal(absorbed2.absorbed, 20);
  assert.equal(absorbed2.shieldBroken, true);
  assert.equal(h.hp, PLAYER_MAX_HP - 20);
});

test('kill count persists in the hunter state', () => {
  const h = createHunterState();
  onMonsterKilled(h);
  onMonsterKilled(h);
  assert.equal(h.kills, 2);
});

test('senses: sight cone spots, facing away does not', () => {
  // Monster faces +z (faceYaw 0 means facing +z in atan2(dx,dz) terms).
  const facing = mon('slot-06', 0, 0, 0);
  const inFront = { x: 0, z: 20 };
  stepMonster(facing, 0.1, inFront, rng, { losClear: alwaysLos });
  assert.equal(facing.spotted, true);
  const behind = mon('slot-06', 0, 0, 0);
  stepMonster(behind, 0.1, { x: 0, z: -20 }, rng, { losClear: alwaysLos });
  assert.equal(behind.spotted, false);
});

test('senses: terrain line-of-sight blocks the sight cone', () => {
  const m = mon('slot-06', 0, 0, 0);
  stepMonster(m, 0.1, { x: 0, z: 20 }, rng, { losClear: neverLos });
  assert.equal(m.spotted, false);
});

test('senses: hearing draws a monster outside the cone', () => {
  const m = mon('slot-06', 0, 0, 0);
  stepMonster(m, 0.1, { x: 20, z: 0 }, rng, { losClear: alwaysLos, noise: { x: 5, z: 5 } });
  assert.equal(m.spotted, true);
});

test('senses: proximity spots regardless of facing or cover', () => {
  const m = mon('slot-06', 0, 0, 0);
  stepMonster(m, 0.1, { x: 0, z: -5 }, rng, { losClear: neverLos });
  assert.equal(m.spotted, true);
});

test('senses: ambushers ignore sight and hearing, trigger on proximity', () => {
  const m = mon('slot-29', 0, 0, 0);
  stepMonster(m, 0.1, { x: 0, z: 20 }, rng, { losClear: alwaysLos, noise: { x: 2, z: 2 } });
  assert.equal(m.spotted, false);
  stepMonster(m, 0.1, { x: 0, z: 5 }, rng, { losClear: neverLos });
  assert.equal(m.spotted, true);
});

test('senses: quiet hunters shrink the sight radius', () => {
  const m = mon('slot-06', 0, 0, 0);
  stepMonster(m, 0.1, { x: 0, z: 20 }, rng, { losClear: alwaysLos, quiet: 0.55 });
  assert.equal(m.spotted, false);
});

test('senses: give-up after 12 s unseen returns the monster to roam', () => {
  const m = mon('slot-06', 0, 0, 0);
  stepMonster(m, 0.1, { x: 0, z: 20 }, rng, { losClear: alwaysLos });
  assert.equal(m.spotted, true);
  for (let i = 0; i < GIVE_UP_S; i++) {
    stepMonster(m, 1, { x: 0, z: -100 }, rng, { losClear: neverLos });
  }
  assert.equal(m.spotted, false);
  assert.equal(m.state, 'idle');
});

test('senses: chases break at the safe-base boundary', () => {
  const m = mon('slot-06', 0, 0, 0);
  stepMonster(m, 0.1, { x: 0, z: 20 }, rng, { losClear: alwaysLos });
  assert.equal(m.spotted, true);
  stepMonster(m, 0.1, { x: SAFE_BASE.x, z: SAFE_BASE.z }, rng, { losClear: alwaysLos, inBase: true });
  assert.equal(m.spotted, false);
});

test('safe base: inside the ring, outside it, teleport cooldown', () => {
  assert.equal(isInBase(SAFE_BASE.x, SAFE_BASE.z), true);
  assert.equal(isInBase(SAFE_BASE.x, SAFE_BASE.z + SAFE_BASE.r + 1), false);
  assert.equal(canTeleport(null, 1000), true);
  assert.equal(canTeleport(1000, 1000 + BASE_TELEPORT_COOLDOWN_S * 1000), true);
  assert.equal(canTeleport(1000, 1000 + BASE_TELEPORT_COOLDOWN_S * 1000 - 1), false);
});

test('spawn field excludes the base radius + 10 m', () => {
  const field = spawnField(42, { habitatAt: () => 'sand' });
  for (const rec of field) {
    assert.ok(Math.hypot(rec.x - SAFE_BASE.x, rec.z - SAFE_BASE.z) >= SAFE_BASE.r + 10);
  }
});

/* ---------------- dragons ---------------- */

test('exactly three dragon types, distinct elements and archetypes', () => {
  assert.deepEqual([...DRAGON_TYPES].sort(), ['cinder-dragon', 'muse-dragon', 'sky-dragon']);
  const els = new Set(DRAGON_TYPES.map((d) => MONSTER_TYPES[d].element));
  assert.equal(els.size, 3);
  const archs = new Set(DRAGON_TYPES.map((d) => MONSTER_TYPES[d].archetype));
  assert.equal(archs.size, 3);
  assert.ok(archs.has('ranged') && archs.has('melee') && archs.has('environmental'));
});

test('dragon roles span fly, ground, and both', () => {
  assert.equal(MONSTER_TYPES['sky-dragon'].role, 'fly');
  assert.equal(MONSTER_TYPES['cinder-dragon'].role, 'ground');
  assert.equal(MONSTER_TYPES['muse-dragon'].role, 'both');
  assert.ok(MONSTER_TYPES['sky-dragon'].flyHeight > MONSTER_TYPES['muse-dragon'].flyHeight);
});

test('dragons sit inside the same 100–200 HP band', () => {
  for (const d of DRAGON_TYPES) {
    const t = MONSTER_TYPES[d];
    assert.ok(t.hp >= 100 && t.hp <= 200, `${d} hp ${t.hp}`);
  }
});

test('the Muse dragon is the tribute entry: luminous, violet-and-cyan, the wiser one', () => {
  const t = MONSTER_TYPES['muse-dragon'];
  assert.equal(t.tribute, 'muse');
  assert.equal(t.name, 'Muse, the Luminous');
  assert.ok(t.temperament.vicious < MONSTER_TYPES['sky-dragon'].temperament.vicious);
  assert.ok(t.temperament.vicious < MONSTER_TYPES['cinder-dragon'].temperament.vicious);
});

test('strike: melee cannot reach the sky dragon, but can reach the low-hovering Muse dragon', () => {
  const sky = mon('sky-dragon', 0, -2, 0);
  const muse = mon('muse-dragon', 0, -2, 0);
  const meleeSpec = { dmg: 38, range: 2.4, arcCos: Math.cos(1.22) };
  // Walker yaw 0 faces -z (forward = (-sin 0, -cos 0) = (0,-1)),
  // so both dragons at (0,-2) sit dead ahead.
  const hits = strike([sky, muse], 0, 0, 0, meleeSpec);
  assert.ok(!hits.includes(sky), 'melee must not reach the sky dragon at 6 m');
  assert.ok(hits.includes(muse), 'melee must reach the Muse dragon at 3 m');
  const boltSpec = { dmg: 30, range: 28, arcCos: Math.cos(0.21) };
  const hits2 = strike([sky, muse], 0, 0, 0, boltSpec);
  assert.ok(hits2.includes(sky), 'ranged must reach the sky dragon');
});

test('GLB-only field: every record is a placed family, and the vanish list is exact', () => {
  // 51 type-table keys (37 slots + 11 extras + 3 dragons)
  // minus 24 placed field keys = 27 vanished types.
  const placed = new Set(PLACED_FIELD_KEYS);
  assert.equal(placed.size, 24, `placed field keys ${placed.size}`);
  const vanished = Object.keys(MONSTER_TYPES).filter((k) => !placed.has(k));
  assert.equal(vanished.length, 27, `vanished ${vanished.length}: ${vanished.join(',')}`);
  const expected = [
    'slot-02', 'slot-03', 'slot-05', 'slot-06', 'slot-09', 'slot-12',
    'slot-16', 'slot-18', 'slot-21', 'slot-24', 'slot-25', 'slot-27',
    'slot-28', 'slot-33', 'slot-34', 'slot-35', 'slot-36', 'slot-37',
    'slot-38', 'slot-39', 'slot-40',
    'umbrax', 'frostbite-lizard', 'vice', 'wonder',
    'cinder-dragon', 'muse-dragon',
  ];
  assert.deepEqual([...vanished].sort(), [...expected].sort());
  const field = spawnField(77701, { habitatAt: () => 'sand' });
  for (const rec of field) {
    assert.ok(placed.has(rec.type), `${rec.type} spawns but has no placed GLB`);
  }
  assert.ok(!field.some((r) => vanished.includes(r.type)), 'a vanished family spawns');
});

test('Korus fight: dormant until the gate, wakes in range, telegraphs, dies', () => {
  const k = createKorus(false);
  const evs = stepKorus(k, 0.1, { x: KORUS_POS_X(), z: KORUS_POS_Z() });
  assert.equal(k.awake, false);
  assert.ok(!evs.some((e) => e.kind === 'wake'));
  const k2 = createKorus(true);
  stepKorus(k2, 0.1, { x: KORUS_POS_X(), z: KORUS_POS_Z() });
  assert.equal(k2.awake, true);
  const died = damageKorus(k2, 1000);
  assert.equal(died, true);
  assert.equal(k2.dead, true);
});

function KORUS_POS_X() { return -215; }
function KORUS_POS_Z() { return 55; }

/* ---- SOLID CHARACTERS (video QA, 2026-10-26) ---- */

test('monsterColliders: active living monsters included at footprintR + body radius, dead/inactive excluded', () => {
  const a = mon('slot-01', 10, 10);
  const dead = mon('slot-01', 20, 20);
  dead.dead = true;
  const idle = mon('slot-01', 30, 30);
  idle.active = false;
  const out = monsterColliders([a, dead, idle], null);
  assert.equal(out.length, 1);
  assert.equal(out[0].x, 10);
  assert.equal(out[0].z, 10);
  assert.equal(out[0].r, MONSTER_TYPES['slot-01'].footprintR + PLAYER_BODY_R);
});

test('monsterColliders: Korus included while alive at his throne radius, excluded when dead', () => {
  const alive = monsterColliders([], { x: -215, z: 55, dead: false });
  assert.equal(alive.length, 1);
  assert.equal(alive[0].r, 3 + PLAYER_BODY_R);
  assert.equal(monsterColliders([], { x: -215, z: 55, dead: true }).length, 0);
  assert.equal(monsterColliders([], null).length, 0);
});

test('separation: a ground monster overlapping the hunter is pushed to exactly footprintR + body radius', () => {
  const m = { x: 10.4, z: 0, dead: false, stats: { footprintR: 1.6 } };
  assert.equal(separateFromPlayer(m, 10, 0), true);
  assert.ok(Math.abs(Math.hypot(m.x - 10, m.z - 0) - 2.1) < 1e-9);
});

test('separation: already-separated, flying, and dead monsters are untouched', () => {
  const far = { x: 20, z: 0, dead: false, stats: { footprintR: 1.6 } };
  assert.equal(separateFromPlayer(far, 10, 0), false);
  assert.equal(far.x, 20);
  const flyer = { x: 10.1, z: 0, dead: false, stats: { footprintR: 1.6, flyHeight: 6 } };
  assert.equal(separateFromPlayer(flyer, 10, 0), false);
  const dead = { x: 10.1, z: 0, dead: true, stats: { footprintR: 1.6 } };
  assert.equal(separateFromPlayer(dead, 10, 0), false);
});

test('separation: dead-center overlap falls back to +x instead of dividing by zero', () => {
  const m = { x: 10, z: 0, dead: false, stats: { footprintR: 1.6 } };
  assert.equal(separateFromPlayer(m, 10, 0), true);
  assert.equal(m.x, 12.1);
  assert.equal(m.z, 0);
});

test('solidity never breaks attack bands: separation stays inside range + footprintR for every type', () => {
  // Melee hits land at dist <= range + footprintR (stepMonster),
  // so the separation distance (footprintR + body radius) only
  // needs the body radius to sit under the melee range itself.
  assert.ok(PLAYER_BODY_R < ARCHETYPES.melee.range);
  for (const [key, t] of Object.entries(MONSTER_TYPES)) {
    assert.ok(t.footprintR + PLAYER_BODY_R < t.footprintR + ARCHETYPES.melee.range,
      `${key} separation ${t.footprintR + PLAYER_BODY_R} would outrange melee ${ARCHETYPES.melee.range} + footprintR`);
  }
});

/* ---------------- LIGHTNING AURA-STRIKE (Merlin, Nov 16 ~00:11) ----------------
 * The aura is the monster's element, not a hunt decision: a live,
 * active lightning-element monster or dragon strikes anything
 * inside 59 m, spotted or not — 8 on the hit, 6/s burn for 3 s,
 * one streak per 1.5 s. Fail-before: before this build stepMonster
 * emitted no 'aura-strike' event at all (the kind did not exist
 * in spawns.js), so every pin below failed on the old code. */

const AURA_CARRIERS = Object.entries(MONSTER_TYPES)
  .filter(([, t]) => t.element === 'lightning' || t.dragon)
  .map(([key]) => key);

function auraStrikes(m, player, dt = 0.1, opts = {}) {
  return stepMonster(m, dt, player, rng, { losClear: alwaysLos, ...opts })
    .filter((e) => e.kind === 'aura-strike');
}

test('aura: radius is exactly 59 m for every lightning family and every dragon', () => {
  assert.equal(AURA_R_M, 59);
  // 7 lightning-element families + 3 dragons = 10 carriers.
  assert.equal(AURA_CARRIERS.length, 10, `carriers: ${AURA_CARRIERS.join(',')}`);
  for (const key of AURA_CARRIERS) {
    // Facing away (+z), player behind at exactly 59 m: unspotted, in aura.
    const atEdge = mon(key, 0, 0, 0);
    assert.equal(auraStrikes(atEdge, { x: 0, z: -59 }).length, 1, `${key} must strike at 59 m`);
    const beyond = mon(key, 0, 0, 0);
    assert.equal(auraStrikes(beyond, { x: 0, z: -59.5 }).length, 0, `${key} must not strike past 59 m`);
  }
});

test('aura: colours — white-yellow for lightning non-dragons, red for dragons', () => {
  for (const key of AURA_CARRIERS) {
    const m = mon(key, 0, 0, 0);
    const evs = auraStrikes(m, { x: 0, z: -30 });
    assert.equal(evs.length, 1, `${key} must strike at 30 m`);
    const expected = MONSTER_TYPES[key].dragon
      ? LIGHTNING_COLORS.dragon
      : LIGHTNING_COLORS['lightning-monster'];
    assert.deepEqual(evs[0].color, expected, `${key} colour`);
  }
});

test('aura: burn numbers ride the event — 8 on the hit, 6/s for 3 s', () => {
  assert.equal(BURN_HIT_DMG, 8);
  assert.equal(BURN_DPS, 6);
  assert.equal(BURN_SECONDS, 3);
  const m = mon('slot-17', 0, 0, 0);
  const evs = auraStrikes(m, { x: 0, z: -30 });
  assert.equal(evs.length, 1);
  assert.equal(evs[0].dmg, 8);
  assert.equal(evs[0].burnDps, 6);
  assert.equal(evs[0].burnSeconds, 3);
  assert.equal(evs[0].element, 'lightning');
  assert.equal(evs[0].from, m.id);
});

test('aura: cadence 1.5 s — no double-strike inside the window, fires again after it', () => {
  assert.equal(STRIKE_INTERVAL_S, 1.5);
  const m = mon('slot-19', 0, 0, 0);
  assert.equal(m.auraCd, 0, 'fresh monsters start with a cold aura cooldown');
  assert.equal(auraStrikes(m, { x: 0, z: -30 }, 0.1).length, 1, 'first strike');
  assert.equal(m.auraCd, 1.5, 'cooldown resets to 1.5 s');
  assert.equal(auraStrikes(m, { x: 0, z: -30 }, 0.1).length, 0, 'no strike 0.1 s later');
  assert.equal(auraStrikes(m, { x: 0, z: -30 }, 1.4).length, 1, 'strikes again once 1.5 s have passed');
});

test('aura: fires unspotted within 59 m, never beyond it', () => {
  const m = mon('slot-20', 0, 0, 0); // facing +z, player behind
  const evs = auraStrikes(m, { x: 0, z: -30 });
  assert.equal(evs.length, 1);
  assert.equal(m.spotted, false, 'the aura is not a hunt decision — it fires unspotted');
  const far = mon('slot-20', 0, 0, 0);
  assert.equal(auraStrikes(far, { x: 0, z: -60 }).length, 0);
  assert.equal(far.spotted, false);
});

test('aura: non-lightning families never emit aura-strike, even at point-blank', () => {
  for (const [key, t] of Object.entries(MONSTER_TYPES)) {
    if (t.element === 'lightning' || t.dragon) continue;
    const m = mon(key, 0, 0, 0);
    assert.equal(auraStrikes(m, { x: 0, z: -3 }).length, 0, `${key} must never aura-strike`);
  }
});

test('aura: mounted monsters never emit it', () => {
  const m = mon('slot-17', 0, 0, 0);
  m.mounted = true;
  assert.equal(auraStrikes(m, { x: 0, z: -10 }).length, 0);
});

test('aura: a lightning monster at close range may both hit and aura-strike on one tick', () => {
  // slot-16 Storm Herald is ranged (22 m): player 10 m ahead,
  // in sight — the archetype hit and the aura-strike are
  // separate cooldowns, separate events, same tick.
  const m = mon('slot-16', 0, 0, 0);
  const evs = stepMonster(m, 0.1, { x: 0, z: 10 }, rng, { losClear: alwaysLos });
  assert.ok(evs.some((e) => e.kind === 'hit'), 'archetype hit fires');
  assert.ok(evs.some((e) => e.kind === 'aura-strike'), 'aura-strike fires on the same tick');
});

test('aura: no streak inside The Haven, none from a dead monster', () => {
  const m = mon('slot-17', 0, 0, 0);
  assert.equal(
    stepMonster(m, 0.1, { x: SAFE_BASE.x, z: SAFE_BASE.z }, rng, { losClear: alwaysLos, inBase: true })
      .filter((e) => e.kind === 'aura-strike').length,
    0, 'sanctuary: no streak lands in The Haven',
  );
  const dead = mon('slot-17', 0, 0, 0);
  damageMonster(dead, 1000);
  assert.equal(dead.dead, true);
  assert.equal(auraStrikes(dead, { x: 0, z: -10 }).length, 0);
});

test('aura: an inactive monster never strikes', () => {
  const m = mon('slot-17', 0, 0, 0);
  m.active = false;
  assert.equal(auraStrikes(m, { x: 0, z: -10 }).length, 0);
});
