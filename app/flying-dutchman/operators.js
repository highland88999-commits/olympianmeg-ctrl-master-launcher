// app/flying-dutchman/operators.js
// THE FLYING DUTCHMAN — OPERATOR AGENTS (Merlin, Nov 14 ~22:56:
// "Yes — all realms"). The agents that operate the Dutchman's
// creatures: kraken, seagulls, dolphins / flying fish, and foe ships
// with their crews. Mirrors the Earth 4 pattern
// (lib/earth4/operators.js): seven agents (birth, growth, death,
// decomposition, diet, habits + conductor `lifeFor`), a creature's
// whole life a pure function of (place, species, device clock),
// NO stored state, NO server.
//
// THE OPERATORS READ THE EXISTING SYSTEMS — THEY DO NOT REPLACE
// THEM. The kraken timer (6–10 min), the 12-hit kill rule, the
// exactly-1 mega-soul drop, the seeded sea-life schedule (45–90 s)
// and foe-ship combat all live where they always lived
// (voyage.js / engine.js / sea3d.js) and are untouched. The
// operators only REPORT life on top of them.
//
// DEATH LAW (recorded from code + Merlin's orders, implemented
// exactly that — no combat or death cause invented):
//   * Kraken: dies by cannons only — 12 direct hits (6 with
//     kraken-bane). engine.js stepBalls / voyage.js stepKraken.
//   * Foe ships: sink by cannon fire — hull <= 0. engine.js
//     damageShip. Crew souls are released with the wreck.
//   * Seagulls / dolphins / flying fish: NO death rule exists in
//     the code for them (sea3d.js renders them forever). Default
//     implemented here is AGE ONLY (lifespan reached) — THAT IS
//     THIS WORKER'S CALL, flagged as such, not Merlin's order.
//     Nothing else kills them. Ever.
//
// POPULATION RULE (Merlin, Nov 14 ~22:57): MORE THAN ONE COPY of
// every creature, SPREAD OUT ACROSS MAPS. Minimums (this worker's
// call, see POPULATION_MINIMUMS): seagulls 6 (2 flocks of 3, on
// two different islands — the existing system already meets it);
// dolphins / flying fish are transient appearances, not a standing
// population, so the minimum is schedule-shaped: a breach at least
// every 90 s, both kinds across a voyage, at a new seeded
// bearing/distance each time (the existing schedule already meets
// it); foe ships at least 1 live once a wave has started, in waves
// of 1–3 (the existing system already meets it). THE KRAKEN IS A
// SINGLE EVENT-BOSS BY DESIGN — one at a time, timer-spawned —
// it is NOT a population and is NOT multiplied.
//
// BEHAVIOR LOGIC (Merlin, Nov 14 ~22:59): the agents run EVERY part
// of each creature according to logic — feeding, territory, water,
// movement, rest, breeding, all of it through the operator agents.
// Diet drives feeding: carnivores, when hungry, HUNT other animals;
// omnivores either hunt or graze; herbivores graze. Carnivores are
// TERRITORIAL: in range of each other they FIGHT TO THE DEATH —
// UNLESS a user enters the area, in which case they hunt the user
// and fight each other for that meal. Should the user die, the
// carnivores fight over the corpse. ALL creatures seek out water.
//
// DUTCHMAN APPLICATION — read carefully, per realm (the parent's
// check, Nov 14 ~22:59): this logic is implemented where the
// realm's code actually supports the branch, and each branch that
// does not apply is said so, not faked:
//   * Feeding: diet drives the feeding mode (feedingFor) — dolphins
//     hunt, flying fish graze, gulls hunt or graze by seeded day,
//     the kraken hunts ships, foe ships feed on souls. The prey is
//     NEVER a spawned creature: no spawned creature is ever prey in
//     the Dutchman either (the sea is full of unspawned fish); the
//     death law in the header stands.
//   * Territory: the kraken is the Dutchman's only territorial
//     carnivore — and it is solitary by design (one at a time), so
//     the fight-a-rival branch is implemented but unreachable. The
//     user-in-range branch IS live: the kraken hunts the player's
//     ship (its existing attack rule) and foe ships close on the
//     player (their existing AI). Seagulls and dolphins are NOT
//     territorial death-fighters — pods and flocks share the sea —
//     said so, not implemented as combat.
//   * User death: the Dutchman has NO corpse. A downed ship
//     respawns 100 m from the wreck keeping everything
//     (voyage.js respawnPlayer) — that is the existing user-death
//     outcome, NOT a corpse, and no corpse mechanic is invented.
//     The kraken despawns when it downs the player and its timer
//     resets. So the fight-over-the-corpse branch is implemented
//     as 'no-corpse' (see territoryFor / userDeathLaw).
//   * Water: trivially satisfied — everything lives in or on the
//     sea (waterFor): gulls drink from it, dolphins / flying fish /
//     kraken live in it, foe ships sail on it.
// EARTH 4 CARVE-OUT: none of this touches Earth 4. Earth 4's
// standing laws (NO hunting; population by TIME only; death by age
// only; no spawned creature ever prey) are untouched in
// lib/earth4/operators.js.

import {
  localHour,
  utcMonth,
  inSeasonMask,
  nextSeasonStartMs,
} from '../../lib/earth4/life-clock.js';

export const DUTCHMAN_FOUNDING_MS = Date.UTC(2026, 10, 14); // the Dutchman went live Nov 14, 2026
export const DAY_MS = 86400000;
export const YEAR_MS = 365.25 * DAY_MS;

// Kraken law, read from voyage.js / engine.js — NOT re-decided here.
export const KRAKEN_HP = 60;
export const KRAKEN_DMG_PER_HIT = 5;
export const KRAKEN_HITS_TO_KILL = 12; // 60 hp / 5 — 6 with kraken-bane
export const KRAKEN_HITS_TO_KILL_BANE = 6;
export const KRAKEN_TIMER_MIN_S = 360; // 6 min
export const KRAKEN_TIMER_MAX_S = 600; // 10 min
export const KRAKEN_WARNING_S = 8;

const SEED_BIRTH = 20261114 + 401;
const SEED_ACT = 20261114 + 503;
const SEED_SOCIAL = 20261114 + 607;

// The spawner's own hash law (lib/earth4/operators.js) — the same
// seeded arithmetic, so the same creature always draws the same life.
function hash01(str, seed) {
  let h = seed | 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/** Deterministic RNG (mulberry32) — the same one sea3d.js uses. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Life records for the ambient creatures (gulls / sea life).
//
// Lifespans, breeding seasons, clutch sizes and decomposition windows
// below are ESTIMATES (this worker's call — no Dutchman dataset
// exists for them, and the code has no death rule for these
// creatures at all). The sim runs the same for listed and estimated
// values; the `src` flag on each life object says which is which.
// Kraken and foe ships have NO record here — their lives are read
// live from the voyage / engine state (krakenLife / foeShipLife).
// ---------------------------------------------------------------------------

const SEASON_YEAR_ROUND = 0xfff;
const SEASON_APR_JUL = (1 << 3) | (1 << 4) | (1 << 5) | (1 << 6); // Apr–Jul

const RECORDS = {
  seagull: {
    lif: 15, lifB: 'estimate', dec: 30,
    lit: 3, lpy: 1, ges: 0, inc: 28, mat: 730, rls: 10, sea: SEASON_APR_JUL,
    ttA: 730, adS: 0.45, bS: 0.1,
    stg: ['Chick', 'Fledgling', 'Adult'],
    dstg: ['Remains'],
    die: 'Scavenger — fish, crabs, scraps',
    dieCat: 'omnivore', territorial: false,
    act: 'Diurnal', soc: 'Flock', hrs: [8, 6, 6, 3, 1],
  },
  dolphin: {
    lif: 25, lifB: 'estimate', dec: 60,
    lit: 1, lpy: 1, ges: 365, inc: 0, mat: 1825, rls: 15, sea: SEASON_YEAR_ROUND,
    ttA: 1825, adS: 2.5, bS: 1.0,
    stg: ['Calf', 'Juvenile', 'Adult'],
    dstg: ['Remains'],
    die: 'Fish and squid',
    dieCat: 'carnivore', territorial: false, // hunts fish — but pods share the sea, no death-fights (see header)
    act: 'Cathemeral', soc: 'Pod', hrs: [4, 8, 8, 3, 1],
  },
  'flying-fish': {
    lif: 5, lifB: 'estimate', dec: 7,
    lit: 200, lpy: 1, ges: 0, inc: 7, mat: 180, rls: 4, sea: SEASON_YEAR_ROUND,
    ttA: 180, adS: 0.3, bS: 0.02,
    stg: ['Fry', 'Juvenile', 'Adult'],
    dstg: ['Remains'],
    die: 'Plankton',
    dieCat: 'herbivore', territorial: false,
    act: 'Diurnal', soc: 'School', hrs: [8, 8, 5, 2, 1],
  },
};

const FALLBACK = {
  lif: 10, lifB: 'fallback', dec: 30,
  lit: 1, lpy: 1, ges: 0, inc: 0, mat: 365, rls: 1, sea: SEASON_YEAR_ROUND,
  ttA: 365, adS: 0.3, bS: 0.03,
  stg: ['Juvenile', 'Adult'],
  dstg: ['Remains'],
  die: 'Unknown',
  dieCat: 'omnivore', territorial: false,
  act: 'Cathemeral', soc: 'Solitary', hrs: [8, 6, 4, 4, 2],
};

/** The compiled life record for an ambient creature, or the fallback. */
export function lifeRecordFor(name) {
  return (name && RECORDS[name]) || FALLBACK;
}

// ---------------------------------------------------------------------------
// Death Agent — the death law, as implemented (see the header).
// ---------------------------------------------------------------------------

/**
 * The death law for a creature, as implemented in the code — not
 * invented. `cause` is one of 'cannons' (kraken), 'cannon fire'
 * (foe ships) or 'age' (gulls / sea life — the age-only default,
 * this worker's call: no death rule exists for them in sea3d.js).
 */
export function deathLawFor(name) {
  if (name === 'kraken') {
    return {
      cause: 'cannons',
      detail: `12 direct cannon hits (${KRAKEN_HITS_TO_KILL_BANE} with kraken-bane)`,
      hitsToKill: KRAKEN_HITS_TO_KILL,
      hitsToKillBane: KRAKEN_HITS_TO_KILL_BANE,
      drops: 'exactly 1 mega soul',
    };
  }
  if (name === 'foe-ship') {
    return {
      cause: 'cannon fire',
      detail: 'sinks when hull reaches 0; her crew souls are released with the wreck',
      hitsToKill: null,
      hitsToKillBane: null,
      drops: 'one soul per crewman aboard',
    };
  }
  return {
    cause: 'age',
    detail: 'age only — no death rule exists in the code for this creature (worker default, flagged)',
    hitsToKill: null,
    hitsToKillBane: null,
    drops: null,
  };
}

// ---------------------------------------------------------------------------
// Birth Agent (breeding season + offspring)
// ---------------------------------------------------------------------------

/** True when the species is in its breeding season at this latitude. */
export function breedingSeasonNow(rec, lat, now = new Date()) {
  return inSeasonMask(rec.sea, lat, utcMonth(now));
}

// ---------------------------------------------------------------------------
// Growth Agent
// ---------------------------------------------------------------------------

/**
 * Growth state at `ageDays`: the stage the creature is in, and its
 * current size — birth size eased up to adult size over
 * time-to-adult (square-root easing: fast early growth, then slow).
 */
export function growthFor(rec, ageDays) {
  const stages = rec.stg || ['Juvenile', 'Adult'];
  const frac = clamp(ageDays / Math.max(1, rec.ttA), 0, 1);
  const eased = Math.sqrt(frac);
  const sizeM = rec.bS + (rec.adS - rec.bS) * eased;
  const stageIndex = Math.min(stages.length - 1, Math.floor(frac * stages.length));
  return {
    fraction: frac,
    sizeM,
    stageIndex,
    stageName: stages[stageIndex],
    stages,
  };
}

// ---------------------------------------------------------------------------
// Habits Agent — the current activity, read off the device clock.
// ---------------------------------------------------------------------------

// The day is painted in 96 quarter-hour slots, on the SAME convention
// as Earth 4 (lib/earth4/operators.js): resting fills the inactive
// window first (night rest) and only spills into the active window
// as daytime rest; inside the active window the blocks run feeding
// -> moving -> other -> resting, in budget proportions; sleep sits
// centred in the inactive window. The budget columns are the data;
// the mapping is the stated convention.
const SLOTS = 96;

function patternWindows(pattern) {
  switch (pattern) {
    case 'Diurnal': return [[6, 18]];
    case 'Nocturnal': return [[18, 24], [0, 6]];
    case 'Crepuscular': return [[5, 8], [17, 20]];
    case 'Cathemeral': return [[0, 24]];
    default: return [[0, 24]];
  }
}

function paintDay(rec, key) {
  const slots = new Array(SLOTS).fill('resting');
  const [sleep, feed, move, rest, other] = rec.hrs;
  const awakeRest = Math.max(0, rest - sleep);
  const pattern = rec.act || 'Cathemeral';
  const active = new Array(SLOTS).fill(false);
  for (const [a, b] of patternWindows(pattern)) {
    for (let s = Math.floor(a * 4); s < Math.floor(b * 4); s++) active[s % SLOTS] = true;
  }
  const activeCount = active.reduce((n, v) => n + (v ? 1 : 0), 0);
  const inactiveCount = SLOTS - activeCount;
  const sleepSlots = Math.min(Math.round(sleep * 4), inactiveCount);
  const restNightSlots = Math.min(Math.round(awakeRest * 4), inactiveCount - sleepSlots);
  const restDayHours = Math.max(0, awakeRest - restNightSlots / 4);
  const weights = [['feeding', feed], ['moving', move], ['other', other], ['resting', restDayHours]];
  const wTotal = Math.max(0.001, feed + move + other + restDayHours);
  const activeActs = [];
  for (const [act, w] of weights) {
    const n = Math.round((w / wTotal) * activeCount);
    for (let i = 0; i < n; i++) activeActs.push(act);
  }
  while (activeActs.length > activeCount) activeActs.pop();
  while (activeActs.length < activeCount) activeActs.push('resting');
  const dayStartSlots = Math.floor(patternWindows(pattern)[0][0] * 4);
  const order = [...Array(SLOTS).keys()]
    .sort((a, b) => ((a - dayStartSlots + SLOTS) % SLOTS) - ((b - dayStartSlots + SLOTS) % SLOTS));
  let ai = 0;
  for (const s of order) if (active[s]) slots[s] = activeActs[ai++];
  const inactiveIdx = order.filter((s) => !active[s]);
  const sleepStart = Math.floor((inactiveIdx.length - sleepSlots) / 2);
  for (let i = 0; i < sleepSlots; i++) slots[inactiveIdx[sleepStart + i]] = 'sleeping';
  return slots;
}

/** What the creature is doing right now, by the device clock. */
export function activityNow(rec, key, now = new Date()) {
  const slots = paintDay(rec, key);
  const idx = Math.min(SLOTS - 1, Math.floor(localHour(now) * 4));
  return slots[idx];
}

// ---------------------------------------------------------------------------
// Diet Agent — feeding, driven by diet (Merlin, Nov 14 ~22:59).
//
// Carnivores, when hungry, HUNT; omnivores either hunt or graze
// (seeded per day, so the same creature hunts on some days and
// grazes on others); herbivores graze. The prey is NEVER a spawned
// creature — the sea is full of unspawned fish, and the death law
// in the header stands: no spawned creature is ever prey.
// ---------------------------------------------------------------------------

/**
 * How the creature feeds right now. Only meaningful while its
 * clock activity is 'feeding'; otherwise mode is null.
 * `dietCat` is 'carnivore' | 'omnivore' | 'herbivore'.
 */
export function feedingFor(dietCat, activity, key, now = Date.now()) {
  if (activity !== 'feeding') return { mode: null, detail: 'not feeding right now' };
  if (dietCat === 'carnivore') {
    return { mode: 'hunting', detail: 'hunting when hungry — prey is unspawned fish, never a spawned creature' };
  }
  if (dietCat === 'herbivore') {
    return { mode: 'grazing', detail: 'grazing on plankton' };
  }
  // Omnivore: hunts or grazes, seeded per UTC day.
  const day = new Date(now instanceof Date ? now.getTime() : Number(now)).toISOString().slice(0, 10);
  const hunts = hash01(`${key}|${day}`, SEED_ACT) < 0.5;
  return hunts
    ? { mode: 'hunting', detail: 'hunting or grazing — today, hunting scraps and small fish' }
    : { mode: 'grazing', detail: 'hunting or grazing — today, grazing scraps off the water' };
}

// ---------------------------------------------------------------------------
// Territory Agent — carnivores are territorial (Merlin, Nov 14 ~22:59).
//
// In range of each other, territorial carnivores FIGHT TO THE DEATH
// — UNLESS a user enters the area, in which case they hunt the user
// and fight each other for that meal. Should the user die, they
// fight over the corpse. Dutchman application (see header): the
// kraken is the only territorial carnivore here, and it is solitary
// by design (one at a time), so the rival-fight branch is
// implemented but unreachable; the user-hunt branch IS live (the
// kraken hunts the player's ship, foe ships close on the player);
// the user-death branch resolves to 'no-corpse' — a downed ship
// respawns, it is not a corpse, and the kraken despawns when it
// downs the player. Seagulls and dolphins are NOT territorial
// death-fighters: pods and flocks share the sea.
// ---------------------------------------------------------------------------

/**
 * A creature's territorial state. `ctx` is { rivalsInRange,
 * userInRange, userDead } — live scene facts the caller reads off
 * the world (krakenLife / foeShipLife do this); ambient creatures
 * pass {} and report their standing state.
 * States: 'not-territorial' | 'solitary' | 'fighting-rival' |
 * 'hunting-user' | 'no-corpse'.
 */
export function territoryFor(kind, ctx = {}) {
  const rivals = !!ctx.rivalsInRange;
  const user = !!ctx.userInRange;
  const userDead = !!ctx.userDead;
  if (userDead) {
    if (kind === 'kraken') {
      return { state: 'no-corpse', detail: 'the player went down — the kraken despawned, no corpse to fight over' };
    }
    if (kind === 'foe-ship') {
      return { state: 'no-corpse', detail: 'no corpse — the Dutchman rises again 100 m from the wreck' };
    }
    return { state: 'not-territorial', detail: 'not a territorial carnivore' };
  }
  if (kind === 'kraken') {
    if (user) return { state: 'hunting-user', detail: 'a user is in range — hunting the Dutchman, not fighting rivals' };
    if (rivals) return { state: 'fighting-rival', detail: 'fighting a rival kraken to the death' };
    return { state: 'solitary', detail: 'solitary — no rival kraken exists to fight' };
  }
  if (kind === 'foe-ship') {
    return { state: 'not-territorial', detail: 'crewed ships — they fight the player, never each other for a meal' };
  }
  if (kind === 'dolphin') {
    return { state: 'not-territorial', detail: 'pods share the sea — hunts fish, not a territorial death-fighter' };
  }
  if (kind === 'seagull') {
    return { state: 'not-territorial', detail: 'flocks share the islands — scavenger, not a territorial carnivore' };
  }
  if (kind === 'flying-fish') {
    return { state: 'not-territorial', detail: 'schools share the open water — grazes plankton, not territorial' };
  }
  return { state: 'not-territorial', detail: 'not a territorial carnivore' };
}

/**
 * The user-death outcome for this realm, as implemented in the
 * code. There is NO corpse in the Dutchman: a downed ship respawns
 * 100 m from the wreck keeping level, upgrades, souls, mega souls
 * and crew (voyage.js respawnPlayer), and the kraken despawns when
 * it downs the player with its timer reset. Nothing fights over a
 * corpse, because there is none — no corpse mechanic is invented.
 */
export function userDeathLaw() {
  return {
    outcome: 'respawn',
    corpse: false,
    detail: 'A downed ship is NOT a corpse: the Dutchman rises again 100 m from the wreck, keeping level, upgrades, souls, mega souls and crew (voyage.js respawnPlayer). The kraken despawns when it downs the player and its timer resets.',
  };
}

// ---------------------------------------------------------------------------
// Water Agent — ALL creatures seek out water (Merlin, Nov 14 ~22:59).
// In the Dutchman the branch is trivially satisfied: everything
// lives in or on the sea.
// ---------------------------------------------------------------------------

/** How the creature meets its water need. */
export function waterFor(name) {
  switch (name) {
    case 'seagull':
      return { need: 'drink', detail: 'drinks from the sea — circles over open water, never far from it' };
    case 'dolphin':
      return { need: 'lives in it', detail: 'lives in the sea' };
    case 'flying-fish':
      return { need: 'lives in it', detail: 'lives in the sea' };
    case 'kraken':
      return { need: 'lives in it', detail: 'lives in the deep sea' };
    case 'foe-ship':
      return { need: 'sails on it', detail: 'sails on the sea — her crew drinks from ship stores' };
    default:
      return { need: 'drink', detail: 'seeks out water to drink' };
  }
}

// ---------------------------------------------------------------------------
// Habits Agent, social — group size (display)
// ---------------------------------------------------------------------------

/** Social behaviour and group size (display — the scene renders what it renders). */
export function socialFor(rec, key, name = '') {
  const b = rec.soc || 'Solitary';
  if (name === 'seagull') return { behaviour: b, groupSize: 3 }; // a flock of 3, per sea3d.js
  if (/^pair$/i.test(b)) return { behaviour: b, groupSize: 2 };
  if (/pod|school|flock|group/i.test(b)) {
    return { behaviour: b, groupSize: 2 + Math.floor(hash01(key, SEED_SOCIAL) * 7) };
  }
  return { behaviour: b, groupSize: 1 };
}

// ---------------------------------------------------------------------------
// Conductor: the whole life of an AMBIENT creature, from the clock.
// Seeded timeline anchored at the Dutchman's founding, exactly like
// Earth 4: age at founding = hash x lifespan, death = birth +
// lifespan, then a decomposition window, then the next generation
// is born — snapped forward to the next breeding-season start when
// the species is seasonal. At any moment exactly one generation
// exists: alive, or decomposing.
// ---------------------------------------------------------------------------

function buildAlive(rec, name, key, nowMsV, lat, epochMs, ageDays, generation) {
  const g = growthFor(rec, ageDays);
  const month = utcMonth(new Date(nowMsV));
  const inSeason = inSeasonMask(rec.sea, lat, month);
  const adult = ageDays >= rec.mat;
  const reproEndDays = rec.mat + rec.rls * 365.25;
  const breeding = adult && inSeason && ageDays <= reproEndDays;
  const activity = activityNow(rec, key, new Date(nowMsV));
  return {
    name,
    key,
    kind: 'ambient',
    state: 'alive',
    generation,
    ageDays: Math.round(ageDays * 10) / 10,
    ageYears: Math.round((ageDays / 365.25) * 100) / 100,
    stageIndex: g.stageIndex,
    stageName: g.stageName,
    stages: g.stages,
    sizeM: Math.round(g.sizeM * 1000) / 1000,
    adultSizeM: rec.adS,
    growthFraction: Math.round(g.fraction * 1000) / 1000,
    breeding,
    offspring: breeding ? Math.max(1, Math.round(rec.lit)) : 0,
    gestationDays: rec.ges,
    incubationDays: rec.inc,
    activity,
    activityPattern: rec.act,
    diet: rec.die,
    dietCategory: rec.dieCat,
    feeding: feedingFor(rec.dieCat, activity, key, nowMsV),
    territory: territoryFor(name, {}),
    water: waterFor(name),
    social: socialFor(rec, key, name),
    decompFraction: 0,
    decompStageName: null,
    deathEpochMs: null,
    deathLaw: deathLawFor(name),
    lifespanYears: rec.lif,
    lifespanBasis: rec.lifB,
  };
}

function buildDecomposing(rec, name, key, nowMsV, lat, epochMs, deathMs, generation) {
  const stages = rec.dstg || ['Remains'];
  const decompMs = Math.max(1, rec.dec * DAY_MS);
  const frac = clamp((nowMsV - deathMs) / decompMs, 0, 1);
  const idx = Math.min(stages.length - 1, Math.floor(frac * stages.length));
  const g = growthFor(rec, rec.lif * 365.25);
  const month = utcMonth(new Date(nowMsV));
  return {
    name,
    key,
    kind: 'ambient',
    state: 'decomposing',
    generation,
    ageDays: Math.round(((deathMs - epochMs) / DAY_MS) * 10) / 10,
    ageYears: rec.lif,
    stageIndex: g.stageIndex,
    stageName: g.stageName,
    stages: g.stages,
    sizeM: g.sizeM,
    adultSizeM: rec.adS,
    growthFraction: 1,
    breeding: false,
    offspring: 0,
    gestationDays: rec.ges,
    incubationDays: rec.inc,
    activity: 'resting',
    activityPattern: rec.act,
    diet: rec.die,
    dietCategory: rec.dieCat,
    feeding: { mode: null, detail: 'dead — not feeding' },
    territory: { state: 'none', detail: 'dead — holds no territory' },
    water: waterFor(name),
    social: socialFor(rec, key, name),
    decompFraction: Math.round(frac * 1000) / 1000,
    decompStageName: stages[idx],
    decompStages: stages,
    deathEpochMs: deathMs,
    deathLaw: deathLawFor(name),
    lifespanYears: rec.lif,
    lifespanBasis: rec.lifB,
  };
}

/**
 * The full life state of one ambient creature (seagull, dolphin,
 * flying fish) at the device clock: its generation, age, growth
 * stage and size, whether it is breeding, what it is doing right
 * now, what it eats, and — if dead — how far along its
 * decomposition is. Pure: the same (name, key, clock) always
 * returns the same life.
 */
export function lifeFor(name, key, now = Date.now(), lat = 0) {
  const rec = lifeRecordFor(name);
  const nowMsV = now instanceof Date ? now.getTime() : Number(now);
  const lifespanMs = Math.max(1, rec.lif * YEAR_MS);
  const decompMs = Math.max(1, rec.dec * DAY_MS);
  const seedKey = `${key}|${name}`;
  const ageAtFounding = hash01(seedKey, SEED_BIRTH) * lifespanMs;
  let epoch = DUTCHMAN_FOUNDING_MS - ageAtFounding;
  let generation = 0;
  let guard = 0;
  while (guard++ < 10000) {
    const death = epoch + lifespanMs;
    if (nowMsV < death) {
      return buildAlive(rec, name, key, nowMsV, lat, epoch, (nowMsV - epoch) / DAY_MS, generation);
    }
    const free = death + decompMs;
    const next = nextSeasonStartMs(rec.sea, lat, free);
    if (nowMsV < next) {
      return buildDecomposing(rec, name, key, nowMsV, lat, epoch, death, generation);
    }
    epoch = next;
    generation++;
  }
  return buildAlive(rec, name, key, nowMsV, lat, epoch, Math.max(0, (nowMsV - epoch) / DAY_MS), generation);
}

// ---------------------------------------------------------------------------
// Kraken life — READ from the voyage state, never re-derived.
// The kraken is an event-boss, not a population creature: it has no
// seeded age timeline. Its life is the timer + the state machine in
// voyage.js (stepKraken): stirring (timer counting) → warning (8 s)
// → attack → dying (drops exactly 1 mega soul).
// ---------------------------------------------------------------------------

/**
 * The kraken's life right now, read off the world: its stage, what
 * it is doing, how many cannon hits it has taken and how many it
 * takes to kill it (12, or 6 with kraken-bane — pass
 * { krakenBane: true } when the player's ship carries the bane).
 * Pure read — it never mutates the world and never touches the
 * timer, the kill rule or the drop.
 */
export function krakenLife(world, now = Date.now(), opts = {}) {
  const k = world && world.kraken;
  const bane = !!(opts && opts.krakenBane);
  const hitsToKill = bane ? KRAKEN_HITS_TO_KILL_BANE : KRAKEN_HITS_TO_KILL;
  const nowMsV = now instanceof Date ? now.getTime() : Number(now);
  if (!k) {
    const timer = (world && world.krakenTimer) || 0;
    const threshold = (world && world.krakenThreshold) || 480;
    const userDead = !!(world && world.player && !world.player.alive);
    return {
      name: 'kraken',
      kind: 'kraken',
      state: 'stirring',
      stageName: 'Stirring',
      activity: 'stirring beneath the waves',
      hits: 0,
      hp: KRAKEN_HP,
      hitsToKill,
      hitsLeft: hitsToKill,
      secondsToSpawn: Math.max(0, Math.round(threshold - timer)),
      breeding: false,
      offspring: 0,
      diet: 'Ships and sailors',
      dietCategory: 'carnivore',
      feeding: { mode: null, detail: 'not feeding right now' },
      territory: territoryFor('kraken', { userDead }),
      water: waterFor('kraken'),
      social: { behaviour: 'Solitary', groupSize: 1 },
      deathLaw: deathLawFor('kraken'),
      decompFraction: 0,
      decompStageName: null,
      nowMs: nowMsV,
    };
  }
  const hits = k.hits || 0;
  const stageName = k.state === 'warning' ? 'Rising' : k.state === 'attack' ? 'Attacking' : k.state === 'dying' ? 'Dying' : 'Stirring';
  const activity = k.state === 'warning' ? 'rising out of dark water'
    : k.state === 'attack' ? 'hunting the Dutchman'
    : k.state === 'dying' ? 'sinking beneath the waves'
    : 'stirring beneath the waves';
  return {
    name: 'kraken',
    kind: 'kraken',
    state: k.state === 'dying' ? 'decomposing' : 'alive',
    stageName,
    activity,
    hits,
    hp: typeof k.hp === 'number' ? k.hp : KRAKEN_HP - hits * KRAKEN_DMG_PER_HIT,
    hitsToKill,
    hitsLeft: Math.max(0, hitsToKill - hits),
    secondsToSpawn: 0,
    breeding: false,
    offspring: 0,
    diet: 'Ships and sailors',
    dietCategory: 'carnivore',
    feeding: k.state === 'attack'
      ? { mode: 'hunting', detail: 'hunting the Dutchman — its only prey' }
      : { mode: null, detail: 'not feeding right now' },
    territory: territoryFor('kraken', { userInRange: k.state === 'attack' || k.state === 'warning' }),
    water: waterFor('kraken'),
    social: { behaviour: 'Solitary', groupSize: 1 },
    deathLaw: deathLawFor('kraken'),
    decompFraction: k.state === 'dying' ? 1 : 0,
    decompStageName: k.state === 'dying' ? 'Sinking' : null,
    nowMs: nowMsV,
  };
}

// ---------------------------------------------------------------------------
// Foe-ship life — READ from the engine state, never re-derived.
// A foe ship's life is her hull and her crew: stage from hull
// fraction, activity from range to the player (the AI helm closes,
// holds broadside, or turns away — engine.js stepAI), group size
// is the crew aboard. She dies by cannon fire at hull 0 and her
// crew souls are released with the wreck (engine.js damageShip).
// ---------------------------------------------------------------------------

/**
 * A foe ship's life right now. `player` is the player's ship (for
 * the range that reads the AI's activity); omit it and the activity
 * reads 'sailing'. A sunk ship reports state 'decomposing' with
 * stage 'Sinking' — the wreck goes down over SHIP.sinkTime and
 * leaves no remains behind. Pure read — it never mutates the ship.
 */
export function foeShipLife(ship, player = null, now = Date.now()) {
  const nowMsV = now instanceof Date ? now.getTime() : Number(now);
  const hull = ship && typeof ship.hull === 'number' ? ship.hull : 0;
  const maxHull = (ship && ship.maxHull) || 100;
  const frac = clamp(hull / Math.max(1, maxHull), 0, 1);
  const crew = ship && typeof ship.crew === 'number' ? ship.crew : 0;
  const crewStart = (ship && ship._crewStart) || crew;
  if (!ship || !ship.alive) {
    return {
      name: (ship && ship.name) || 'Ghost ship',
      kind: 'foe-ship',
      state: 'decomposing',
      stageName: 'Sinking',
      activity: 'going down with her crew',
      hull, maxHull, hullFraction: Math.round(frac * 1000) / 1000,
      crew, crewStart,
      breeding: false,
      offspring: 0,
      diet: 'Souls claimed in battle',
      dietCategory: 'n/a',
      feeding: { mode: 'souls', detail: 'feeds on souls claimed in battle' },
      territory: territoryFor('foe-ship', { userDead: !!(player && !player.alive) }),
      water: waterFor('foe-ship'),
      social: { behaviour: 'Crew', groupSize: Math.max(0, crew) },
      deathLaw: deathLawFor('foe-ship'),
      decompFraction: 1,
      decompStageName: 'Sunk',
      nowMs: nowMsV,
    };
  }
  const stageName = frac >= 0.75 ? 'Battle-ready' : frac >= 0.5 ? 'Battered' : frac >= 0.25 ? 'Crippled' : 'Breaking up';
  let activity = 'sailing';
  if (player) {
    const d = Math.hypot(player.x - ship.x, player.z - ship.z);
    activity = d > 90 ? 'closing to broadside' : d < 35 ? 'turning away' : 'holding broadside';
  }
  return {
    name: ship.name || 'Ghost ship',
    kind: 'foe-ship',
    state: 'alive',
    stageName,
    activity,
    hull, maxHull, hullFraction: Math.round(frac * 1000) / 1000,
    crew, crewStart,
    breeding: false,
    offspring: 0,
    diet: 'Souls claimed in battle',
    dietCategory: 'n/a',
    feeding: { mode: 'souls', detail: 'feeds on souls claimed in battle' },
    territory: territoryFor('foe-ship', { userInRange: true }),
    water: waterFor('foe-ship'),
    social: { behaviour: 'Crew', groupSize: Math.max(0, crew) },
    deathLaw: deathLawFor('foe-ship'),
    decompFraction: 0,
    decompStageName: null,
    nowMs: nowMsV,
  };
}

// ---------------------------------------------------------------------------
// Population rule (Merlin, Nov 14 ~22:57): MORE THAN ONE COPY of
// every creature, SPREAD OUT ACROSS MAPS. Minimums are this worker's
// call. The kraken is NOT a population — one event-boss at a time,
// by design — and is listed here only so the exemption is explicit.
// ---------------------------------------------------------------------------

export const POPULATION_MINIMUMS = {
  seagull: {
    minLive: 6,
    unit: 'gulls',
    spread: '2 flocks of 3, circling two different islands',
    howMet: 'sea3d.js createGulls — 2 flocks of 3 on islands[0] and islands[1]',
  },
  dolphin: {
    minLive: 1,
    unit: 'breach per 90 s',
    spread: 'a new seeded bearing and distance (40–80 m off the player) every breach',
    howMet: 'sea3d.js createSeaLife — a breach every 45–90 s, one at a time, 60% dolphin',
  },
  'flying-fish': {
    minLive: 1,
    unit: 'breach per 90 s',
    spread: 'a new seeded bearing and distance (40–80 m off the player) every breach',
    howMet: 'sea3d.js createSeaLife — a breach every 45–90 s, one at a time, 40% flying fish',
  },
  'foe-ship': {
    minLive: 1,
    unit: 'live foe ship once a wave has started',
    spread: 'waves of 1–3, spawned around the player at 220–380 m on all bearings',
    howMet: 'engine.js spawnWave — 1–3 per wave; the next wave spawns when the sea is clear',
  },
  kraken: {
    minLive: 1,
    unit: 'at a time, while active',
    spread: 'n/a — single event-boss, timer-spawned 120 m off the player',
    howMet: 'EXEMPT — one at a time by design (voyage.js stepKraken); NOT a population, NOT multiplied',
  },
};

/**
 * Check live counts against the population minimums. `counts` is
 * { seagull, dolphinBreachesPer90s, flyingFishBreachesPer90s,
 * liveFoes, krakenActive }. Sea life is schedule-shaped: a breach
 * every 45–90 s means at least 1 appearance per 90 s window.
 * Returns one entry per creature with { min, actual, meets, note }.
 */
export function checkPopulation(counts = {}) {
  const c = counts || {};
  const gulls = typeof c.seagull === 'number' ? c.seagull : 0;
  const dolphin = typeof c.dolphinBreachesPer90s === 'number' ? c.dolphinBreachesPer90s : 0;
  const fish = typeof c.flyingFishBreachesPer90s === 'number' ? c.flyingFishBreachesPer90s : 0;
  const foes = typeof c.liveFoes === 'number' ? c.liveFoes : 0;
  const kraken = typeof c.krakenActive === 'number' ? c.krakenActive : 0;
  return {
    seagull: { min: 6, actual: gulls, meets: gulls >= 6, note: '2 flocks of 3 on two islands' },
    dolphin: { min: 1, actual: dolphin, meets: dolphin >= 1, note: 'at least 1 breach per 90 s' },
    'flying-fish': { min: 1, actual: fish, meets: fish >= 1, note: 'at least 1 breach per 90 s' },
    'foe-ship': { min: 1, actual: foes, meets: foes >= 1, note: 'at least 1 live foe once a wave has started' },
    kraken: { min: 1, actual: kraken, meets: kraken <= 1, note: 'event-boss: exactly 0 or 1 at a time, by design' },
  };
}

// ---------------------------------------------------------------------------
// Seagull placement — a PURE mirror of sea3d.js createGulls, so the
// population can be verified headlessly: 2 flocks of 3, circling the
// first two islands (radius island.r + 25, heights 25 m and 33 m).
// No three.js, no DOM — the 3D layer renders these placements.
// ---------------------------------------------------------------------------

export function gullFlocks(islands) {
  const list = Array.isArray(islands) ? islands : [];
  const flocks = [];
  for (let f = 0; f < 2; f++) {
    const isl = list[f];
    if (!isl || typeof isl.x !== 'number' || typeof isl.z !== 'number') continue;
    flocks.push({
      flock: f,
      islandId: isl.id || `isle-${f}`,
      cx: isl.x,
      cz: isl.z,
      radius: (typeof isl.r === 'number' ? isl.r : 60) + 25,
      height: 25 + f * 8,
      gulls: 3,
    });
  }
  return flocks;
}

// ---------------------------------------------------------------------------
// Sea-life schedule — a PURE mirror of sea3d.js createSeaLife (same
// seed 1337, same draw order), so the schedule's spread can be
// verified headlessly: a breach every 45–90 s, one at a time, 60%
// dolphin / 40% flying fish, at a new bearing and distance
// (40–80 m off the player) each time. The 3D layer owns the real
// schedule; this only replays its dice.
// ---------------------------------------------------------------------------

export const SEA_LIFE_SEED = 1337;
export const SEA_LIFE_MIN_GAP_S = 45;
export const SEA_LIFE_MAX_GAP_S = 90;

/**
 * Replay the first `count` breaches of the seeded schedule.
 * Each entry: { atS, kind, bearing, distM } — `atS` is seconds
 * from the voyage start (t = 0). Draw order mirrors createSeaLife
 * exactly: gap, then (kind, bearing, distance) per breach, then
 * the next gap.
 */
export function simulateSeaLifeSchedule(seed = SEA_LIFE_SEED, count = 20) {
  const rng = mulberry32(seed);
  const out = [];
  let nextT = 45 + rng() * 45;
  for (let i = 0; i < count; i++) {
    const atS = nextT;
    const kind = rng() < 0.6 ? 'dolphin' : 'flying-fish';
    const bearing = rng() * Math.PI * 2;
    const dist = 40 + rng() * 40;
    out.push({ atS, kind, bearing, distM: dist });
    nextT = atS + 45 + rng() * 45;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Conductor entry points (mirror lib/earth4/operators.js)
// ---------------------------------------------------------------------------

/**
 * Enrich creatures with life: adds `life` to every entry (mutates
 * and returns the same array). The existing systems are untouched —
 * the operators layer life on top of what they already hold.
 * Each entry is one of:
 *   { name: 'seagull'|'dolphin'|'flying-fish', key } — ambient,
 *     seeded timeline via lifeFor.
 *   { kind: 'kraken', world } — read live via krakenLife.
 *   { kind: 'foe-ship', ship, player? } — read live via foeShipLife.
 */
export function enrichCreatures(creatures, now = Date.now()) {
  if (!Array.isArray(creatures)) return creatures;
  const t = now instanceof Date ? now.getTime() : Number(now);
  for (const c of creatures) {
    if (!c || typeof c !== 'object') continue;
    if (c.kind === 'kraken' && c.world) {
      c.life = krakenLife(c.world, t, { krakenBane: !!(c.ship && c.ship.upgrades && c.ship.upgrades.krakenBane) });
    } else if (c.kind === 'foe-ship' && c.ship) {
      c.life = foeShipLife(c.ship, c.player || null, t);
    } else if (typeof c.name === 'string') {
      c.life = lifeFor(c.name, c.key || c.id || '', t, typeof c.lat === 'number' ? c.lat : 0);
    }
  }
  return creatures;
}

/**
 * The tap-card life line, in Earth 4's shape: stage · activity,
 * plus breeding and group size where they apply — or
 * "Remains — <stage>" for the dead. Kraken and foe-ship lines
 * carry their combat facts instead of breeding (hits left / crew).
 */
export function lifeLine(life) {
  if (!life) return '';
  if (life.state === 'decomposing') {
    return `Remains — ${life.decompStageName || life.stageName || 'gone'}`;
  }
  // Diet drives feeding: while the clock activity is 'feeding', the
  // card shows the feeding mode (hunting / grazing) instead.
  const act = life.activity === 'feeding' && life.feeding && life.feeding.mode
    ? life.feeding.mode
    : (life.activity || 'resting');
  let line = `${life.stageName || 'Unknown'} · ${act}`;
  if (life.kind === 'kraken') {
    line += ` · ${life.hitsLeft}/${life.hitsToKill} hits to kill`;
    return line;
  }
  if (life.kind === 'foe-ship') {
    line += ` · crew of ${life.crew}`;
    return line;
  }
  if (life.breeding) line += ` · breeding now — ${life.offspring} offspring`;
  if (life.social && life.social.groupSize > 1) {
    line += ` · in a group of ${life.social.groupSize}`;
  }
  return line;
}
