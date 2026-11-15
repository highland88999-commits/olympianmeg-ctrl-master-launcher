// app/middle-earth/humanoid-operators.js
// MIDDLE-EARTH — HUMANOID OPERATOR AGENTS (Merlin, Nov 14 ~23:25,
// "Do the same thing we did for animals for humanoids please,
// garments, weapons handling, all of it."). The agents that
// operate Middle-earth's HUMANOIDS, following the Earth 4 /
// animal-operator pattern: a humanoid's life a pure function of
// (place, kind, device clock) plus the live state the zone
// already owns — NO stored state of their own, NO server. The
// animal operators (operators.js) are NOT touched.
//
// HUMANOIDS IN CODE (enumerated exactly — read, never assumed):
//   * orcs — warrior (60 HP) + captain (150 HP), per pod
//     (orcs.js spawnField: camps + rovers across the whole
//     disc; ORC_KINDS). Procedural hunched brutes (buildOrcFigure:
//     green skin, dark rags, crude blade in the side -1 fist;
//     captains add a red crest + iron shoulder pads), with a GLB
//     slot (ORC_MODELS: warrior orc-warrior.glb, captain
//     orc-brute.glb) that hides the brute whole when it lands.
//   * Saruman — the boss (600 HP, boss.js; gate 30 kills).
//     Tall white figure: floor-length white robe, white hair
//     and beard, black staff crowned with a cold light; the
//     white-wizard GLB (fitted 1.95 m) swaps over it.
//   * placed folk (data.js characters, creature NOT set):
//     halfling + wizard (Shire), elf-archer + ranger
//     (Rivendell), dwarf (Gondor), elf-warden = elf-archer
//     model (Mirkwood), dark-lord (Mordor). 7 seats, 6 models.
//     GLB figures via attachFigureModel (characters.js); there
//     is NO procedural stand-in for a person — a figure whose
//     GLB never arrives simply never appears.
//   * the hero — the PLAYER, one of PLAYABLE (wizard, ranger,
//     elf-archer, dwarf, halfling). The player IS that humanoid:
//     the twin rule (zone.js) empties the picked hero's NPC seat.
//     Folk extras skip the picked hero's seat for the same reason.
//   * placed CREATURES (Great Eagle, Horse of the Mark, Warg,
//     Fell Beast, Dragon) are NOT humanoids — the animal
//     operators already cover them; this module excludes them.
//
// GARMENTS (tied to the actual mesh — never invented):
//   * orc garments ARE the procedural materials: dark rags
//     (0x33302a) torso/hips, green skin (warrior 0x6d8148,
//     captain 0x5c6e3a), iron (0x777d84) blade + captain pads,
//     red crest (0x8c2f1d) on captains only. No wardrobe exists
//     in code: garments never change except the whole-figure
//     GLB swap (brute hides) and the hit flash (emissive,
//     0.18 s) + death fall/fade. Condition (pristine / worn /
//     battle-torn) is a DISPLAY read off HP fraction, labelled
//     as such — the renderer never swaps cloth.
//   * Saruman's robe IS the procedural material (0xe9e6da);
//     same hit-flash-only damage path, no garment change.
//   * folk garments are BAKED INTO their GLBs — no separate
//     cloth mesh exists in code, so there is nothing to change,
//     tear, or swap; condition reads pristine always, and folk
//     are never struck, so no damage path exists for them.
//
// WEAPONS (the existing combat systems, read never rewritten):
//   * an orc carries ONE weapon: its crude blade (mesh in the
//     fist). Its numbers are the ORC_KINDS stats — warrior
//     8 dmg, swing 2.0 m, cooldown 1.1 s; captain 14 dmg,
//     swing 2.2 m, cooldown 1.3 s; wind-up 0.35 s
//     (figure-motion.js ORC_WINDUP_S). Orcs carry NO bow in
//     code. The BLADE (34 dmg @ 2.2 m, cd 0.45) and BOW
//     (26 dmg @ 30 m, cd 0.8) are the PLAYER's weapons —
//     they are what KILLS an orc, listed under killsBy.
//   * Saruman wields his black staff (2.6 m shaft, cold-light
//     crown): telegraphed blasts, 22 dmg inside 3.2 m, 1.1 s
//     to move, cast every 3.2 / 2.4 / 1.8 s by phase; the Voice
//     slows the player's stride to 0.55 within 14 / 18 m
//     (phases 2 / 3). His death pays the Staff of the White
//     Wizard into the backpack (campaign.js SARUMAN_REWARD).
//   * folk carry NO weapon in code — they never fight, are
//     never strike targets. The hero's weapons live in
//     PLAYABLE (characters.js) and belong to the player.
//
// DEATH LAW (from code — never invented):
//   * orcs die by COMBAT ONLY (player blade 34 / bow 26 via
//     damageOrc); a dead record refills on its pod's respawn
//     clock (respawnS per pod: 40–60 s) once the player is
//     > 65 m away (zone.js). Loot rolls on the kill.
//   * Saruman dies by COMBAT ONLY (600 HP via damageBoss);
//     death completes the campaign (completeSaruman) and is
//     PERMANENT — no respawn in code.
//   * placed folk NEVER die: strike() only takes orcs / the
//     boss; folk are ambient, untargetable figures.
//   * the hero (player) dies by combat; death respawns them
//     at the pod spawn (reviveHunter), cuts the hunt heat to
//     35% (cutHeatOnDeath), and resets a combat boss to
//     'ready' with pending blasts cleared (page.jsx).
//
// BEHAVIOUR LOGIC (Merlin, Nov 14 ~22:59) — per-realm check:
//   * user-hunt branch: APPLIES. Orcs hunt the user (orcs.js
//     stepOrc: sight / alert / chase / wind-up / hit; hunt.js
//     heat meter + hunting parties; the boss's telegraphed
//     blasts). A dead user cuts the heat (they lost the trail)
//     and the boss resets — there is no corpse entity and
//     orcs do not fight each other.
//   * user-death / corpse-fight branch: DOES NOT APPLY as a
//     fight. On user death the orcs LOSE the trail (heat cut
//     to 35%, trail cold, boss resets to ready) — recorded
//     here as trail-loss, never a corpse fight.
//   * territorial rival fights: DO NOT APPLY. Orcs are a
//     WAR-BAND, not territorial carnivores: a struck or
//     sighted orc ALERTS its bandmates to join the hunt
//     (alertBand / hearNoise / raiseAlarm) — they cooperate.
//   * diet-driven feeding: orcs have no diet in code; their
//     feeding IS the hunt (the campaign spine: "hunt orcs —
//     kill Saruman"). Folk have no diet either — ambient.
//   * water-seeking: DOES NOT APPLY. No humanoid drinks in
//     Middle-earth code.
//
// POPULATION RULE (Merlin, Nov 14 ~22:57): more than one copy
// of every humanoid, spread out. Orcs ALREADY meet it (blanket
// field — verified by orcPopulationAll() in operators.js).
// Placed folk FAIL it (one seat each); folkExtras() returns
// the deterministic second copy per folk seat, mirrored across
// the pod centre ≥ 100 m away, skipping the picked hero's seat
// (the twin rule). Saruman is a singleton BY DESIGN (one boss,
// one campaign) — flagged, not doubled.

import {
  ORC_KINDS,
  BLADE,
  BOW,
  ORC_LOOT_WEAPONS,
  ORC_MODELS,
  RESPAWN_MIN_DIST,
} from './orcs.js';
import {
  ORC_ARM_REST,
  ORC_WINDUP_S,
  orcLimbAngles,
} from './figure-motion.js';
import {
  BOSS_MAX_HP,
  BOSS_WAKE_DIST,
  BLAST,
  bossPhase,
} from './boss.js';
import {
  PODS,
  POD_ORDER,
  SARUMAN_GATE_KILLS,
} from './data.js';
import {
  PLAYABLE,
  CHARACTER_MODELS,
} from './characters.js';
import {
  SARUMAN_REWARD,
  heatOf,
} from './campaign.js';
import { heatLevel } from './hunt.js';
import { orcPopulationAll } from './operators.js';
import { localHour, isNightAt } from '../../lib/life-clock.js';

export const MIN_FOLK_SPREAD_M = 100;
export const FOLK_KINDS = ['halfling', 'wizard', 'elf-archer', 'ranger', 'dwarf', 'dark-lord'];

// ── Enumeration ──────────────────────────────────────────────
/** The placed folk defs (data.js characters, creature NOT set). */
export function placedFolk(podId) {
  const def = PODS[podId];
  if (!def) return [];
  return (def.characters || [])
    .filter((c) => c && c.creature !== true)
    .map((c) => ({
      id: c.id,
      model: c.model,
      name: c.name,
      x: c.at[0],
      z: c.at[1],
      height: c.height,
      pod: podId,
      playable: !!PLAYABLE[c.model],
    }));
}

/** Every folk seat realm-wide, in pod order. */
export function placedFolkAll() {
  const out = [];
  for (const podId of POD_ORDER) out.push(...placedFolk(podId));
  return out;
}

/** True when a folk model is one of the playable hero picks. */
export function isPlayableFolk(model) {
  return !!PLAYABLE[model];
}

// ── Birth Agent ──────────────────────────────────────────────
/**
 * How a humanoid comes to be. Orcs are not born — a dead
 * record refills on its pod's respawn clock. Saruman and the
 * folk are placed once; the hero is the player's pick.
 */
export function birthFor(kind, opts = {}) {
  if (kind === 'orc') {
    const respawnS = opts.respawnS != null ? opts.respawnS : 45;
    return {
      mode: 'respawn-clock',
      respawnS,
      needsDistanceM: RESPAWN_MIN_DIST,
      note: `No birth — a dead orc refills ${respawnS} s after death, once the player is ${RESPAWN_MIN_DIST} m away`,
    };
  }
  if (kind === 'boss') {
    return {
      mode: 'singleton',
      note: 'One boss, placed once at the foot of Orthanc — no birth, no respawn',
    };
  }
  if (kind === 'hero') {
    return {
      mode: 'player-pick',
      note: 'The player IS this humanoid — picked from the fellowship, never spawned',
    };
  }
  return {
    mode: 'placed-once',
    note: 'Placed once in its home pod — no birth, no death, no second seat in code',
  };
}

// ── Growth Agent ─────────────────────────────────────────────
/**
 * Growth state: every Middle-earth humanoid is placed as an
 * adult — there is no growth in code (no juvenile orc, no
 * child folk). Size is the figure's placed height.
 */
export function growthFor(kind, record) {
  if (kind === 'orc') {
    const orcKind = record && record.kind === 'captain' ? 'captain' : 'warrior';
    const stats = ORC_KINDS[orcKind];
    return {
      stage: 'adult', stageName: 'Adult', fraction: 1,
      sizeM: stats.height, scale: stats.scale,
      note: 'Placed as an adult — captains stand taller (2.05 m) than warriors (1.75 m)',
    };
  }
  if (kind === 'boss') {
    return {
      stage: 'adult', stageName: 'Adult', fraction: 1,
      sizeM: 1.95, scale: 1.1,
      note: 'Adult — the white-wizard GLB is fitted to 1.95 m (boss.js); the procedural figure stands ~2.3 m',
    };
  }
  if (kind === 'hero') {
    const hero = PLAYABLE[(record && record.heroKey) || (record && record.key)] || null;
    return {
      stage: 'adult', stageName: 'Adult', fraction: 1,
      sizeM: hero ? hero.height : 1.85, scale: 1,
      note: 'Adult — the picked hero, at its PLAYABLE height',
    };
  }
  const height = (record && record.height) || 1.8;
  return {
    stage: 'adult', stageName: 'Adult', fraction: 1,
    sizeM: height, scale: 1,
    note: 'Placed as an adult at its data.js height — folk never grow in code',
  };
}

// ── Death Agent (combat only — read, never rewritten) ───────
export const DEATH_CAUSES = Object.freeze(['combat']);

/**
 * Death state for a humanoid. `opts` carries { deadAt,
 * respawnS, nowMs } for orcs. Folk never die; the boss dies
 * once, permanently; the hero's death is the player's death
 * (respawn at the pod spawn — see userDeathFor).
 */
export function deathFor(kind, record, opts = {}) {
  if (kind === 'folk') {
    return {
      state: 'alive',
      cause: 'none',
      note: 'Folk never die — strike() only takes orcs and the boss; no death path exists for them',
    };
  }
  if (kind === 'boss') {
    const dead = !!record && record.state === 'dead';
    return {
      state: dead ? 'dead' : 'alive',
      cause: dead ? 'combat' : null,
      respawnAt: null,
      note: dead
        ? 'Dead — the campaign is complete; no respawn in code, permanently'
        : 'Alive — dies once, by combat, when the gate is open and the player reaches him',
    };
  }
  if (kind === 'hero') {
    const dead = !!record && record.alive === false;
    return {
      state: dead ? 'dead' : 'alive',
      cause: dead ? 'combat' : null,
      respawnAt: null,
      note: dead
        ? 'Fallen — rises again at the pod spawn; the hunt heat is cut to 35% and a combat boss resets to ready'
        : 'Alive — the player',
    };
  }
  // Orc.
  const dead = !record || record.state === 'dead';
  if (!dead) return { state: 'alive', cause: null, respawnAt: null, note: null };
  const respawnS = opts.respawnS != null ? opts.respawnS : 45;
  const deadAt = Number(opts.deadAt) || 0;
  return {
    state: 'dead',
    cause: 'combat',
    respawnAt: deadAt + respawnS,
    respawnNeedsDistanceM: RESPAWN_MIN_DIST,
    note: `Killed in combat — refills ${respawnS} s after death, once the player is ${RESPAWN_MIN_DIST} m away`,
  };
}

// ── Decomposition Agent ──────────────────────────────────────
/**
 * What a body does after death — the figure's own fall/fade
 * numbers (orcs.js buildOrcFigure / boss.js buildSarumanFigure).
 * `deathT` is seconds since death (the figure's deathT).
 * Folk never die, so they have no remains.
 */
export function decompositionFor(kind, deathT) {
  const t = Math.max(0, Number(deathT) || 0);
  if (kind === 'boss') {
    const fall = Math.min(1, t / 0.9);
    const fade = t > 1.8 ? Math.max(0, 1 - (t - 1.8) / 1.2) : 1;
    return {
      remains: 'falling-figure',
      fallFraction: Math.round(fall * 1000) / 1000,
      fadeOpacity: Math.round(fade * 1000) / 1000,
      goneAtS: 3.0,
      note: 'The white figure falls over 0.9 s, then fades over 1.2 s — and never returns',
    };
  }
  if (kind === 'folk' || kind === 'hero') {
    return {
      remains: 'none',
      fallFraction: 0,
      fadeOpacity: 1,
      goneAtS: null,
      note: kind === 'folk'
        ? 'Folk never die, so no remains ever exist'
        : 'The player rises again at the pod spawn — no remains',
    };
  }
  // Orc.
  const fall = Math.min(1, t / 0.7);
  const fade = t > 1.6 ? Math.max(0, 1 - (t - 1.6) / 0.9) : 1;
  return {
    remains: 'falling-figure',
    fallFraction: Math.round(fall * 1000) / 1000,
    fadeOpacity: Math.round(fade * 1000) / 1000,
    goneAtS: 2.5,
    note: 'The brute falls over 0.7 s and fades after 1.6 s — the record refills on the respawn clock',
  };
}

// ── Diet / Feeding Agent ─────────────────────────────────────
/**
 * What a humanoid does for food. Orcs have NO diet in code —
 * their feeding IS the hunt (chase = hunting the user,
 * idle = patrolling). Saruman and the folk have no diet
 * either; the hero (player) has none in code. Where a branch
 * has no coded basis it is recorded as not-applicable, never
 * invented.
 */
export function dietFor(kind, record) {
  if (kind === 'orc') {
    const chasing = !!record && (record.state === 'chase' || !!record.task);
    return {
      diet: null,
      action: !record || record.state === 'dead' ? 'none' : chasing ? 'hunt-user' : 'patrol',
      note: chasing
        ? 'Hunting the user — orcs hunt them too'
        : 'No diet in code — feeding IS the hunt; idle orcs patrol, they do not eat',
    };
  }
  if (kind === 'boss') {
    const combat = !!record && record.state === 'combat';
    return {
      diet: null,
      action: combat ? 'hunt-user' : 'none',
      note: combat
        ? 'Casting telegraphed blasts at the user — the Voice slows their stride'
        : 'No diet in code — dormant until the gate opens',
    };
  }
  return {
    diet: null,
    action: 'none',
    note: kind === 'folk'
      ? 'Ambient figure — no diet or hunt in code'
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

const ORC_GARMENT_BASE = [
  {
    piece: 'Dark rags',
    mesh: 'Torso + hips, BoxGeometry, MeshStandardMaterial 0x33302a, flatShading, roughness 1',
    note: 'The brute’s rags — the same dark cloth on warrior and captain',
  },
  {
    piece: 'Skin',
    mesh: 'Head, jaw, arms, BoxGeometry, MeshStandardMaterial flatShading, roughness 1',
    note: 'Green skin — warrior 0x6d8148, captain 0x5c6e3a',
  },
];

/**
 * What a humanoid wears, tied to the mesh the scene already
 * uses. Garments NEVER change in code (no wardrobe, no swap):
 * the only garment events are the whole-figure GLB swap (the
 * brute hides when its GLB lands) and the hit flash / death
 * fall-fade. Folk garments are baked into their GLBs.
 */
export function garmentFor(kind, record) {
  if (kind === 'orc') {
    const orcKind = record && record.kind === 'captain' ? 'captain' : 'warrior';
    const hp = record ? record.hp : ORC_KINDS[orcKind].hp;
    const pieces = [...ORC_GARMENT_BASE];
    if (orcKind === 'captain') {
      pieces.push(
        {
          piece: 'Red crest',
          mesh: 'BoxGeometry 0.08×0.34×0.4, MeshStandardMaterial 0x8c2f1d, flatShading, roughness 1',
          note: 'Captain only — the red crest on the crown',
        },
        {
          piece: 'Iron shoulder pads',
          mesh: 'BoxGeometry 0.3×0.14×0.34, MeshStandardMaterial 0x777d84, metalness 0.5',
          note: 'Captain only — iron pads on both shoulders',
        },
      );
    }
    return {
      kind: 'orc',
      orcKind,
      model: ORC_MODELS[orcKind].url,
      modelHeight: ORC_MODELS[orcKind].height,
      pieces,
      condition: garmentCondition(hp, ORC_KINDS[orcKind].hp),
      conditionBasis: 'display — HP fraction; the renderer never swaps cloth',
      changeNote: 'Never changes in code — the brute hides whole when its GLB lands (body.visible = false); a hit flashes the materials emissive for 0.18 s, death falls and fades the figure',
      damageNote: 'Combat damage shows as the hit flash and the death fall/fade — never as torn cloth',
    };
  }
  if (kind === 'boss') {
    const hp = record ? record.hp : BOSS_MAX_HP;
    return {
      kind: 'boss',
      model: '/models/middle-earth/white-wizard.glb',
      modelHeight: 1.95,
      pieces: [
        {
          piece: 'White robe',
          mesh: 'Floor-length skirt + torso, CylinderGeometry, MeshStandardMaterial 0xe9e6da, flatShading, roughness 0.9',
          note: 'The floor-length white robe — skirt, torso, arms and beard all wear it',
        },
        {
          piece: 'White hair and beard',
          mesh: 'Cylinder + Box, MeshStandardMaterial 0xe9e6da (robe) / pale 0xd9c9a8 head',
          note: 'Hair and beard in the same white as the robe',
        },
      ],
      condition: garmentCondition(hp, BOSS_MAX_HP),
      conditionBasis: 'display — HP fraction; the renderer never swaps cloth',
      changeNote: 'Never changes in code — the procedural figure yields whole to the white-wizard GLB; a hit flashes the robe emissive for 0.18 s',
      damageNote: 'Combat damage shows as the hit flash and the death fall/fade — never as torn cloth',
    };
  }
  if (kind === 'hero') {
    const hero = PLAYABLE[(record && record.heroKey) || (record && record.key)] || null;
    return {
      kind: 'hero',
      model: hero ? CHARACTER_MODELS[hero.model].url : null,
      modelHeight: hero ? hero.height : null,
      pieces: [{
        piece: 'Figure as modelled',
        mesh: hero ? `Staged ${hero.model}.glb, height-fitted` : 'No hero picked',
        note: 'The hero’s garb is baked into the GLB — no separate cloth mesh in code; damage shows as HP loss, never as torn cloth',
      }],
      condition: 'pristine',
      conditionBasis: 'no damage path for cloth in code',
      changeNote: 'Never changes in code',
      damageNote: 'The player shows damage as HP loss, not garment damage',
    };
  }
  // Folk.
  const model = record && record.model;
  const def = model ? CHARACTER_MODELS[model] : null;
  return {
    kind: 'folk',
    model: def ? def.url : null,
    modelHeight: (record && record.height) || null,
    pieces: [{
      piece: 'Figure as modelled',
      mesh: def ? `${model}.glb, height-fitted by attachFigureModel` : 'No model',
      note: 'Garment baked into the GLB — no separate cloth mesh in code; the wizard’s staff is baked into his model too (figure-motion.js)',
    }],
    condition: 'pristine',
    conditionBasis: 'no damage path in code — folk are never struck',
    changeNote: 'Never changes in code — folk never fight, never die, never change clothes',
    damageNote: 'No damage path exists for folk in code',
  };
}

// ── Weapons Agent ────────────────────────────────────────────
/**
 * How a humanoid wields what it carries — grip / stance /
 * readiness by state, weapon condition, and the weapons that
 * kill it. The existing combat systems are read, never
 * rewritten: orc numbers from ORC_KINDS, player numbers from
 * BLADE / BOW, Saruman's from BLAST + bossPhase.
 */
export function weaponFor(kind, record, opts = {}) {
  if (kind === 'orc') {
    const orcKind = record && record.kind === 'captain' ? 'captain' : 'warrior';
    const stats = ORC_KINDS[orcKind];
    const state = !record || record.state === 'dead' ? 'dead' : record.state;
    const windupP = record && record.windupT > 0 ? 1 - record.windupT / ORC_WINDUP_S : 0;
    const swingP = opts.swingP != null ? opts.swingP : 0;
    const moveSpeed = state === 'chase' ? stats.speed : state === 'idle' ? 0.55 : 0;
    const angles = orcLimbAngles({
      moveSpeed, phase: opts.phase || 0, windupP, swingP, idleT: opts.idleT || 0,
    });
    const readiness = state === 'dead'
      ? 'fallen'
      : windupP > 0 ? 'raised-windup' : swingP > 0 ? 'sweeping' : state === 'chase' ? 'raised-chase' : 'lowered-rest';
    return {
      kind: 'orc',
      orcKind,
      carried: {
        id: 'orc-crude-blade',
        name: 'Crude blade',
        mesh: 'BoxGeometry 0.05×0.62×0.14, iron 0x777d84, in the side -1 fist, tilt 0.9 split between pivot rest and mesh',
        grip: 'Right fist (side -1 pivot) — rides the blade-arm pivot, so it swings with the arm',
        dmg: stats.dmg,
        swingRangeM: stats.swingRange,
        swingCooldownS: stats.swingCooldown,
        windupS: ORC_WINDUP_S,
        stance: {
          readiness,
          armBladeRad: Math.round(angles.armBlade * 1000) / 1000,
          armRestRad: ORC_ARM_REST,
          note: readiness === 'raised-windup'
            ? 'Wind-up: the blade arm rises back over the shoulder so the hit can be SEEN coming (figure-motion.js)'
            : readiness === 'sweeping'
              ? 'Sweep: the blade arm drives forward past rest, then settles'
              : 'Rest: the blade hangs at ORC_ARM_REST (-0.35 rad)',
        },
      },
      carriedBow: null,
      carriedBowNote: 'Orcs carry NO bow in code — the BOW is the player’s weapon, not theirs',
      killsBy: {
        blade: { dmg: BLADE.dmg, rangeM: BLADE.range, arcDeg: 70, cooldownS: BLADE.cooldown },
        bow: { dmg: BOW.dmg, rangeM: BOW.range, arcDeg: 12, cooldownS: BOW.cooldown },
        note: 'The player’s blade (34 @ 2.2 m) and bow (26 @ 30 m) are what kill an orc, via damageOrc',
      },
      lootWeapons: ORC_LOOT_WEAPONS.map((w) => ({ id: w.id, name: w.name, class: w.class })),
      lootNote: 'Captains drop a weapon 25% of the time, warriors 8% — rollLoot (orcs.js)',
      condition: garmentCondition(record ? record.hp : stats.hp, stats.hp),
      conditionBasis: 'display — HP fraction; weapons never break or dull in code',
    };
  }
  if (kind === 'boss') {
    const hp = record ? record.hp : BOSS_MAX_HP;
    const phase = bossPhase(hp);
    const state = !record ? 'dormant' : record.state;
    return {
      kind: 'boss',
      carried: {
        id: 'saruman-staff',
        name: 'Black staff, cold crown',
        mesh: 'Black shaft 2.6 m (CylinderGeometry 0.035, 0x1c1c20) + octahedron crown 0.13, emissive 0x8fb8ff intensity 1.6, in the right hand',
        grip: 'Right hand — staff sways 0.06 rad in combat (buildSarumanFigure)',
        blast: { dmg: BLAST.dmg, radiusM: BLAST.radius, telegraphS: BLAST.telegraph },
        castIntervalS: phase === 1 ? 3.2 : phase === 2 ? 2.4 : 1.8,
        twinBlast: phase === 3,
        voice: {
          auraM: phase === 1 ? 0 : phase === 2 ? 14 : 18,
          strideFactor: 0.55,
          note: 'The Voice — within the aura the player’s stride slows to 0.55',
        },
        stance: {
          readiness: state === 'combat' ? 'casting' : state === 'dead' ? 'fallen' : state === 'ready' ? 'waiting' : 'dormant',
          note: state === 'combat'
            ? `Casting — phase ${phase}, a telegraphed blast every ${phase === 1 ? 3.2 : phase === 2 ? 2.4 : 1.8} s${phase === 3 ? ', twin blasts' : ''}`
            : 'Dormant — blade and bow pass over him until the gate opens',
        },
      },
      carriedBow: null,
      killsBy: {
        blade: { dmg: BLADE.dmg, rangeM: BLADE.range, cooldownS: BLADE.cooldown },
        bow: { dmg: BOW.dmg, rangeM: BOW.range, cooldownS: BOW.cooldown },
        note: 'The player’s blade and bow (or staff, same ranged hand) via damageBoss — only in combat, after the gate',
      },
      reward: { ...SARUMAN_REWARD, note: 'Death pays the Staff of the White Wizard into the backpack once (campaign.js)' },
      condition: garmentCondition(hp, BOSS_MAX_HP),
      conditionBasis: 'display — HP fraction; the staff never breaks in code',
    };
  }
  if (kind === 'hero') {
    const hero = PLAYABLE[(record && record.heroKey) || (record && record.key)] || null;
    if (!hero) return { kind: 'hero', carried: null, note: 'No hero picked' };
    return {
      kind: 'hero',
      heroKey: hero.key,
      carried: {
        melee: { label: hero.meleeLabel, dmg: hero.meleeDmg },
        ranged: { ...hero.ranged, label: hero.rangedLabel },
        note: 'The player’s weapons — melee + ranged hand from PLAYABLE (characters.js); equipped backpack weapons override at strike time (page.jsx equippedDamageForSlot)',
      },
      stance: {
        readiness: record && record.alive === false ? 'fallen' : 'ready',
        note: 'The hero figure trails the walker (page.jsx) — weapon in hand, reticle by backpack law',
      },
      condition: 'pristine',
      conditionBasis: 'player weapons never break in code',
    };
  }
  // Folk.
  return {
    kind: 'folk',
    carried: null,
    carriedNote: 'Folk carry NO weapon in code — they never fight and are never strike targets; the same model, when PLAYED as the hero, carries the PLAYABLE weapons (see weaponFor hero)',
    killsBy: null,
    condition: 'pristine',
    conditionBasis: 'no combat path in code',
  };
}

// ── Habits Agent ─────────────────────────────────────────────
/**
 * What a humanoid is doing right now. Orc activity is its AI
 * state; Saruman's is his boss state; folk are ambient
 * (buildFigure breathing sway); the hero follows the walker.
 */
export function habitsFor(kind, record, now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const base = {
    hour: Math.round(localHour(new Date(t)) * 10) / 10,
    night: isNightAt(new Date(t)),
  };
  if (kind === 'orc') {
    const state = !record ? 'idle' : record.state;
    const activity = state === 'dead' ? 'dead' : state === 'chase' ? 'chase' : record && record.task ? 'seek' : 'patrol';
    return {
      ...base,
      activity,
      moving: state === 'chase' || !!(record && record.task && record.task.phase === 'go'),
      note: activity === 'chase'
        ? 'Chasing the user — sight, alert radius, or a hunting-party task'
        : activity === 'seek'
          ? 'Marching to the last-known position, then searching it for 20 s before the trail goes cold'
          : activity === 'dead'
            ? 'Dead — does not hunt'
            : 'Patrolling its ground — a slow shuffle around home (rovers roam wide)',
    };
  }
  if (kind === 'boss') {
    const state = !record ? 'dormant' : record.state;
    return {
      ...base,
      activity: state === 'combat' ? 'combat' : state === 'dead' ? 'dead' : 'waiting',
      moving: false,
      note: state === 'combat'
        ? 'Casting telegraphed blasts at the user'
        : state === 'dead'
          ? 'Dead — the campaign is complete'
          : state === 'ready'
            ? 'Waiting — approach within 26 m to wake him'
            : 'Dormant — the gate has not opened',
    };
  }
  if (kind === 'hero') {
    return {
      ...base,
      activity: record && record.alive === false ? 'dead' : 'follow',
      moving: true,
      note: 'The hero figure trails the walker — the player, not an NPC',
    };
  }
  return {
    ...base,
    activity: 'ambient',
    moving: false,
    note: 'Ambient figure — breathing sway, a slow turn; never hunts, never fights, never leaves its seat',
  };
}

// ── Territory + User-hunt Agents ─────────────────────────────
/**
 * Territory: orcs are a WAR-BAND — a struck orc alerts its
 * bandmates (alertBand, 18 m), loud acts draw orcs (hearNoise),
 * a kill raises an alarm (raiseAlarm). They NEVER fight each
 * other. Saruman holds his vale alone; folk hold no territory.
 */
export function territoryFor(kind) {
  if (kind === 'orc') {
    return {
      mode: 'war-band',
      note: 'War-band — a struck or sighted orc alerts its bandmates to join the hunt, never to fight them',
    };
  }
  if (kind === 'boss') {
    return { mode: 'boss-vale', note: 'One boss, one vale — a singleton by design' };
  }
  return { mode: 'none', note: kind === 'folk' ? 'Folk hold no territory in code' : 'The player holds no territory' };
}

/**
 * The user-hunt reading for an orc at a hunt meter value:
 * the heat level (hunt.js), the dispatch tiers, and the trail.
 */
export function userHuntFor(heat) {
  const h = Math.max(0, Math.min(100, Number(heat) || 0));
  return {
    heat: h,
    level: heatLevel(h),
    levelLine: `Hunt heat: ${heatLevel(h)} (${Math.round(h)})`,
    dispatchTiers: [
      { at: 45, size: 3 },
      { at: 70, size: 4 },
      { at: 90, size: 5 },
    ],
    trailColdS: 25,
    note: 'Kills, sightings and alarms raise the heat; silence and distance cool it; at 45 / 70 / 90 a hunting party marches to the last-known position — never teleports',
  };
}

/**
 * User death, pure: the orcs LOSE the trail — heat cut to 35%
 * (campaign.js cutHeatOnDeath), the trail goes cold, a combat
 * boss resets to 'ready' with pending blasts cleared, and the
 * player rises again at the pod spawn. There is NO corpse
 * entity and no corpse fight — recorded, never invented.
 */
export function userDeathFor(campaign, podId) {
  const before = heatOf(campaign, podId);
  return {
    heatBefore: before,
    heatAfter: Math.round(before * 0.35 * 100) / 100,
    heatCut: '×0.35',
    bossReset: 'ready',
    bossPendingCleared: true,
    respawn: 'pod spawn',
    corpseFight: 'none — no corpse entity; orcs lose the trail, they do not fight over it',
    note: 'Death cuts the meter — they lost your trail in the chaos (hunt.js / page.jsx)',
  };
}

// ── Population Agent ─────────────────────────────────────────
/**
 * The deterministic second copy per folk seat: mirrored across
 * the pod centre (0, 0), ≥ 100 m from the original (a mirrored
 * point near the centre is pushed out along its own direction).
 * The picked hero's seat is skipped — the player IS that hero
 * (the twin rule). Pure records the zone can place beside the
 * first. Saruman is never doubled.
 */
export function folkExtras(podId, heroKey) {
  const out = [];
  for (const c of placedFolk(podId)) {
    // The twin rule applies ONLY to playable heroes: the player
    // IS that hero, so the seat (and its extra) stands empty.
    // A non-playable seat — the Dark Lord — is never skipped.
    if (heroKey && PLAYABLE[c.model] && c.model === heroKey) continue;
    let x = -c.x;
    let z = -c.z;
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < MIN_FOLK_SPREAD_M) {
      const dir = Math.hypot(x, z) || 1;
      const push = (MIN_FOLK_SPREAD_M - d) / 2 + 10;
      x += (x / dir) * push;
      z += (z / dir) * push;
    }
    out.push({
      id: `${c.id}-second`,
      model: c.model,
      name: c.name,
      x: Math.round(x * 10) / 10,
      z: Math.round(z * 10) / 10,
      height: c.height,
      pod: podId,
      operatorExtra: true,
      anchor: 'second',
      note: 'Second copy — the population rule (more than one copy, spread out)',
    });
  }
  return out;
}

/**
 * Humanoid population report: orcs via the animal operators'
 * blanket-field audit, folk seats + extras per pod, Saruman
 * as a singleton by design.
 */
export function humanoidPopulation(tryPlace, heroKey) {
  const orcs = orcPopulationAll(tryPlace);
  const folk = {};
  let folkSeats = 0;
  let folkExtrasCount = 0;
  for (const podId of POD_ORDER) {
    const seats = placedFolk(podId);
    const extras = folkExtras(podId, heroKey);
    folk[podId] = {
      seats: seats.length,
      extras: extras.length,
      meetsMin: seats.length + extras.length >= 2 || seats.length === 0,
    };
    folkSeats += seats.length;
    folkExtrasCount += extras.length;
  }
  return {
    orcs,
    folk,
    folkSeats,
    folkExtras: folkExtrasCount,
    saruman: { count: 1, note: 'One boss by design' },
    meetsRule: orcs.meetsWarriors && orcs.meetsCaptains
      && Object.values(folk).every((f) => f.meetsMin),
  };
}

// ── Conductor ────────────────────────────────────────────────
/**
 * The full life state of one Middle-earth humanoid. `h` carries
 * { kind: 'orc' | 'boss' | 'folk' | 'hero' } — an orc record, a
 * Saruman record, a folk def, or a hero pick ({ heroKey } /
 * PLAYABLE key). `opts` carries the live context ({ deadAt,
 * respawnS, totalKills, heat, heroKey, nowMs }). Pure for orcs /
 * boss / folk; the hero reads the pick + hunter record.
 */
export function lifeFor(h, now = Date.now(), opts = {}) {
  if (!h) return null;
  const t = now instanceof Date ? now.getTime() : Number(now);
  const kind = h.kind === 'boss' || h.isBoss === true
    ? 'boss'
    : h.kind === 'hero' || h.heroKey || (h.key && PLAYABLE[h.key])
      ? 'hero'
      : h.kind === 'folk' || (h.model && !h.stats)
        ? 'folk'
        : 'orc';
  if (kind === 'boss') return bossLifeFor(h, t, opts);
  if (kind === 'folk') return folkLifeFor(h, t, opts);
  if (kind === 'hero') return heroLifeFor(h, t, opts);
  return orcLifeFor(h, t, opts);
}

/** Life of one orc, with garment + weapon. */
export function orcLifeFor(orc, now = Date.now(), opts = {}) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const orcKind = orc && orc.kind === 'captain' ? 'captain' : 'warrior';
  const stats = ORC_KINDS[orcKind];
  const death = deathFor('orc', orc, opts);
  const decomp = decompositionFor('orc', orc ? orc.deathT || 0 : 0);
  const diet = dietFor('orc', orc);
  const habits = habitsFor('orc', orc, t);
  const garment = garmentFor('orc', orc);
  const weapon = weaponFor('orc', orc, opts);
  const life = {
    realm: 'middle-earth',
    kind: 'orc',
    humanoidKind: 'orc',
    orcKind,
    name: orcKind === 'captain' ? 'Orc Captain' : 'Orc Warrior',
    stage: 'adult',
    stageName: 'Adult',
    sizeM: stats.height,
    state: death.state,
    activity: habits.activity,
    moving: habits.moving,
    role: 'War-band',
    hp: orc ? orc.hp : 0,
    maxHp: stats.hp,
    deathCause: death.cause,
    respawnAt: death.respawnAt,
    respawnNeedsDistanceM: death.respawnNeedsDistanceM,
    decomp,
    feeding: diet.action,
    feedingNote: diet.note,
    territory: territoryFor('orc').mode,
    territoryNote: territoryFor('orc').note,
    duel: null,
    water: 'none',
    waterNote: 'No drink law in Middle-earth code',
    breeding: false,
    breedingNote: birthFor('orc', opts).note,
    groupSize: orcKind === 'captain' ? 1 : 3,
    garment: {
      summary: orcKind === 'captain' ? 'Dark rags · red crest · iron shoulder pads' : 'Dark rags',
      condition: garment.condition,
      pieces: garment.pieces,
    },
    weapon: {
      summary: `Crude blade · ${stats.dmg} dmg · ${stats.swingRange} m`,
      readiness: weapon.carried.stance.readiness,
      carried: weapon.carried,
    },
    hour: habits.hour,
    night: habits.night,
  };
  life.line = lifeLine(life);
  return life;
}

/** Life of the boss, with garment + weapon. */
export function bossLifeFor(boss, now = Date.now(), opts = {}) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const state = !boss ? 'dormant' : boss.state;
  const gateOpen = (opts.totalKills || 0) >= SARUMAN_GATE_KILLS;
  const death = deathFor('boss', boss, opts);
  const decomp = decompositionFor('boss', boss ? boss.deathT || 0 : 0);
  const diet = dietFor('boss', boss);
  const habits = habitsFor('boss', boss, t);
  const garment = garmentFor('boss', boss);
  const weapon = weaponFor('boss', boss, opts);
  const life = {
    realm: 'middle-earth',
    kind: 'boss',
    humanoidKind: 'boss',
    name: 'Saruman',
    stage: 'adult',
    stageName: 'Adult',
    sizeM: 1.95,
    state,
    activity: habits.activity,
    moving: false,
    role: 'Boss · Isengard',
    hp: boss ? boss.hp : BOSS_MAX_HP,
    maxHp: BOSS_MAX_HP,
    phase: boss ? bossPhase(boss.hp) : 1,
    gateKills: SARUMAN_GATE_KILLS,
    gateOpen,
    wakeDistM: BOSS_WAKE_DIST,
    deathCause: death.cause,
    decomp,
    feeding: diet.action,
    feedingNote: diet.note,
    territory: territoryFor('boss').mode,
    territoryNote: territoryFor('boss').note,
    duel: null,
    water: 'none',
    waterNote: 'No drink law in Middle-earth code',
    breeding: false,
    breedingNote: birthFor('boss').note,
    groupSize: 1,
    garment: {
      summary: 'White robe · white hair and beard',
      condition: garment.condition,
      pieces: garment.pieces,
    },
    weapon: {
      summary: `Black staff · blast ${BLAST.dmg} dmg · ${BLAST.radius} m`,
      readiness: weapon.carried.stance.readiness,
      carried: weapon.carried,
    },
    hour: habits.hour,
    night: habits.night,
  };
  life.line = lifeLine(life);
  return life;
}

/** Life of a placed folk figure: ambient, never dies. */
export function folkLifeFor(def, now = Date.now(), opts = {}) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const growth = growthFor('folk', def);
  const habits = habitsFor('folk', def, t);
  const garment = garmentFor('folk', def);
  const weapon = weaponFor('folk', def, opts);
  const life = {
    realm: 'middle-earth',
    kind: 'folk',
    humanoidKind: 'folk',
    model: (def && def.model) || null,
    name: (def && def.name) || 'Folk',
    pod: (def && def.pod) || null,
    stage: growth.stage,
    stageName: growth.stageName,
    sizeM: growth.sizeM,
    state: 'alive',
    activity: habits.activity,
    moving: false,
    role: (def && def.playable) ? 'Fellowship hero (NPC seat)' : 'Folk of the realm',
    hp: null,
    maxHp: null,
    deathCause: 'none',
    decomp: decompositionFor('folk', 0),
    feeding: 'none',
    feedingNote: 'Ambient figure — no diet or hunt in code',
    territory: 'none',
    territoryNote: 'Folk hold no territory in code',
    duel: null,
    water: 'none',
    waterNote: 'No drink law in Middle-earth code',
    breeding: false,
    breedingNote: birthFor('folk').note,
    groupSize: 1,
    garment: {
      summary: 'Figure as modelled — garment baked into the GLB',
      condition: garment.condition,
      pieces: garment.pieces,
    },
    weapon: {
      summary: 'Unarmed — folk never fight',
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
  const def = key ? PLAYABLE[key] : null;
  const growth = growthFor('hero', { heroKey: key });
  const habits = habitsFor('hero', hero, t);
  const garment = garmentFor('hero', { heroKey: key });
  const weapon = weaponFor('hero', { heroKey: key }, opts);
  const life = {
    realm: 'middle-earth',
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
    decomp: decompositionFor('hero', 0),
    feeding: 'none',
    feedingNote: 'The player — no diet law in code',
    territory: 'none',
    territoryNote: 'The player holds no territory',
    duel: null,
    water: 'none',
    waterNote: 'No drink law in Middle-earth code',
    breeding: false,
    breedingNote: birthFor('hero').note,
    groupSize: 1,
    garment: {
      summary: 'Figure as modelled — garment baked into the GLB',
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
  if (life.state === 'dead') {
    if (life.kind === 'boss') return 'Remains — Saruman — the campaign is complete';
    if (life.kind === 'hero') return 'Remains — Hero — rise again at the pod spawn';
    if (life.respawnAt != null) return `Remains — ${life.stageName} ${life.name || 'Orc'} — returns on the respawn clock`;
    return `Remains — ${life.stageName} ${life.name || 'Humanoid'}`;
  }
  if (life.kind === 'boss') {
    if (life.state === 'dormant') return `Adult · Dormant · Boss · White robe · Black staff — gate opens at ${life.gateKills} orc kills`;
    if (life.state === 'ready') return 'Adult · Waiting · Boss · White robe · Black staff — approach within 26 m to wake him';
    return `Adult · Combat · Boss · White robe · Black staff · phase ${life.phase} · ${life.hp}/${life.maxHp} HP`;
  }
  if (life.kind === 'folk') return `${life.stageName} · Ambient · ${life.role} · Figure as modelled · Unarmed`;
  if (life.kind === 'hero') {
    return `${life.stageName} · Following you · You — the player · Figure as modelled · ${life.weapon.summary}`;
  }
  const parts = [
    life.stageName || 'Adult',
    life.activity === 'chase' ? 'Hunting you' : life.activity === 'seek' ? 'Seeking your trail' : 'Patrolling',
    life.role || 'War-band',
    (life.garment && life.garment.summary) || 'Dark rags',
    (life.weapon && life.weapon.summary) || 'Crude blade',
  ];
  if (life.orcKind === 'captain') parts.push('Captain');
  if (life.groupSize > 1) parts.push(`Band of ${life.groupSize}`);
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
