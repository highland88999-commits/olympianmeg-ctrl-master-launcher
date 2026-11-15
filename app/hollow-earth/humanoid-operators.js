// app/hollow-earth/humanoid-operators.js
// HOLLOW EARTH (OLYMPIAN MONSTERVERSE) — HUMANOID OPERATOR
// AGENTS (Merlin, Nov 14 ~23:25, "Do the same thing we did for
// animals for humanoids please, garments, weapons handling, all
// of it."). The agents that operate Hollow Earth's HUMANOIDS,
// following the Earth 4 / animal-operator pattern: a humanoid's
// life a pure function of (place, kind, device clock) plus the
// live state the zone already owns — NO stored state of their
// own, NO server. The animal operators (operators.js) are NOT
// touched.
//
// HUMANOIDS IN CODE (enumerated exactly — read, never assumed):
//   * Korus — the ultimate boss (1,000 HP, throne (-215, 55),
//     gate 40 kills, spawns.js). A colossal demon-boss figure
//     (korus.glb, 12 m, batch-3 demon boss, models.js).
//   * Ghorrum — the Mountain's Grin (watcher.js): NON-HOSTILE,
//     excluded from combat AND the hunt, never blocks the path,
//     never counts as a monster. An 8 m mountain face
//     (ghorrum.glb) that gazes, blinks and laughs.
//   * the hero — the PLAYER: Kael, the Monster Hunter
//     (characters.js HEROES: monster-hunter, 120 HP, hunting
//     spear 38 + bolt-thrower 30 @ 28 m) or an imported
//     Middle-earth hero (wizard, ranger, elf-archer, dwarf,
//     halfling — same stats as their home program). The player
//     IS that humanoid: buildHeroFigure renders a procedural
//     stand-in (dark leathers + trophy pauldron for Kael) that
//     trails the walker; only Kael has a GLB seat
//     (HERO_MODEL monster-hunter.glb).
//   * upright-figure monster families — A READING, flagged,
//     not a code field: families.js carries NO humanoid form —
//     every family is form 'beast' or 'vortex'. The families
//     below are the ones whose BLURB describes an upright
//     two-legged figure (skeletal figure, robed figures,
//     walkers, sentinel, crowned leader, giant, yeti). Their
//     operators describe that figure; the form field is never
//     rewritten and a non-reading family is never claimed
//     humanoid. See HUMANOID_READING_KEYS + humanoidReadingFor.
//   * NOT humanoids, verified: Jedi Knight and Sith Lord are
//     EXCLUDED from HEROES by characters.js (their home program
//     defines no hero stats — saber colour/length only), so no
//     Jedi/Sith stands anywhere in this realm. The knight /
//     warrior / ranger / wizard weapon mappings in behavior.js
//     (WEAPON_BY_ARCHETYPE) are generic archetype labels for
//     the shared backpack/forge weapon system — knight → sword,
//     hunter → blaster, ranger → bow, wizard → staff, warrior
//     → sword, assassin → dagger, brawler → fists — NOT placed
//     characters. The 24 staged character-class files in
//     models.js STAGED_NOT_WIRED have NO destination in this
//     repo (Merlin decides where each one lives) — they are not
//     inhabitants here. Dragons are creatures, not humanoids —
//     the animal operators already cover them.
//
// GARMENTS (tied to the actual mesh — never invented):
//   * every Hollow Earth figure renders from a rigged GLB
//     only — there is NO procedural figure builder anymore
//     (spawns.js, 2026-10-26 rework) and NO file carries
//     separate cloth geometry: capes/robes are baked into the
//     body mesh (behavior.js cloth note), so garment sway is a
//     small whole-figure rotation (clothSway), never a cloth
//     part. Garments therefore never change in code; condition
//     (pristine / worn / battle-torn) is a DISPLAY read off HP
//     fraction, labelled as such.
//   * Korus: his demon-boss figure, baked. Ghorrum: a mountain
//     face — no garment at all. Heroes: Kael's dark leathers +
//     trophy pauldron (procedural stand-in); imported heroes'
//     garb baked into their Middle-earth GLBs.
//   * upright families: the element-tinted body itself IS the
//     garment (ooze-wreathed, violet robes, smoke) — baked
//     into the family GLB at /models/hollow-earth/<key>.glb.
//
// WEAPONS (the existing combat systems, read never rewritten):
//   * Korus casts: shadow blast 26 dmg @ 4 m + sky-bolt 18 dmg
//     @ 6 m, telegraph 1.2 s, cast every 3.2 / 2.4 / 1.8 s by
//     phase (KORUS_BLAST, korusPhase).
//   * heroes wield their HEROES weapons (Kael: spear 38,
//     bolt-thrower 30 @ 28 m, cd 0.8; the imported five carry
//     their PLAYABLE numbers); equipped backpack weapons
//     override at strike time (page.jsx equippedDamageForSlot).
//     The forge archetype table (behavior.js) maps a fighter
//     archetype to its weapon — knight → sword etc.
//   * upright families wield their ARCHETYPE attack
//     (ARCHETYPES: ranged 22 m, environmental hazard 18 m /
//     3.5 m / telegraph 0.9, melee 2.6 m, short-range 5 m) at
//     the family dmg/speed. NO batch-4 file contains a native
//     weapon mesh or a holster node (behavior.js) — the weapon
//     is the archetype, from the backpack/forge system.
//   * the PLAYER's weapons kill monsters: blade 36 @ 2.4 m,
//     cd 0.45; bolt 28 @ 30 m, cd 0.8 (spawns.js WEAPONS).
//
// DEATH LAW (from code — never invented):
//   * monsters die by COMBAT ONLY: player blade (36) / bolt
//     (28) via damageMonster. A kill pays +12 HP and counts
//     toward the 30-kill shield. A dead monster does NOT
//     respawn in code: zone.js hides it (fig.visible = false)
//     and no refill loop exists — the field empties as the
//     player hunts, until re-entry rebuilds it. (RESPAWN_S =
//     45 exists in spawns.js but no code reads it — flagged
//     in the animal pass, NOT fixed here.)
//   * Korus dies by COMBAT ONLY (1,000 HP via damageKorus);
//     death is PERMANENT — no respawn in code.
//   * Ghorrum NEVER dies (excluded from combat by code).
//   * the hero (player) dies by combat; death wakes the hunter
//     at The Haven, WHOLE (full HP, kills + shield kept —
//     page.jsx). There is NO corpse entity and monsters do not
//     fight each other.
//   * DECOMPOSITION: there is none in code — a dead monster's
//     figure is hidden, not left as remains; no carcass, no
//     sinking, no residue. Recorded, never invented.
//
// BEHAVIOUR LOGIC (Merlin, Nov 14 ~22:59) — per-realm check:
//   * user-hunt branch: APPLIES. Monsters hunt the user once
//     they SPOT them (stepMonster: sight cone / hearing /
//     proximity; ambushers wait to 10 m); they give up after
//     12 s unseen (GIVE_UP_S) and every chase breaks at The
//     Haven's boundary (sanctuary).
//   * user-death / corpse-fight branch: DOES NOT APPLY as a
//     fight. On user death the hunter wakes at The Haven,
//     whole — there is no corpse entity and monsters do not
//     fight each other. Recorded as trail-going-cold at The
//     Haven, never a corpse fight.
//   * territorial rival fights: DO NOT APPLY. Monsters carry
//     NO diet in code (element / attitude / archetype instead)
//     and no monster-vs-monster combat exists.
//   * diet-driven feeding: no diet data — a monster's feeding
//     IS its hunt of the user (attitude + archetype).
//   * water-seeking: DOES NOT APPLY. No water habitat exists
//     in code (habitats are acid / fire / lightning / poison /
//     shadow / sand / frost) and no creature drinks.
//
// POPULATION RULE (Merlin, Nov 14 ~22:57): more than one copy
// of every humanoid, spread out. The field already guarantees
// 2 of every PLACED family (spawnField PASS 1) and 3 of each
// placed dragon — humanoidPopulationAudit() re-runs that check
// for the upright-figure families. Unplaced reading families
// spawn ZERO (no GLB — nothing to render); that is
// model-gated, not a population failure. Korus and Ghorrum are
// singletons BY DESIGN (one boss, one watcher) — flagged, not
// doubled. The hero is a singleton by design too: the player
// IS the hero, one per session.

import {
  MONSTER_TYPES,
  ARCHETYPES,
  KORUS_MAX_HP,
  KORUS_GATE_KILLS,
  KORUS_BLAST,
  KORUS_POS,
  korusPhase,
  GIVE_UP_S,
  SAFE_BASE,
  RESPAWN_S,
  WEAPONS,
} from './spawns.js';
import {
  MONSTER_FAMILIES,
  EXTRA_FAMILIES,
} from './families.js';
import {
  PLACED_FIELD_KEYS,
  GHORRUM_MODEL,
} from './models.js';
import { WATCHER } from './watcher.js';
import {
  HEROES,
  HERO_MODEL,
} from './characters.js';
import {
  WEAPON_BY_ARCHETYPE,
  weaponForArchetype,
} from './behavior.js';
import {
  populationAudit,
  isPlacedFamily,
} from './operators.js';
import { companionLifeFor } from '../../lib/earth2/operators.js';
import { localHour, isNightAt } from '../../lib/life-clock.js';

export const MIN_COPIES_PER_HUMANOID_FAMILY = 2;
export const PLACED_FIELD = new Set(PLACED_FIELD_KEYS);
export { WEAPON_BY_ARCHETYPE, weaponForArchetype };

// ── Enumeration: the upright-figure reading ──────────────────
// families.js has NO humanoid form (every family is 'beast' or
// 'vortex'), so this list is a READING of the blurbs — the
// upright two-legged language in each blurb is quoted as the
// basis. A family is NOT added because its name sounds
// humanoid: 'Sir Oozealot' is excluded (its staged file is a
// slug-like creature), the Verdant Core Golem is excluded
// ('armoured rock' — no upright language), the Horned Ember
// Pack is excluded ('advancing' — no figure language), and
// Vice is excluded (a demon with no figure language).
export const HUMANOID_READING = {
  'slot-01': 'skeletal figure wreathed in green ooze-light',
  'slot-03': 'core-lit tyrant standing the lava ridge',
  'slot-07': 'crowned leader over the lava flow, throwing fire from range',
  'slot-10': 'pale ice yeti standing its iceberg',
  'slot-11': 'tall gaunt smoke figures creeping out of the gloom',
  'slot-21': 'second skeletal watcher, green-lit, tall over the pools',
  'slot-22': 'tall, dark, molten core dripping fire from its hands',
  'slot-26': 'skull-faced smoke walkers advancing slow out of the dark',
  'slot-38': 'gaunt violet-robed figures advancing out of the dark hollow',
  'slot-43': 'smoke giant looming over a lone traveller on the road',
};
export const HUMANOID_READING_KEYS = Object.keys(HUMANOID_READING);

/** The upright-figure families that are NOT counted humanoid, and why. */
export const HUMANOID_READING_EXCLUDED = {
  'slot-27': 'Verdant Core Golem — “armoured rock with a green core” — no upright/figure language',
  'slot-30': 'Horned Ember Pack — “advancing down the dark valley” — no figure language',
  'slot-02': 'Lava Hulk — “hulking demon” — no upright/figure language',
  oozealot: 'Sir Oozealot — the name sounds knightly but the staged file is a slug-like creature',
  vice: 'Vice — “temptation with claws” — a demon with no figure language',
};

/** True when a family key is one of the upright-figure readings. */
export function isHumanoidReading(key) {
  return Object.prototype.hasOwnProperty.call(HUMANOID_READING, String(key));
}

/**
 * The humanoid reading for one family: its family record plus
 * the blurb basis and whether its GLB is placed. Returns null
 * for any family that is not a reading (beast / vortex form —
 * never reclassified).
 */
export function humanoidReadingFor(key) {
  const k = String(key);
  if (!isHumanoidReading(k)) return null;
  const fam = MONSTER_FAMILIES[k] || EXTRA_FAMILIES[k] || null;
  if (!fam) return null;
  return {
    key: k,
    name: fam.name,
    element: fam.element,
    attitude: fam.attitude,
    archetype: fam.archetype,
    habitat: fam.habitat,
    form: fam.form,
    sizeClass: fam.sizeClass,
    hp: fam.hp,
    dmg: fam.dmg,
    speed: fam.speed,
    scaleM: fam.scaleM,
    basis: HUMANOID_READING[k],
    reading: 'upright-figure (blurb reading — families.js carries no humanoid form)',
    placed: isPlacedFamily(k),
    model: `/models/hollow-earth/${k}.glb`,
  };
}

/** Every upright-figure reading, in roster order. */
export function humanoidReadings() {
  return HUMANOID_READING_KEYS.map((k) => humanoidReadingFor(k)).filter(Boolean);
}

// ── Birth Agent ──────────────────────────────────────────────
/**
 * How a humanoid comes to be. Monsters are seeded on entry
 * (spawnField PASS 1: 2 of every placed family in-band);
 * Korus and Ghorrum are placed once, singletons; the hero is
 * the player's pick.
 */
export function birthFor(kind, key) {
  if (kind === 'monster') {
    return {
      mode: 'seeded-on-entry',
      note: 'No birth — spawnField PASS 1 seeds 2 of every placed family in its habitat band on entry; the field refills on re-entry, never mid-session',
    };
  }
  if (kind === 'boss') {
    return { mode: 'singleton', note: 'One boss, placed once on his throne — no birth, no respawn' };
  }
  if (kind === 'watcher') {
    return { mode: 'singleton', note: 'One watcher, blended into the mountain — no birth, no death' };
  }
  if (kind === 'hero') {
    return { mode: 'player-pick', note: 'The player IS this humanoid — picked at the Concourse entry, never spawned' };
  }
  return { mode: 'none', note: 'No birth law in code for this kind' };
}

// ── Growth Agent ─────────────────────────────────────────────
/**
 * Growth state: every Hollow Earth humanoid is placed as an
 * adult — there is no growth in code (no juvenile monster, no
 * child figure). Size is the family's scaleM / the figure's
 * placed height.
 */
export function growthFor(kind, record) {
  if (kind === 'boss') {
    return { stage: 'adult', stageName: 'Adult', fraction: 1, sizeM: 12, note: 'Adult — Korus stands 12 m on his throne (KORUS_MODEL)' };
  }
  if (kind === 'watcher') {
    return { stage: 'adult', stageName: 'Adult', fraction: 1, sizeM: WATCHER.scaleM, note: 'Adult — Ghorrum stands 8 m in the mountain (watcher.js)' };
  }
  if (kind === 'hero') {
    const hero = HEROES[(record && (record.heroKey || record.key)) || ''] || null;
    return { stage: 'adult', stageName: 'Adult', fraction: 1, sizeM: hero ? hero.height : 1.9, note: 'Adult — the picked hero, at its HEROES height' };
  }
  const type = record && record.type ? MONSTER_TYPES[record.type] : null;
  return {
    stage: 'adult', stageName: 'Adult', fraction: 1,
    sizeM: type ? type.scaleM : 2.6,
    note: 'Placed as an adult at the family scaleM — monsters never grow in code',
  };
}

// ── Death Agent (combat only — read, never rewritten) ───────
export const DEATH_CAUSES = Object.freeze(['combat']);

/**
 * Death state for a humanoid. Monsters: combat, permanent for
 * the session (no respawn loop in code — RESPAWN_S exists but
 * no code reads it, flagged). Korus: combat, permanent.
 * Ghorrum: never dies. Hero: the player's death — wakes at
 * The Haven whole (see userDeathFor).
 */
export function deathFor(kind, record, opts = {}) {
  if (kind === 'watcher') {
    return {
      state: 'alive',
      cause: 'none',
      note: 'Ghorrum never dies — excluded from combat by code',
    };
  }
  if (kind === 'boss') {
    const dead = !!record && record.dead === true;
    return {
      state: dead ? 'dead' : 'alive',
      cause: dead ? 'combat' : null,
      respawnAt: null,
      respawnNote: dead ? 'No respawn in code — death is permanent' : null,
      note: dead ? 'Dead — the throne stands empty' : 'Alive — dies once, by combat, when the gate is open',
    };
  }
  if (kind === 'hero') {
    const dead = !!record && record.alive === false;
    return {
      state: dead ? 'dead' : 'alive',
      cause: dead ? 'combat' : null,
      respawnAt: null,
      note: dead
        ? 'Fallen — wakes at The Haven, whole: full HP, kills and shield kept'
        : 'Alive — the player',
    };
  }
  // Monster.
  const dead = !!record && record.dead === true;
  if (!dead) return { state: 'alive', cause: null, respawnAt: null, respawnNote: null };
  return {
    state: 'dead',
    cause: 'combat',
    respawnAt: null,
    respawnNote: `No respawn loop in code — the field refills on re-entry (RESPAWN_S = ${RESPAWN_S} exists in spawns.js but no code reads it — flagged, not fixed here)`,
    note: 'Killed in combat — does not return this session',
  };
}

// ── Decomposition Agent ──────────────────────────────────────
/**
 * What a body does after death: NOTHING in Hollow Earth code.
 * A dead monster's figure is hidden (zone.js fig.visible =
 * false); Korus's figure is hidden too. No carcass, no
 * sinking, no skeletal residue, no remains entity. Recorded,
 * never invented.
 */
export function decompositionFor(kind) {
  if (kind === 'boss') {
    return {
      remains: 'none',
      note: 'No remains in code — Korus’s figure hides on death; the throne stands empty',
    };
  }
  if (kind === 'watcher' || kind === 'hero') {
    return {
      remains: 'none',
      note: kind === 'watcher'
        ? 'Ghorrum never dies, so no remains ever exist'
        : 'The player wakes at The Haven whole — no remains',
    };
  }
  return {
    remains: 'none',
    note: 'No decomposition in code — the figure is hidden on death (fig.visible = false); no carcass, no residue',
  };
}

// ── Diet / Feeding Agent ─────────────────────────────────────
/**
 * What a humanoid does for food. Monsters have NO diet in
 * code (element / attitude / archetype instead) — their
 * feeding IS the hunt of the user. Korus, Ghorrum and the hero
 * have no diet either. Where a branch has no coded basis it
 * is recorded as not-applicable, never invented.
 */
export function dietFor(kind, record) {
  if (kind === 'monster') {
    const spotted = !!record && !!record.spotted && !record.dead;
    const ambush = record && MONSTER_TYPES[record.type] && MONSTER_TYPES[record.type].attitude === 'ambush';
    return {
      diet: null,
      action: !record || record.dead ? 'none' : spotted ? 'hunt-user' : ambush ? 'ambush-wait' : 'roam',
      note: spotted
        ? 'Hunting the user — spotted by sight, hearing or proximity'
        : ambush
          ? 'Lying in wait — ambushers strike inside 10 m'
          : 'No diet in code — feeding IS the hunt; unspotted monsters roam',
    };
  }
  if (kind === 'boss') {
    const combat = !!record && record.awake === true && !record.dead;
    return {
      diet: null,
      action: combat ? 'hunt-user' : 'none',
      note: combat
        ? 'Casting shadow + sky-bolt at the user from his throne'
        : 'No diet in code — dormant on his throne until the 40-kill gate opens',
    };
  }
  return {
    diet: null,
    action: 'none',
    note: kind === 'watcher'
      ? 'Non-hostile watcher — never hunts, never counts as a monster'
      : 'The player — no diet law in code',
  };
}

// ── Garment Agent ────────────────────────────────────────────
/** Garment condition as a DISPLAY read off HP fraction — the
 *  renderer never swaps cloth, so this is labelled, not coded. */
export function garmentCondition(hp, maxHp) {
  const f = maxHp > 0 ? hp / maxHp : 1;
  if (f <= 0) return 'fallen';
  if (f <= 0.33) return 'battle-torn';
  if (f <= 0.66) return 'worn';
  return 'pristine';
}

/**
 * What a humanoid wears, tied to the mesh the scene already
 * uses. Every figure here is a rigged GLB with its garment
 * BAKED INTO the body mesh (behavior.js cloth note: no file
 * carries separate cloth geometry) — so garments never change
 * in code, and damage never shows as torn cloth. The only
 * garment events are the hit flash (monster figures) and the
 * figure hiding on death.
 */
export function garmentFor(kind, record) {
  if (kind === 'boss') {
    const hp = record ? record.hp : KORUS_MAX_HP;
    return {
      kind: 'boss',
      model: '/models/hollow-earth/korus.glb',
      modelHeight: 12,
      pieces: [{
        piece: 'Demon-boss figure',
        mesh: 'Rigged korus.glb, 12 m — batch-3 demon boss (models.js)',
        note: 'Garment baked into the GLB — no separate cloth mesh in code',
      }],
      condition: garmentCondition(hp, KORUS_MAX_HP),
      conditionBasis: 'display — HP fraction; the renderer never swaps cloth',
      changeNote: 'Never changes in code',
      damageNote: 'Combat damage shows as HP loss and the figure hiding on death — never as torn cloth',
    };
  }
  if (kind === 'watcher') {
    return {
      kind: 'watcher',
      model: GHORRUM_MODEL.url,
      modelHeight: GHORRUM_MODEL.height,
      pieces: [{
        piece: 'Mountain face',
        mesh: 'Rigged ghorrum.glb, 8 m, blended into the mountain ranges',
        note: 'No garment — a grin in the mountain, not a clothed figure',
      }],
      condition: 'pristine',
      conditionBasis: 'no damage path in code — Ghorrum is never struck',
      changeNote: 'Never changes in code',
      damageNote: 'No damage path exists for Ghorrum in code',
    };
  }
  if (kind === 'hero') {
    const hero = HEROES[(record && (record.heroKey || record.key)) || ''] || null;
    const isKael = hero && hero.key === 'monster-hunter';
    return {
      kind: 'hero',
      model: isKael ? HERO_MODEL['monster-hunter'].url : null,
      modelHeight: hero ? hero.height : null,
      pieces: [{
        piece: isKael ? 'Dark leathers + trophy pauldron' : 'Figure as modelled',
        mesh: isKael
          ? 'Procedural stand-in (buildHeroFigure): dark-leather coat 0x2e2620, horned trophy pauldron on the left shoulder; monster-hunter.glb swaps in when it lands'
          : 'Procedural stand-in (buildHeroFigure): coat 0x3a4a5a; the imported hero’s garb lives in its Middle-earth GLB — no HE GLB seat exists for it',
        note: 'The hero’s garb is the stand-in / the baked GLB — no separate cloth mesh in code; damage shows as HP loss, never as torn cloth',
      }],
      condition: 'pristine',
      conditionBasis: 'no damage path for cloth in code',
      changeNote: 'Never changes in code',
      damageNote: 'The player shows damage as HP loss, not garment damage',
    };
  }
  // Monster (upright-figure reading or otherwise).
  const type = record && record.type ? MONSTER_TYPES[record.type] : null;
  const reading = record && record.type ? humanoidReadingFor(record.type) : null;
  const hp = record && Number.isFinite(record.hp) ? record.hp : (type ? type.hp : 0);
  return {
    kind: 'monster',
    type: record ? record.type : null,
    model: record ? `/models/hollow-earth/${record.type}.glb` : null,
    modelHeight: type ? type.scaleM : null,
    pieces: [{
      piece: reading ? `${reading.element}-wreathed figure` : 'Monster figure',
      mesh: record ? `Rigged ${record.type}.glb at scaleM ${type ? type.scaleM : '?'}` : 'No record',
      note: reading
        ? `The ${reading.element} tint IS the garment — ${reading.basis}; baked into the GLB, no separate cloth mesh (behavior.js cloth note)`
        : 'Not an upright-figure reading — beast / vortex form; garment is the body itself, baked into the GLB',
    }],
    condition: garmentCondition(hp, type ? type.hp : 0),
    conditionBasis: 'display — HP fraction; the renderer never swaps cloth',
    changeNote: 'Never changes in code — the figure hides whole on death (fig.visible = false)',
    damageNote: 'Combat damage shows as the hit flash and the figure hiding on death — never as torn cloth',
  };
}

// ── Weapons Agent ────────────────────────────────────────────
/**
 * How a humanoid wields what it carries — grip / stance /
 * readiness by state, weapon condition, and the weapons that
 * kill it. The existing combat systems are read, never
 * rewritten: Korus from KORUS_BLAST, heroes from HEROES,
 * families from ARCHETYPES + MONSTER_TYPES, the player's
 * killing weapons from WEAPONS.
 */
export function weaponFor(kind, record, opts = {}) {
  if (kind === 'boss') {
    const hp = record ? record.hp : KORUS_MAX_HP;
    const phase = korusPhase(hp);
    const state = !record ? 'dormant' : record.dead ? 'dead' : record.dormant ? 'dormant' : record.awake ? 'combat' : 'ready';
    return {
      kind: 'boss',
      carried: {
        id: 'korus-shadow-bolt',
        name: 'Shadow + sky-bolt',
        mesh: 'No weapon mesh — Korus casts from his throne (no native weapon mesh in any batch-4 file, behavior.js)',
        grip: 'Throne-cast — both hands, telegraphed',
        shadow: { dmg: KORUS_BLAST.shadowDmg, radiusM: KORUS_BLAST.shadowR },
        bolt: { dmg: KORUS_BLAST.boltDmg, radiusM: KORUS_BLAST.boltR },
        telegraphS: KORUS_BLAST.telegraph,
        castIntervalS: phase === 1 ? 3.2 : phase === 2 ? 2.4 : 1.8,
        stance: {
          readiness: state === 'combat' ? 'casting' : state === 'dead' ? 'fallen' : state === 'ready' ? 'rising' : 'seated-dormant',
          note: state === 'combat'
            ? `Casting — phase ${phase}, shadow + sky-bolt every ${phase === 1 ? 3.2 : phase === 2 ? 2.4 : 1.8} s after a 1.2 s telegraph`
            : state === 'ready'
              ? 'Awake on the throne — approach within 30 m to wake him'
              : 'Dormant on his throne until the 40-kill gate opens',
        },
      },
      killsBy: {
        blade: { dmg: WEAPONS.blade.dmg, rangeM: WEAPONS.blade.range, cooldownS: WEAPONS.blade.cooldown },
        bolt: { dmg: WEAPONS.bolt.dmg, rangeM: WEAPONS.bolt.range, cooldownS: WEAPONS.bolt.cooldown },
        note: 'The player’s blade (36 @ 2.4 m) and bolt (28 @ 30 m) via damageKorus — only once awake',
      },
      condition: garmentCondition(hp, KORUS_MAX_HP),
      conditionBasis: 'display — HP fraction; the cast never weakens or breaks in code',
    };
  }
  if (kind === 'watcher') {
    return {
      kind: 'watcher',
      carried: null,
      carriedNote: 'Ghorrum carries NO weapon — non-hostile watcher, excluded from combat by code; his only acts are gaze, blink and laughter',
      killsBy: null,
      condition: 'pristine',
      conditionBasis: 'no combat path in code',
    };
  }
  if (kind === 'hero') {
    const hero = HEROES[(record && (record.heroKey || record.key)) || ''] || null;
    if (!hero) return { kind: 'hero', carried: null, note: 'No hero picked' };
    return {
      kind: 'hero',
      heroKey: hero.key,
      carried: {
        melee: { label: hero.meleeLabel, dmg: hero.meleeDmg, class: hero.meleeClass || null },
        ranged: { ...hero.ranged, label: hero.rangedLabel },
        note: 'The player’s weapons — melee + ranged hand from HEROES (characters.js); equipped backpack weapons override at strike time (page.jsx equippedDamageForSlot); the forge archetype table maps knight → sword, hunter → blaster, ranger → bow, wizard → staff, warrior → sword, assassin → dagger, brawler → fists (behavior.js WEAPON_BY_ARCHETYPE)',
      },
      archetypeWeapon: weaponForArchetype(hero.key === 'monster-hunter' ? 'hunter' : hero.key === 'wizard' ? 'wizard' : hero.key === 'ranger' || hero.key === 'elf-archer' ? 'ranger' : hero.key === 'dwarf' ? 'warrior' : hero.key === 'halfling' ? 'assassin' : 'warrior'),
      stance: {
        readiness: record && record.alive === false ? 'fallen' : 'ready',
        note: 'The hero figure trails the walker (page.jsx) — weapon in hand, reticle by backpack law',
      },
      condition: 'pristine',
      conditionBasis: 'player weapons never break in code',
    };
  }
  // Monster.
  const type = record && record.type ? MONSTER_TYPES[record.type] : null;
  const reading = record && record.type ? humanoidReadingFor(record.type) : null;
  const arch = type ? ARCHETYPES[type.archetype] : null;
  const state = !record || record.dead ? 'dead' : record.state === 'ambush' ? 'ambush-wait' : record.spotted ? record.state || 'stalk' : 'roam';
  return {
    kind: 'monster',
    type: record ? record.type : null,
    humanoidReading: !!reading,
    carried: type ? {
      id: `${record.type}-archetype`,
      name: `${type.archetype} attack`,
      mesh: 'No native weapon mesh — no batch-4 file contains a weapon mesh or a holster node (behavior.js); the weapon is the archetype, from the backpack/forge system',
      grip: 'Archetype-held — the family’s element is its weapon',
      archetype: type.archetype,
      rangeM: arch ? arch.range : null,
      hazard: arch ? !!arch.hazard : false,
      hazardR: arch && arch.hazardR ? arch.hazardR : null,
      telegraphS: arch && arch.telegraph ? arch.telegraph : null,
      dmg: type.dmg,
      speed: type.speed,
      chargeBurst: type.attitude === 'charge' ? '1.7× speed while charging (stepMonster)' : null,
      stance: {
        readiness: state === 'dead' ? 'fallen' : state === 'ambush-wait' ? 'lying-in-wait' : state === 'charge' ? 'charging' : record && record.spotted ? 'hunting' : 'roaming',
        note: state === 'ambush-wait'
          ? 'Lying in wait — ambushers strike inside 10 m'
          : state === 'charge'
            ? 'Charging — burst at 1.7× speed'
            : record && record.spotted
              ? 'Hunting the user — spotted by sight, hearing or proximity'
              : 'Roaming its habitat band',
      },
    } : null,
    killsBy: {
      blade: { dmg: WEAPONS.blade.dmg, rangeM: WEAPONS.blade.range, cooldownS: WEAPONS.blade.cooldown },
      bolt: { dmg: WEAPONS.bolt.dmg, rangeM: WEAPONS.bolt.range, cooldownS: WEAPONS.bolt.cooldown },
      note: 'The player’s blade (36 @ 2.4 m) and bolt (28 @ 30 m) are what kill a monster, via damageMonster; a kill pays +12 HP toward the 30-kill shield',
    },
    condition: garmentCondition(record && Number.isFinite(record.hp) ? record.hp : (type ? type.hp : 0), type ? type.hp : 0),
    conditionBasis: 'display — HP fraction; archetype attacks never weaken in code',
  };
}

// ── Habits Agent ─────────────────────────────────────────────
/**
 * What a humanoid is doing right now. Monster activity is its
 * hunt state; Korus's is his boss state; Ghorrum watches
 * (gaze / blink / laugh cycles); the hero follows the walker.
 */
export function habitsFor(kind, record, now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const base = {
    hour: Math.round(localHour(new Date(t)) * 10) / 10,
    night: isNightAt(new Date(t)),
  };
  if (kind === 'monster') {
    const type = record && record.type ? MONSTER_TYPES[record.type] : null;
    const activity = !record || record.dead
      ? 'dead'
      : record.state === 'ambush' ? 'ambush-wait' : record.spotted ? (record.state || 'stalk') : 'roam';
    return {
      ...base,
      activity,
      moving: !!record && !!record.spotted && record.state !== 'ambush',
      note: activity === 'dead'
        ? 'Dead — does not hunt (and does not return this session)'
        : activity === 'ambush-wait'
          ? 'Lying in wait — ambushers strike inside 10 m'
          : record && record.spotted
            ? 'Hunting the user — spotted by sight, hearing or proximity'
            : 'Roaming its habitat band',
      giveUpS: GIVE_UP_S,
    };
  }
  if (kind === 'boss') {
    const state = !record ? 'dormant' : record.dead ? 'dead' : record.dormant ? 'dormant' : record.awake ? 'combat' : 'ready';
    return {
      ...base,
      activity: state === 'combat' ? 'combat' : state === 'dead' ? 'dead' : 'waiting',
      moving: false,
      note: state === 'combat'
        ? 'Casting shadow + sky-bolt at the user from his throne'
        : state === 'dead'
          ? 'Dead — the throne stands empty'
          : state === 'ready'
            ? 'Waiting — approach within 30 m to wake him'
            : 'Dormant — the gate has not opened',
    };
  }
  if (kind === 'watcher') {
    return {
      ...base,
      activity: 'watching',
      moving: false,
      note: 'Watching — gaze follows passersby, slow blink, a deep laugh every 25–45 s; never hostile',
    };
  }
  return {
    ...base,
    activity: record && record.alive === false ? 'dead' : 'follow',
    moving: true,
    note: 'The hero figure trails the walker — the player, not an NPC',
  };
}

// ── Territory + User-hunt Agents ─────────────────────────────
/**
 * Territory: monsters hold NO territory and NEVER fight each
 * other (no diet, no monster-vs-monster combat in code).
 * Korus holds his throne; Ghorrum holds no territory.
 */
export function territoryFor(kind) {
  if (kind === 'boss') {
    return { mode: 'boss-throne', note: 'One boss, one throne — a singleton by design' };
  }
  if (kind === 'monster') {
    return { mode: 'none', note: 'No diet, no monster-vs-monster combat in code' };
  }
  return { mode: 'none', note: kind === 'watcher' ? 'Excluded from combat and the hunt by code' : 'The player holds no territory' };
}

/**
 * The user-hunt reading for a monster: spotted state, the
 * 12 s give-up, and the Haven sanctuary break.
 */
export function userHuntFor(monster) {
  return {
    spotted: !!monster && !!monster.spotted && !monster.dead,
    giveUpS: GIVE_UP_S,
    haven: { ...SAFE_BASE, note: 'Every chase breaks at The Haven’s boundary — the hunter inside is untouchable' },
    note: 'Monsters hunt once they spot the user (sight cone / hearing / proximity; ambushers wait to 10 m); unseen for 12 s and the trail goes cold',
  };
}

/**
 * User death, pure: the hunter wakes at The Haven, WHOLE —
 * full HP, kills and shield kept (page.jsx). There is NO
 * corpse entity and monsters do not fight each other — the
 * trail simply goes cold at The Haven. Recorded, never invented.
 */
export function userDeathFor() {
  return {
    respawn: 'The Haven',
    respawnPos: { x: SAFE_BASE.x, z: SAFE_BASE.z },
    hp: 'full',
    killsKept: true,
    shieldKept: true,
    corpseFight: 'none — no corpse entity; monsters do not fight each other',
    note: 'Death costs progress nowhere — the hunter wakes at The Haven whole (spawns.js SAFE_BASE / page.jsx)',
  };
}

// ── Population Agent ─────────────────────────────────────────
/**
 * Humanoid population audit over a spawnField() record list:
 * the full-field audit (operators.js populationAudit) plus the
 * upright-figure families filtered out of it. Per reading
 * family: live copies, whether the 2-copy minimum holds;
 * unplaced reading families count zero by design —
 * model-gated, reported separately, never silently counted as
 * a failure. Korus, Ghorrum and the hero are singletons by
 * design.
 */
export function humanoidPopulationAudit(records) {
  const full = populationAudit(records);
  const reading = {};
  const modelGated = [];
  for (const key of HUMANOID_READING_KEYS) {
    const f = full.families[key];
    if (!f) continue;
    reading[key] = f;
    if (!f.placed) modelGated.push(key);
  }
  return {
    minCopiesPerFamily: MIN_COPIES_PER_HUMANOID_FAMILY,
    total: full.total,
    families: full.families,
    dragons: full.dragons,
    reading,
    modelGatedReading: modelGated,
    placedReading: HUMANOID_READING_KEYS.filter((k) => isPlacedFamily(k)),
    korus: { count: 1, note: 'One boss by design' },
    watcher: { count: 1, note: 'One watcher by design' },
    hero: { count: 1, note: 'The player IS the hero — one per session by design' },
    meetsRule: full.meetsRule,
    meetsReadingRule: Object.values(reading).every((f) => f.meetsMin),
  };
}

// ── Conductor ────────────────────────────────────────────────
/**
 * The full life state of one Hollow Earth humanoid. `h`
 * carries { kind: 'monster' | 'boss' | 'watcher' | 'hero' |
 * 'companion' } — a monster record, a Korus record, the
 * watcher, a hero pick, or a backpack dino item. `opts`
 * carries { totalKills, nowMs }. Pure for monsters / boss /
 * watcher / hero; companions read the backpack record.
 */
export function lifeFor(h, now = Date.now(), opts = {}) {
  if (!h) return null;
  if (h.kind === 'companion' || (h.meta && h.meta.species)) {
    return companionLifeFor(h, now);
  }
  if (h.kind === 'boss' || h === 'korus'
    || (typeof h === 'object' && ('gateOpen' in h || ('dormant' in h && 'awake' in h)))) {
    // A raw createKorus() record carries no kind — its shape
    // (gateOpen / dormant + awake) is the boss signature.
    return korusLifeFor(h === 'korus' ? null : h, now, opts);
  }
  if (h.kind === 'watcher' || h === 'ghorrum') {
    return watcherLifeFor(now);
  }
  if (h.kind === 'hero' || h.heroKey || (h.key && HEROES[h.key])) {
    return heroLifeFor(h, now, opts);
  }
  return monsterLifeFor(h, now, opts);
}

/** Life of one upright-figure (or any) monster, with garment + weapon. */
export function monsterLifeFor(m, now = Date.now(), opts = {}) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const type = MONSTER_TYPES[m.type] || null;
  const name = type ? type.name : String(m.type || 'monster');
  const reading = isHumanoidReading(m.type);
  const dead = !!m.dead;
  const spotted = !!m.spotted && !dead;
  const habits = habitsFor('monster', m, t);
  const diet = dietFor('monster', m);
  const death = deathFor('monster', m, opts);
  const decomp = decompositionFor('monster');
  const garment = garmentFor('monster', m);
  const weapon = weaponFor('monster', m, opts);
  const life = {
    realm: 'hollow-earth',
    kind: 'monster',
    humanoidKind: 'monster',
    humanoidReading: reading,
    type: m.type,
    name,
    element: type ? type.element : (m.element || null),
    attitude: type ? type.attitude : null,
    archetype: type ? type.archetype : null,
    habitat: type ? type.habitat : null,
    dragon: !!(type && type.dragon),
    stage: 'adult',
    stageName: 'Adult',
    sizeM: type ? type.scaleM : null,
    state: dead ? 'dead' : 'alive',
    activity: habits.activity,
    moving: habits.moving,
    role: reading ? 'Upright figure' : 'Monster',
    hp: m.hp != null ? m.hp : (type ? type.hp : 0),
    maxHp: type ? type.hp : 0,
    spotted,
    deathCause: death.cause,
    decomp,
    feeding: diet.action,
    feedingNote: diet.note,
    territory: territoryFor('monster').mode,
    territoryNote: territoryFor('monster').note,
    duel: null,
    water: 'none',
    waterNote: 'No water habitat in code — habitats are element bands',
    breeding: false,
    breedingNote: 'No breeding — the field is seeded on entry (2 of every placed family)',
    groupSize: 2,
    garment: {
      summary: reading
        ? `${type ? type.element : ''}-wreathed figure`
        : 'Figure as modelled — garment baked into the GLB',
      condition: garment.condition,
      pieces: garment.pieces,
    },
    weapon: weapon.carried
      ? {
        summary: `${type.archetype} · ${type.dmg} dmg · ${ARCHETYPES[type.archetype].range} m`,
        readiness: weapon.carried.stance.readiness,
        carried: weapon.carried,
      }
      : { summary: 'Unarmed', readiness: 'at-rest', carried: null },
    giveUpS: GIVE_UP_S,
    hour: habits.hour,
    night: habits.night,
  };
  life.line = lifeLine(life);
  return life;
}

/** Life of the boss, with garment + weapon. */
export function korusLifeFor(korus, now = Date.now(), opts = {}) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const state = !korus ? 'dormant' : korus.dead ? 'dead' : korus.dormant ? 'dormant' : korus.awake ? 'combat' : 'ready';
  const gateOpen = (opts.totalKills || 0) >= KORUS_GATE_KILLS;
  const death = deathFor('boss', korus, opts);
  const decomp = decompositionFor('boss');
  const diet = dietFor('boss', korus);
  const habits = habitsFor('boss', korus, t);
  const garment = garmentFor('boss', korus);
  const weapon = weaponFor('boss', korus, opts);
  const life = {
    realm: 'hollow-earth',
    kind: 'boss',
    humanoidKind: 'boss',
    name: 'Korus',
    stage: 'adult',
    stageName: 'Adult',
    sizeM: 12,
    state,
    activity: habits.activity,
    moving: false,
    role: 'Boss · Throne',
    hp: korus ? korus.hp : KORUS_MAX_HP,
    maxHp: KORUS_MAX_HP,
    phase: korus ? korusPhase(korus.hp) : 1,
    gateKills: KORUS_GATE_KILLS,
    gateOpen,
    wakeDistM: 30,
    throne: { ...KORUS_POS },
    deathCause: death.cause,
    decomp,
    feeding: diet.action,
    feedingNote: diet.note,
    territory: territoryFor('boss').mode,
    territoryNote: territoryFor('boss').note,
    duel: null,
    water: 'none',
    waterNote: 'No water habitat in code',
    breeding: false,
    breedingNote: birthFor('boss').note,
    groupSize: 1,
    garment: {
      summary: 'Demon-boss figure',
      condition: garment.condition,
      pieces: garment.pieces,
    },
    weapon: {
      summary: `Shadow ${KORUS_BLAST.shadowDmg} · bolt ${KORUS_BLAST.boltDmg}`,
      readiness: weapon.carried.stance.readiness,
      carried: weapon.carried,
    },
    hour: habits.hour,
    night: habits.night,
  };
  life.line = lifeLine(life);
  return life;
}

/** Life of the watcher: alive, non-hostile, never dies. */
export function watcherLifeFor(now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const habits = habitsFor('watcher', null, t);
  const garment = garmentFor('watcher', null);
  const weapon = weaponFor('watcher', null);
  const life = {
    realm: 'hollow-earth',
    kind: 'watcher',
    humanoidKind: 'watcher',
    name: WATCHER.name,
    stage: 'adult',
    stageName: 'Adult',
    sizeM: WATCHER.scaleM,
    state: 'alive',
    activity: habits.activity,
    moving: false,
    role: 'Watcher · Mountain',
    hp: null,
    maxHp: null,
    deathCause: 'none',
    decomp: decompositionFor('watcher'),
    feeding: 'none',
    feedingNote: 'Non-hostile watcher — never hunts, never counts as a monster',
    territory: 'none',
    territoryNote: 'Excluded from combat and the hunt by code',
    duel: null,
    water: 'none',
    waterNote: 'No drink law in code',
    breeding: false,
    breedingNote: birthFor('watcher').note,
    groupSize: 1,
    garment: {
      summary: 'Mountain face — no garment',
      condition: garment.condition,
      pieces: garment.pieces,
    },
    weapon: {
      summary: 'Unarmed — never attacks',
      readiness: 'at-rest',
      carried: null,
    },
    hour: habits.hour,
    night: habits.night,
  };
  life.line = lifeLine(life);
  return life;
}

/** Life of the hero — the player as a humanoid. */
export function heroLifeFor(hero, now = Date.now(), opts = {}) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const key = (hero && (hero.heroKey || hero.key)) || null;
  const def = key ? HEROES[key] : null;
  const growth = growthFor('hero', { heroKey: key });
  const habits = habitsFor('hero', hero, t);
  const garment = garmentFor('hero', { heroKey: key });
  const weapon = weaponFor('hero', { heroKey: key }, opts);
  const life = {
    realm: 'hollow-earth',
    kind: 'hero',
    humanoidKind: 'hero',
    heroKey: key,
    name: def ? def.name : 'Hero',
    stage: growth.stage,
    stageName: growth.stageName,
    sizeM: growth.sizeM,
    state: hero && hero.alive === false ? 'dead' : 'alive',
    activity: habits.activity,
    moving: habits.moving,
    role: 'You — the player',
    hp: hero && Number.isFinite(hero.hp) ? hero.hp : (def ? def.maxHp : null),
    maxHp: def ? def.maxHp : null,
    deathCause: hero && hero.alive === false ? 'combat' : null,
    decomp: decompositionFor('hero'),
    feeding: 'none',
    feedingNote: 'The player — no diet law in code',
    territory: 'none',
    territoryNote: 'The player holds no territory',
    duel: null,
    water: 'none',
    waterNote: 'No water habitat in code',
    breeding: false,
    breedingNote: birthFor('hero').note,
    groupSize: 1,
    garment: {
      summary: def && def.key === 'monster-hunter' ? 'Dark leathers · trophy pauldron' : 'Figure as modelled',
      condition: garment.condition,
      pieces: garment.pieces,
    },
    weapon: weapon.carried
      ? {
        summary: `${weapon.carried.melee.label} ${weapon.carried.melee.dmg} · ${weapon.carried.ranged.label} ${weapon.carried.ranged.dmg}`,
        readiness: weapon.stance.readiness,
        carried: weapon.carried,
      }
      : { summary: 'No hero picked', readiness: 'at-rest', carried: null },
    hour: habits.hour,
    night: habits.night,
  };
  life.line = lifeLine(life);
  return life;
}

/**
 * The tap-card life line, Earth 4 style: "stage · activity ·
 * role · garment · weapon", or "Remains — <stage>" for the dead.
 */
export function lifeLine(life) {
  if (!life) return '';
  if (life.kind === 'watcher') return `${life.name} · Watching · never hostile`;
  if (life.kind === 'boss') {
    if (life.state === 'dead') return 'Remains — Korus — the throne stands empty';
    if (life.state === 'dormant') return `Adult · Dormant · Boss · Demon-boss figure · Shadow + sky-bolt — gate opens at ${life.gateKills} kills`;
    if (life.state === 'ready') return 'Adult · Waiting · Boss · Demon-boss figure · Shadow + sky-bolt — approach within 30 m to wake him';
    return `Adult · Combat · Boss · Demon-boss figure · Shadow ${KORUS_BLAST.shadowDmg} / bolt ${KORUS_BLAST.boltDmg} · ${life.hp}/${life.maxHp} HP`;
  }
  if (life.state === 'dead') {
    return `Remains — ${life.stageName} ${life.name} — killed in combat, does not return this session`;
  }
  if (life.isAlly) return `${life.stageName || 'Adult'} · Following you · Ally`;
  if (life.kind === 'hero') {
    return `${life.stageName} · Following you · You — the player · ${life.garment.summary} · ${life.weapon.summary}`;
  }
  const parts = [
    life.stageName || 'Adult',
    life.activity === 'ambush-wait' ? 'Lying in wait' : life.spotted ? 'Hunting you' : 'Roaming',
    life.role || 'Monster',
    (life.garment && life.garment.summary) || 'Figure as modelled',
    (life.weapon && life.weapon.summary) || 'Unarmed',
  ];
  if (life.dragon) parts.push('Dragon');
  if (life.element) parts.push(life.element);
  return parts.join(' · ');
}

/**
 * Enrich zone output with life: adds `life` to every humanoid
 * (mutates and returns the same array). The zone's records are
 * untouched — the operators layer the life line on top.
 */
export function enrichHumanoids(humanoids, now = Date.now(), opts = {}) {
  if (!Array.isArray(humanoids)) return humanoids;
  const t = now instanceof Date ? now.getTime() : Number(now);
  for (const h of humanoids) {
    if (!h || typeof h !== 'object') continue;
    h.life = lifeFor(h, t, opts);
  }
  return humanoids;
}
