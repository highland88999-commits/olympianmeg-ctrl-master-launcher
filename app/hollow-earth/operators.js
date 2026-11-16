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
//   * monsters die by COMBAT (player blade (36) / bolt (28)
//     via damageMonster) OR BY PREDATION (Merlin, Nov 16
//     ~01:02): another monster's aura-strike (applyMonsterAuraHit
//     + burn) kills the same way. A kill pays +12 HP and counts
//     toward the 30-kill shield — a monster-vs-monster kill pays
//     NOTHING to the hunter (no heal, no shield, no Korus-gate
//     progress: the campaign counts the hunter's kills only).
//     A dead monster RETURNS after 45 s in-slot (respawnMonster
//     + the zone update loop — same family, near where it fell,
//     full HP; player kills respawn on the same clock). No age
//     death, no decomposition — the field never empties within
//     a session; re-entry rebuilds it as the backstop.
//   * Korus dies by COMBAT ONLY (1,000 HP via damageKorus);
//     death is PERMANENT — no respawn in code.
//   * Ghorrum NEVER dies (excluded from combat by code).
//   * companion dinos NEVER die (ally law, breeding.js).
//   * AGE DEATH + GENERATIONS (agents workstream, Nov 16
//     ~02:31): a monster's lifespan runs out at birth +
//     lifespan (lifespans per family by the HP-band rule in
//     monster-life.js — dragon 420 d, HP ≥ 180 → 420 d, HP ≥
//     140 → 300 d, else 180 d, a stated convention). The 45 s
//     respawn clock IS the decomposition window — ONE death law,
//     not two: death → remains lie 45 s, fading → the next
//     generation is born in the same slot (generation + 1,
//     birthMs reset, same family, near where it fell). J2's
//     multi-day decomposition clock is deliberately NOT copied:
//     Hollow Earth is a session world, the field rebuilds on
//     re-entry, so nothing decomposes across days.
//
// BEHAVIOUR LOGIC (Merlin, Nov 14 ~22:59) — per-realm check:
//   * user-hunt branch: APPLIES. Monsters hunt the user once
//     they SPOT them (stepMonster: sight cone / hearing /
//     proximity; ambushers wait to 10 m); they give up after
//     20 s unseen (GIVE_UP_S) and every chase breaks at The
//     Haven's boundary (sanctuary).
//   * user-death / corpse-fight branch: DOES NOT APPLY as a
//     fight. On user death the hunter wakes at The Haven, whole
//     (full HP, kills + shield kept — page.jsx); there is no
//     corpse entity and monsters do not fight each other. The
//     operators record the trail going cold at The Haven,
//     never a corpse fight.
//   * territorial carnivore fights: APPLY NOW — aura, chase
//     AND duel (Merlin, Nov 16 ~01:02 — "make monsters attack
//     each other, not just the user"; savagery, Nov 16 ~01:33).
//     A live lightning-element monster or dragon strikes monster
//     prey inside its 59 m aura with the shared law (8 + 6/s
//     burn for 3 s, player first in the same tick, one streak
//     per 1.5 s per target per source); carriers also HUNT prey
//     inside 140 m at ×1.5 speed, and two carriers within 50 m
//     duel — bigger scaleM wins, the loser dies. Non-lightning
//     monsters carry no aura, so they never hunt — they can only
//     be prey. Archetype attacks stay player-only. Korus and
//     Ghorrum are EXEMPT (never an aura, never prey).
//   * diet-driven feeding: diet is READ from the family
//     record (attitude + archetype + habitat + element
//     secondary — monster-life.js dietFor), never invented: a
//     monster eats other monsters and the hunter, taken the way
//     its attitude and archetype say. Hunger (J2's clock, 0→1
//     over 210 s, hungry ≥ 0.72) gates ONLY the monster-vs-
//     monster chase — never the player hunt, never the aura.
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
  nearestMonsterPrey,
} from './spawns.js';
import {
  MONSTER_FAMILIES,
  EXTRA_FAMILIES,
} from './families.js';
import { PLACED_FIELD_KEYS } from './models.js';
import { WATCHER } from './watcher.js';
import { companionLifeFor } from '../../lib/earth2/operators.js';
import { localHour, isNightAt } from '../../lib/life-clock.js';
import { auraForElement, ELEMENT_AURA } from './elemental-aura.js';
import { lifeAgentsFor } from './monster-life.js'; // the seven-agent
// life line (birth / growth / death / decomposition / diet /
// habits / hunger) — monsterLifeFor is the conductor that reads it

export const MIN_COPIES_PER_FAMILY = 2;
export const MIN_COPIES_PER_DRAGON = 3;
export const PLACED_FIELD = new Set(PLACED_FIELD_KEYS);

// ── Monsters ─────────────────────────────────────────────────
/** True when a family has a placed GLB and can spawn. */
export function isPlacedFamily(key) {
  return PLACED_FIELD.has(String(key));
}

/**
 * The tap-card line naming one family's emanation. Lightning
 * keeps its shared-law wording (red for dragons, white-yellow
 * for lightning monsters); every other element names its own
 * secondary from its ELEMENT_AURA row, so the radius in the
 * line can never drift from the row that fires it.
 */
export function auraNoteFor(element, row, auraKind) {
  if (!row) return 'No aura — this family carries no element';
  if (element === 'lightning') {
    return auraKind === 'dragon'
      ? `Red lightning aura, ${row.radiusM} m — streaks strike and burn inside it`
      : `White-yellow lightning aura, ${row.radiusM} m — streaks strike and burn inside it`;
  }
  const secondaryNote = {
    burn: 'streaks strike and burn inside it',
    pool: 'streaks strike and leave a corrosive pool',
    dot: 'streaks strike and light venom',
    gloom: 'streaks strike and drive the gloom in',
    veil: 'streaks strike and whip up a sand veil',
    chill: 'streaks strike and chill the walker',
  }[row.secondary] || 'streaks strike inside it';
  const name = element.charAt(0).toUpperCase() + element.slice(1);
  return `${name} aura, ${row.radiusM} m — ${secondaryNote}`;
}

/**
 * Life of one monster at the device clock. `m` is a
 * createMonster() record ({ type, element, x, z, hp, state,
 * spotted, dead, active }); `opts` carries { nowMs } and
 * optionally { playerPos } — the hunter's {x, z} when known.
 * Death is combat, predation, territorial-duel, or age
 * (m.deathCause); the dead return after 45 s in-slot
 * (m.respawnAtMs) as the next generation — the 45 s window IS
 * the decomposition window (monster-life.js, the one-death-law
 * call). The seven-agent bundle (birth / growth / death /
 * decomposition / diet / habits / hunger) rides on the life
 * object verbatim from lifeAgentsFor.
 *
 * ELEMENTAL AURA (Merlin, Nov 16 ~00:11 lightning, Nov 16
 * ~01:33-01:34 all seven elements): every monster family
 * emanates its own element — the ELEMENT_AURA table
 * (elemental-aura.js) is the law: lightning 59 m (the shared
 * lib/lightning-aura.js law, white-yellow streaks for lightning
 * non-dragons, red for dragons), fire 24 m, acid 18 m, poison
 * 20 m, shadow 30 m, sand 26 m, frost 16 m. `aura` is the
 * auraForElement() object when the monster is a live source,
 * else null. targetInRange is true / false only when a player
 * position is known (opts.playerPos or m.playerPos); with no
 * target known it reports null, never an invented position. A
 * dead monster's aura is off (null).
 * MONSTER PREY (Merlin, Nov 16 ~01:02): a live lightning
 * source with another monster inside its 59 m aura is hunting
 * prey — `preyTarget` is that monster's id (opts.others carries
 * the field's monster records; without it prey is unknown,
 * null, never invented). The prey-HUNT stays lightning-
 * carrier-only (WS3 savagery law) even though every element
 * now auras — the aura strikes prey, the chase does not.
 * Korus and Ghorrum are never prey.
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
  // The prey / duel reads below still key on this lightning-
  // carrier kind only (WS3 savagery law, preserved); the aura
  // itself is the ELEMENT_AURA row for the family's element.
  const auraKind = !type ? null : type.dragon ? 'dragon' : type.element === 'lightning' ? 'lightning-monster' : null;
  const auraRow = type ? ELEMENT_AURA[type.element] : null;
  let aura = null;
  let auraNote = null;
  if (auraRow && !dead) {
    const targetPos = (opts && opts.playerPos) || m.playerPos || null;
    aura = auraForElement(type.element, { x: m.x || 0, z: m.z || 0 }, targetPos, { kind: auraKind });
    // auraForElement() reports targetInRange false with no target;
    // here "no target known" is null, never invented.
    if (!targetPos) aura = { ...aura, targetInRange: null };
    // Lightning keeps the shared-law colour object (the shape
    // the tap-card already pins); every other element carries
    // its numeric ELEMENT_AURA colour.
    if (type.element === 'lightning' && aura.lightningColor) aura = { ...aura, color: aura.lightningColor };
    auraNote = auraNoteFor(type.element, auraRow, auraKind);
  } else if (dead) {
    auraNote = 'Dead — the aura is off';
  } else {
    auraNote = 'No aura — this family carries no element';
  }
  // Monster prey (Merlin, Nov 16 ~01:02; savagery step 3): the
  // record's own preyTarget is the live chase (140 m stalk, set
  // by stepMonster) — trusted first. Without it, fall back to
  // the nearest prey inside the 59 m aura (opts.others carries
  // the field's monster records; without it prey is unknown).
  let preyTarget = null;
  if (auraKind && !dead && m.preyTarget) preyTarget = m.preyTarget;
  else if (auraKind && !dead && opts && Array.isArray(opts.others)) {
    const prey = nearestMonsterPrey(m, opts.others);
    if (prey) preyTarget = prey.target.id;
  }
  // The seven-agent life line (monster-life.js): birth, growth,
  // death, decomposition, diet, habits, hunger — one bundle,
  // read off the record + the device clock, with the derived
  // preyTarget handed to the diet agent (the record's own chase
  // is trusted first inside the bundle). This function is the
  // conductor that assembles the tap-card life from it.
  const agents = lifeAgentsFor(m, t, { preyTarget });
  // Killer name for the Remains line: resolved from the field
  // when opts.others carries the killer's record, else a plain
  // label by cause — predation: another monster, duel: a rival,
  // combat: the hunter.
  let killerName = null;
  let respawnInS = null;
  if (dead) {
    if (m.killerId && opts && Array.isArray(opts.others)) {
      const killer = opts.others.find((o) => o && o.id === m.killerId);
      if (killer) killerName = (MONSTER_TYPES[killer.type] || {}).name || killer.type;
    }
    if (!killerName) {
      killerName = m.deathCause === 'predation' ? 'another monster'
        : m.deathCause === 'territorial-duel' ? 'a rival'
          : m.deathCause === 'age' ? 'old age' : 'the hunter';
    }
    if (m.respawnAtMs) respawnInS = Math.max(0, Math.ceil((m.respawnAtMs - t) / 1000));
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
    preyTarget,
    // The seven agents, verbatim from the bundle — birth,
    // growth, death, decomposition, diet, habits, hunger.
    birth: agents.birth,
    growth: agents.growth,
    death: agents.death,
    decomp: agents.decomp,
    diet: agents.diet,
    habits: agents.habits,
    hunger: agents.hunger,
    hungry: agents.hunger.hungry,
    generation: agents.generation,
    lifespanDays: agents.birth.lifespanDays,
    lifespanSource: agents.birth.lifespanSource,
    feeding: agents.diet.feedingMode,
    feedingNote: agents.diet.feedingNote,
    territory: 'none',
    territoryNote: 'Monster-vs-monster is real — lightning carriers strike other monsters in their 59 m aura (Nov 16 ~01:02), hunt prey inside 140 m, and duel rivals inside 50 m',
    duel: !dead && m.dueling ? { rivalId: m.dueling } : null,
    water: 'none',
    waterNote: 'No water habitat in code — habitats are element bands',
    breeding: false,
    breedingNote: 'No breeding — the field is seeded on entry (2 of every placed family); each slot’s next generation is born by respawn, 45 s after death',
    groupSize: 2,
    deathCause: dead ? (m.deathCause || 'combat') : null,
    killerName,
    respawnAt: dead ? (m.respawnAtMs || null) : null,
    respawnInS,
    respawnNote: dead
      ? (m.respawnAtMs
        ? 'Returns in 45 s, same family, near where it fell'
        : 'No respawn loop in code — the field refills on re-entry')
      : null,
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
    respawnAt: null,
    respawnNote: 'No respawn — death is permanent',
    aura: null,
    auraNote: 'No aura — Korus keeps his own shadow + sky-bolt boss mechanics; EXEMPT from monster-vs-monster, never prey',
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
    auraNote: 'No aura — Ghorrum is a non-hostile watcher, never a lightning source; EXEMPT from monster-vs-monster, never prey',
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
  if (life.state === 'dead') {
    if (life.deathCause === 'age' && life.respawnAt != null && life.respawnInS != null) {
      return `Remains — ${life.name} · died of age · returns in ${life.respawnInS}s`;
    }
    if (life.respawnAt != null && life.respawnInS != null) {
      return `Remains — ${life.name} · slain by ${life.killerName || 'the hunter'} · returns in ${life.respawnInS}s`;
    }
    return `Remains — ${life.name} — killed in combat, does not return this session`;
  }
  if (life.isAlly) return `${life.stageName || 'Adult'} · Following you · Ally`;
  const parts = [life.name || 'Monster'];
  if (life.growth) parts.push(life.growth.stageName);
  if (life.dragon) parts.push('Dragon');
  if (life.duel) parts.push('Dueling');
  if (life.feeding === 'hunt-prey') parts.push('Hunting prey');
  else if (life.activity === 'ambush-wait') parts.push('Lying in wait');
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
