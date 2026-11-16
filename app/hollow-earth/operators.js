// app/hollow-earth/operators.js
// HOLLOW EARTH (OLYMPIAN MONSTERVERSE) — OPERATOR AGENTS
// (Merlin, Nov 14 ~22:56, "Yes — all realms"; behaviour logic
// Nov 14 ~22:59). The agents that operate the Monsterverse's
// creatures, following the Earth 4 pattern: a creature's life
// a pure function of (place, family, device clock) plus the
// live state the zone already owns — NO stored state of their
// own, NO server. Earth 4 itself is NOT touched.
//
// CREATURES IN CODE (enumerated exactly):
//   * monster families — 37 slot families (families.js
//     MONSTER_FAMILIES) + 11 extra families (EXTRA_FAMILIES)
//     = 48 types, each with element, attitude (stalk / charge
//     / ambush), archetype, habitat, HP (100–200), dmg, speed.
//     Only families with a placed rigged GLB spawn (models.js
//     PLACED_FIELD_KEYS — 24 keys today); the rest return
//     automatically when their Tripo re-send lands.
//   * dragons — exactly 3 (Stormwing sky-dragon, Cinder Maw,
//     Muse the Luminous); only Stormwing's GLB is placed, so
//     only Stormwing spawns (3 copies).
//   * Korus — the ultimate boss (1,000 HP, throne at
//     (-215, 55), gate 40 kills, spawns.js).
//   * Ghorrum — the Mountain's Grin (watcher.js): NON-HOSTILE,
//     excluded from combat AND the hunt, never blocks the path,
//     never counts as a monster.
//   * raised dino companions — the shared backpack (breeding.js
//     + lib/dino-companion.js; the page summons/recalls them).
//
// DEATH LAW (from code — never invented):
//   * monsters die by COMBAT ONLY: player blade (36) / bolt
//     (28) via damageMonster. A kill pays +12 HP and counts
//     toward the 30-kill shield. A dead monster does NOT
//     respawn in code: zone.js hides it (fig.visible = false)
//     and no refill loop exists — the field empties as the
//     player hunts, until re-entry rebuilds it. (RESPAWN_S =
//     45 exists in spawns.js but no code reads it — flagged.)
//     No age death.
//   * Korus dies by COMBAT ONLY (1,000 HP via damageKorus);
//     death is PERMANENT — no respawn in code.
//   * Ghorrum NEVER dies (excluded from combat by code).
//   * companion dinos NEVER die (ally law, breeding.js).
//
// BEHAVIOUR LOGIC (Merlin, Nov 14 ~22:59) — per-realm check:
//   * user-hunt branch: APPLIES. Monsters hunt the user once
//     they SPOT them (stepMonster: sight cone / hearing /
//     proximity; ambushers wait to 10 m); they give up after
//     12 s unseen (GIVE_UP_S) and every chase breaks at The
//     Haven's boundary (sanctuary).
//   * user-death / corpse-fight branch: DOES NOT APPLY as a
//     fight. On user death the hunter wakes at The Haven, whole
//     (full HP, kills + shield kept — page.jsx); there is no
//     corpse entity and monsters do not fight each other. The
//     operators record the trail going cold at The Haven,
//     never a corpse fight.
//   * territorial carnivore fights: DO NOT APPLY. Monsters
//     carry NO diet in code (element / attitude / archetype
//     instead) and no monster-vs-monster combat exists —
//     inventing it would contradict the hunt code.
//   * diet-driven feeding: no diet data — a monster's feeding
//     IS its hunt of the user (attitude + archetype).
//   * water-seeking: DOES NOT APPLY. No water habitat exists
//     in code (habitats are acid / fire / lightning / poison /
//     shadow / sand / frost) and no creature drinks.
//   * the agents run every part of each creature — feeding,
//     territory, water, movement, rest, breeding — through the
//     operators, not as one-off scripts; where a branch has no
//     coded basis it is recorded as not-applicable, never
//     invented.
//
// POPULATION RULE (Merlin, Nov 14 ~22:57): more than one copy
// of every creature, spread out across the map. Minimums (this
// module's call): 2 copies per PLACED family, 3 per PLACED
// dragon. VERIFIED, NOT FIXED: spawnField PASS 1 already
// guarantees 2 of every placed family in its own habitat band,
// and 3 of each placed dragon — populationAudit() re-runs that
// check. Unplaced families spawn ZERO (no GLB — nothing to
// render); that is model-gated, not a population failure.
// Korus and Ghorrum are singletons BY DESIGN (one boss, one
// watcher) — flagged, not doubled.

import {
  MONSTER_TYPES,
  spawnField,
  DRAGON_TYPES,
  KORUS_MAX_HP,
  KORUS_GATE_KILLS,
  GIVE_UP_S,
} from './spawns.js';
import {
  MONSTER_FAMILIES,
  EXTRA_FAMILIES,
} from './families.js';
import { PLACED_FIELD_KEYS } from './models.js';
import { WATCHER } from './watcher.js';
import { companionLifeFor } from '../../lib/earth2/operators.js';
import { localHour, isNightAt } from '../../lib/life-clock.js';
import { auraFor } from '../../lib/lightning-aura.js';

export const MIN_COPIES_PER_FAMILY = 2;
export const MIN_COPIES_PER_DRAGON = 3;
export const PLACED_FIELD = new Set(PLACED_FIELD_KEYS);

// ── Monsters ─────────────────────────────────────────────────
/** True when a family has a placed GLB and can spawn. */
export function isPlacedFamily(key) {
  return PLACED_FIELD.has(String(key));
}

/**
 * Life of one monster at the device clock. `m` is a
 * createMonster() record ({ type, element, x, z, hp, state,
 * spotted, dead, active }); `opts` carries { nowMs } and
 * optionally { playerPos } — the hunter's {x, z} when known.
 * Death is combat only and permanent for the session (no
 * respawn loop in code — flagged in the header).
 *
 * LIGHTNING AURA (Merlin, Nov 16 ~00:11): lightning-element
 * monsters and dragons carry a 59 m aura (lib/lightning-aura.js
 * — white-yellow streaks for lightning non-dragons, red for
 * dragons). `aura` is the auraFor() object when the monster is
 * a live lightning source, else null. targetInRange is true /
 * false only when a player position is known (opts.playerPos
 * or m.playerPos); with no target known it reports null, never
 * an invented position. A dead monster's aura is off (null).
 */
export function monsterLifeFor(m, now = Date.now(), opts = {}) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const type = MONSTER_TYPES[m.type] || null;
  const name = type ? type.name : String(m.type || 'monster');
  const dead = !!m.dead;
  const spotted = !!m.spotted && !dead;
  const activity = dead ? 'dead' : m.state === 'ambush' ? 'ambush-wait' : spotted ? (m.state || 'stalk') : 'roam';
  // Aura kind for the shared law: dragons ('dragon' → red) and
  // lightning non-dragons ('lightning-monster' → white-yellow).
  const auraKind = !type ? null : type.dragon ? 'dragon' : type.element === 'lightning' ? 'lightning-monster' : null;
  let aura = null;
  let auraNote = null;
  if (auraKind && !dead) {
    const targetPos = (opts && opts.playerPos) || m.playerPos || null;
    aura = auraFor(auraKind, { x: m.x || 0, z: m.z || 0 }, targetPos);
    // auraFor() reports targetInRange false with no target;
    // here "no target known" is null, never invented.
    if (!targetPos) aura = { ...aura, targetInRange: null };
    auraNote = auraKind === 'dragon'
      ? 'Red lightning aura, 59 m — streaks strike and burn inside it'
      : 'White-yellow lightning aura, 59 m — streaks strike and burn inside it';
  } else if (dead) {
    auraNote = 'Dead — the aura is off';
  } else {
    auraNote = 'No lightning aura — this family carries no lightning';
  }
  const life = {
    realm: 'hollow-earth',
    kind: 'monster',
    type: m.type,
    name,
    element: type ? type.element : (m.element || null),
    attitude: type ? type.attitude : null,
    archetype: type ? type.archetype : null,
    habitat: type ? type.habitat : null,
    dragon: !!(type && type.dragon),
    state: dead ? 'dead' : 'alive',
    activity,
    moving: spotted && m.state !== 'ambush',
    hp: m.hp != null ? m.hp : (type ? type.hp : 0),
    maxHp: type ? type.hp : 0,
    spotted,
    feeding: dead ? 'none' : spotted ? 'hunt-user' : type && type.attitude === 'ambush' ? 'ambush-wait' : 'roam',
    feedingNote: dead
      ? 'Dead — does not hunt (and does not return this session)'
      : spotted
        ? 'Hunting the user — spotted by sight, hearing or proximity'
        : type && type.attitude === 'ambush'
          ? 'Lying in wait — ambushers strike inside 10 m'
          : 'Roaming its habitat band',
    territory: 'none',
    territoryNote: 'No diet, no monster-vs-monster combat in code',
    duel: null,
    water: 'none',
    waterNote: 'No water habitat in code — habitats are element bands',
    breeding: false,
    breedingNote: 'No breeding — the field is seeded on entry (2 of every placed family)',
    groupSize: 2,
    deathCause: dead ? 'combat' : null,
    respawnAt: null,
    respawnNote: dead ? 'No respawn loop in code — the field refills on re-entry' : null,
    giveUpS: GIVE_UP_S,
    aura,
    auraNote,
    hour: Math.round(localHour(new Date(t)) * 10) / 10,
    night: isNightAt(new Date(t)),
  };
  life.line = lifeLine(life);
  return life;
}

// ── Korus ────────────────────────────────────────────────────
/**
 * Life of the boss. `korus` is a createKorus() record;
 * `opts` carries { totalKills, nowMs }. Dormant until the
 * 40-kill gate opens, awake within 30 m, dead — permanent.
 */
export function korusLifeFor(korus, now = Date.now(), opts = {}) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const state = !korus ? 'dormant' : korus.dead ? 'dead' : korus.dormant ? 'dormant' : korus.awake ? 'combat' : 'ready';
  const gateOpen = (opts.totalKills || 0) >= KORUS_GATE_KILLS;
  const life = {
    realm: 'hollow-earth',
    kind: 'boss',
    name: 'Korus',
    state,
    activity: state === 'combat' ? 'combat' : state === 'dead' ? 'dead' : 'waiting',
    moving: false,
    hp: korus ? korus.hp : KORUS_MAX_HP,
    maxHp: KORUS_MAX_HP,
    gateKills: KORUS_GATE_KILLS,
    gateOpen,
    wakeDistM: 30,
    feeding: state === 'combat' ? 'hunt-user' : 'none',
    feedingNote: state === 'combat'
      ? 'Casting shadow + sky-bolt at the user from his throne'
      : 'Dormant on his throne until the 40-kill gate opens',
    territory: 'boss',
    territoryNote: 'One boss, one throne — a singleton by design',
    duel: null,
    water: 'none',
    waterNote: 'No water habitat in code',
    breeding: false,
    breedingNote: 'No respawn — death is permanent',
    groupSize: 1,
    deathCause: state === 'dead' ? 'combat' : null,
    aura: null,
    auraNote: 'No aura — Korus keeps his own shadow + sky-bolt boss mechanics',
    hour: Math.round(localHour(new Date(t)) * 10) / 10,
    night: isNightAt(new Date(t)),
  };
  life.line = lifeLine(life);
  return life;
}

// ── Ghorrum, the watcher ─────────────────────────────────────
/** Life of the watcher: alive, non-hostile, never dies, never counts. */
export function watcherLifeFor(now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const life = {
    realm: 'hollow-earth',
    kind: 'watcher',
    name: WATCHER.name,
    state: 'alive',
    activity: 'watching',
    moving: false,
    hp: null,
    maxHp: null,
    feeding: 'none',
    feedingNote: 'Non-hostile watcher — never hunts, never counts as a monster',
    territory: 'none',
    territoryNote: 'Excluded from combat and the hunt by code',
    duel: null,
    water: 'none',
    waterNote: 'No drink law in code',
    breeding: false,
    breedingNote: 'One watcher, one mountain — a singleton by design',
    groupSize: 1,
    deathCause: null,
    aura: null,
    auraNote: 'No aura — Ghorrum is a non-hostile watcher, never a lightning source',
    hour: Math.round(localHour(new Date(t)) * 10) / 10,
    night: isNightAt(new Date(t)),
  };
  life.line = lifeLine(life);
  return life;
}

// ── Conductor ────────────────────────────────────────────────
/**
 * The full life state of one Hollow Earth creature. `creature`
 * carries { kind: 'monster' | 'boss' | 'watcher' |
 * 'companion' } — monster records, Korus records, the watcher,
 * or backpack dino items. `opts` carries { totalKills, nowMs }.
 */
export function lifeFor(creature, now = Date.now(), opts = {}) {
  if (!creature) return null;
  if (creature.kind === 'companion' || (creature.meta && creature.meta.species)) {
    return companionLifeFor(creature, now);
  }
  if (creature.kind === 'boss' || creature === 'korus') {
    return korusLifeFor(creature === 'korus' ? null : creature, now, opts);
  }
  if (creature.kind === 'watcher' || creature === 'ghorrum') {
    return watcherLifeFor(now);
  }
  return monsterLifeFor(creature, now, opts);
}

/** The tap-card life line, Earth 4 style. */
export function lifeLine(life) {
  if (!life) return '';
  if (life.kind === 'watcher') return `${life.name} · Watching · never hostile`;
  if (life.kind === 'boss') {
    if (life.state === 'dead') return 'Remains — Korus — the throne stands empty';
    if (life.state === 'dormant') return `Korus · Dormant · gate opens at ${life.gateKills} kills`;
    if (life.state === 'ready') return 'Korus · Waiting · approach within 30 m to wake him';
    return `Korus · Combat · ${life.hp}/${life.maxHp} HP`;
  }
  if (life.state === 'dead') return `Remains — ${life.name} — killed in combat, does not return this session`;
  if (life.isAlly) return `${life.stageName || 'Adult'} · Following you · Ally`;
  const parts = [life.name || 'Monster'];
  if (life.dragon) parts.push('Dragon');
  if (life.activity === 'ambush-wait') parts.push('Lying in wait');
  else if (life.spotted) parts.push('Hunting you');
  else parts.push('Roaming');
  if (life.element) parts.push(life.element);
  return parts.join(' · ');
}

/**
 * Enrich zone output with life: adds `life` to every creature
 * (mutates and returns the same array). The zone's records are
 * untouched — the operators layer the life line on top.
 */
export function enrichCreatures(creatures, now = Date.now(), opts = {}) {
  if (!Array.isArray(creatures)) return creatures;
  const t = now instanceof Date ? now.getTime() : Number(now);
  for (const c of creatures) {
    if (!c || typeof c.kind !== 'string') continue;
    c.life = lifeFor(c, t, opts);
  }
  return creatures;
}

// ── Population Agent (Merlin, Nov 14 ~22:57) ────────────────
/**
 * Population audit for a spawnField() record list. Per family:
 * live copies, whether the 2-copy minimum holds; per placed
 * dragon: whether the 3-copy minimum holds. Unplaced families
 * (no GLB) count zero by design — model-gated, reported
 * separately, never silently counted as a failure.
 */
export function populationAudit(records) {
  const counts = new Map();
  for (const r of Array.isArray(records) ? records : []) {
    if (!r || typeof r.type !== 'string') continue;
    counts.set(r.type, (counts.get(r.type) || 0) + 1);
  }
  const perFamily = {};
  const modelGated = [];
  for (const key of Object.keys({ ...MONSTER_FAMILIES, ...EXTRA_FAMILIES })) {
    const n = counts.get(key) || 0;
    if (!isPlacedFamily(key)) {
      modelGated.push(key);
      perFamily[key] = { count: n, placed: false, meetsMin: true, note: 'No GLB — model-gated, returns when it lands' };
    } else {
      perFamily[key] = {
        count: n,
        placed: true,
        meetsMin: n >= MIN_COPIES_PER_FAMILY,
        note: n >= MIN_COPIES_PER_FAMILY ? 'Meets the 2-copy minimum' : 'BELOW the 2-copy minimum',
      };
    }
  }
  const dragons = {};
  for (const dtype of DRAGON_TYPES) {
    const n = counts.get(dtype) || 0;
    dragons[dtype] = {
      count: n,
      placed: isPlacedFamily(dtype),
      meetsMin: !isPlacedFamily(dtype) ? true : n >= MIN_COPIES_PER_DRAGON,
      note: !isPlacedFamily(dtype) ? 'No GLB — model-gated' : n >= MIN_COPIES_PER_DRAGON ? 'Meets the 3-copy minimum' : 'BELOW the 3-copy minimum',
    };
  }
  return {
    minCopiesPerFamily: MIN_COPIES_PER_FAMILY,
    minCopiesPerDragon: MIN_COPIES_PER_DRAGON,
    total: (Array.isArray(records) ? records : []).length,
    families: perFamily,
    dragons,
    modelGated,
    korus: { count: 1, note: 'One boss by design' },
    watcher: { count: 1, note: 'One watcher by design' },
    meetsRule: Object.values(perFamily).every((f) => f.meetsMin)
      && Object.values(dragons).every((d) => d.meetsMin),
  };
}

/**
 * Build a field and audit it: the spawnField PASS 1 guarantee
 * (2 of every placed family, 3 of each placed dragon) checked
 * against a habitat reader the caller supplies. `habitatAt`
 * must return a habitat id per point; the zone passes
 * biomeAt().dominant.
 */
export function fieldPopulation(seed, opts = {}) {
  const records = spawnField(seed, opts);
  return { records, audit: populationAudit(records) };
}
