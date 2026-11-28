// app/middle-earth/operators.js
// MIDDLE-EARTH — OPERATOR AGENTS (Merlin, Nov 14 ~22:56, "Yes —
// all realms"; behaviour logic Nov 14 ~22:59). The agents that
// operate Middle-earth's creatures, following the Earth 4
// pattern: a creature's life a pure function of (place, kind,
// device clock) plus the live state the zone already owns —
// NO stored state of their own, NO server. Earth 4 itself is
// NOT touched.
//
// CREATURES IN CODE (enumerated exactly):
//   * orcs — warrior (60 HP) + captain (150 HP), per pod
//     (orcs.js spawnField: camps + rovers across the whole
//     disc; data.js per-pod counts; zone.js timed respawns).
//   * Saruman — the boss (600 HP, boss.js; campaign gate 30
//     orc kills, data.js SARUMAN_GATE_KILLS).
//   * placed creatures (data.js characters, creature: true):
//     a Great Eagle (Rivendell), a Horse of the Mark + a Warg
//     of the Wilds (Rohan), a Fell Beast + a Dragon of the
//     Wastes (Mordor). One copy each — singletons (see below).
//   * raised dino companions — the shared backpack (breeding.js
//     + lib/dino-companion.js; the page summons/recalls them).
//   * heroes / folk (halfling, wizard, elf, ranger, dwarf,
//     Dark Lord) are PEOPLE, not creatures — no agents.
//
// DEATH LAW (from code — never invented):
//   * orcs die by COMBAT ONLY: player blade (34) / bow (26)
//     via damageOrc. A dead record refills on its pod's respawn
//     clock (respawnS per pod: 40–60 s) once the player is
//     > 65 m away (zone.js RESPAWN_MIN_DIST). Loot rolls on
//     the kill. No age death.
//   * Saruman dies by COMBAT ONLY (600 HP via damageBoss);
//     death completes the campaign (completeSaruman) and is
//     PERMANENT — no respawn in code.
//   * placed creatures have NO death in code — EXCEPT the two
//     dragon-class creatures (Merlin, Nov 26: "Make the dragons
//     hunt and be billable"): the Dragon of the Wastes (400 HP)
//     and the Fell Beast (300 HP) hunt the player, die by
//     COMBAT ONLY (blade / bow via damageDragon), drop Dragon
//     Scales or Fire Orbs, and refill on the pod respawn clock
//     like orcs. The Eagle, Horse and Warg stay ambient —
//     untargetable, never die (strike() only takes orcs, the
//     boss, and dragons).
//   * companion dinos NEVER die (ally law, breeding.js).
//
// BEHAVIOUR LOGIC (Merlin, Nov 14 ~22:59) — per-realm check:
//   * user-hunt branch: APPLIES. Orcs hunt the user (orcs.js
//     stepOrc: sight / alert / chase / wind-up / hit; hunt.js
//     heat meter + hunting parties; the boss's telegraphed
//     blasts). A dead user cuts the heat (they lost the trail)
//     and the user respawns at the pod spawn (page.jsx).
//   * user-death / corpse-fight branch: DOES NOT APPLY as a
//     fight. On user death the orcs LOSE the trail (heat cut
//     to 35%, trail cold, boss resets to ready) — there is no
//     corpse entity and orcs do not fight each other. The
//     operators record the trail-loss, never a corpse fight.
//   * territorial carnivore fights: DO NOT APPLY to orcs.
//     Orcs are a WAR-BAND, not territorial carnivores: a struck
//     or sighted orc ALERTS its bandmates to join the hunt
//     (alertBand / hearNoise / raiseAlarm) — they cooperate.
//     No diet field exists for orcs in code.
//   * diet-driven feeding: orcs have no diet in code; their
//     feeding IS the hunt (the campaign spine: "hunt orcs —
//     kill Saruman"). Dragons hunt the PLAYER (dragons.js:
//     roam / chase / fire-breath / bite — prey is the player
//     only, never orcs, so a dragon cannot farm campaign kills).
//     The other placed creatures have no diet — they are
//     ambient, flagged.
//   * water-seeking: DOES NOT APPLY. No creature drinks in
//     Middle-earth code (the Bruinen gorge is terrain, not a
//     drink source; no thirst law exists here).
//   * the agents run every part of each creature — feeding,
//     territory, water, movement, rest, breeding — through the
//     operators, not as one-off scripts; where a branch has no
//     coded basis it is recorded as not-applicable, never
//     invented.
//
// POPULATION RULE (Merlin, Nov 14 ~22:57): more than one copy
// of every creature, spread out across the map. Minimums (this
// module's call): orcs ≥ 2 warriors per pod and ≥ 2 captains
// realm-wide across ≥ 2 pods; placed creatures ≥ 2 copies per
// pod. Orcs ALREADY meet the rule (blanket field, camps +
// rovers — verified by orcPopulationAll()). Placed creatures
// FAIL it (one copy each); placedCreatureExtras() returns the
// deterministic second copy per placed creature, mirrored
// across the pod centre ≥ 100 m away. Saruman is a singleton
// BY DESIGN (one boss, one campaign) — flagged, not doubled.

import {
  ORC_KINDS,
  spawnField,
  RESPAWN_MIN_DIST,
} from './orcs.js';
import {
  PODS,
  POD_ORDER,
  SARUMAN_GATE_KILLS,
} from './data.js';
import {
  DRAGON_KINDS,
  isDragonModel,
  isDragonKind,
} from './dragons.js';
import {
  bossPhase,
  BOSS_MAX_HP,
  BOSS_WAKE_DIST,
} from './boss.js';
import { heatLevel } from './hunt.js';
import { companionLifeFor } from '../../lib/earth2/operators.js';
import { localHour, isNightAt } from '../../lib/life-clock.js';

export const MIN_WARRIORS_PER_POD = 2;
export const MIN_CAPTAINS_REALM = 2;
export const MIN_CAPTAIN_PODS = 2;
export const PLACED_SPREAD_MIN_M = 100;

// ── Orcs ─────────────────────────────────────────────────────
/**
 * Life of one orc at the device clock. `orc` is a createOrc()
 * record ({ kind, x, z, hp, maxHp, state, bandId, recordId,
 * home, rove }); `opts` carries { deadAt, clock, respawnS,
 * nowMs }. Death is combat only; a dead orc refills on its
 * pod's respawn clock once the player is > 65 m away.
 */
export function orcLifeFor(orc, now = Date.now(), opts = {}) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const kind = orc && orc.kind === 'captain' ? 'captain' : 'warrior';
  const stats = ORC_KINDS[kind];
  const respawnS = opts.respawnS != null ? opts.respawnS : 45;
  const dead = !orc || orc.state === 'dead';
  const base = {
    realm: 'middle-earth',
    kind: 'orc',
    orcKind: kind,
    name: kind === 'captain' ? 'Orc Captain' : 'Orc Warrior',
    state: dead ? 'dead' : (orc.state === 'chase' ? 'hunting' : 'alive'),
    activity: dead ? 'dead' : orc.state === 'chase' ? 'chase' : 'patrol',
    moving: !!orc && orc.state === 'chase',
    hp: orc ? orc.hp : 0,
    maxHp: stats.hp,
    feeding: dead ? 'none' : orc.state === 'chase' ? 'hunt-user' : 'patrol',
    feedingNote: dead
      ? 'Dead — does not hunt'
      : orc.state === 'chase'
        ? 'Hunting the user — orcs hunt them too'
        : 'Patrolling its ground — sights the user and gives chase',
    territory: 'band',
    territoryNote: 'War-band — a struck orc alerts its bandmates to join the hunt, never to fight them',
    duel: null,
    water: 'none',
    waterNote: 'No drink law in Middle-earth code',
    breeding: false,
    breedingNote: 'No breeding — dead records refill on the pod respawn clock',
    groupSize: kind === 'captain' ? 1 : 3,
    deathCause: dead ? 'combat' : null,
    respawnAt: null,
    respawnNeedsDistanceM: null,
    hour: Math.round(localHour(new Date(t)) * 10) / 10,
    night: isNightAt(new Date(t)),
  };
  if (dead) {
    const deadAt = Number(opts.deadAt) || 0;
    base.respawnAt = deadAt + respawnS;
    base.respawnNeedsDistanceM = RESPAWN_MIN_DIST;
    base.breedingNote = `Refills ${respawnS} s after death, once the player is ${RESPAWN_MIN_DIST} m away`;
  }
  base.line = lifeLine(base);
  return base;
}

/** Orc population for one pod: runs the pod's blanket field
 *  with a tryPlace the caller supplies (the zone's clearance
 *  predicate, or () => true in tests). */
export function orcPopulation(podId, tryPlace) {
  const def = PODS[podId];
  if (!def) return null;
  const records = spawnField(def.seed, def.orcs || {}, tryPlace || (() => true));
  const warriors = records.filter((r) => r.kind === 'warrior');
  const captains = records.filter((r) => r.kind === 'captain');
  return {
    pod: podId,
    total: records.length,
    warriors: warriors.length,
    captains: captains.length,
    camps: (def.orcs || {}).camps || 0,
    rovers: (def.orcs || {}).rovers || 0,
    meetsWarriors: warriors.length >= MIN_WARRIORS_PER_POD,
    hasCaptains: captains.length > 0,
  };
}

/** Orc population across all six pods. */
export function orcPopulationAll(tryPlace) {
  const perPod = {};
  let warriors = 0;
  let captains = 0;
  const captainPods = [];
  for (const podId of POD_ORDER) {
    const p = orcPopulation(podId, tryPlace);
    perPod[podId] = p;
    warriors += p.warriors;
    captains += p.captains;
    if (p.captains > 0) captainPods.push(podId);
  }
  return {
    perPod,
    warriors,
    captains,
    captainPods,
    meetsWarriors: Object.values(perPod).every((p) => p.meetsWarriors),
    meetsCaptains: captains >= MIN_CAPTAINS_REALM && captainPods.length >= MIN_CAPTAIN_PODS,
  };
}

// ── Saruman ──────────────────────────────────────────────────
/**
 * Life of the boss. `boss` is a createSaruman() record;
 * `opts` carries { totalKills, nowMs }. Dormant until the
 * 30-kill gate opens, ready within 26 m, combat, dead —
 * dead is permanent (campaign complete, no respawn).
 */
export function bossLifeFor(boss, now = Date.now(), opts = {}) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const state = !boss ? 'dormant' : boss.state;
  const gateOpen = (opts.totalKills || 0) >= SARUMAN_GATE_KILLS;
  const life = {
    realm: 'middle-earth',
    kind: 'boss',
    name: 'Saruman',
    state,
    activity: state === 'combat' ? 'combat' : state === 'dead' ? 'dead' : 'waiting',
    moving: false,
    hp: boss ? boss.hp : BOSS_MAX_HP,
    maxHp: BOSS_MAX_HP,
    phase: boss ? bossPhase(boss.hp) : 1,
    gateKills: SARUMAN_GATE_KILLS,
    gateOpen,
    wakeDistM: BOSS_WAKE_DIST,
    feeding: state === 'combat' ? 'hunt-user' : 'none',
    feedingNote: state === 'combat'
      ? 'Casting telegraphed blasts at the user — the Voice slows their stride'
      : 'Dormant — blade and bow pass over him until the gate opens',
    territory: 'boss',
    territoryNote: 'One boss, one campaign — a singleton by design',
    duel: null,
    water: 'none',
    waterNote: 'No drink law in Middle-earth code',
    breeding: false,
    breedingNote: 'No respawn — death completes the campaign, permanently',
    groupSize: 1,
    deathCause: state === 'dead' ? 'combat' : null,
    hour: Math.round(localHour(new Date(t)) * 10) / 10,
    night: isNightAt(new Date(t)),
  };
  life.line = lifeLine(life);
  return life;
}

// ── Dragons ──────────────────────────────────────────────────
/**
 * Life of a dragon (createDragon() record). `opts` carries
 * { deadAt, respawnS } — a dead dragon refills on its pod's
 * respawn clock once the player is > 65 m away, the orc rule.
 * Alive: roam (patrolling its ground) / chase / windup (about
 * to breathe fire or bite) — the hunt, honestly reported.
 */
export function dragonLifeFor(dragon, now = Date.now(), opts = {}) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const kind = dragon && dragon.kind === 'fell-beast' ? 'fell-beast' : 'dragon';
  const stats = DRAGON_KINDS[kind];
  const respawnS = opts.respawnS != null ? opts.respawnS : 40;
  const dead = !dragon || dragon.state === 'dead';
  const hunting = !dead && (dragon.state === 'chase' || dragon.state === 'windup');
  const life = {
    realm: 'middle-earth',
    kind: 'placed',
    isDragon: true,
    dragonKind: kind,
    name: (dragon && dragon.name) || (kind === 'fell-beast' ? 'A Fell Beast' : 'A Dragon of the Wastes'),
    model: kind,
    pod: (dragon && dragon.pod) || 'mordor',
    state: dead ? 'dead' : dragon.state,
    activity: dead ? 'dead' : hunting ? 'hunt' : 'roam',
    moving: hunting,
    hp: dragon ? dragon.hp : 0,
    maxHp: stats.hp,
    feeding: dead ? 'none' : hunting ? 'hunt-user' : 'roam',
    feedingNote: dead
      ? 'Dead — does not hunt'
      : hunting
        ? 'Hunting the user — fire breath at range, bite up close'
        : 'Roaming its ground — sights the user and gives chase',
    territory: 'wastes',
    territoryNote: 'A dragon-class hunter — it roams Mordor and chases what it sees',
    duel: null,
    water: 'none',
    waterNote: 'No drink law in Middle-earth code',
    breeding: false,
    breedingNote: `No breeding — refills ${respawnS} s after death, once the player is ${RESPAWN_MIN_DIST} m away`,
    groupSize: 1,
    deathCause: dead ? 'combat' : null,
    respawnAt: null,
    respawnNeedsDistanceM: null,
    hour: Math.round(localHour(new Date(t)) * 10) / 10,
    night: isNightAt(new Date(t)),
  };
  if (dead) {
    const deadAt = Number(opts.deadAt) || 0;
    life.respawnAt = deadAt + respawnS;
    life.respawnNeedsDistanceM = RESPAWN_MIN_DIST;
  }
  life.line = lifeLine(life);
  return life;
}

// ── Placed creatures ─────────────────────────────────────────
/** The placed creature defs (data.js characters, creature: true). */
export function placedCreatures(podId) {
  const def = PODS[podId];
  if (!def) return [];
  return (def.characters || [])
    .filter((c) => c && c.creature === true)
    .map((c) => ({ id: c.id, model: c.model, name: c.name, x: c.at[0], z: c.at[1], height: c.height, pod: podId }));
}

/**
 * Life of a placed creature. Dragon-class defs (dragon /
 * fell-beast) are HUNTERS now (Merlin, Nov 26): the life line
 * says they hunt, carry HP, and drop scales or fire orbs. The
 * Eagle, Horse and Warg stay ambient, never die, no diet in
 * code — the life line says so plainly rather than inventing
 * a hunt or a death for them.
 *
 * NOTE on the figure tag's second line (video 2, f_86): the
 * small subtitle under "A Dragon of the Wastes" IS this life
 * line — it now reads "Hunts · 400 HP · drops Dragon Scales
 * or Fire Orbs" instead of "Ambient · no hunt, no death".
 */
export function placedCreatureLifeFor(def, now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const dragon = isDragonModel(def && def.model);
  const stats = dragon ? DRAGON_KINDS[def.model] : null;
  const life = {
    realm: 'middle-earth',
    kind: 'placed',
    isDragon: dragon,
    name: (def && def.name) || 'Creature',
    model: (def && def.model) || null,
    pod: (def && def.pod) || null,
    state: 'alive',
    activity: dragon ? 'roam' : 'ambient',
    moving: false,
    hp: dragon ? stats.hp : null,
    maxHp: dragon ? stats.hp : null,
    feeding: dragon ? 'hunt-user' : 'none',
    feedingNote: dragon
      ? 'Hunts the user — fire breath at range, bite up close'
      : 'Ambient figure — no diet or hunt in code',
    territory: dragon ? 'wastes' : 'peace',
    territoryNote: dragon
      ? 'A dragon-class hunter — it roams Mordor and chases what it sees'
      : 'No territory law in code for placed creatures',
    duel: null,
    water: 'none',
    waterNote: 'No drink law in Middle-earth code',
    breeding: false,
    breedingNote: dragon
      ? 'No breeding — refills on the pod respawn clock, once the player is 65 m away'
      : 'Placed once — no breeding, no death in code',
    groupSize: 1,
    deathCause: null,
    hour: Math.round(localHour(new Date(t)) * 10) / 10,
    night: isNightAt(new Date(t)),
  };
  life.line = lifeLine(life);
  return life;
}

/**
 * The deterministic second copy per placed creature: mirrored
 * across the pod centre (0, 0), ≥ 100 m from the original (a
 * mirrored point near the centre is pushed out along its own
 * direction). Pure records the zone can place beside the first.
 */
export function placedCreatureExtras(podId) {
  const out = [];
  for (const c of placedCreatures(podId)) {
    let x = -c.x;
    let z = -c.z;
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < PLACED_SPREAD_MIN_M) {
      const dir = Math.hypot(x, z) || 1;
      const push = (PLACED_SPREAD_MIN_M - d) / 2 + 10;
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

// ── Conductor ────────────────────────────────────────────────
/**
 * The full life state of one Middle-earth creature. `creature`
 * carries { kind: 'orc' | 'boss' | 'placed' | 'companion' } —
 * orc records, boss records, placed defs, or backpack dino
 * items. `opts` carries the live context ({ deadAt, clock,
 * respawnS, totalKills, nowMs }). Pure for orcs / boss /
 * placed; companions read the backpack record (the truth).
 */
export function lifeFor(creature, now = Date.now(), opts = {}) {
  if (!creature) return null;
  if (creature.kind === 'companion' || (creature.meta && creature.meta.species)) {
    return companionLifeFor(creature, now);
  }
  if (creature.kind === 'boss' || creature.isBoss === true) {
    return bossLifeFor(creature, now, opts);
  }
  if (creature.isDragon === true || isDragonKind(creature.kind)) {
    return dragonLifeFor(creature, now, opts);
  }
  if (creature.kind === 'placed' || creature.creature === true) {
    return placedCreatureLifeFor(creature, now);
  }
  // Default: an orc record.
  return orcLifeFor(creature, now, opts);
}

/** The tap-card life line, Earth 4 style. */
export function lifeLine(life) {
  if (!life) return '';
  if (life.state === 'dead') {
    if (life.kind === 'boss') return 'Remains — Saruman — the campaign is complete';
    if (life.respawnAt != null) return `Remains — ${life.name || 'Orc'} — returns on the respawn clock`;
    return `Remains — ${life.name || 'Creature'}`;
  }
  if (life.kind === 'boss') {
    if (life.state === 'dormant') return `Saruman · Dormant · gate opens at ${life.gateKills} orc kills`;
    if (life.state === 'ready') return 'Saruman · Waiting · approach within 26 m to wake him';
    return `Saruman · Combat · phase ${life.phase} · ${life.hp}/${life.maxHp} HP`;
  }
  if (life.kind === 'placed') {
    if (life.isDragon) {
      if (life.state === 'dead') return `Remains — ${life.name} — returns on the respawn clock`;
      if (life.activity === 'hunt') {
        return `${life.name} · Hunting you · ${life.hp}/${life.maxHp} HP`;
      }
      if (life.hp != null && life.maxHp != null && life.hp < life.maxHp) {
        return `${life.name} · Roaming · ${life.hp}/${life.maxHp} HP`;
      }
      return `${life.name} · Hunts · ${life.maxHp} HP · drops Dragon Scales or Fire Orbs`;
    }
    return `${life.name} · Ambient · no hunt, no death in code`;
  }
  if (life.isAlly) return `${life.stageName || 'Adult'} · Following you · Ally`;
  const parts = [life.name || 'Orc', life.activity === 'chase' ? 'Hunting you' : 'Patrolling'];
  if (life.orcKind === 'captain') parts.push('Captain');
  if (life.groupSize > 1) parts.push(`Band of ${life.groupSize}`);
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

/** The hunt-meter reading for the life line (hunt.js). */
export function huntHeatLine(heat) {
  return `Hunt heat: ${heatLevel(heat)} (${Math.round(heat)})`;
}
