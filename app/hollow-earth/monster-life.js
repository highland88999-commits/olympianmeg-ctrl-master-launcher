// app/hollow-earth/monster-life.js
// HOLLOW EARTH — MONSTER LIFE AGENTS (the seven-agent life line).
//
// Merlin, Nov 16 ~02:31: agents inside the MonsterVerse monsters
// — the same seven-agent pattern Jupiter 2 got in the full-planet
// build (lib/jupiter2/operators.js): birth, growth, death,
// decomposition, diet, habits + conductor. Monster-shaped for
// Hollow Earth — J2's pattern, HE's numbers where the worlds
// differ. The conductor lives in operators.js (monsterLifeFor)
// and humanoid-operators.js (monsterLifeFor); this module is the
// pure agent layer both conductors read, and the simulation
// (spawns.js stepMonster) reads its hunger + age verdicts from
// here too — never a second copy of either rule.
//
// THE ONE DEATH LAW (this module's call, stated plainly):
// Hollow Earth is a SESSION world — the field is built on entry
// (spawnField) and rebuilds on re-entry — so J2's multi-day
// decomposition clock (30 / 14 days) and the house 45 s respawn
// clock CANNOT both be true: two death clocks would fight over
// the same corpse. The 45 s clock WINS, and it IS the
// decomposition window: death (any cause — combat, predation,
// territorial-duel, age) → remains lie for 45 s, fading (the
// zone's remains disc fades over exactly that window) → the
// next generation is born in the same slot (respawnMonster:
// same id, same family, new position near the death point,
// full HP). One clock, three readings: respawn, decomposition,
// generation. J2's long clocks are the wrong shape here —
// nothing in HE lives across sessions, so nothing decomposes
// across days either.
//
// AGE DEATH: lifespans are days, per family by the HP-band rule
// below (a STATED CONVENTION by body size, per lib/life-clock.js
// — never presented as listed data). The field is seeded
// mid-life on entry (birthMs hashed from type+id, age 0..90% of
// lifespan), so in any one session age death is RARE but REAL —
// the monsters seeded closest to their lifespan end are the ones
// that die of age while you watch, and the wiring (stepMonster
// → monster-killed 'age' → remains → next generation) is the
// same path every other death takes. A generation born by
// respawn starts at age 0 with its full lifespan ahead of it.
//
// HUNGER (WS3 audit G7's call, now settled): J2's clock, adopted
// verbatim (0→1 over 210 s, hungry ≥ 0.72 — Merlin's numbers).
// It gates ONLY the monster-vs-monster CHASE: a carrier closes
// on prey only while hungry, so the field is not in permanent
// frenzy. It NEVER gates the player hunt (a spotted monster
// always hunts the player — HE is harsher on willingness than
// J2, and that stays) and NEVER gates the aura (the aura is not
// a hunt decision — it fires unspotted, per the shared law).
//
// DIET: read from the family record (families.js attitude /
// archetype / habitat / element + the ELEMENT_AURA secondary),
// never invented. A monster's diet IS its hunt: other monsters
// and the hunter, taken the way its attitude and archetype say.
//
// PURE: every function here is a function of (record, device
// clock) — no THREE, no DOM, no stored state, no server.
//
// EXEMPTIONS (standing): Korus (boss — never a monster record)
// and Ghorrum (watcher — never a monster record) have no life
// line here; korusLifeFor / watcherLifeFor stay as-is.

import { hash01, DAY_MS } from '../../lib/life-clock.js';
import { ELEMENT_AURA } from './elemental-aura.js';

/** Death causes in Hollow Earth (J2's list, HE-shaped: no user-kill — HE has no blaster/orb drop). */
export const DEATH_CAUSES = Object.freeze(['age', 'combat', 'predation', 'territorial-duel']);

/** Hunger law — J2's numbers, adopted verbatim (see header). */
export const HUNGER_RISE_S = 210;
export const HUNGER_THRESHOLD = 0.72;
export const HUNGER_SEED = 20261103; // J2's diet salt — the same phase law

/** Birth seed — the field's mid-life ages hash from type+id. */
export const BIRTH_SEED = 20261116;

/** Decomposition stages over the 45 s remains window (J2's three-stage shape, HE's window). */
export const DECOMP_STAGES = Object.freeze(['fresh remains', 'fading charge', 'ash drift']);

/** Growth stages by age fraction of lifespan (J2's thresholds, HE's names). */
export const GROWTH_STAGES = Object.freeze(['young', 'juvenile', 'adult', 'elder']);
const GROWTH_SIZE = { young: 0.6, juvenile: 0.8, adult: 1.0, elder: 0.9 };
const GROWTH_NAMES = { young: 'Young', juvenile: 'Juvenile', adult: 'Adult', elder: 'Elder' };

/**
 * LIFESPAN RULE (worker's call, stated plainly): a family's
 * lifespan follows Merlin's HP band (every regular monster sits
 * 100–200 HP) — skirmishers live shortest, brutes longest —
 * and every dragon lives the J2 dragon lifespan whatever its HP.
 *   dragon → 420 days (J2 parity)
 *   HP ≥ 180 → 420 days (brutes: Road Colossus, Cinder Maw, …)
 *   HP ≥ 140 → 300 days (hunters)
 *   else → 180 days (skirmishers)
 * A STATED CONVENTION by body size (lib/life-clock.js) — never
 * presented as listed data.
 */
export const LIFESPAN_SOURCE = 'convention';
export const LIFESPAN_RULE = 'dragon 420 d · HP ≥ 180 → 420 d · HP ≥ 140 → 300 d · else 180 d';

export function lifespanDaysFor(type) {
  if (!type) return 180;
  if (type.dragon) return 420;
  const hp = Number(type.hp) || 100;
  if (hp >= 180) return 420;
  if (hp >= 140) return 300;
  return 180;
}

// ── Birth Agent ──────────────────────────────────────────────
/**
 * Seeded birth: the field is already mid-life on entry — age
 * 0..90% of the family's lifespan, hashed from type+id so the
 * same slot always draws the same birth. Never past the
 * lifespan (a monster is never born already dead of age).
 */
export function birthMsFor(typeKey, id, lifespanDays, nowMs = Date.now()) {
  const t = nowMs instanceof Date ? nowMs.getTime() : Number(nowMs);
  const seed = hash01(`${String(typeKey)}:${String(id)}`, BIRTH_SEED);
  return t - Math.floor(seed * 0.9 * lifespanDays * DAY_MS);
}

/** Age in days at the device clock, or null when the record carries no birth (never invented). */
export function ageDaysFor(m, nowMs = Date.now()) {
  if (!m || !Number.isFinite(m.birthMs)) return null;
  const t = nowMs instanceof Date ? nowMs.getTime() : Number(nowMs);
  return Math.max(0, (t - m.birthMs) / DAY_MS);
}

// ── Growth Agent ─────────────────────────────────────────────
/** Growth stage from age fraction of lifespan (J2's thresholds: 0.15 / 0.45 / 0.8). */
export function growthStageFor(ageDays, lifespanDays) {
  const f = lifespanDays > 0 ? Math.max(0, Math.min(1, ageDays / lifespanDays)) : 0;
  if (f < 0.15) return GROWTH_STAGES[0];
  if (f < 0.45) return GROWTH_STAGES[1];
  if (f < 0.8) return GROWTH_STAGES[2];
  return GROWTH_STAGES[3];
}

/**
 * Growth state at the device clock: stage + size factor + size
 * in metres (the family's scaleM, factored by stage). A READ
 * only — the GLB never resizes in code (the figure is placed at
 * its family scaleM); the stage is the life line's read on the
 * monster's age, not a mesh change.
 */
export function growthFor(m, nowMs = Date.now()) {
  const type = (m && m.stats) || null;
  const scaleM = type ? type.scaleM : null;
  const ageDays = ageDaysFor(m, nowMs);
  if (ageDays == null) {
    return {
      stage: 'adult', stageName: 'Adult', fraction: null, sizeFactor: 1, sizeM: scaleM,
      note: 'No birth on the record — age unknown, never invented; read as adult',
    };
  }
  const lifespanDays = (m && m.lifespanDays) || lifespanDaysFor(type);
  const stage = growthStageFor(ageDays, lifespanDays);
  const sizeFactor = GROWTH_SIZE[stage] || 1;
  return {
    stage,
    stageName: GROWTH_NAMES[stage] || 'Adult',
    fraction: Math.round((ageDays / lifespanDays) * 1000) / 1000,
    sizeFactor,
    sizeM: scaleM != null ? Math.round(scaleM * sizeFactor * 100) / 100 : null,
    note: 'Placed at the family scaleM — monsters never grow in code; the stage is a read on age',
  };
}

// ── Death Agent ──────────────────────────────────────────────
/** The age-death instant for a generation: birth + lifespan, or null with no birth on the record. */
export function ageDeathMsFor(m) {
  if (!m || !Number.isFinite(m.birthMs)) return null;
  const lifespanDays = m.lifespanDays || lifespanDaysFor(m.stats);
  return m.birthMs + lifespanDays * DAY_MS;
}

/** True when a live monster's lifespan has run out at the device clock. Dead monsters never re-die. */
export function ageDeathDue(m, nowMs = Date.now()) {
  if (!m || m.dead) return false;
  const deathMs = ageDeathMsFor(m);
  if (deathMs == null) return false;
  const t = nowMs instanceof Date ? nowMs.getTime() : Number(nowMs);
  return t >= deathMs;
}

/**
 * Death state: for the dead, the record's cause (combat /
 * predation / territorial-duel / age) + killer + the 45 s
 * respawn clock; for the living, the age death that awaits
 * (birth + lifespan) — the kill that moves it earlier is the
 * simulation's, read from the record, never re-derived here.
 */
export function deathFor(m, nowMs = Date.now()) {
  if (!m) return { state: 'alive', cause: null, killerId: null, deathMs: null, byAge: false, respawnAtMs: null };
  if (m.dead) {
    return {
      state: 'dead',
      cause: m.deathCause || 'combat',
      killerId: m.killerId || null,
      deathMs: Number.isFinite(m.diedAtMs) ? m.diedAtMs : null,
      byAge: m.deathCause === 'age',
      respawnAtMs: m.respawnAtMs || null,
    };
  }
  return {
    state: 'alive',
    cause: null,
    killerId: null,
    deathMs: ageDeathMsFor(m),
    byAge: true,
    respawnAtMs: null,
  };
}

// ── Decomposition Agent ──────────────────────────────────────
/**
 * What a body does after death: it lies for the 45 s respawn
 * window and fades — fresh remains, fading charge, ash drift —
 * and then the next generation is born in the same slot. The
 * window is read off the record (respawnAtMs − diedAtMs, the
 * 45 s clock markMonsterDead sets); a dead record with no
 * respawn time has an unknown window, never an invented one.
 */
export function decompFor(m, nowMs = Date.now()) {
  const t = nowMs instanceof Date ? nowMs.getTime() : Number(nowMs);
  if (!m || !m.dead) {
    return {
      remains: 'none', fraction: 0, stageIndex: null, stageName: null,
      stages: DECOMP_STAGES, windowS: null, nextGenerationAt: null,
      note: 'Alive — no remains',
    };
  }
  if (!Number.isFinite(m.diedAtMs)) {
    return {
      remains: 'unknown', fraction: null, stageIndex: null, stageName: null,
      stages: DECOMP_STAGES, windowS: null, nextGenerationAt: m.respawnAtMs || null,
      note: 'Dead, but no death time on the record — the remains window is unknown, never invented',
    };
  }
  const windowMs = (m.respawnAtMs && m.respawnAtMs > m.diedAtMs) ? (m.respawnAtMs - m.diedAtMs) : null;
  const fraction = windowMs != null
    ? Math.max(0, Math.min(1, (t - m.diedAtMs) / windowMs))
    : null;
  const stageIndex = fraction == null ? null : Math.min(DECOMP_STAGES.length - 1, Math.floor(fraction * DECOMP_STAGES.length));
  return {
    remains: 'fading disc',
    fraction: fraction == null ? null : Math.round(fraction * 1000) / 1000,
    stageIndex,
    stageName: stageIndex == null ? null : DECOMP_STAGES[stageIndex],
    stages: DECOMP_STAGES,
    windowS: windowMs != null ? Math.round(windowMs / 1000) : null,
    nextGenerationAt: m.respawnAtMs || null,
    note: windowMs != null
      ? 'Remains lie for the 45 s respawn window, fading — then the next generation is born in the same slot'
      : 'Dead — no respawn time on the record, so the remains window is unknown',
  };
}

// ── Hunger Agent (J2's clock — see header) ───────────────────
/**
 * Hunger cycles 0→1 over HUNGER_RISE_S on the device clock,
 * phase-seeded per monster (type+id) so the field is never in
 * lockstep. Hungry at ≥ 0.72. Pure — the simulation and the
 * conductors all read this one function.
 */
export function hungerFor(m, nowMs = Date.now()) {
  const t = nowMs instanceof Date ? nowMs.getTime() : Number(nowMs);
  const key = `${(m && m.type) || 'monster'}:${(m && m.id) || ''}`;
  const hunger = ((t / (HUNGER_RISE_S * 1000) + hash01(key, HUNGER_SEED)) % 1);
  const hungry = hunger >= HUNGER_THRESHOLD;
  return {
    hunger: Math.round(hunger * 1000) / 1000,
    hungry,
    threshold: HUNGER_THRESHOLD,
    riseS: HUNGER_RISE_S,
    note: hungry
      ? 'Hungry — closes on monster prey while the hunger lasts'
      : 'Not hungry — roaming on its element; the player hunt is never hunger-gated',
  };
}

// ── Diet Agent ───────────────────────────────────────────────
/**
 * What a family eats — read from the family record (attitude /
 * archetype / habitat / element + its ELEMENT_AURA secondary),
 * never invented. A monster's diet IS its hunt: other monsters
 * and the hunter, taken the way its attitude and archetype say.
 * feedingMode is the live action: hunt-user / hunt-prey /
 * ambush-wait / roam / none (dead).
 */
const ATTITUDE_VERB = { stalk: 'Stalks', charge: 'Runs down', ambush: 'Lies in wait for' };
const SECONDARY_FEEDS = {
  burn: 'burns its prey',
  pool: 'leaves a corrosive pool under its prey',
  dot: 'venoms its prey',
  gloom: 'drives the gloom into its prey',
  veil: 'whips a sand veil around its prey',
  chill: 'chills its prey to a standstill',
};

export function dietFor(m, nowMs = Date.now(), opts = {}) {
  const type = (m && m.stats) || null;
  const dead = !!(m && m.dead);
  const spotted = !!(m && m.spotted) && !dead;
  // The prey this monster is chasing: the record's own chase
  // (set by stepMonster) trusted first; the conductor may pass
  // a derived prey id in opts.preyTarget (from opts.others —
  // the nearest prey inside the aura) when the record carries
  // none yet. Without either, prey is unknown, never invented.
  const preyTarget = !dead && ((m && m.preyTarget) || (opts && opts.preyTarget) || null);
  const ambush = !!(type && type.attitude === 'ambush');
  const feedingMode = dead ? 'none' : spotted ? 'hunt-user' : preyTarget ? 'hunt-prey' : ambush ? 'ambush-wait' : 'roam';
  const feedingNote = dead
    ? (m.respawnAtMs
      ? 'Dead — does not hunt (returns in 45 s, same family, near where it fell)'
      : 'Dead — does not hunt (and does not return this session)')
    : spotted
      ? 'Hunting the user — spotted by sight, hearing or proximity'
      : preyTarget
        ? 'Hunting another monster — a lightning carrier strikes prey inside its 59 m aura'
        : ambush
          ? 'Lying in wait — ambushers strike inside 10 m'
          : 'Roaming its habitat band';
  if (!type) {
    const hunger0 = hungerFor(m, nowMs);
    return {
      diet: null, prey: null, feedingMode, feedingNote,
      hunger: hunger0.hunger, hungry: hunger0.hungry,
      note: 'No family on the record — diet unknown, never invented',
    };
  }
  const row = ELEMENT_AURA[type.element] || null;
  const secondary = row ? row.secondary : null;
  const feed = (secondary && SECONDARY_FEEDS[secondary]) || 'strikes its prey';
  const verb = ATTITUDE_VERB[type.attitude] || 'Hunts';
  const article = /^[aeiou]/i.test(type.archetype) ? 'an' : 'a';
  const diet = `${verb} other monsters and the hunter — ${article} ${type.archetype} ${type.element} predator of the ${type.habitat} band, ${feed}.`;
  const hunger = hungerFor(m, nowMs);
  return {
    diet,
    prey: 'other monsters and the hunter',
    feedingMode,
    feedingNote,
    hunger: hunger.hunger,
    hungry: hunger.hungry,
    note: 'Diet read from the family record — attitude + archetype + habitat + element secondary, never invented',
  };
}

// ── Habits Agent ─────────────────────────────────────────────
/**
 * What a monster is doing: its behaviour state (stalk / charge
 * / ambush, roam / hunt / duel), read off the record — the same
 * states stepMonster already sets. Social shape is solitary
 * (each carrier picks the nearest prey independently; no shared
 * target, no pack — WS3 audit G12, read from code, not a gap).
 */
const ATTITUDE_HABIT = {
  stalk: 'Circles and closes on prey',
  charge: 'Bursts from range at prey',
  ambush: 'Lies still until prey closes in, then explodes',
};

export function habitsFor(m) {
  const type = (m && m.stats) || null;
  const dead = !!(m && m.dead);
  const activity = dead
    ? 'dead'
    : (m && m.state) === 'ambush' ? 'ambush-wait'
      : (m && m.dueling) ? 'duel'
        : (m && m.preyTarget) ? 'hunt-prey'
          : (m && m.spotted) ? ((m && m.state) || 'stalk')
            : 'roam';
  return {
    activity,
    moving: !dead && !!((m && m.spotted) || (m && m.preyTarget)) && (m && m.state) !== 'ambush',
    social: { behaviour: 'Solitary', groupSize: 1 },
    habit: type ? (ATTITUDE_HABIT[type.attitude] || 'Roams its habitat band') : 'Roams its habitat band',
    note: activity === 'dead'
      ? 'Dead — does not hunt (returns in 45 s, same family, near where it fell)'
      : activity === 'duel'
        ? 'Dueling a rival carrier — bigger scaleM wins'
        : activity === 'hunt-prey'
          ? 'Hunting another monster — hungry, closing at ×1.5 speed'
          : activity === 'ambush-wait'
            ? 'Lying in wait — ambushers strike inside 10 m'
            : (m && m.spotted)
              ? 'Hunting the user — spotted by sight, hearing or proximity'
              : 'Roaming its habitat band',
  };
}

// ── The seven-agent bundle ───────────────────────────────────
/**
 * The whole life line's agent bundle for one monster record at
 * the device clock — birth, growth, death, decomposition, diet,
 * habits, hunger. The conductors (operators.js / humanoid-
 * operators.js monsterLifeFor) assemble the tap-card life from
 * this; the simulation reads hunger + age death from here.
 */
export function lifeAgentsFor(m, nowMs = Date.now(), opts = {}) {
  const t = nowMs instanceof Date ? nowMs.getTime() : Number(nowMs);
  const type = (m && m.stats) || null;
  const lifespanDays = (m && m.lifespanDays) || lifespanDaysFor(type);
  const ageDays = ageDaysFor(m, t);
  const growth = growthFor(m, t);
  const death = deathFor(m, t);
  const decomp = decompFor(m, t);
  const diet = dietFor(m, t, opts);
  const habits = habitsFor(m);
  const hunger = hungerFor(m, t);
  return {
    birth: {
      birthMs: (m && Number.isFinite(m.birthMs)) ? m.birthMs : null,
      ageDays: ageDays == null ? null : Math.round(ageDays * 100) / 100,
      generation: (m && m.generation) || 0,
      lifespanDays,
      lifespanSource: LIFESPAN_SOURCE,
      lifespanRule: LIFESPAN_RULE,
      note: (m && Number.isFinite(m.birthMs))
        ? 'Seeded mid-life on entry — age 0..90% of lifespan, hashed from type+id'
        : 'No birth on the record — age unknown, never invented',
    },
    growth,
    death,
    decomp,
    diet,
    habits,
    hunger,
    generation: (m && m.generation) || 0,
  };
}
