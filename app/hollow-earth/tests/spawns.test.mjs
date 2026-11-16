// Spawn tables, combat rules, senses, safe base, dragons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MONSTER_TYPES, DRAGON_TYPES, ARCHETYPES, MONSTER_MODELS, TYPES_BY_ELEMENT,
  spawnField, createMonster, stepMonster, damageMonster, strike,
  isMonsterPreyTarget, nearestMonsterPrey, applyMonsterAuraHit, tickMonsterBurn,
  createHunterState, onMonsterKilled, applyDamage,
  SHIELD_KILLS, SHIELD_ABSORB, HEAL_ON_KILL, PLAYER_MAX_HP,
  KORUS_MAX_HP, KORUS_GATE_KILLS, createKorus, stepKorus, damageKorus,
  SAFE_BASE, isInBase, canTeleport, BASE_TELEPORT_COOLDOWN_S,
  GIVE_UP_S, ELEMENTS, ELEMENT_COLORS,
  DEATH_CAUSES, TERRITORY_R_M, PREY_STALK_R_M, RESPAWN_S, duelOutcome, respawnMonster,
  monsterColliders, separateFromPlayer, PLAYER_BODY_R,
} from '../spawns.js';
import { MONSTER_FAMILIES, ALL_MONSTER_SLOTS, slotHome, slotKey, FAMILIES_BY_HABITAT } from '../families.js';
import { PLACED_FIELD_KEYS } from '../models.js';
import { AURA_R_M, BURN_HIT_DMG, BURN_DPS, BURN_SECONDS, STRIKE_INTERVAL_S, LIGHTNING_COLORS } from '../../../lib/lightning-aura.js';
import { ELEMENT_AURA } from '../elemental-aura.js';
import { hungerFor } from '../monster-life.js';
import { DAY_MS } from '../../../lib/life-clock.js';

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

test('spawn field: 303 records (300 + 3 Stormwings), none inside the safe base, placed types only', () => {
  const bands = ['acid', 'fire', 'lightning', 'poison', 'shadow', 'sand', 'mountain', 'frost'];
  const habitatAt = (x, z) => bands[(Math.abs(Math.floor(x / 50)) + Math.abs(Math.floor(z / 50))) % 8];
  const field = spawnField(77701, { habitatAt });
  assert.equal(field.length, 303, `field has ${field.length} records, expected 303`);
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
  // SIGHT_R is 40 m now (savagery step 8): quiet 0.45 shrinks it
  // to 18 m, below the 20 m player — the old 0.55 factor (22 m)
  // would spot at 20 m under the new sight range.
  stepMonster(m, 0.1, { x: 0, z: 20 }, rng, { losClear: alwaysLos, quiet: 0.45 });
  assert.equal(m.spotted, false);
});

test('senses: give-up after 20 s unseen returns the monster to roam', () => {
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

test('aura: radius is exactly 59 m for every lightning family and for Stormwing; the other dragons strike at their own element radius', () => {
  assert.equal(AURA_R_M, 59);
  // 7 lightning-element families + Stormwing (the lightning
  // dragon) = 8 carriers at 59 m. Cinder Maw (fire) and Muse
  // (shadow) aura by their own element, not by being dragons.
  const at59 = AURA_CARRIERS.filter((key) => MONSTER_TYPES[key].element === 'lightning');
  assert.equal(at59.length, 8, `59 m carriers: ${at59.join(',')}`);
  for (const key of at59) {
    // Facing away (+z), player behind at exactly 59 m: unspotted, in aura.
    const atEdge = mon(key, 0, 0, 0);
    assert.equal(auraStrikes(atEdge, { x: 0, z: -59 }).length, 1, `${key} must strike at 59 m`);
    const beyond = mon(key, 0, 0, 0);
    assert.equal(auraStrikes(beyond, { x: 0, z: -59.5 }).length, 0, `${key} must not strike past 59 m`);
  }
  const cinder = mon('cinder-dragon', 0, 0, 0);
  assert.equal(auraStrikes(cinder, { x: 0, z: -24 }).length, 1, 'Cinder Maw strikes at its 24 m fire radius');
  assert.equal(auraStrikes(mon('cinder-dragon', 0, 0, 0), { x: 0, z: -24.5 }).length, 0, 'Cinder Maw must not strike past 24 m');
  const muse = mon('muse-dragon', 0, 0, 0);
  assert.equal(auraStrikes(muse, { x: 0, z: -30 }).length, 1, 'Muse strikes at her 30 m shadow radius');
  assert.equal(auraStrikes(mon('muse-dragon', 0, 0, 0), { x: 0, z: -30.5 }).length, 0, 'Muse must not strike past 30 m');
});

test('aura: radius + numbers per element — the ELEMENT_AURA table is the law', () => {
  // One representative family per element (poison's slot-36 has
  // no placed GLB, but the aura is model-independent — the row
  // lights up when its re-send lands).
  const rep = { acid: 'slot-01', fire: 'slot-07', lightning: 'slot-17', poison: 'slot-36', shadow: 'slot-11', sand: 'slot-23', frost: 'slot-10' };
  for (const [element, key] of Object.entries(rep)) {
    const row = ELEMENT_AURA[element];
    const atEdge = mon(key, 0, 0, 0);
    const evs = auraStrikes(atEdge, { x: 0, z: -(row.radiusM - 0.5) });
    assert.equal(evs.length, 1, `${key} must strike inside its ${row.radiusM} m ${element} radius`);
    assert.equal(evs[0].element, element);
    assert.equal(evs[0].dmg, row.hit, `${key} hit`);
    assert.equal(evs[0].burnDps, row.dps, `${key} dps`);
    assert.equal(evs[0].burnSeconds, row.seconds, `${key} seconds`);
    assert.equal(evs[0].secondary, row.secondary, `${key} secondary`);
    if (element === 'lightning') {
      assert.deepEqual(evs[0].color, LIGHTNING_COLORS['lightning-monster'], `${key} colour`);
    } else {
      assert.equal(evs[0].color, row.color, `${key} colour is its ELEMENT_AURA colour`);
    }
    const beyond = mon(key, 0, 0, 0);
    assert.equal(auraStrikes(beyond, { x: 0, z: -(row.radiusM + 0.5) }).length, 0, `${key} must not strike past ${row.radiusM} m`);
  }
});

test('aura: cadence 1.5 s holds for a non-lightning element (fire)', () => {
  const m = mon('slot-07', 0, 0, 0);
  assert.equal(auraStrikes(m, { x: 0, z: -10 }, 0.1).length, 1, 'first strike');
  assert.equal(m.auraCd, 1.5, 'cooldown resets to 1.5 s');
  assert.equal(auraStrikes(m, { x: 0, z: -10 }, 0.1).length, 0, 'no strike 0.1 s later');
  assert.equal(auraStrikes(m, { x: 0, z: -10 }, 1.4).length, 1, 'strikes again once 1.5 s have passed');
});

test('aura: an unknown element never fires, even at point-blank', () => {
  const m = mon('slot-01', 0, 0, 0);
  m.stats = { ...m.stats, element: 'void' };
  assert.equal(auraStrikes(m, { x: 0, z: -3 }).length, 0, 'unknown element carries no aura row');
});

test('aura: colours — white-yellow for lightning non-dragons, red for the lightning dragon, element colour for the other dragons', () => {
  for (const key of AURA_CARRIERS) {
    const m = mon(key, 0, 0, 0);
    // 10 m sits inside every carrier's radius (shortest: 24 m fire).
    const evs = auraStrikes(m, { x: 0, z: -10 });
    assert.equal(evs.length, 1, `${key} must strike at 10 m`);
    const element = MONSTER_TYPES[key].element;
    const expected = element === 'lightning'
      ? (MONSTER_TYPES[key].dragon ? LIGHTNING_COLORS.dragon : LIGHTNING_COLORS['lightning-monster'])
      : ELEMENT_AURA[element].color;
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

test('aura: every element fires now, not just lightning — a fire family strikes at point-blank', () => {
  // The old lightning-only pin ("non-lightning families never
  // emit aura-strike") is superseded by the WS5 generalisation:
  // each monster emanates its own element (see the per-element
  // radius test above). What stays: an UNKNOWN element never
  // fires (pinned above), and mounted / Haven / dead / inactive
  // never fire (pinned below).
  for (const [key, t] of Object.entries(MONSTER_TYPES)) {
    if (t.element === 'lightning') continue;
    const m = mon(key, 0, 0, 0);
    assert.equal(auraStrikes(m, { x: 0, z: -3 }).length, 1, `${key} (${t.element}) must aura-strike at 3 m`);
  }
});

test('aura: mounted monsters never emit it', () => {
  const m = mon('slot-17', 0, 0, 0);
  m.mounted = true;
  assert.equal(auraStrikes(m, { x: 0, z: -10 }).length, 0);
  // Mounted never emanates for any element, not just lightning.
  const fire = mon('slot-07', 0, 0, 0);
  fire.mounted = true;
  assert.equal(auraStrikes(fire, { x: 0, z: -10 }).length, 0, 'mounted fire monster never auras');
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
  // Sanctuary holds for every element, not just lightning.
  const fire = mon('slot-07', 0, 0, 0);
  assert.equal(
    stepMonster(fire, 0.1, { x: SAFE_BASE.x, z: SAFE_BASE.z }, rng, { losClear: alwaysLos, inBase: true })
      .filter((e) => e.kind === 'aura-strike').length,
    0, 'sanctuary: no fire streak lands in The Haven',
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

/* ---------------- MONSTER-VS-MONSTER (Merlin, Nov 16 ~01:02) ----------------
 * "Make monsters attack each other, not just the user." The
 * attack is the aura: a live lightning carrier strikes monster
 * prey inside 59 m with the same law (8 + 6/s burn for 3 s,
 * one streak per 1.5 s per source, player first). Korus and
 * Ghorrum are EXEMPT — never an aura, never prey. */

test('mvm: a lightning monster strikes monster prey when the player is out of range', () => {
  const hunter = mon('slot-17', 0, 0, 0);
  const prey = mon('slot-20', 0, 30, 0);
  const evs = stepMonster(hunter, 0.1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [prey] })
    .filter((e) => e.kind === 'aura-strike');
  assert.equal(evs.length, 1, 'one streak at the prey');
  assert.equal(evs[0].target, prey.id, 'the streak names its monster target');
  assert.equal(evs[0].from, hunter.id);
  assert.equal(evs[0].dmg, 8);
  assert.equal(evs[0].burnDps, 6);
  assert.equal(evs[0].burnSeconds, 3);
});

test('mvm: the player is struck first — and prey is struck on the same tick (per-target cadence)', () => {
  // Savagery step 5 ends the player-first SUPPRESSION (not the
  // player-first ORDER): the player still takes their streak
  // first, but the nearest prey inside 59 m is struck on the
  // same tick on its own 1.5 s cooldown. The prey here is a
  // non-carrier (slot-01, acid) so no territorial duel fires
  // and the aura law is isolated.
  const hunter = mon('slot-17', 0, 0, 0);
  const prey = mon('slot-01', 0, 30, 0);
  const evs = stepMonster(hunter, 0.1, { x: 0, z: -30 }, rng, { losClear: alwaysLos, others: [prey] })
    .filter((e) => e.kind === 'aura-strike');
  assert.equal(evs.length, 2, 'player strike + prey strike on one tick');
  assert.equal(evs[0].target, 'player', 'player first — the lightning is never softened against the user');
  assert.equal(evs[1].target, prey.id, 'prey struck on the same tick');
});

test('mvm: no strike at prey past 59 m; one streak per 1.5 s per TARGET, not per source', () => {
  const hunter = mon('slot-17', 0, 0, 0);
  const farPrey = mon('slot-20', 0, 60, 0);
  assert.equal(
    stepMonster(hunter, 0.1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [farPrey] })
      .filter((e) => e.kind === 'aura-strike').length,
    0, 'prey at 60 m is outside the aura',
  );
  // Non-carrier prey (slot-01) so no territorial duel fires and
  // the cadence law is isolated: the prey survives to be struck.
  const nearPrey = mon('slot-01', 0, 30, 0);
  const opts = { losClear: alwaysLos, others: [nearPrey] };
  assert.equal(
    stepMonster(hunter, 0.1, { x: 0, z: -500 }, rng, opts).filter((e) => e.kind === 'aura-strike').length,
    1, 'first strike at the prey',
  );
  assert.equal(
    stepMonster(hunter, 0.1, { x: 0, z: -500 }, rng, opts).filter((e) => e.kind === 'aura-strike').length,
    0, 'no second streak inside the 1.5 s window — not even at the player',
  );
  // Once 1.5 s have passed BOTH cooldowns are due: the player
  // strike and the prey strike land on the same tick (per-target
  // cadence, savagery step 5 — the old shared per-source
  // cooldown would have fired only one).
  const both = stepMonster(hunter, 1.4, { x: 0, z: -30 }, rng, opts)
    .filter((e) => e.kind === 'aura-strike');
  assert.equal(both.length, 2, 'player + prey strike once 1.5 s have passed');
  assert.equal(both[0].target, 'player', 'player first');
  assert.equal(both[1].target, nearPrey.id, 'prey second');
});

test('mvm: Korus and Ghorrum are never prey — refused outright', () => {
  assert.equal(isMonsterPreyTarget(null), false);
  assert.equal(isMonsterPreyTarget({ id: 'korus', type: 'korus', x: 0, z: 10, dead: false }), false, 'Korus by type');
  assert.equal(isMonsterPreyTarget({ id: 'korus', kind: 'boss', x: 0, z: 10, dead: false }), false, 'Korus by kind');
  assert.equal(isMonsterPreyTarget({ id: 'ghorrum', kind: 'watcher', x: 0, z: 10, dead: false }), false, 'Ghorrum by kind');
  assert.equal(isMonsterPreyTarget({ id: 'ghorrum', watcher: true, x: 0, z: 10, dead: false }), false, 'Ghorrum by flag');
  // Even passed in `others` at point-blank, neither draws a streak.
  const hunter = mon('slot-17', 0, 0, 0);
  const korusShaped = { id: 'korus', type: 'korus', x: 0, z: 10, dead: false, active: true };
  const ghorrumShaped = { id: 'ghorrum', kind: 'watcher', x: 0, z: -10, dead: false, active: true };
  assert.equal(nearestMonsterPrey(hunter, [korusShaped, ghorrumShaped]), null);
  assert.equal(
    stepMonster(hunter, 0.1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [korusShaped, ghorrumShaped] })
      .filter((e) => e.kind === 'aura-strike').length,
    0, 'no streak at Korus or Ghorrum',
  );
});

test('mvm: dead, mounted and inactive monsters are never prey; nearest prey wins', () => {
  const hunter = mon('slot-17', 0, 0, 0);
  const dead = mon('slot-20', 0, 10, 0);
  damageMonster(dead, 1000);
  const mounted = mon('slot-19', 0, 20, 0);
  mounted.mounted = true;
  const inactive = mon('slot-19', 0, 25, 0);
  inactive.active = false;
  const near = mon('slot-20', 0, 40, 0);
  const far = mon('slot-19', 0, 50, 0);
  assert.equal(isMonsterPreyTarget(dead), false);
  assert.equal(isMonsterPreyTarget(mounted), false);
  // `active` is a nearestMonsterPrey-level filter (an inactive
  // monster is off the field), not an isMonsterPreyTarget one —
  // the pick below proves the inactive record is skipped.
  const pick = nearestMonsterPrey(hunter, [far, dead, mounted, inactive, near]);
  assert.equal(pick.target.id, near.id, 'nearest living, active, unmounted prey wins');
  assert.equal(pick.distanceM, 40);
  assert.equal(nearestMonsterPrey(hunter, [dead, mounted, inactive]), null);
  assert.equal(nearestMonsterPrey(hunter, []), null);
  assert.equal(nearestMonsterPrey(hunter, null), null);
});

test('mvm: every element strikes monster prey inside its own aura radius', () => {
  // Acid hunter (slot-01, 18 m) vs prey at 10 m: one streak at
  // the prey, carrying the acid row (3 hit, 3/s x 4 s, pool).
  // The old lightning-only pin ("non-lightning families never
  // strike prey") is superseded by the WS5 generalisation.
  const hunter = mon('slot-01', 0, 0, 0);
  const prey = mon('slot-20', 0, 10, 0);
  const evs = stepMonster(hunter, 0.1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [prey] })
    .filter((e) => e.kind === 'aura-strike');
  assert.equal(evs.length, 1, 'one streak at the prey');
  assert.equal(evs[0].target, prey.id, 'the streak names its monster target');
  assert.equal(evs[0].element, 'acid');
  assert.equal(evs[0].dmg, 3);
  assert.equal(evs[0].burnDps, 3);
  assert.equal(evs[0].burnSeconds, 4);
  assert.equal(evs[0].secondary, 'pool');
  // Prey past the acid radius draws nothing.
  const farPrey = mon('slot-20', 0, 19, 0);
  assert.equal(
    stepMonster(mon('slot-01', 0, 0, 0), 0.1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [farPrey] })
      .filter((e) => e.kind === 'aura-strike').length,
    0, 'prey at 19 m is outside the 18 m acid aura',
  );
  // And the prey hit lands the event's own DoT, not lightning's.
  const victim = mon('slot-20', 0, 0, 0);
  const startHp = victim.hp;
  assert.equal(applyMonsterAuraHit(victim, { dmg: 3, burnDps: 3, burnSeconds: 4 }), false);
  assert.equal(victim.hp, startHp - 3);
  assert.equal(victim.burnDps, 3);
  assert.equal(victim.burnRemainingS, 4);
});

test('mvm: the hit lands 8 + a 6/s burn for 3 s, and the burn can kill — without waking the victim onto the hunter', () => {
  const prey = mon('slot-20', 0, 0, 0);
  const startHp = prey.hp;
  assert.equal(prey.burnDps, 0, 'fresh monsters carry no burn');
  assert.equal(applyMonsterAuraHit(prey, { dmg: 8 }), false, 'one hit does not kill');
  assert.equal(prey.hp, startHp - 8);
  assert.equal(prey.burnDps, 6);
  assert.equal(prey.burnRemainingS, 3);
  assert.equal(prey.spotted, false, 'a monster-struck victim does NOT turn on the hunter');
  // The burn eats 6/s: 3 s of burn is 18 damage.
  assert.equal(tickMonsterBurn(prey, 3), false);
  assert.equal(prey.hp, startHp - 8 - 18);
  assert.equal(prey.burnRemainingS, 0);
  assert.equal(prey.burnDps, 0);
  // Repeated streaks + burns kill: each 1.5 s cycle is 8 + 9.
  let guard = 0;
  while (!prey.dead && guard++ < 40) {
    applyMonsterAuraHit(prey, { dmg: 8 });
    tickMonsterBurn(prey, 1.5);
  }
  assert.equal(prey.dead, true, 'sustained aura fire kills the prey');
  assert.equal(prey.hp, 0);
  assert.equal(prey.state, 'dead');
  // A dead victim stays dead — further hits are no-ops.
  assert.equal(applyMonsterAuraHit(prey, { dmg: 8 }), false);
  assert.equal(tickMonsterBurn(prey, 1.5), false);
});

test('mvm: a burning monster keeps burning through its own stepMonster ticks', () => {
  const hunter = mon('slot-17', 0, 0, 0);
  // Non-carrier prey (slot-01, acid): a carrier prey at 30 m
  // would die in a territorial duel on the hunter's step, and
  // this test is about the burn, not the duel.
  const prey = mon('slot-01', 0, 30, 0);
  const startHp = prey.hp;
  // Strike the prey once via the hunter's aura, then let the
  // prey's own ticks eat the burn.
  stepMonster(hunter, 0.1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [prey] });
  applyMonsterAuraHit(prey, { dmg: 8 });
  assert.equal(prey.hp, startHp - 8);
  stepMonster(prey, 1.5, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [] });
  assert.equal(prey.hp, startHp - 8 - 9, '1.5 s of burn at 6/s');
  assert.equal(prey.burnRemainingS, 1.5);
});

/* ---------------- SAVAGERY (Merlin, Nov 16 ~01:33 — "same savagery
 * here as on Jupiter") ----------------
 * Phase-2 workstream 3: monsters hunt monsters (140 m stalk,
 * ×1.5 close), territorial duels (50 m, bigger scaleM wins),
 * predation death causes, 45 s in-slot respawn, per-target aura
 * cadence, 40 m sight, 20 s give-up. Tests written first; the
 * old player-first-suppression pins were updated to the new law
 * (see the two mvm tests above) because step 5 reverses them
 * outright — the player is still struck first, never softened. */

test('savagery: death causes are combat, predation, territorial-duel — and age', () => {
  assert.deepEqual([...DEATH_CAUSES].sort(), ['age', 'combat', 'predation', 'territorial-duel']);
  assert.equal(RESPAWN_S, 45, 'the house 45 s respawn clock');
  assert.equal(TERRITORY_R_M, 50, "J2's duel radius, adopted verbatim");
  assert.equal(PREY_STALK_R_M, 140, "J2's stalk radius, adopted verbatim");
});

/* ---------------- AGENTS (Merlin, Nov 16 ~02:31) ----------------
 * The seven-agent life line: the prey chase is hunger-gated and
 * age death kills through stepMonster. These helpers pin a
 * deterministic clock — monsters created at AGENT_NOW, stepped
 * at a hungry / not-hungry instant found from that same clock,
 * so the age-death check (birth + lifespan) stays far away and
 * the test never depends on the wall clock. */
const AGENT_NOW = 1800000000000;
function monAt(type, x, z, nowMs = AGENT_NOW) {
  const m = createMonster({ id: `t-${type}`, type, element: MONSTER_TYPES[type].element, x, z }, rng, nowMs);
  m.active = true;
  return m;
}
function hungryNow(m, base = AGENT_NOW) {
  let t = base;
  while (!hungerFor(m, t).hungry) t += 1000;
  return t;
}
function notHungryNow(m, base = AGENT_NOW) {
  let t = base;
  while (hungerFor(m, t).hungry) t += 1000;
  return t;
}

test('savagery: a lightning carrier steers toward monster prey inside 140 m at ×1.5 speed', () => {
  // slot-19: lightning, stalk, speed 4.8 — closing at 7.2 m/s.
  // The chase is hunger-gated (agents workstream): the test pins
  // a hungry clock for the hunter, and monsters created at that
  // same clock so the age-death check stays far away.
  const hunter = monAt('slot-19', 0, 0);
  const prey = monAt('slot-20', 100, 0);
  stepMonster(hunter, 1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [prey], nowMs: hungryNow(hunter) });
  assert.equal(hunter.preyTarget, prey.id, 'the chase names its prey');
  assert.ok(Math.abs(hunter.x - 7.2) < 1e-9, `hunter closed 7.2 m toward the prey, x=${hunter.x}`);
  assert.ok(Math.abs(hunter.z) < 1e-9, 'straight at the prey, no sideways drift');
  assert.equal(hunter.spotted, false, 'prey-hunting is not player-spotting');
  // Prey past 140 m: no chase, no preyTarget — roam drift only.
  const farHunter = monAt('slot-19', 0, 0);
  const farPrey = monAt('slot-20', 150, 0);
  stepMonster(farHunter, 1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [farPrey], nowMs: hungryNow(farHunter) });
  assert.equal(farHunter.preyTarget, null, 'no prey inside 140 m');
  assert.ok(Math.abs(farHunter.x) < 1e-9, 'no steering toward prey past 140 m');
});

test('savagery: player hunt keeps absolute priority over prey hunt', () => {
  // slot-20: lightning, short-range — a closer, not a shooter.
  const hunter = mon('slot-20', 0, 0, 0);
  const prey = mon('slot-19', 100, 0, 0);
  // Player 20 m ahead, in the sight cone: spotted, hunts the player.
  stepMonster(hunter, 1, { x: 0, z: 20 }, rng, { losClear: alwaysLos, others: [prey] });
  assert.equal(hunter.spotted, true);
  assert.equal(hunter.preyTarget, null, 'a spotted carrier hunts the player, never prey');
  assert.ok(hunter.z > 0, 'moves toward the player, not the prey');
  assert.ok(Math.abs(hunter.x) < 1e-9, 'no sideways drift toward the prey');
});

test('savagery: non-carriers never hunt prey', () => {
  const hunter = mon('slot-01', 0, 0, 0); // acid, no aura
  const prey = mon('slot-20', 50, 0, 0);
  stepMonster(hunter, 1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [prey] });
  assert.equal(hunter.preyTarget, null, 'no aura, no hunt — prey only');
});

test('savagery: duelOutcome — bigger scaleM wins, ties break on the pair hash', () => {
  assert.deepEqual(
    duelOutcome({ id: 'a', scaleM: 3.2 }, { id: 'b', scaleM: 2.2 }),
    { winnerId: 'a', loserId: 'b' },
  );
  assert.deepEqual(
    duelOutcome({ id: 'b', scaleM: 2.2 }, { id: 'a', scaleM: 3.2 }),
    { winnerId: 'a', loserId: 'b' },
    'argument order never changes the winner',
  );
  const tie1 = duelOutcome({ id: 'a', scaleM: 2.2 }, { id: 'b', scaleM: 2.2 });
  const tie2 = duelOutcome({ id: 'b', scaleM: 2.2 }, { id: 'a', scaleM: 2.2 });
  assert.equal(tie1.winnerId, tie2.winnerId, 'a tied pair has one deterministic winner');
  assert.ok(tie1.winnerId === 'a' || tie1.winnerId === 'b', 'the tie winner is one of the pair');
  assert.equal(tie1.loserId, tie1.winnerId === 'a' ? 'b' : 'a');
});

test('savagery: a territorial duel kills the loser once — territorial-duel, killerId the winner', () => {
  // Stormwing (sky-dragon, scaleM 3.2) vs a Volt Pack Leader
  // (slot-19, scaleM 2.2) at 30 m: the dragon wins.
  const dragon = mon('sky-dragon', 0, 0, 0);
  const rival = mon('slot-19', 30, 0, 0);
  const evs = stepMonster(dragon, 0.1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [rival] });
  const kills = evs.filter((e) => e.kind === 'monster-killed');
  assert.equal(kills.length, 1, 'exactly one monster-killed event');
  assert.equal(kills[0].id, rival.id);
  assert.equal(kills[0].cause, 'territorial-duel');
  assert.equal(kills[0].killerId, dragon.id);
  assert.equal(rival.dead, true);
  assert.equal(rival.deathCause, 'territorial-duel');
  assert.equal(rival.killerId, dragon.id);
  assert.equal(dragon.dead, false, 'the winner keeps hunting');
  assert.equal(dragon.dueling, rival.id, 'the winner reports the duel');
  // A second step emits nothing more — the loser is already dead.
  const evs2 = stepMonster(dragon, 0.1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [rival] });
  assert.equal(evs2.filter((e) => e.kind === 'monster-killed').length, 0, 'no double-kill');
  // Past 50 m: no duel at all.
  const farDragon = mon('sky-dragon', 0, 0, 0);
  const farRival = mon('slot-19', 60, 0, 0);
  stepMonster(farDragon, 0.1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [farRival] });
  assert.equal(farRival.dead, false, 'no duel past 50 m');
  assert.equal(farDragon.dueling, null);
});

test('savagery: predation deaths record deathCause, killerId, diedAtMs and a 45 s respawn clock', () => {
  const prey = mon('slot-01', 0, 0, 0);
  prey.hp = 5;
  assert.equal(prey.respawnAtMs, null, 'fresh monsters carry no respawn time');
  assert.equal(applyMonsterAuraHit(prey, { dmg: 8, from: 't-slot-19' }), true, 'the hit kills');
  assert.equal(prey.deathCause, 'predation');
  assert.equal(prey.killerId, 't-slot-19');
  assert.ok(typeof prey.diedAtMs === 'number' && prey.diedAtMs > 0);
  assert.equal(prey.respawnAtMs, prey.diedAtMs + RESPAWN_S * 1000, 'returns 45 s after death');
  // A burn kill records the same cause, with the striker who lit it.
  const burned = mon('slot-01', 0, 0, 0);
  burned.hp = 5;
  applyMonsterAuraHit(burned, { dmg: 1, from: 't-slot-17' });
  assert.equal(burned.dead, false, 'a 1-damage hit does not kill');
  assert.equal(tickMonsterBurn(burned, 1), true, 'the burn finishes it');
  assert.equal(burned.deathCause, 'predation');
  assert.equal(burned.killerId, 't-slot-17', 'the burn killer is the striker who lit it');
  assert.equal(burned.respawnAtMs, burned.diedAtMs + RESPAWN_S * 1000);
});

test('savagery: a burn death inside stepMonster emits a monster-killed event', () => {
  const prey = mon('slot-01', 0, 0, 0);
  prey.hp = 5;
  applyMonsterAuraHit(prey, { dmg: 1, from: 't-slot-19' });
  const evs = stepMonster(prey, 1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [] });
  const kills = evs.filter((e) => e.kind === 'monster-killed');
  assert.equal(kills.length, 1, 'the burn death is an event, not a silent return');
  assert.equal(kills[0].id, prey.id);
  assert.equal(kills[0].cause, 'predation');
  assert.equal(kills[0].killerId, 't-slot-19');
  assert.equal(prey.dead, true);
});

test('savagery: player kills record combat and the same 45 s clock', () => {
  const m = mon('slot-01', 0, 0, 0);
  assert.equal(damageMonster(m, 1000), true);
  assert.equal(m.deathCause, 'combat', 'player kills stay combat, never predation');
  assert.equal(m.killerId, null);
  assert.equal(m.respawnAtMs, m.diedAtMs + RESPAWN_S * 1000, 'player kills respawn on the same clock');
});

test('savagery: respawnMonster returns the same monster, same type, full HP, near where it fell', () => {
  const m = mon('slot-01', 100, 100, 0);
  damageMonster(m, 1000);
  assert.equal(m.dead, true);
  const diedAt = { x: m.x, z: m.z };
  respawnMonster(m, () => 0.5);
  assert.equal(m.id, 't-slot-01', 'same slot identity — the field count never drops');
  assert.equal(m.type, 'slot-01', 'same family');
  assert.equal(m.dead, false);
  assert.equal(m.hp, MONSTER_TYPES['slot-01'].hp, 'full HP');
  assert.equal(m.deathCause, null);
  assert.equal(m.killerId, null);
  assert.equal(m.diedAtMs, null);
  assert.equal(m.respawnAtMs, null);
  assert.equal(m.preyTarget, null);
  assert.equal(m.auraCd, 0);
  assert.equal(m.auraCdPrey, 0);
  const moved = Math.hypot(m.x - diedAt.x, m.z - diedAt.z);
  assert.ok(moved <= 40, `respawned ${moved.toFixed(1)} m from the death point — inside ~40 m`);
  assert.equal(isInBase(m.x, m.z), false, 'never respawns inside The Haven');
  assert.ok(Math.hypot(m.x - 0, m.z - 95) >= 30, 'never respawns inside the spawn-clear radius');
});

test('savagery: aura strikes the player and the prey on one tick, each on its own 1.5 s cooldown', () => {
  const hunter = mon('slot-19', 0, 0, 0);
  const prey = mon('slot-01', 0, 30, 0);
  const opts = { losClear: alwaysLos, others: [prey] };
  const first = stepMonster(hunter, 0.1, { x: 0, z: -30 }, rng, opts)
    .filter((e) => e.kind === 'aura-strike');
  assert.equal(first.length, 2, 'player + prey on one tick');
  assert.equal(first[0].target, 'player', 'player first');
  assert.equal(first[1].target, prey.id, 'prey second');
  assert.equal(hunter.auraCd, 1.5, 'player cooldown tracked');
  assert.equal(hunter.auraCdPrey, 1.5, 'prey cooldown tracked separately');
  assert.equal(
    stepMonster(hunter, 0.1, { x: 0, z: -30 }, rng, opts).filter((e) => e.kind === 'aura-strike').length,
    0, 'neither target is struck again inside 1.5 s',
  );
  const again = stepMonster(hunter, 1.4, { x: 0, z: -30 }, rng, opts)
    .filter((e) => e.kind === 'aura-strike');
  assert.equal(again.length, 2, 'both cooldowns due again after 1.5 s');
});

test('savagery: sight is 40 m — a monster spots at 35 m, not at 45 m', () => {
  const near = mon('slot-06', 0, 0, 0);
  stepMonster(near, 0.1, { x: 0, z: 35 }, rng, { losClear: alwaysLos });
  assert.equal(near.spotted, true, '35 m is inside the 40 m sight range');
  const far = mon('slot-06', 0, 0, 0);
  stepMonster(far, 0.1, { x: 0, z: 45 }, rng, { losClear: alwaysLos });
  assert.equal(far.spotted, false, '45 m is past the 40 m sight range');
});

test('savagery: give-up is 20 s — the trail holds at 15 s unseen', () => {
  assert.equal(GIVE_UP_S, 20, 'the hunt lasts 20 s unseen now');
  const m = mon('slot-06', 0, 0, 0);
  stepMonster(m, 0.1, { x: 0, z: 20 }, rng, { losClear: alwaysLos });
  assert.equal(m.spotted, true);
  for (let i = 0; i < 15; i++) stepMonster(m, 1, { x: 0, z: -100 }, rng, { losClear: neverLos });
  assert.equal(m.spotted, true, '15 s unseen is not enough to give up anymore');
  for (let i = 0; i < 5; i++) stepMonster(m, 1, { x: 0, z: -100 }, rng, { losClear: neverLos });
  assert.equal(m.spotted, false, '20 s unseen and the trail goes cold');
});

/* ---------------- WS6 (2026-11-16): hit events carry the element ----------------
 * Flat-damage site D3: the archetype `hit` event carried no
 * element, so the zone and the page could only ever deal a bare
 * number. The event now carries m.element; Korus hits are the
 * deliberate exception (his own boss mechanics, flat by design). */

test('WS6: every stepMonster hit event carries a valid element from ELEMENTS', () => {
  for (const archetype of ['melee', 'short-range', 'ranged']) {
    const key = Object.entries(MONSTER_TYPES)
      .find(([, t]) => t.archetype === archetype && !t.dragon)?.[0];
    assert.ok(key, `no ${archetype} type found`);
    const dist = archetype === 'melee' ? 2 : archetype === 'short-range' ? 4 : 10;
    const m = mon(key, 0, 0, Math.PI / 2);
    const evs = stepMonster(m, 0.1, { x: dist, z: 0 }, rng, { losClear: alwaysLos });
    const hits = evs.filter((e) => e.kind === 'hit');
    assert.ok(hits.length >= 1, `${key} must emit a hit`);
    for (const hit of hits) {
      assert.ok(ELEMENTS.includes(hit.element), `${key} hit element ${hit.element} invalid`);
      assert.equal(hit.element, MONSTER_TYPES[key].element);
      assert.ok(ELEMENT_COLORS[hit.element] !== undefined, 'hit element must have a colour');
    }
  }
});

/* ---------------- AGENTS (Merlin, Nov 16 ~02:31) ----------------
 * The seven-agent life line, simulation side: age death kills
 * through the same monster-killed / remains / 45 s
 * next-generation path as every other death, and hunger gates
 * ONLY the prey chase — never the player hunt, never the aura. */

test('agents: age death kills through stepMonster — cause age, monster-killed event, 45 s clock, next generation', () => {
  const m = monAt('slot-01', 0, 0); // 180 d lifespan
  const deathMs = m.birthMs + 180 * DAY_MS;
  // One millisecond early: alive, no event.
  assert.deepEqual(
    stepMonster(m, 0.1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [], nowMs: deathMs - 1 }),
    [], 'one millisecond before birth + lifespan, nothing happens',
  );
  assert.equal(m.dead, false);
  // At birth + lifespan: dead of age.
  const evs = stepMonster(m, 0.1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [], nowMs: deathMs });
  const kills = evs.filter((e) => e.kind === 'monster-killed');
  assert.equal(kills.length, 1, 'exactly one monster-killed event');
  assert.equal(kills[0].id, m.id);
  assert.equal(kills[0].cause, 'age');
  assert.equal(kills[0].killerId, null, 'no killer — old age');
  assert.equal(m.dead, true);
  assert.equal(m.deathCause, 'age');
  assert.equal(m.diedAtMs, deathMs);
  assert.equal(m.respawnAtMs, deathMs + RESPAWN_S * 1000, 'the same 45 s clock as every other death');
  // The next generation is born in the same slot: generation + 1, age 0.
  respawnMonster(m, () => 0.5, deathMs + RESPAWN_S * 1000);
  assert.equal(m.dead, false);
  assert.equal(m.generation, 1, 'the respawn IS the next generation');
  assert.equal(m.birthMs, deathMs + RESPAWN_S * 1000, 'born fresh at the respawn instant');
  assert.equal(m.hp, MONSTER_TYPES['slot-01'].hp, 'full HP');
  assert.equal(m.type, 'slot-01', 'same family');
});

test('agents: a burning monster that is also due of age dies by the burn — predation wins ties', () => {
  const prey = monAt('slot-01', 0, 0);
  prey.hp = 5;
  applyMonsterAuraHit(prey, { dmg: 1, from: 't-slot-19' });
  const deathMs = prey.birthMs + 180 * DAY_MS;
  const evs = stepMonster(prey, 1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [], nowMs: deathMs });
  const kills = evs.filter((e) => e.kind === 'monster-killed');
  assert.equal(kills.length, 1);
  assert.equal(kills[0].cause, 'predation', 'the burn already killing this tick keeps its cause');
  assert.equal(prey.deathCause, 'predation');
});

test('agents: hunger gates the prey chase only — not hungry, no chase; hungry, chase', () => {
  // Not hungry: the carrier roams, preyTarget stays null.
  const calm = monAt('slot-19', 0, 0);
  const prey = monAt('slot-20', 100, 0);
  stepMonster(calm, 1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [prey], nowMs: notHungryNow(calm) });
  assert.equal(calm.preyTarget, null, 'not hungry — no chase');
  assert.ok(Math.abs(calm.x) < 1e-9, 'no steering toward prey while not hungry');
  // Hungry: the same carrier chases.
  const hungry = monAt('slot-19', 0, 0);
  stepMonster(hungry, 1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [prey], nowMs: hungryNow(hungry) });
  assert.equal(hungry.preyTarget, prey.id, 'hungry — the chase runs');
  assert.ok(Math.abs(hungry.x - 7.2) < 1e-9, 'closes at ×1.5 speed');
});

test('agents: the player hunt is never hunger-gated — a spotted carrier hunts the player on a not-hungry clock', () => {
  const hunter = monAt('slot-20', 0, 0);
  hunter.faceYaw = 0; // facing +z, the player ahead — spotted by sight
  const prey = monAt('slot-19', 100, 0);
  stepMonster(hunter, 1, { x: 0, z: 20 }, rng, { losClear: alwaysLos, others: [prey], nowMs: notHungryNow(hunter) });
  assert.equal(hunter.spotted, true);
  assert.equal(hunter.preyTarget, null, 'a spotted carrier hunts the player, never prey');
  assert.ok(hunter.z > 0, 'moves toward the player, hungry or not');
});

test('agents: the aura strikes prey hungry or not — hunger paces the chase, never the strike', () => {
  const hunter = monAt('slot-17', 0, 0);
  const prey = monAt('slot-01', 0, 30); // non-carrier, so no duel fires
  const evs = stepMonster(hunter, 0.1, { x: 0, z: -500 }, rng, { losClear: alwaysLos, others: [prey], nowMs: notHungryNow(hunter) })
    .filter((e) => e.kind === 'aura-strike');
  assert.equal(evs.length, 1, 'one streak at the prey on a not-hungry clock');
  assert.equal(evs[0].target, prey.id);
});

test('agents: respawnMonster advances the generation and rebirths at age 0', () => {
  const m = monAt('slot-01', 100, 100);
  assert.equal(m.generation, 0);
  const born = m.birthMs;
  damageMonster(m, 1000);
  respawnMonster(m, () => 0.5, AGENT_NOW + 45000);
  assert.equal(m.generation, 1, 'first respawn is generation 1');
  assert.equal(m.birthMs, AGENT_NOW + 45000, 'born fresh at the respawn instant');
  assert.ok(m.birthMs > born, 'the new birth is later than the old one');
  damageMonster(m, 1000);
  respawnMonster(m, () => 0.5, AGENT_NOW + 90000);
  assert.equal(m.generation, 2, 'generations keep advancing');
});
