// lib/earth4/operators.js
// EARTH 4 — OPERATOR AGENTS (Merlin, Nov 14 ~17:13): the agents that
// operate the species. One agent per life dataset, plus a conductor.
//
// THE LAW (Merlin, Nov 14 ~17:00–17:05): Earth 4 is an
// exploration/observation world only — NO hunting; population is
// controlled by TIME only; humans observe and explore; the animals
// live without humans. TIME is the actual clock on each user's
// phone. So a creature's whole life is a pure function of
// (cell key, species, device clock): two phones in the same place at
// the same time see the same animal at the same age doing the same
// thing, and the world changes only as the clock moves.
//
// THE TIMELINE: for each (cell, species) a seeded hash fixes the
// individual's life, anchored at Earth 4's founding (2026-11-12).
// Age at founding = hash x lifespan, so the world is already
// mid-life on day one. death = birth + lifespan. After death the
// body decomposes for decomposition_time, then the next generation
// is born — snapped forward to the next breeding-season start when
// the species is seasonal. At any moment exactly one generation
// exists: alive, or decomposing (remains persist as skeletal residue
// until the next birth, so the cell never stands empty and the
// spawner's ~35% density holds forever while individuals turn over).
//
// DEATH HAS ONE CAUSE: age. The Diet Agent never kills: a predator
// feeds during its feeding hours, and no spawned creature is ever
// prey. Population changes only through the birth/death clock.
//
// No state is stored, no background tick runs. The scene recomputes
// life from the device clock on its 1-second refresh; state changes
// only when the clock crosses a boundary — an hour, a season, a
// lifespan's end. If a species has no compiled life record, the
// conductor falls back to a taxon-level default and never throws.

import {
  SPECIES_LIFE,
  LIFE_STAGES,
  LIFE_DECOMP_STAGES,
  LIFE_DIETS,
  LIFE_FEEDING_METHODS,
  LIFE_GUTS,
} from './species-life.js';
import {
  localHour,
  utcMonth,
  inSeasonMask,
  nextSeasonStartMs,
} from './life-clock.js';

export const FOUNDING_MS = Date.UTC(2026, 10, 12); // Earth 4's founding day
export const DAY_MS = 86400000;
export const YEAR_MS = 365.25 * DAY_MS;

const SEED_BIRTH = 20261112 + 401;
const SEED_ACT = 20261112 + 503;
const SEED_SOCIAL = 20261112 + 607;

// The spawner's own hash law (lib/earth4/spawner.js) — the same
// seeded arithmetic, so the same cell always draws the same life.
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

// Taxon-level default when a name has no compiled record. It should
// never be needed (the build refuses unless all 2,408 names match),
// but a creature is never dropped for lack of data.
const FALLBACK = {
  lit: 1, lpy: 1, ges: 0, inc: 0, mat: 365, rls: 1, sea: 0xFFF,
  ttA: 365, adS: 0.3, bS: 0.03, stg: 0, lif: 1, lifB: 'fallback',
  dec: 30, dstg: 0, die: 0, fdm: 0, gut: 0, act: 'Cathemeral',
  soc: 'Solitary', mig: 'Non-migratory', hrs: [8, 6, 4, 12, 2],
  src: '--------------',
};

/** The compiled life record for a species, or the fallback. */
export function lifeRecordFor(name) {
  return (name && SPECIES_LIFE[name]) || FALLBACK;
}

// ── Birth Agent (reproduction.csv) ──────────────────────────────

/** True when the species is in its breeding season at this cell. */
export function breedingSeasonNow(rec, lat, now = new Date()) {
  return inSeasonMask(rec.sea, lat, utcMonth(now));
}

// ── Growth Agent (growth.csv) ───────────────────────────────────

/**
 * Growth state at `ageDays`: the stage the animal or plant is in,
 * and its current size — birth size eased up to adult size over
 * time-to-adult (square-root easing: fast early growth, then slow).
 */
export function growthFor(rec, ageDays) {
  const stages = LIFE_STAGES[rec.stg] || ['Juvenile', 'Adult'];
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

// ── Habits Agent (habits.csv) ────────────────────────────────────

// The day is painted in 96 quarter-hour slots. The budget columns
// give HOURS per activity (feeding / moving / resting / other, plus
// sleep, which sits INSIDE resting) but not WHICH clock hours — the
// mapping below is a stated convention, not data: resting fills the
// inactive window first (night rest) and only spills into the active
// window as daytime rest; inside the active window the blocks run
// feeding -> moving -> other -> resting, in budget proportions; sleep
// sits centred in the inactive window (deepest sleep mid-rest).
const SLOTS = 96;

function patternWindows(pattern) {
  switch (pattern) {
    case 'Diurnal': return [[6, 18]];
    case 'Nocturnal': return [[18, 24], [0, 6]];
    case 'Crepuscular': return [[5, 8], [17, 20]];
    case 'Cathemeral': return [[0, 24]];
    case 'Continuous': return [[6, 18]]; // daylight = feeding
    default: return [[0, 24]];
  }
}

function paintDay(rec, key) {
  const slots = new Array(SLOTS).fill('resting');
  const [sleep, feed, move, rest, other] = rec.hrs;
  const awakeRest = Math.max(0, rest - sleep);
  const pattern = rec.act || 'Cathemeral';

  if (pattern === 'Arrhythmic') {
    // No fixed pattern: one 24 h sequence in budget order, from a
    // seeded start hour — the same cell always starts at the same hour.
    const start = Math.floor(hash01(key, SEED_ACT) * SLOTS);
    const seq = [['feeding', feed], ['moving', move], ['other', other], ['resting', rest]];
    let s = start;
    for (const [act, hrs] of seq) {
      const n = Math.round(hrs * 4);
      for (let i = 0; i < n; i++) {
        const idx = (s + i) % SLOTS;
        slots[idx] = act === 'resting' && i < Math.round(sleep * 4) ? 'sleeping' : act;
      }
      s = (s + n) % SLOTS;
    }
    return slots;
  }

  const active = new Array(SLOTS).fill(false);
  for (const [a, b] of patternWindows(pattern)) {
    for (let s = Math.floor(a * 4); s < Math.floor(b * 4); s++) active[s % SLOTS] = true;
  }
  const activeCount = active.reduce((n, v) => n + (v ? 1 : 0), 0);
  const inactiveCount = SLOTS - activeCount;
  // Resting fills the inactive window first (night rest); only the
  // leftover spills into the active window as daytime rest.
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
  // Clock order from the day's start (first window's start hour) —
  // the inactive window wraps midnight, so slot order would put
  // 00:00–06:00 before 18:00–24:00 and centre sleep wrongly.
  const dayStartSlots = Math.floor(patternWindows(pattern)[0][0] * 4);
  const order = [...Array(SLOTS).keys()]
    .sort((a, b) => ((a - dayStartSlots + SLOTS) % SLOTS) - ((b - dayStartSlots + SLOTS) % SLOTS));
  let ai = 0;
  for (const s of order) if (active[s]) slots[s] = activeActs[ai++];
  // Inactive window: rest, then sleep centred in the window (deepest
  // sleep mid-rest), then rest again.
  const inactiveIdx = order.filter((s) => !active[s]);
  const sleepStart = Math.floor((inactiveIdx.length - sleepSlots) / 2);
  for (let i = 0; i < sleepSlots; i++) slots[inactiveIdx[sleepStart + i]] = 'sleeping';
  if (pattern === 'Continuous') {
    // No sleep cycle: daylight is feeding (photosynthesis, filtering),
    // night is rest.
    for (let s = 0; s < SLOTS; s++) if (active[s]) slots[s] = 'feeding';
  }
  return slots;
}

/** What the creature is doing right now, by the device clock. */
export function activityNow(rec, key, now = new Date()) {
  const slots = paintDay(rec, key);
  const idx = Math.min(SLOTS - 1, Math.floor(localHour(now) * 4));
  return slots[idx];
}

// ── Habits Agent, social + migration ─────────────────────────────

/** Social behaviour and group size (display — one mesh per cell). */
export function socialFor(rec, key) {
  const b = rec.soc || 'Solitary';
  if (/^pair$/i.test(b)) return { behaviour: b, groupSize: 2 };
  if (/group/i.test(b)) {
    return { behaviour: b, groupSize: 2 + Math.floor(hash01(key, SEED_SOCIAL) * 10) };
  }
  if (/colon/i.test(b)) {
    return { behaviour: b, groupSize: 5 + Math.floor(hash01(key, SEED_SOCIAL) * 25) };
  }
  return { behaviour: b, groupSize: 1 };
}

const MIGRATORY_RE = /migrat|anadromous|potamodromous|amphidromous/i;

/**
 * Migration state. Migratory species are flagged migrating in
 * spring and autumn (hemisphere-shifted) and roam a 3x wider
 * circuit; they do not leave the cell — no long-distance travel
 * model yet.
 */
export function migrationFor(rec, lat, month) {
  const type = rec.mig || 'Non-migratory';
  const isMig = MIGRATORY_RE.test(type) && !/^non-migratory/i.test(type.trim());
  const m = lat < 0 ? ((month + 5) % 12) + 1 : month;
  const migrating = isMig && ((m >= 3 && m <= 5) || (m >= 9 && m <= 11));
  return { type, migrating, roam: isMig ? 3 : 1 };
}

// ── Conductor: the whole life, from the clock ────────────────────

function buildAlive(rec, name, cellKey, nowMsV, lat, epochMs, ageDays, generation) {
  const key = `${cellKey}|${name}`;
  const g = growthFor(rec, ageDays);
  const month = utcMonth(new Date(nowMsV));
  const inSeason = inSeasonMask(rec.sea, lat, month);
  const adult = ageDays >= rec.mat;
  const reproEndDays = rec.mat + rec.rls * 365.25;
  const breeding = adult && inSeason && ageDays <= reproEndDays;
  return {
    name,
    cell: cellKey,
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
    littersPerYear: rec.lpy,
    gestationDays: rec.ges,
    incubationDays: rec.inc,
    activity: activityNow(rec, key, new Date(nowMsV)),
    activityPattern: rec.act,
    diet: LIFE_DIETS[rec.die] || 'Omnivore',
    feedingMethod: LIFE_FEEDING_METHODS[rec.fdm] || '',
    gut: LIFE_GUTS[rec.gut] || '',
    social: socialFor(rec, key),
    migration: migrationFor(rec, lat, month),
    decompFraction: 0,
    decompStageName: null,
    deathEpochMs: null,
    lifespanYears: rec.lif,
    lifespanBasis: rec.lifB,
    lifespanSource: rec.src[8] || '-',
    src: rec.src,
  };
}

function buildDecomposing(rec, name, cellKey, nowMsV, lat, epochMs, deathMs, generation) {
  const key = `${cellKey}|${name}`;
  const stages = LIFE_DECOMP_STAGES[rec.dstg] || ['Remains'];
  const decompMs = Math.max(1, rec.dec * DAY_MS);
  const frac = clamp((nowMsV - deathMs) / decompMs, 0, 1);
  const idx = Math.min(stages.length - 1, Math.floor(frac * stages.length));
  const g = growthFor(rec, rec.lif * 365.25);
  const month = utcMonth(new Date(nowMsV));
  return {
    name,
    cell: cellKey,
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
    littersPerYear: rec.lpy,
    gestationDays: rec.ges,
    incubationDays: rec.inc,
    activity: 'resting',
    activityPattern: rec.act,
    diet: LIFE_DIETS[rec.die] || 'Omnivore',
    feedingMethod: LIFE_FEEDING_METHODS[rec.fdm] || '',
    gut: LIFE_GUTS[rec.gut] || '',
    social: socialFor(rec, key),
    migration: migrationFor(rec, lat, month),
    decompFraction: Math.round(frac * 1000) / 1000,
    decompStageName: stages[idx],
    decompStages: stages,
    deathEpochMs: deathMs,
    lifespanYears: rec.lif,
    lifespanBasis: rec.lifB,
    lifespanSource: rec.src[8] || '-',
    src: rec.src,
  };
}

/**
 * The full life state of one creature at the device clock: its
 * generation, age, growth stage and size, whether it is breeding,
 * what it is doing right now, what it eats, and — if dead — how
 * far along its decomposition is. Pure: the same (name, cell,
 * clock, latitude) always returns the same life.
 */
export function lifeFor(name, cellKey, now = Date.now(), lat = 0) {
  const rec = lifeRecordFor(name);
  const nowMsV = now instanceof Date ? now.getTime() : Number(now);
  const lifespanMs = Math.max(1, rec.lif * YEAR_MS);
  const decompMs = Math.max(1, rec.dec * DAY_MS);
  const key = `${cellKey}|${name}`;
  const ageAtFounding = hash01(key, SEED_BIRTH) * lifespanMs;
  let epoch = FOUNDING_MS - ageAtFounding;
  let generation = 0;
  let guard = 0;
  while (guard++ < 10000) {
    const death = epoch + lifespanMs;
    if (nowMsV < death) {
      return buildAlive(rec, name, cellKey, nowMsV, lat, epoch, (nowMsV - epoch) / DAY_MS, generation);
    }
    const free = death + decompMs;
    const next = nextSeasonStartMs(rec.sea, lat, free);
    if (nowMsV < next) {
      return buildDecomposing(rec, name, cellKey, nowMsV, lat, epoch, death, generation);
    }
    epoch = next;
    generation++;
  }
  // Guard tripped (unreachable in practice): report the current
  // epoch as alive rather than throwing.
  return buildAlive(rec, name, cellKey, nowMsV, lat, epoch, Math.max(0, (nowMsV - epoch) / DAY_MS), generation);
}

/**
 * Enrich spawner output with life: adds `life` to every creature
 * (mutates and returns the same array). The spawner itself is
 * untouched — the spatial law stays pure; the operators layer time
 * on top of it.
 */
export function enrichCreatures(creatures, now = Date.now()) {
  if (!Array.isArray(creatures)) return creatures;
  const t = now instanceof Date ? now.getTime() : Number(now);
  for (const c of creatures) {
    if (!c || typeof c.name !== 'string') continue;
    c.life = lifeFor(c.name, c.cell || c.id || '', t, typeof c.lat === 'number' ? c.lat : 0);
  }
  return creatures;
}

/**
 * Mesh scale for a live creature: its current size over its adult
 * size, floored so hatchlings and seedlings still read on screen.
 * Decomposing remains are not scaled here — the scene flattens them.
 */
export function growthScale(life) {
  if (!life || life.state !== 'alive') return 1;
  return clamp(life.sizeM / Math.max(0.001, life.adultSizeM), 0.15, 1);
}
