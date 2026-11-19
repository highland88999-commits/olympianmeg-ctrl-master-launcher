// lib/jupiter2/operators.js — Jupiter 2 creature operators.
//
// The operator treatment, following the lib/earth4/operators.js +
// lib/life-clock.js pattern: a creature's whole life is a pure
// function of (place, species, device clock) — no stored state, no
// server tick. Two phones in the same place at the same time see
// the same creature at the same age doing the same thing.
//
// THE CREATURES (Merlin's spec, Nov 10 + Nov 16):
//   - LIGHTNING MONSTERS on the surface (the surface creatures)
//   - DRAGONS on the surface — Stormwing (sky-dragon) and Aureline
//     the Dawnscale ARE dragons in code (models.js: 'sky-dragon',
//     'aureline'), so the dragon kind is real, not invented. Red
//     lightning is theirs.
//   - DEMOBATS in the air (the air creatures)
//
// THE SEVEN AGENTS (Merlin, Nov 16 ~00:08 — "inject agents into
// these monsters"): birth, growth, death, decomposition, diet,
// habits + conductor. The monsters live, feed/hunt, age and die
// on their own clock instead of being static spawns. This is the
// monster-shaped variant of the humanoid seven-agent pattern
// (lib/afterlife/humanoid-operators.js): NO garment agent (a
// monster wears no clothes — its GLB is its body) and NO weapons
// agent (a monster carries no weapon — its lightning IS its
// weapon, wired as the aura in lib/lightning-aura.js, not a
// carried item). Those two are left out deliberately, stated
// here, not forgotten.
//
// DEATH LAW — SUPERSEDES the old "NO DEATH LAW" (Nov 15):
// the old law ("the spec orders none, so the creatures persist",
// life.death === null) stood until Merlin ordered agents on
// Nov 16 ~00:08 ("so they live/feed/age/die on their own clock").
// The death law now reads:
//   * AGE — death = birth + lifespan (420 days lightning
//     monsters + dragons, 180 demobats — the same lifespan
//     numbers the growth stages always used; they were a
//     'convention' for stages only, and now they also end the
//     life — the lifespanSource stays 'convention', flagged
//     wherever it surfaces).
//   * PREDATION — killed by another monster's lightning: a
//     monster inside another monster's 59 m aura takes the
//     burn law and dies at 0 HP (cause 'predation') — demobats
//     diving low, rival lightning monsters and dragons alike
//     (monster-vs-monster, Merlin Nov 16 ~01:02).
//   * TERRITORIAL DUEL — two lightning monsters / dragons within
//     50 m fight; the bigger wins, the loser dies (cause
//     'territorial-duel', Earth 2's duel law).
// After death the remains decompose (30 days lightning/dragon,
// 14 demobat — the worker's call), then the next generation is
// born in the same slot — the cell never stands empty and the
// roster (7 + 9) holds forever while individuals turn over
// (Earth 4's generation pattern). A kill is passed in through
// ctx.kill ({ generation, cause, diedAtMs, killerId }) — the
// scene owns the HP that decides it; the operator only reads it.
//
// THE HUNT (Merlin, Nov 16 ~00:09 — "the J2 monsters hunt"):
// the Earth 2 predator economy, J2-shaped. A monster hunts when
// HUNGRY (hunger ≥ 0.72 — Earth 2's threshold, hunger cycling
// 0→1 over 210 s on the clock) and prey is inside the 140 m
// stalk range (Earth 2's stalkRangeM). PREY, resolved in code:
//   * the WALKER ON FOOT, alive — USER FIRST, always. A walker
//     in the speeder is NOT prey (mounted = immune — Earth 2's
//     walkerImmune pattern; the speeder is the escape).
//   * OTHER MONSTERS (Merlin, Nov 16 ~01:02 — "make monsters
//     attack each other, not just the user"): every kind hunts
//     other monsters, user still first. The matrix (worker's
//     call): lightning monsters and dragons hunt demobats
//     DIVING LOW (demobats dive after dark, and only then are
//     they in reach) and other lightning monsters / dragons
//     beyond duel range (inside 50 m the duel decides instead);
//     demobats hunt other demobats air-to-air, and lightning
//     monsters / dragons only while diving low themselves.
//     Nearest prey wins; the attack is the same 59 m aura law.
// The hunt ENDS when the prey leaves 140 m, dies, the walker
// mounts the speeder, or the hunger phase wraps below 0.72 —
// the decision is re-evaluated every tick from the clock and the
// live positions, so there is no stored "unseen" timer to go
// stale. The ATTACK is the lightning aura (lib/lightning-aura.js):
// inside 59 m the streaks strike (8 hit + 6/s burn for 3 s,
// at most one streak per 1.5 s). The operator decides; the scene
// moves the mesh and applies the damage.

import { hash01, localHour } from '../life-clock.js';
import { JUPITER2_FOUNDING_MS } from './profile.js';
import { lightningModelFor } from './models.js';
import { auraFor, AURA_R_M } from '../lightning-aura.js';

export const JUPITER2_FOUNDING = JUPITER2_FOUNDING_MS;
export const DAY_MS = 86400000;

/** Death causes on Jupiter 2 (Merlin's agent order, Nov 16 ~00:08). 'user-kill' joined Nov 16 ~01:16 (elemental orbs, round 2 workstream 7): a monster the USER kills with the speeder blaster — its kill carries killerId 'user', and only a user kill drops an elemental orb. */
export const DEATH_CAUSES = Object.freeze(['age', 'predation', 'territorial-duel', 'user-kill']);

/** Hunt law — the Earth 2 numbers, J2-shaped (see header). */
export const HUNT_STALK_M = 140;
export const HUNT_HUNGER_THRESHOLD = 0.72;
export const HUNGER_RISE_S = 210;
export const TERRITORY_R_M = 50;
export const CHASE_SPEED_MPS = 9;
export const DEMOBAT_DIVE_SPEED_MPS = 12;

/** Decomposition: how long remains lie before the next generation (worker's call). */
export const DECOMP_DAYS = Object.freeze({
  'lightning-monster': 30,
  dragon: 30,
  demobat: 14,
});

/** Decomposition stages — a lightning creature's charge fades, it does not rot. */
export const DECOMP_STAGES = Object.freeze(['fading charge', 'cold husk', 'ash drift']);

/** Model keys that ARE dragons (models.js — read, not invented). */
export const DRAGON_MODEL_KEYS = Object.freeze(['sky-dragon', 'aureline']);

/**
 * Lightning-roster slots that hold the cave-mouth guard dragons
 * (Stormwing 3, Aureline 4 — modelFor below). The guard pair never
 * duels or hunts each other (lib/jupiter2/guard.js): they stand
 * together at the cave mouth, and the hunt law would otherwise
 * turn them on each other the moment they came within 50 m.
 */
export const GUARD_DRAGON_SLOTS = Object.freeze([3, 4]);

/** True when a lightning-monster slot holds a guard dragon. */
export function isGuardDragonSlot(kind, index) {
  return kind === 'lightning-monster' && GUARD_DRAGON_SLOTS.includes(Number(index));
}

export const CREATURE_KINDS = {
  'lightning-monster': {
    kind: 'lightning-monster',
    name: 'Lightning Monster',
    realm: 'surface',
    diet: 'Feeds on storm charge — drinks lightning, grazes the charged cloud deck.',
    habit: 'Stalks the cloud deck in the storm; flares bright when a strike lands nearby.',
    lifespanDays: 420,
    lifespanSource: 'convention',
  },
  dragon: {
    kind: 'dragon',
    name: 'Dragon',
    realm: 'surface',
    diet: 'Hunts storm charge and lesser flyers — red lightning is its strike.',
    habit: 'Circles the storm deck; dives on prey after dark.',
    lifespanDays: 420,
    lifespanSource: 'convention',
  },
  demobat: {
    kind: 'demobat',
    name: 'Demobat',
    realm: 'air',
    diet: 'Feeds on storm moths and wind-borne charge in the upper storm.',
    habit: 'Circles high in the storm by day, dives low through the rain after dark.',
    lifespanDays: 180,
    lifespanSource: 'convention',
  },
};

const GROWTH_STAGES = ['spark', 'juvenile', 'adult', 'elder'];
/** Size factor by growth stage (worker's call — a spark is small, an elder slightly shrunken). */
const GROWTH_SIZE = { spark: 0.4, juvenile: 0.7, adult: 1.0, elder: 0.9 };

/** Growth stage from age: spark → juvenile → adult → elder. */
export function growthStage(kind, ageDays) {
  const spec = CREATURE_KINDS[kind];
  if (!spec) return 'adult';
  const f = Math.max(0, Math.min(1, ageDays / spec.lifespanDays));
  if (f < 0.15) return GROWTH_STAGES[0];
  if (f < 0.45) return GROWTH_STAGES[1];
  if (f < 0.8) return GROWTH_STAGES[2];
  return GROWTH_STAGES[3];
}

/** Growth state at an age: stage + size factor + size in metres (needs the model's height). */
export function growthFor(kind, ageDays, heightM = 0) {
  const stage = growthStage(kind, ageDays);
  const sizeFactor = GROWTH_SIZE[stage] || 1;
  return { stage, sizeFactor, sizeM: Math.round(heightM * sizeFactor * 100) / 100 };
}

/** What the creature is doing at the device clock's hour. */
export function activityFor(kind, nowMs) {
  const h = localHour(nowMs);
  if (kind === 'dragon') {
    if (h >= 22 || h < 4) return 'diving on prey after dark';
    if (h >= 4 && h < 10) return 'riding the high winds';
    if (h >= 10 && h < 16) return 'circling the storm deck';
    return 'hunting the cloud deck';
  }
  if (kind === 'lightning-monster') {
    // Surface monsters flare and feed hardest in the deep storm
    // hours (late night), and rest low in the bright hours.
    if (h >= 22 || h < 4) return 'feeding on storm charge';
    if (h >= 4 && h < 10) return 'stalking the cloud deck';
    if (h >= 10 && h < 16) return 'resting low in the murk';
    return 'stalking the cloud deck';
  }
  // Demobats: high circles by day, low dives after dark.
  if (h >= 20 || h < 5) return 'diving low through the rain';
  if (h >= 5 && h < 11) return 'circling high in the storm';
  return 'riding the storm winds';
}

/** True when the model behind a lightning-monster slot is a dragon. */
export function isDragonModel(modelKey) {
  return DRAGON_MODEL_KEYS.includes(String(modelKey || ''));
}

/**
 * The real model behind one creature — the Monsterverse lightning
 * seat for a deck monster, the Hawkins demobat for a bat. The tap
 * card names the creature you are actually looking at (Volta, Auric
 * Storm, …), not the generic kind. The model is data only; the
 * scene mounts the GLB.
 */
export function modelFor(kind, index) {
  if (kind === 'dragon') {
    // The two dragon models, by deck slot: Stormwing is slot 3,
    // Aureline is slot 4 of the lightning roster.
    const dragons = [lightningModelFor(3), lightningModelFor(4)];
    return dragons[index % dragons.length];
  }
  if (kind === 'lightning-monster') return lightningModelFor(index);
  if (kind === 'demobat') return { key: 'demobats', name: 'Demobat', heightM: 2.0, blurb: '' };
  return null;
}

/** The lightning kind of a creature: dragons strike red, the rest by their kind. */
export function lightningKindFor(kind, index) {
  if (kind === 'demobat') return 'demobat';
  if (kind === 'dragon') return 'dragon';
  const model = modelFor(kind, index);
  if (model && isDragonModel(model.key)) return 'dragon';
  return 'lightning-monster';
}

// ── Birth Agent ─────────────────────────────────────────────────
// Seeded birth before founding, so the world is already mid-life
// on day one; ageDays drives the growth stage. The conductor walks
// generations from here: death + decomposition, then the next
// birth in the same slot.
export function birthFor(kind, index, nowMs = Date.now()) {
  const spec = CREATURE_KINDS[kind];
  if (!spec) return null;
  const seed = hash01(`${kind}:${index}`, 20261115);
  const birthMs = JUPITER2_FOUNDING_MS - Math.floor(seed * spec.lifespanDays * DAY_MS);
  return { birthMs, ageDays: Math.max(0, (nowMs - birthMs) / DAY_MS), seed };
}

// ── Death Agent ─────────────────────────────────────────────────
// The death that AWAITS a generation: age, at birth + lifespan.
// A kill (predation / duel) passed through ctx.kill moves it
// earlier — the conductor resolves which applies.
export function deathFor(kind, birthMs, kill = null) {
  const spec = CREATURE_KINDS[kind];
  if (!spec) return null;
  const ageDeathMs = birthMs + spec.lifespanDays * DAY_MS;
  if (kill && Number.isFinite(kill.diedAtMs) && kill.diedAtMs < ageDeathMs
    && DEATH_CAUSES.includes(kill.cause) && kill.cause !== 'age') {
    return { dies: true, deathMs: kill.diedAtMs, cause: kill.cause, killerId: kill.killerId || null, byAge: false };
  }
  return { dies: true, deathMs: ageDeathMs, cause: 'age', killerId: null, byAge: true };
}

// ── Decomposition Agent ─────────────────────────────────────────
// After death, the remains fade over DECOMP_DAYS: the charge
// leaves first, then the husk cools, then ash drifts — then the
// slot is free for the next generation.
export function decompFor(kind, frac) {
  const f = Math.max(0, Math.min(1, Number(frac) || 0));
  const stages = DECOMP_STAGES;
  const idx = Math.min(stages.length - 1, Math.floor(f * stages.length));
  return { fraction: Math.round(f * 1000) / 1000, stageIndex: idx, stageName: stages[idx], stages };
}

// ── Diet Agent ──────────────────────────────────────────────────
// Every Jupiter 2 monster is a predator: when hungry it hunts.
// Hunger cycles 0→1 over HUNGER_RISE_S on the clock (Earth 2's
// fallback law); prey is the caller's live list. Demobats also
// eat storm moths when not hunting — no moth entities exist in
// code, so that half of the diet is a note, never a target.
export function dietFor(kind, index, nowMs, prey = []) {
  const spec = CREATURE_KINDS[kind];
  if (!spec) return null;
  const key = `${kind}:${index}`;
  const hunger = ((nowMs / (HUNGER_RISE_S * 1000) + hash01(key, 20261103)) % 1);
  const hungry = hunger >= HUNT_HUNGER_THRESHOLD;
  const feedingMode = hungry
    ? (prey.length > 0 ? 'hunts when hungry — prey in range' : 'hunts when hungry — no prey in range')
    : (kind === 'demobat' ? 'feeding on storm moths' : 'feeding on storm charge');
  return {
    diet: spec.diet,
    hunger: Math.round(hunger * 1000) / 1000,
    hungry,
    hungerThreshold: HUNT_HUNGER_THRESHOLD,
    feedingMode,
    preyCount: prey.length,
    prey: prey.map((p) => (typeof p === 'string' ? p : (p.id || p.kind || 'prey'))),
  };
}

// ── Habits Agent ────────────────────────────────────────────────
// Activity from the device clock + social shape. All three kinds
// are solitary: Volta stands twice, but the two Voltas are two
// copies of one model, not a pack.
export function habitsFor(kind, index, nowMs) {
  return {
    activity: activityFor(kind, nowMs),
    social: { behaviour: 'Solitary', groupSize: 1 },
    habit: (CREATURE_KINDS[kind] || {}).habit || '',
  };
}

// ── Hunt Agent (the predator behaviour) ─────────────────────────
// Pure decision from (kind, clock, hunter position, walker, other
// monsters). ctx: { x, y, z, walker: {x,y,z,alive,mounted}|null,
// others: [{id,kind,index,x,y,z,alive,heightM,diving}]|null,
// diving: true when a demobat hunter is itself diving low }.
// Returns { mode, target, hunger, ... } — the scene executes the
// chase and the aura strike; this only decides.
function dist3(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0), (a.z || 0) - (b.z || 0));
}

/**
 * Monster-vs-monster prey matrix (Merlin, Nov 16 ~01:02).
 * `hunterDiving` is true when a demobat hunter is itself diving
 * low (the scene passes its clock activity in ctx.diving).
 * Lightning monsters / dragons never prey on each other inside
 * duel range — the duel above decides there — but beyond 50 m
 * a rival is prey like any other monster.
 */
export function isMonsterPreyFor(hunterKind, hunterDiving, o) {
  if (!o || o.alive === false) return false;
  if (o.kind === 'demobat') {
    // Demobats are air prey for ground hunters only while diving
    // low; for a demobat hunter they are always in reach.
    return hunterKind === 'demobat' ? true : o.diving === true;
  }
  if (o.kind === 'lightning-monster' || o.kind === 'dragon') {
    // Ground hunters take rivals beyond duel range; a demobat
    // hunter only while diving low into reach.
    return hunterKind === 'demobat' ? hunterDiving === true : true;
  }
  return false;
}

/** Nearest monster prey inside the 140 m stalk range, or null. `self` is { kind, index }. */
export function nearestMonsterPrey(kind, index, self, others, hunterDiving = false) {
  const list = (Array.isArray(others) ? others : [])
    .filter((o) => o && !(o.kind === kind && o.index === index) && isMonsterPreyFor(kind, hunterDiving, o)
      // The guard pair never preys on each other (see GUARD_DRAGON_SLOTS).
      && !(isGuardDragonSlot(kind, index) && isGuardDragonSlot(o.kind, o.index)))
    .map((o) => ({ o, d: dist3(self, o) }))
    .filter(({ d }) => d <= HUNT_STALK_M)
    .sort((a, b) => a.d - b.d);
  return list.length > 0 ? list[0] : null;
}

export function huntFor(kind, index, nowMs, ctx = {}) {
  const spec = CREATURE_KINDS[kind];
  if (!spec) return null;
  const key = `${kind}:${index}`;
  const hunger = ((nowMs / (HUNGER_RISE_S * 1000) + hash01(key, 20261103)) % 1);
  const hungry = hunger >= HUNT_HUNGER_THRESHOLD;
  const self = { x: ctx.x || 0, y: ctx.y || 0, z: ctx.z || 0 };
  const walker = ctx.walker || null;
  const others = Array.isArray(ctx.others) ? ctx.others : [];
  const base = { hunger: Math.round(hunger * 1000) / 1000, hungry, mode: 'idle', target: null, targetKind: null, distanceM: null, note: 'Roaming — not hungry, no prey in range' };

  // Rivals first: two lightning monsters / dragons within 50 m
  // duel (Earth 2's territorial law). The bigger wins; ties break
  // on the pair hash. The scene routes the loser to death.
  // `others` carry scene ids (e.g. 'lightning-monster_3'); the
  // duel outcome itself is keyed on kind:index so both rivals
  // agree, and the scene ids ride along for the caller to match.
  if (kind === 'lightning-monster' || kind === 'dragon') {
    const rivals = others.filter((o) => o && o.alive !== false
      && (o.kind === 'lightning-monster' || o.kind === 'dragon')
      && !(o.kind === kind && o.index === index)
      && dist3(self, o) <= TERRITORY_R_M
      // The guard pair never duels each other (see GUARD_DRAGON_SLOTS).
      && !(isGuardDragonSlot(kind, index) && isGuardDragonSlot(o.kind, o.index)));
    if (rivals.length > 0) {
      const rival = rivals[0];
      const outcome = duelOutcome(
        { id: `${kind}:${index}`, heightM: (modelFor(kind, index) || {}).heightM || 2 },
        { id: `${rival.kind}:${rival.index}`, heightM: rival.heightM || 2 },
      );
      const iWin = outcome.winnerId === `${kind}:${index}`;
      return {
        ...base,
        mode: 'duel',
        target: rival.id,
        targetKind: rival.kind,
        distanceM: Math.round(dist3(self, rival) * 10) / 10,
        rival,
        winnerId: outcome.winnerId,
        loserId: outcome.loserId,
        winnerSceneId: iWin ? `${kind}_${index}` : rival.id,
        loserSceneId: iWin ? rival.id : `${kind}_${index}`,
        note: iWin ? 'Territorial duel — this monster wins' : 'Territorial duel — this monster loses and dies',
      };
    }
  }

  if (!hungry) return { ...base, note: 'Not hungry — roaming on storm charge' };

  // Prey, user first: the walker on foot, alive, inside 140 m.
  if (walker && walker.alive !== false && walker.mounted !== true) {
    const d = dist3(self, walker);
    if (d <= HUNT_STALK_M) {
      const inAura = d <= AURA_R_M;
      return {
        ...base,
        mode: inAura ? 'attack' : 'hunt-user',
        target: 'walker',
        targetKind: 'walker',
        distanceM: Math.round(d * 10) / 10,
        note: inAura ? 'Walker inside the 59 m aura — the streaks strike' : 'Hunting the walker — user first',
      };
    }
  }
  // Monster prey (Merlin, Nov 16 ~01:02): every kind hunts
  // other monsters — nearest prey inside 140 m, user first.
  const prey = nearestMonsterPrey(kind, index, self, others, ctx.diving === true);
  if (prey) {
    const inAura = prey.d <= AURA_R_M;
    return {
      ...base,
      mode: inAura ? 'attack' : 'hunt-prey',
      target: prey.o.id,
      targetKind: prey.o.kind,
      distanceM: Math.round(prey.d * 10) / 10,
      note: inAura ? 'Monster prey inside the 59 m aura — the streaks strike' : `Hunting a ${prey.o.kind}`,
    };
  }
  return { ...base, note: 'Hungry, but no prey inside 140 m' };
}

/** Seeded duel winner: bigger wins; ties break on the pair hash (Earth 2's duelOutcome). */
export function duelOutcome(a, b) {
  const sa = Number((a && a.heightM) || 1);
  const sb = Number((b && b.heightM) || 1);
  if (sa !== sb) {
    return sa > sb
      ? { winnerId: a.id, loserId: b.id }
      : { winnerId: b.id, loserId: a.id };
  }
  const ids = [String(a && a.id), String(b && b.id)].sort().join('|');
  return hash01(ids, 20261114) < 0.5
    ? { winnerId: a.id, loserId: b.id }
    : { winnerId: b.id, loserId: a.id };
}

// ── Conductor: the whole life, from the clock ────────────────────
// lifeFor walks generations from the seeded birth: alive until
// death (age, or a kill passed in ctx.kill), decomposing until
// the remains are gone, then the next generation is born in the
// same slot. At any instant exactly one generation exists.
// ctx (optional): { x, y, z, walker, others, kill } — the hunt
// and the aura need live positions; without them the life still
// reads (hunt idle, aura target unknown).
function buildAlive(kind, index, nowMs, birthMs, generation, ctx) {
  const spec = CREATURE_KINDS[kind];
  const model = modelFor(kind, index);
  const ageDays = Math.max(0, (nowMs - birthMs) / DAY_MS);
  const growth = growthFor(kind, ageDays, model ? model.heightM : 0);
  const habits = habitsFor(kind, index, nowMs);
  const lKind = lightningKindFor(kind, index);
  const hunt = huntFor(kind, index, nowMs, ctx || {});
  const diet = dietFor(kind, index, nowMs, hunt && hunt.target ? [hunt.target] : []);
  const death = deathFor(kind, birthMs, ctx && ctx.kill && ctx.kill.generation === generation ? ctx.kill : null);
  const aura = auraFor(lKind,
    ctx && Number.isFinite(ctx.x) ? { x: ctx.x, y: ctx.y || 0, z: ctx.z || 0 } : null,
    hunt && hunt.target && ctx
      ? (hunt.targetKind === 'walker' && ctx.walker ? ctx.walker : (ctx.others || []).find((o) => o.id === hunt.target) || null)
      : null);
  const life = {
    kind,
    index,
    name: model ? model.name : spec.name,
    model: model ? model.key : null,
    blurb: model ? model.blurb : '',
    realm: spec.realm,
    dragon: lKind === 'dragon',
    lightningKind: lKind,
    diet: spec.diet,
    dietDetail: diet,
    habit: spec.habit,
    habits,
    birthMs,
    ageDays: Math.floor(ageDays),
    stage: growth.stage,
    sizeFactor: growth.sizeFactor,
    sizeM: growth.sizeM,
    activity: habits.activity,
    state: 'alive',
    generation,
    death,
    dies: true,
    lifespanDays: spec.lifespanDays,
    lifespanSource: spec.lifespanSource,
    decompFraction: 0,
    decompStageName: null,
    deathEpochMs: null,
    hunt,
    aura,
  };
  life.line = lifeLineFor(life);
  return life;
}

function buildDecomposing(kind, index, nowMs, birthMs, deathMs, generation, cause, killerId, ctx) {
  const spec = CREATURE_KINDS[kind];
  const model = modelFor(kind, index);
  const decompMs = Math.max(1, (DECOMP_DAYS[kind] || 30) * DAY_MS);
  const frac = Math.max(0, Math.min(1, (nowMs - deathMs) / decompMs));
  const decomp = decompFor(kind, frac);
  const growth = growthFor(kind, spec.lifespanDays, model ? model.heightM : 0);
  const life = {
    kind,
    index,
    name: model ? model.name : spec.name,
    model: model ? model.key : null,
    blurb: model ? model.blurb : '',
    realm: spec.realm,
    dragon: lightningKindFor(kind, index) === 'dragon',
    lightningKind: lightningKindFor(kind, index),
    diet: spec.diet,
    dietDetail: null,
    habit: spec.habit,
    habits: { activity: 'resting', social: { behaviour: 'Solitary', groupSize: 1 }, habit: spec.habit },
    birthMs,
    ageDays: Math.floor(Math.max(0, (deathMs - birthMs) / DAY_MS)),
    stage: growth.stage,
    sizeFactor: growth.sizeFactor,
    sizeM: growth.sizeM,
    activity: 'resting',
    state: 'decomposing',
    generation,
    death: { dies: true, deathMs, cause, killerId: killerId || null, byAge: cause === 'age' },
    dies: true,
    lifespanDays: spec.lifespanDays,
    lifespanSource: spec.lifespanSource,
    decompFraction: decomp.fraction,
    decompStageName: decomp.stageName,
    decompStages: decomp.stages,
    deathEpochMs: deathMs,
    hunt: { mode: 'idle', target: null, hunger: 0, hungry: false, note: 'Dead — does not hunt' },
    aura: null,
  };
  life.line = lifeLineFor(life);
  return life;
}

/**
 * One creature's life at an instant — pure function of
 * (kind, index, device clock) plus the live positions and kill
 * the caller passes in ctx. Birth is seeded so the world is
 * already mid-life on day one; ageDays drives the growth stage;
 * death is REAL now (Merlin, Nov 16 ~00:08 — the old
 * death: null law is superseded, see header).
 */
export function lifeFor(kind, index, nowMs = Date.now(), ctx = {}) {
  const spec = CREATURE_KINDS[kind];
  if (!spec) return null;
  const first = birthFor(kind, index, nowMs);
  const decompMs = Math.max(1, (DECOMP_DAYS[kind] || 30) * DAY_MS);
  let epoch = first.birthMs;
  let generation = 0;
  let guard = 0;
  while (guard++ < 10000) {
    const kill = ctx && ctx.kill && ctx.kill.generation === generation ? ctx.kill : null;
    const death = deathFor(kind, epoch, kill);
    const deathMs = death.deathMs;
    if (nowMs < deathMs) {
      return buildAlive(kind, index, nowMs, epoch, generation, ctx);
    }
    const free = deathMs + decompMs;
    if (nowMs < free) {
      return buildDecomposing(kind, index, nowMs, epoch, deathMs, generation, death.cause, death.killerId, ctx);
    }
    epoch = free;
    generation++;
  }
  // Guard tripped (unreachable in practice): report the current
  // epoch as alive rather than throwing.
  return buildAlive(kind, index, nowMs, epoch, generation, ctx);
}

/** The tap-card life line, Earth 4 shape: kind · stage · activity · lightning. */
export function lifeLineFor(life) {
  if (!life) return '';
  if (life.state === 'decomposing') {
    return `Remains — ${life.name} · ${life.decompStageName || 'fading'}`;
  }
  const parts = [life.name || 'Monster'];
  if (life.dragon) parts.push('Dragon');
  parts.push(life.stage);
  if (life.hunt && (life.hunt.mode === 'hunt-user' || life.hunt.mode === 'attack')) parts.push('Hunting you');
  else if (life.hunt && life.hunt.mode === 'hunt-prey') parts.push('Hunting prey');
  else if (life.hunt && life.hunt.mode === 'duel') parts.push('Dueling');
  else parts.push(life.activity);
  if (life.aura && life.aura.color) parts.push(`${life.aura.color.label} lightning`);
  return parts.join(' · ');
}

/**
 * Enrich spawner output with life: adds `life` to every creature
 * (mutates and returns the same array). The spawner itself is
 * untouched — the spatial law stays pure; the operators layer time
 * on top of it. `ctxById` maps creature id → hunt ctx (positions,
 * walker, others, kill); creatures without one still get a life.
 */
export function enrichCreatures(creatures, now = Date.now(), ctxById = {}) {
  if (!Array.isArray(creatures)) return creatures;
  const t = now instanceof Date ? now.getTime() : Number(now);
  for (const c of creatures) {
    if (!c || typeof c.kind !== 'string') continue;
    c.life = lifeFor(c.kind, typeof c.index === 'number' ? c.index : 0, t, ctxById[c.id] || {});
  }
  return creatures;
}

/** Seeded home position for one creature, inside the world disc. */
export function homeFor(kind, index, radius = 70) {
  const a = hash01(`${kind}:angle:${index}`, 77) * Math.PI * 2;
  const r = 8 + hash01(`${kind}:dist:${index}`, 91) * radius;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}
