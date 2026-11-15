// app/flying-dutchman/humanoid-operators.js
// THE FLYING DUTCHMAN — HUMANOID OPERATOR AGENTS (Merlin, Nov 14 ~23:25:
// "Do the same thing we did for animals for humanoids please, garments,
// weapons handling, all of it."). The agents that operate the Dutchman's
// humanoids: foe-ship crews, island merchants, and ashore duel foes.
// Mirrors the animal pattern (app/flying-dutchman/operators.js, which
// mirrors lib/earth4/operators.js): seven agents (birth, growth, death,
// decomposition, diet, habits + conductor `lifeFor`), a being's whole
// life a pure function of (place, kind, device clock), NO stored state,
// NO server. Plus a GARMENT agent and a WEAPONS agent per kind.
//
// THE OPERATORS READ THE EXISTING SYSTEMS — THEY DO NOT REPLACE THEM.
// Crew counts, the 25-hull crew-loss rule, the sinking soul release,
// the merchant catalogue, the duel state machines and foe-ship cannon
// fire all live where they always lived (engine.js / voyage.js /
// sea3d.js / ship3d.js / page.jsx) and are untouched. The operators
// only REPORT life on top of them.
//
// HUMANOIDS ENUMERATED FROM CODE (verified, not assumed):
//   * CREWMAN — a soul aboard a ship. engine.js makeShip: `crew` is a
//     NUMBER (souls), default 6; player 8; foe ships (makeAI) 4 +
//     floor(difficulty * 2); legendary fleet ships 8; max 24. Rendered
//     in ship3d.js as glowing soul figures (cone body 0.32 x 1.1 +
//     sphere head 0.2, ONE shared crewMat: 0xd8fff0, opacity 0.85,
//     emissive ghost-green/blue 1.4) stationed at the guns — the page
//     shows at most 12 (player) / 8 (foe, fleet) figures no matter how
//     many souls are aboard. One soul per crewman: the wreck releases
//     one soul per crewman aboard (engine.js damageShip).
//   * MERCHANT — one per island. voyage.js dressIslands sets
//     isl.hasMerchant = true on EVERY island (8 islands); the stall is
//     a POSITION on the shore (page.jsx dockAt: island centre + dock
//     bearing x (r - 6)) and the merchant itself is a 2D panel
//     (MerchantPanel: 4 upgrades — Extra Cannon, Reinforced Hull,
//     Shield Capacitor, Master Carpenter). NO rendered figure exists
//     anywhere: no mesh, no sprite, no GLB. Garments are data-only,
//     flagged as such.
//   * DUELLIST — the ashore duel foes. page.jsx dockAt seeds 2–3 per
//     island (2 + |island.seed| % 2) at seeded spots, each a THREE
//     cone figure (ConeGeometry 1.1 x 3.2, colour 0x1a0a12, emissive
//     0x400010, intensity 0.6) — a dark-red hooded robe, no head, no
//     weapon mesh. The duel itself (voyage.js makeSwordDuel /
//     makePistolDuel) is a pure state machine with an ABSTRACT foe:
//     no identity, no body — the DuelOverlay is 2D pips and text.
//     The standing cone figures and the duel-encounter foe are the
//     same kind at two layers: standing (seeded timeline) and
//     duelling (read live from the duel state machine).
//   * NOT humanoids here: the kraken (event-boss, animal operators),
//     the PvP rival captain (pvp-sync.js — a REAL other player, not
//     an NPC), and the player's own captain (the user).
//
// DEATH LAW (recorded from code, implemented exactly — no combat or
// death cause invented):
//   * Crewman: dies by HULL DAMAGE — 1 crew per 25 hull damage
//     (SHIP.crewPerHullLoss), shield absorbs first so a shielded hit
//     costs no crew — or WITH THE SHIP when hull hits 0: every soul
//     aboard is released with the wreck (one per crewman at sinking,
//     _crewStart, minimum 1 — engine.js damageShip). A lost soul
//     lingers as a floating wisp for 180 s (SHIP.soulLife), then
//     fades back to the deep. Claimed souls JOIN a crew (crew + 1,
//     max 24): death is reversible only by claiming another soul.
//   * Merchant: NEVER DIES in code. No death rule exists for a
//     merchant anywhere; the merchant is always there when the
//     player docks. Implemented as deathLaw 'never' — no lifespan,
//     no decomposition, no next generation.
//   * Duellist (standing): NO death rule exists in the code for the
//     standing cone figures (undock removes the mesh; the next
//     landing re-seeds them — that is respawn, not death). Default
//     implemented here is AGE ONLY (lifespan reached) — THAT IS THIS
//     WORKER'S CALL, flagged as such, not Merlin's order.
//   * Duel-foe (encounter): FALLS when foeHp reaches 0 in a sword
//     duel (3 hits while open — attack only while foe open, parry
//     only during telegraph), or is OUTDRAWN in a pistol duel
//     (reaction < 0.4 s: +3 souls; 0.4–0.7 s: +2; slower, or firing
//     before the signal: the foe wins). The fall is a log line and a
//     soul reward only ('foe falls — player wins', voyage.js): NO
//     corpse, no remains, no soul drop beyond the reward. When the
//     PLAYER loses, the foe LIVES ('the foe keeps your pride').
//
// POPULATION RULE (Merlin, Nov 14 ~22:57): MORE THAN ONE COPY of
// every humanoid kind, SPREAD OUT — EXCEPT singletons by design:
// one merchant per island (flagged, NOT multiplied). Crews: every
// foe ship carries 4+ crewmen, in waves of 1–3 ships at 220–380 m
// on all bearings. Duellists: 2–3 per island, 16–24 across the 8
// islands. Duel encounters are 1-on-1 by design — one foe at a time
// in the overlay, NOT a population.
//
// BEHAVIOR LOGIC (Merlin, Nov 14 ~22:59): diet drives feeding;
// territorial rivals fight unless a user enters the area; should
// the user die, rivals fight over the corpse. DUTCHMAN
// APPLICATION — read carefully, per realm (same check as the animal
// pass): this logic is implemented where the realm's code actually
// supports the branch, and each branch that does not apply is said
// so, not faked:
//   * Feeding: diet drives the feeding mode (feedingFor) — crews
//     feast on souls claimed in battle, merchants and duellists eat
//     ship stores and island fare. The prey is NEVER a spawned
//     creature: no spawned being is ever prey in the Dutchman
//     either (the sea is full of unspawned fish; souls are the
//     already-dead).
//   * Territory: the Dutchman has NO territorial humanoid rivals in
//     code. Crews belong to ships — ships fight the player, crewmen
//     never fight each other. Merchants are per-island singletons
//     with no rival on the same island. Duellists are 1-on-1 by
//     design. The rival-fight branch is implemented but unreachable
//     for every humanoid kind. The user-in-range branch IS live:
//     foe crews hunt the player's ship through their ship's cannons
//     (engine.js stepAI: close, hold broadside, fire).
//   * User death: the Dutchman has NO corpse. A downed ship respawns
//     100 m from the wreck keeping everything (voyage.js
//     respawnPlayer) — that is the existing user-death outcome, NOT
//     a corpse, and no corpse mechanic is invented. A duellist who
//     beats the player leaves no corpse either: the overlay closes
//     and the foe keeps your pride. So the fight-over-the-corpse
//     branch is implemented as 'no-corpse' (see territoryFor /
//     userDeathLaw).
//   * Water: trivially satisfied — everything lives in or on the sea
//     (waterFor): crews drink from ship stores, merchants and
//     duellists from the island spring.
// EARTH 4 CARVE-OUT: none of this touches Earth 4. Earth 4's
// standing laws (NO hunting; population by TIME only; death by age
// only; no spawned creature ever prey) are untouched in
// lib/earth4/operators.js. Verified for this pass: Earth 4 has NO
// humanoids at all — 1,262 catalogue species, no Hominidae, no
// Homo (the "Homo" string hits are Homoscleromorpha sponges), and
// its only 6 primates are non-human monkeys and lemurs (night
// monkey, capuchin, titi, lemur, tamarin, sifaka) — animals, not
// humanoids. Nothing to build there.
// HUB CARVE-OUT: the hub (components/HomeScene.jsx, mounted by
// app/page.jsx) has NO NPCs in it — no figures, no characters, no
// vendors, no guards. lib/glb/avatars.js lists NPC_MODELS (vendor,
// guard, engineer, sage, courier, warden) but nothing in the hub
// imports or spawns them. No hub humanoid file is built.

import {
  localHour,
  utcMonth,
  inSeasonMask,
  nextSeasonStartMs,
} from '../../lib/earth4/life-clock.js';

export const DUTCHMAN_FOUNDING_MS = Date.UTC(2026, 10, 14); // the Dutchman went live Nov 14, 2026
export const DAY_MS = 86400000;
export const YEAR_MS = 365.25 * DAY_MS;

// Crew law, read from engine.js — NOT re-decided here.
export const CREW_PER_HULL_LOSS = 25; // 1 crew per 25 hull damage
export const SOUL_LIFE_S = 180; // seconds a lost soul lingers as a wisp
export const MAX_CREW = 24;
export const CANNON_RANGE = 130;
// Duel law, read from voyage.js — NOT re-decided here.
export const DUEL_FOE_HP = 3;
export const DUEL_SWORD_REWARD = 3;
export const DUEL_PISTOL_FAST_S = 0.4; // reaction < 0.4 s: +3 souls
export const DUEL_PISTOL_SLOW_S = 0.7; // 0.4–0.7 s: +2 souls; slower: lost
export const DUEL_PISTOL_SIGNAL_MIN_S = 1.5;
export const DUEL_PISTOL_SIGNAL_MAX_S = 3.5;

const SEED_BIRTH = 20261114 + 401;
const SEED_ACT = 20261114 + 503;
const SEED_SOCIAL = 20261114 + 607;

// The spawner's own hash law (lib/earth4/operators.js) — the same
// seeded arithmetic, so the same being always draws the same life.
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

// ---------------------------------------------------------------------------
// Life records for the seeded-timeline kinds (merchant, duellist).
//
// Lifespans, tenures and decomposition windows below are ESTIMATES
// (this worker's call — no Dutchman dataset exists for them, and the
// code has no death rule for the standing figures at all). The sim
// runs the same for listed and estimated values; the `src` flag on
// each life object says which is which. Crewmen and duel-encounter
// foes have NO record here — their lives are read live from the ship
// / duel state (crewmanLife / duelFoeLife). The merchant has no
// lifespan at all: merchants never die, so `lif` is null and the
// seeded loop never runs for them.
// ---------------------------------------------------------------------------

const SEASON_YEAR_ROUND = 0xfff;

const RECORDS = {
  merchant: {
    lif: null, lifB: 'never-dies', dec: null,
    lit: 0, lpy: 0, ges: 0, inc: 0, mat: 3650, rls: 0, sea: SEASON_YEAR_ROUND,
    ttA: 3650, adS: 1.7, bS: 1.7,
    stg: ['Apprentice', 'Trader', 'Master merchant'],
    dstg: [],
    die: 'Ship stores and island fare',
    dieCat: 'omnivore', territorial: false,
    act: 'Diurnal', soc: 'Singleton', hrs: [8, 2, 2, 4, 8],
  },
  duellist: {
    lif: 45, lifB: 'estimate', dec: 30,
    lit: 0, lpy: 0, ges: 0, inc: 0, mat: 6570, rls: 0, sea: SEASON_YEAR_ROUND,
    ttA: 6570, adS: 1.7, bS: 1.7,
    stg: ['Greenhorn', 'Seasoned', 'Old blade'],
    dstg: ['Remains'],
    die: 'Ship stores and island fare',
    dieCat: 'omnivore', territorial: false,
    act: 'Diurnal', soc: 'Small band', hrs: [8, 2, 6, 4, 4],
  },
  crewman: {
    lif: null, lifB: 'live-read', dec: SOUL_LIFE_S / 86400,
    lit: 0, lpy: 0, ges: 0, inc: 0, mat: 730, rls: 0, sea: SEASON_YEAR_ROUND,
    ttA: 730, adS: 1.45, bS: 1.45,
    stg: ['New soul', 'Settled', 'Old salt'],
    dstg: ['Wisp', 'Faded'],
    die: 'Souls claimed in battle',
    dieCat: 'souls', territorial: false,
    act: 'Cathemeral', soc: 'Crew', hrs: [6, 2, 10, 4, 2],
  },
};

const FALLBACK = {
  lif: 45, lifB: 'fallback', dec: 30,
  lit: 0, lpy: 0, ges: 0, inc: 0, mat: 365, rls: 0, sea: SEASON_YEAR_ROUND,
  ttA: 365, adS: 1.7, bS: 1.7,
  stg: ['Juvenile', 'Adult'],
  dstg: ['Remains'],
  die: 'Unknown',
  dieCat: 'omnivore', territorial: false,
  act: 'Cathemeral', soc: 'Solitary', hrs: [8, 6, 4, 4, 2],
};

/** The compiled life record for a humanoid kind, or the fallback. */
export function lifeRecordFor(kind) {
  return (kind && RECORDS[kind]) || FALLBACK;
}

// ---------------------------------------------------------------------------
// Death Agent — the death law, as implemented (see the header).
// ---------------------------------------------------------------------------

/**
 * The death law for a humanoid kind, as implemented in the code —
 * not invented. `cause` is one of 'hull-damage-or-sinking'
 * (crewman), 'never' (merchant), 'age' (standing duellist — the
 * age-only default, this worker's call: no death rule exists for
 * them in page.jsx) or 'duel' (the duel-encounter foe).
 */
export function deathLawFor(kind) {
  if (kind === 'crewman') {
    return {
      cause: 'hull-damage-or-sinking',
      detail: `1 crew per ${CREW_PER_HULL_LOSS} hull damage (shield absorbs first — a shielded hit costs no crew); all hands lost when the hull hits 0, one soul released per crewman aboard`,
      crewPerHullLoss: CREW_PER_HULL_LOSS,
      soulLingerSeconds: SOUL_LIFE_S,
      drops: 'one soul per crewman aboard, at sinking',
    };
  }
  if (kind === 'merchant') {
    return {
      cause: 'never',
      detail: 'merchants never die in code — no death rule exists for them anywhere; the merchant is always there when the player docks',
      crewPerHullLoss: null,
      soulLingerSeconds: null,
      drops: null,
    };
  }
  if (kind === 'duel-foe') {
    return {
      cause: 'duel',
      detail: `falls when foeHp reaches 0 in a sword duel (3 hits while open), or is outdrawn in a pistol duel (reaction < ${DUEL_PISTOL_FAST_S} s: +3 souls; ${DUEL_PISTOL_FAST_S}–${DUEL_PISTOL_SLOW_S} s: +2). No corpse, no remains, no soul drop beyond the reward — the overlay closes`,
      crewPerHullLoss: null,
      soulLingerSeconds: null,
      drops: 'soul reward only (+3 sword, +3/+2 pistol)',
    };
  }
  return {
    cause: 'age',
    detail: 'age only — no death rule exists in the code for the standing figures (worker default, flagged)',
    crewPerHullLoss: null,
    soulLingerSeconds: null,
    drops: null,
  };
}

// ---------------------------------------------------------------------------
// Birth Agent (breeding season + offspring — humanoids do not breed;
// birth here is the seeded tenure / arrival at the founding).
// ---------------------------------------------------------------------------

/** True when the kind is in its breeding season at this latitude. */
export function breedingSeasonNow(rec, lat, now = new Date()) {
  return inSeasonMask(rec.sea, lat, utcMonth(now));
}

// ---------------------------------------------------------------------------
// Growth Agent
// ---------------------------------------------------------------------------

/**
 * Growth state at `ageDays`: the stage the being is in, and its
 * current size — birth size eased up to adult size over
 * time-to-adult (square-root easing: fast early growth, then slow).
 * Humanoid sizes are flat (1.7 m, crew souls 1.45 m): the stage is
 * what moves, not the body.
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
// as Earth 4 (lib/earth4/operators.js) and the animal operators: resting
// fills the inactive window first (night rest) and only spills into the
// active window as daytime rest; inside the active window the blocks
// run feeding -> moving -> other -> resting, in budget proportions;
// sleep sits centred in the inactive window. The budget columns are
// the data; the mapping is the stated convention.
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

/** What the being is doing right now, by the device clock. */
export function activityNow(rec, key, now = new Date()) {
  const slots = paintDay(rec, key);
  const idx = Math.min(SLOTS - 1, Math.floor(localHour(now) * 4));
  return slots[idx];
}

/**
 * The clock activity translated into the being's role: a crewman
 * 'moving' is working the rigging, a merchant's 'other' is trading,
 * a duellist's 'moving' is drilling. The raw clock activity stays
 * on the life object as `activity`; this is the display role.
 * `inCombat` (a foe ship closing on the player, or a duel in
 * progress) overrides the clock: the being is fighting, not
 * keeping its hours.
 */
export function roleActivityFor(kind, activity, inCombat = false) {
  if (inCombat) {
    if (kind === 'crewman') return 'at the guns';
    if (kind === 'duellist' || kind === 'duel-foe') return 'fighting';
    return 'trading';
  }
  switch (kind) {
    case 'crewman':
      if (activity === 'feeding') return 'eating below decks';
      if (activity === 'moving') return 'working the rigging';
      if (activity === 'sleeping') return 'asleep in their hammocks';
      if (activity === 'resting') return 'resting';
      return 'mending sail';
    case 'merchant':
      if (activity === 'feeding') return 'eating at the stall';
      if (activity === 'moving') return 'hauling stock';
      if (activity === 'sleeping') return 'asleep behind the stall';
      if (activity === 'resting') return 'resting';
      return 'trading';
    case 'duellist':
    case 'duel-foe':
      if (activity === 'feeding') return 'eating island fare';
      if (activity === 'moving') return 'drilling';
      if (activity === 'sleeping') return 'asleep on the sand';
      if (activity === 'resting') return 'resting';
      return 'swaggering';
    default:
      return activity || 'resting';
  }
}

// ---------------------------------------------------------------------------
// Diet Agent — feeding, driven by diet (Merlin, Nov 14 ~22:59).
//
// Crews feast on souls claimed in battle; merchants and duellists
// eat ship stores and island fare. The prey is NEVER a spawned
// creature — souls are the already-dead, and the sea is full of
// unspawned fish. The death law in the header stands.
// ---------------------------------------------------------------------------

/**
 * How the being feeds right now. Only meaningful while its clock
 * activity is 'feeding'; otherwise mode is null.
 */
export function feedingFor(kind, activity, key, now = Date.now()) {
  if (activity !== 'feeding') return { mode: null, detail: 'not feeding right now' };
  if (kind === 'crewman') {
    return { mode: 'feasting', detail: 'feasting on souls claimed in battle — the already-dead, never a spawned creature' };
  }
  return { mode: 'eating', detail: 'eating ship stores and island fare' };
}

// ---------------------------------------------------------------------------
// Garment Agent — what they wear, tied to the actual mesh/material
// the scene already uses. NOTHING is invented that the renderer
// cannot show: where no figure exists, the garment is data-only and
// flagged as such.
// ---------------------------------------------------------------------------

/**
 * A being's garment right now. `ctx` is { hullFraction } for a
 * crewman (battle damage tatters the shroud as the hull falls),
 * { foeHp } for a duellist / duel-foe (the robe tatters as the foe
 * loses hp), or {} for a merchant.
 *
 * Rendered truth, read from code:
 *   * crewman — ship3d.js: ONE shared crewMat for every soul figure
 *     (cone 0.32 x 1.1 + sphere head 0.2, colour 0xd8fff0, opacity
 *     0.85, emissive ghost-green/blue 1.4). There is NO per-crewman
 *     garment to change: the shroud is the shared material, so the
 *     garment is data-only per crewman (condition only).
 *   * merchant — NO figure at all: no mesh, no sprite, no GLB. The
 *     merchant is a 2D panel and a shore position. Data-only.
 *   * duellist — page.jsx dockAt: EACH foe gets its OWN cone mesh
 *     and its OWN material (ConeGeometry 1.1 x 3.2, colour 0x1a0a12,
 *     emissive 0x400010, emissiveIntensity 0.6). The robe IS the
 *     garment, and its condition maps to the material's
 *     emissiveIntensity (0.6 whole -> 0.45 slashed -> 0.3 torn -> 0
 *     fallen). This module REPORTS the mapping; it does not touch
 *     the mesh — the scene owns it.
 */
export function garmentFor(kind, ctx = {}) {
  if (kind === 'crewman') {
    const hullF = typeof ctx.hullFraction === 'number' ? ctx.hullFraction : 1;
    const condition = hullF >= 0.75 ? 'whole' : hullF >= 0.5 ? 'frayed' : hullF >= 0.25 ? 'tattered' : 'in rags';
    return {
      kind: 'soul shroud',
      label: `soul shroud — ${condition}`,
      condition,
      rendered: true,
      perFigure: false,
      mesh: 'cone body (0.32 x 1.1) + sphere head (0.2), one shared crewMat for all figures',
      material: { color: 0xd8fff0, opacity: 0.85, emissiveGhost: 0x9fdcff, emissive: 0x54ffb0, emissiveIntensity: 1.4 },
      detail: 'data-only per crewman: the renderer draws one shared material for every soul figure — no per-crewman garment exists to re-tint. The shroud tatters as the hull falls.',
    };
  }
  if (kind === 'merchant') {
    const tenureY = typeof ctx.tenureYears === 'number' ? ctx.tenureYears : 0;
    const condition = tenureY >= 10 ? 'worn soft' : tenureY >= 3 ? 'broken in' : 'new';
    return {
      kind: 'merchant garb',
      label: `merchant garb — ${condition}`,
      condition,
      rendered: false,
      perFigure: false,
      mesh: null,
      material: null,
      pieces: ['apron', 'coin purse', 'ledger', 'wide-brim hat'],
      detail: 'DATA-ONLY — the merchant has no rendered figure at all (2D MerchantPanel + a shore position). Nothing in the scene can show this garb.',
    };
  }
  // duellist + duel-foe: the cone robe.
  const hp = typeof ctx.foeHp === 'number' ? ctx.foeHp : DUEL_FOE_HP;
  const condition = hp >= 3 ? 'whole' : hp === 2 ? 'slashed' : hp === 1 ? 'torn' : 'fallen';
  const emissiveIntensity = hp >= 3 ? 0.6 : hp === 2 ? 0.45 : hp === 1 ? 0.3 : 0;
  return {
    kind: 'duel robe',
    label: `duel robe — ${condition}`,
    condition,
    rendered: true,
    perFigure: true,
    mesh: 'cone robe (ConeGeometry 1.1 x 3.2, 6 segments), one mesh + one material per foe',
    material: { color: 0x1a0a12, emissive: 0x400010, emissiveIntensity, roughness: 0.8 },
    detail: `the robe IS the garment — condition maps to the material's emissiveIntensity (${emissiveIntensity}, from 0.6 whole). Reported, not applied: the scene owns the mesh.`,
  };
}

// ---------------------------------------------------------------------------
// Weapons Agent — grip / stance / readiness by state, weapon
// condition and damage. RESPECTS the existing combat systems: it
// READS them and never drives them. Sword: attack only while foe
// open, parry only during telegraph, 3 hits wins +3 souls.
// Pistol: signal at 1.5–3.5 s, timing windows. Foe-ship cannons:
// stepAI fires when the player is abeam and in range.
// ---------------------------------------------------------------------------

/**
 * A being's weapon right now. `ctx` is { foeState, foeHp, phase,
 * reaction, result } for a duellist / duel-foe (read live off the
 * duel state machine), { rangeM, reloadFraction } for a crewman
 * (read live off the ship), or {} for a merchant.
 *
 * Stances, read from the combat code:
 *   * sword — foeState 'idle': circling, sword lowered; 'telegraph':
 *     blade raised, about to strike; 'open': guard down, exposed.
 *   * pistol — phase 'wait': hand hovering over the holster; after
 *     the signal: drawing. Won/lost: holstered again.
 *   * cannon — the crew is ready while the ship is closing or
 *     holding broadside inside cannon range (130 m); standing by
 *     otherwise. Readiness is the ship's reload state, not a new
 *     timer: reloadFraction 1 = loaded and ready.
 * Weapon damage: the code has NO weapon-degradation rule for any
 * kind — cannons never degrade, and the duel foe's blade/pistol
 * condition is display-only here (nicked per hp lost), flagged.
 */
export function weaponFor(kind, ctx = {}) {
  if (kind === 'merchant') {
    return {
      weapon: 'none',
      label: 'unarmed',
      stance: 'unarmed — trades, never fights',
      readiness: null,
      condition: 'n/a',
      detail: 'merchants carry no weapon and never fight — they sell upgrades for souls.',
    };
  }
  if (kind === 'crewman') {
    const rangeM = typeof ctx.rangeM === 'number' ? ctx.rangeM : null;
    const inRange = rangeM != null && rangeM < CANNON_RANGE;
    const reload = typeof ctx.reloadFraction === 'number' ? clamp(ctx.reloadFraction, 0, 1) : null;
    return {
      weapon: 'cannon',
      label: inRange ? 'cannon — ready' : 'cannon — standing by',
      stance: inRange ? 'at the guns, ready to fire' : 'standing by the guns',
      readiness: reload,
      condition: 'sound',
      detail: inRange
        ? 'the player is abeam and in range — the crew is at the guns (engine.js stepAI fires here)'
        : 'no target abeam in range — the crew stands by (cannons never degrade in code)',
    };
  }
  // duellist / duel-foe.
  const duelKind = ctx.duelKind || 'sword';
  if (duelKind === 'pistol') {
    const phase = ctx.phase || 'wait';
    const won = phase === 'won';
    const lost = phase === 'lost';
    const condition = lost && ctx.result === 'slow' ? 'smoke-fouled' : 'clean';
    return {
      weapon: 'pistol',
      label: won ? 'pistol — clean shot' : lost ? 'pistol — smoking' : 'pistol — holstered',
      stance: won ? 'smoking pistol, duel won' : lost ? 'holstered — outdrawn or too slow' : 'hand hovering over the holster, waiting for the signal',
      readiness: phase === 'wait' ? 0.5 : 1,
      condition,
      detail: `signal at ${DUEL_PISTOL_SIGNAL_MIN_S}–${DUEL_PISTOL_SIGNAL_MAX_S} s; reaction < ${DUEL_PISTOL_FAST_S} s wins +3 souls, ${DUEL_PISTOL_FAST_S}–${DUEL_PISTOL_SLOW_S} s wins +2 (voyage.js pistolDuelTap). Condition is display-only — no weapon-degradation rule exists in code.`,
    };
  }
  const foeState = ctx.foeState || 'idle';
  const foeHp = typeof ctx.foeHp === 'number' ? ctx.foeHp : DUEL_FOE_HP;
  const condition = foeHp >= 3 ? 'keen' : foeHp === 2 ? 'nicked' : foeHp === 1 ? 'notched' : 'dropped';
  const stance = foeState === 'telegraph' ? 'blade raised — about to strike'
    : foeState === 'open' ? 'guard down, exposed — strike now'
    : 'circling, sword lowered';
  return {
    weapon: 'sword',
    label: `sword — ${condition}`,
    stance,
    readiness: foeState === 'open' ? 0 : foeState === 'telegraph' ? 1 : 0.5,
    condition,
    detail: `attack only while the foe is open, parry only during the telegraph — 3 hits wins +${DUEL_SWORD_REWARD} souls (voyage.js swordDuelTick / swordDuelAction). Condition is display-only — no weapon-degradation rule exists in code.`,
  };
}

// ---------------------------------------------------------------------------
// Territory Agent — carnivores are territorial (Merlin, Nov 14 ~22:59).
//
// Dutchman application (see header): NO humanoid kind here has a
// territorial rival. Crews belong to ships, merchants are per-island
// singletons, duellists are 1-on-1. The rival-fight branch is
// implemented but unreachable; the user-hunt branch IS live for foe
// crews (their ship's cannons); the user-death branch resolves to
// 'no-corpse' for every kind.
// ---------------------------------------------------------------------------

/**
 * A being's territorial state. `ctx` is { rivalsInRange, userInRange,
 * userDead } — live scene facts the caller reads off the world.
 * States: 'not-territorial' | 'hunting-user' | 'duelling-user' |
 * 'fighting-rival' | 'no-corpse'.
 */
export function territoryFor(kind, ctx = {}) {
  const rivals = !!ctx.rivalsInRange;
  const user = !!ctx.userInRange;
  const userDead = !!ctx.userDead;
  if (userDead) {
    return { state: 'no-corpse', detail: 'no corpse — a downed ship respawns 100 m from the wreck keeping everything, and a beaten duellist leaves no body behind' };
  }
  if (kind === 'crewman') {
    if (user) return { state: 'hunting-user', detail: 'a user is in range — the crew hunts the player\'s ship through her cannons, never each other' };
    if (rivals) return { state: 'fighting-rival', detail: 'fighting a rival crew to the death' };
    return { state: 'not-territorial', detail: 'crews belong to ships — they fight the player, never each other for a meal' };
  }
  if (kind === 'duellist' || kind === 'duel-foe') {
    if (user) return { state: 'duelling-user', detail: 'a user is here — one foe, one duel, never a brawl over territory' };
    if (rivals) return { state: 'fighting-rival', detail: 'fighting a rival duellist to the death' };
    return { state: 'not-territorial', detail: 'duels are 1-on-1 by design — no rival fights, no territory' };
  }
  if (kind === 'merchant') {
    return { state: 'not-territorial', detail: 'one merchant per island — no rival merchant on the same island, and merchants never fight' };
  }
  return { state: 'not-territorial', detail: 'not a territorial fighter' };
}

/**
 * The user-death outcome for this realm, as implemented in the
 * code. There is NO corpse in the Dutchman: a downed ship respawns
 * 100 m from the wreck keeping level, upgrades, souls, mega souls
 * and crew (voyage.js respawnPlayer), and the kraken despawns when
 * it downs the player with its timer reset. A duellist who beats
 * the player leaves no corpse either — the overlay closes and the
 * foe keeps your pride. Nothing fights over a corpse, because there
 * is none — no corpse mechanic is invented.
 */
export function userDeathLaw() {
  return {
    outcome: 'respawn',
    corpse: false,
    detail: 'A downed ship is NOT a corpse: the Dutchman rises again 100 m from the wreck, keeping level, upgrades, souls, mega souls and crew (voyage.js respawnPlayer). A duel loss leaves no corpse either — the overlay closes and the foe keeps your pride.',
  };
}

// ---------------------------------------------------------------------------
// Water Agent — ALL creatures seek out water (Merlin, Nov 14 ~22:59).
// In the Dutchman the branch is trivially satisfied: everything
// lives in or on the sea.
// ---------------------------------------------------------------------------

/** How the being meets its water need. */
export function waterFor(kind) {
  switch (kind) {
    case 'crewman':
      return { need: 'ship stores', detail: 'drinks from the ship\'s stores — the sea is all around, the crew never goes thirsty' };
    case 'merchant':
      return { need: 'island spring', detail: 'drinks from the island spring behind the stall' };
    case 'duellist':
    case 'duel-foe':
      return { need: 'island spring', detail: 'drinks from the island spring between drills' };
    default:
      return { need: 'drink', detail: 'seeks out water to drink' };
  }
}

// ---------------------------------------------------------------------------
// Habits Agent, social — group size (display)
// ---------------------------------------------------------------------------

/** Social behaviour and group size (display — the scene renders what it renders). */
export function socialFor(rec, key, kind = '', liveGroup = null) {
  if (kind === 'merchant') return { behaviour: 'Singleton', groupSize: 1 };
  if (kind === 'crewman') {
    return { behaviour: 'Crew', groupSize: typeof liveGroup === 'number' ? Math.max(0, liveGroup) : 1 };
  }
  if (kind === 'duellist' || kind === 'duel-foe') {
    return { behaviour: 'Small band', groupSize: typeof liveGroup === 'number' ? Math.max(1, liveGroup) : 1 };
  }
  const b = rec.soc || 'Solitary';
  if (/^pair$/i.test(b)) return { behaviour: b, groupSize: 2 };
  if (/group|band|crew|pod|school|flock/i.test(b)) {
    return { behaviour: b, groupSize: 2 + Math.floor(hash01(key, SEED_SOCIAL) * 7) };
  }
  return { behaviour: b, groupSize: 1 };
}

// ---------------------------------------------------------------------------
// Conductor: the whole life of a SEEDED humanoid (merchant, standing
// duellist), from the clock. Same shape as the animal operators'
// lifeFor: age at founding = hash x lifespan, death = birth +
// lifespan, then a decomposition window, then the next generation
// is born — snapped forward to the next breeding-season start when
// the kind is seasonal. Humanoids never breed, so `breeding` is
// always false and `offspring` always 0. The MERCHANT never runs
// this loop at all: merchants never die, so merchantLife (below)
// returns a deathless life instead.
// ---------------------------------------------------------------------------

function buildAlive(rec, kind, key, nowMsV, lat, epochMs, ageDays, generation) {
  const g = growthFor(rec, ageDays);
  const activity = activityNow(rec, key, new Date(nowMsV));
  return {
    name: kind,
    kind,
    key,
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
    breeding: false,
    offspring: 0,
    activity,
    roleActivity: roleActivityFor(kind, activity, false),
    activityPattern: rec.act,
    diet: rec.die,
    dietCategory: rec.dieCat,
    feeding: feedingFor(kind, activity, key, nowMsV),
    territory: territoryFor(kind, {}),
    water: waterFor(kind),
    social: socialFor(rec, key, kind),
    garment: garmentFor(kind, {}),
    weapon: weaponFor(kind, {}),
    decompFraction: 0,
    decompStageName: null,
    deathEpochMs: null,
    deathLaw: deathLawFor(kind),
    lifespanYears: rec.lif,
    lifespanBasis: rec.lifB,
  };
}

function buildDecomposing(rec, kind, key, nowMsV, lat, epochMs, deathMs, generation) {
  const stages = rec.dstg || ['Remains'];
  const decompMs = Math.max(1, rec.dec * DAY_MS);
  const frac = clamp((nowMsV - deathMs) / decompMs, 0, 1);
  const idx = Math.min(stages.length - 1, Math.floor(frac * stages.length));
  const g = growthFor(rec, rec.lif * 365.25);
  return {
    name: kind,
    kind,
    key,
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
    activity: 'resting',
    roleActivity: 'resting',
    activityPattern: rec.act,
    diet: rec.die,
    dietCategory: rec.dieCat,
    feeding: { mode: null, detail: 'dead — not feeding' },
    territory: { state: 'none', detail: 'dead — holds no territory' },
    water: waterFor(kind),
    social: socialFor(rec, key, kind),
    garment: garmentFor(kind, { foeHp: 0 }),
    weapon: weaponFor(kind, { duelKind: 'sword', foeHp: 0, foeState: 'idle' }),
    decompFraction: Math.round(frac * 1000) / 1000,
    decompStageName: stages[idx],
    decompStages: stages,
    deathEpochMs: deathMs,
    deathLaw: deathLawFor(kind),
    lifespanYears: rec.lif,
    lifespanBasis: rec.lifB,
  };
}

/**
 * The full life state of one seeded humanoid (standing duellist;
 * merchants use merchantLife — they never die) at the device clock.
 * Pure: the same (kind, key, clock) always returns the same life.
 */
export function lifeFor(kind, key, now = Date.now(), lat = 0) {
  const rec = lifeRecordFor(kind);
  if (kind === 'merchant' || rec.lif == null) return merchantLifeForKey(key, now);
  const nowMsV = now instanceof Date ? now.getTime() : Number(now);
  const lifespanMs = Math.max(1, rec.lif * YEAR_MS);
  const decompMs = Math.max(1, rec.dec * DAY_MS);
  const seedKey = `${key}|${kind}`;
  const ageAtFounding = hash01(seedKey, SEED_BIRTH) * lifespanMs;
  let epoch = DUTCHMAN_FOUNDING_MS - ageAtFounding;
  let generation = 0;
  let guard = 0;
  while (guard++ < 10000) {
    const death = epoch + lifespanMs;
    if (nowMsV < death) {
      return buildAlive(rec, kind, key, nowMsV, lat, epoch, (nowMsV - epoch) / DAY_MS, generation);
    }
    const free = death + decompMs;
    const next = nextSeasonStartMs(rec.sea, lat, free);
    if (nowMsV < next) {
      return buildDecomposing(rec, kind, key, nowMsV, lat, epoch, death, generation);
    }
    epoch = next;
    generation++;
  }
  return buildAlive(rec, kind, key, nowMsV, lat, epoch, Math.max(0, (nowMsV - epoch) / DAY_MS), generation);
}

// Merchant life from a bare key (used when lifeFor is called with
// 'merchant'): deathless — age is a seeded tenure at the founding
// plus clock elapsed, stage from tenure, never decomposing.
function merchantLifeForKey(key, now = Date.now()) {
  const rec = lifeRecordFor('merchant');
  const nowMsV = now instanceof Date ? now.getTime() : Number(now);
  const tenureAtFoundingDays = hash01(`${key}|merchant`, SEED_BIRTH) * 20 * 365.25;
  const ageDays = tenureAtFoundingDays + Math.max(0, (nowMsV - DUTCHMAN_FOUNDING_MS) / DAY_MS);
  const g = growthFor(rec, ageDays);
  const activity = activityNow(rec, key, new Date(nowMsV));
  return {
    name: 'merchant',
    kind: 'merchant',
    key,
    state: 'alive',
    generation: 0,
    ageDays: Math.round(ageDays * 10) / 10,
    ageYears: Math.round((ageDays / 365.25) * 100) / 100,
    stageIndex: g.stageIndex,
    stageName: g.stageName,
    stages: g.stages,
    sizeM: g.sizeM,
    adultSizeM: rec.adS,
    growthFraction: 1,
    breeding: false,
    offspring: 0,
    activity,
    roleActivity: roleActivityFor('merchant', activity, false),
    activityPattern: rec.act,
    diet: rec.die,
    dietCategory: rec.dieCat,
    feeding: feedingFor('merchant', activity, key, nowMsV),
    territory: territoryFor('merchant', {}),
    water: waterFor('merchant'),
    social: socialFor(rec, key, 'merchant'),
    garment: garmentFor('merchant', { tenureYears: ageDays / 365.25 }),
    weapon: weaponFor('merchant', {}),
    decompFraction: 0,
    decompStageName: null,
    deathEpochMs: null,
    deathLaw: deathLawFor('merchant'),
    lifespanYears: null,
    lifespanBasis: 'never-dies',
  };
}

// ---------------------------------------------------------------------------
// Merchant life — READ from the island, never re-derived. A merchant
// never dies, never leaves, and is one per island by design.
// ---------------------------------------------------------------------------

/**
 * The merchant of one island right now. `island` is the island
 * object (id / name). Always state 'alive' — see deathLawFor.
 * Pure read — it never mutates the island.
 */
export function merchantLife(island, now = Date.now()) {
  const key = (island && (island.id || island.name)) || 'isle-?';
  const life = merchantLifeForKey(key, now);
  life.island = key;
  life.islandName = (island && island.name) || null;
  life.social = { behaviour: 'Singleton', groupSize: 1 };
  return life;
}

// ---------------------------------------------------------------------------
// Standing-duellist life — READ from the island + index, never
// re-derived. Count and placement mirror page.jsx dockAt exactly:
// 2 + |island.seed| % 2 foes per island.
// ---------------------------------------------------------------------------

/** How many standing duel foes an island holds (2–3, seeded). */
export function duellistCountFor(island) {
  const seed = (island && typeof island.seed === 'number' ? island.seed : 0) || 0;
  return 2 + (Math.abs(seed) % 2);
}

/**
 * A pure mirror of page.jsx dockAt's foe placement: seeded spots on
 * the island (angle from island.seed, radius r * (0.35 + 0.15 * (i %
 * 2))). No three.js, no DOM — the 3D layer renders these placements.
 */
export function duellistPlacements(island) {
  const isl = island || {};
  const n = duellistCountFor(isl);
  const seed = (typeof isl.seed === 'number' ? isl.seed : 0) || 0;
  const r = typeof isl.r === 'number' ? isl.r : 60;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (((seed % 1000) / 1000) * Math.PI * 2) + (i / n) * Math.PI * 2;
    const rr = r * (0.35 + 0.15 * (i % 2));
    out.push({
      index: i,
      x: (isl.x || 0) + Math.sin(a) * rr,
      z: (isl.z || 0) + Math.cos(a) * rr,
    });
  }
  return out;
}

/**
 * The standing duel foe #index on an island right now. Returns null
 * when the index is beyond the island's seeded count (no such foe).
 * The seeded timeline is lifeFor('duellist', ...); the robe and
 * sword are whole while the foe stands — damage only shows in a
 * duel (duelFoeLife).
 */
export function duellistLife(island, index, now = Date.now()) {
  const n = duellistCountFor(island);
  if (typeof index !== 'number' || index < 0 || index >= n) return null;
  const key = `${(island && (island.id || island.name)) || 'isle-?'}|foe-${index}`;
  const life = lifeFor('duellist', key, now);
  life.island = (island && (island.id || island.name)) || 'isle-?';
  life.islandName = (island && island.name) || null;
  life.foeIndex = index;
  life.social = { behaviour: 'Small band', groupSize: n };
  const spot = duellistPlacements(island)[index];
  if (spot) { life.x = spot.x; life.z = spot.z; }
  return life;
}

// ---------------------------------------------------------------------------
// Crewman life — READ from the ship, never re-derived. A crewman is
// berth #index aboard a ship: he exists while index < ship.crew.
// Berths have no stored join time, so tenure is the Earth 4 trick:
// a seeded tenure at the founding, advancing with the device clock.
// An empty berth returns null (no such crewman aboard — the soul is
// gone; a lost soul lingers at most 180 s as a floating wisp, which
// is the soul system, not a crewman). A sunk ship reports every
// berth as decomposing: lost with the wreck, souls released.
// ---------------------------------------------------------------------------

/**
 * Crewman #index aboard `ship` right now. `player` is the player's
 * ship (for the range that reads whether the crew is at the guns);
 * omit it and the crew reads off the clock alone. Returns null for
 * an empty berth. Pure read — it never mutates the ship.
 */
export function crewmanLife(ship, index, now = Date.now(), player = null) {
  if (!ship || typeof index !== 'number' || index < 0) return null;
  const nowMsV = now instanceof Date ? now.getTime() : Number(now);
  const crew = typeof ship.crew === 'number' ? ship.crew : 0;
  const crewStart = typeof ship._crewStart === 'number' ? ship._crewStart : crew;
  const rec = lifeRecordFor('crewman');
  const key = `${ship.id || ship.name || 'ship'}|crew-${index}`;
  const hull = typeof ship.hull === 'number' ? ship.hull : 0;
  const maxHull = (ship && ship.maxHull) || 100;
  const hullFraction = clamp(hull / Math.max(1, maxHull), 0, 1);
  let rangeM = null;
  if (player && ship !== player) {
    rangeM = Math.hypot(player.x - ship.x, player.z - ship.z);
  }
  const inCombat = rangeM != null && rangeM < CANNON_RANGE && !!ship.alive;

  if (!ship.alive) {
    // Sunk: every soul aboard is released with the wreck.
    const tenureAtFoundingDays = hash01(key, SEED_BIRTH) * 5 * 365.25;
    const ageDays = tenureAtFoundingDays + Math.max(0, (nowMsV - DUTCHMAN_FOUNDING_MS) / DAY_MS);
    const g = growthFor(rec, ageDays);
    return {
      name: 'crewman',
      kind: 'crewman',
      key,
      ship: ship.id || ship.name || 'ship',
      shipName: ship.name || 'Ghost ship',
      berth: index,
      state: 'decomposing',
      generation: 0,
      ageDays: Math.round(ageDays * 10) / 10,
      ageYears: Math.round((ageDays / 365.25) * 100) / 100,
      stageIndex: g.stageIndex,
      stageName: g.stageName,
      stages: g.stages,
      sizeM: g.sizeM,
      adultSizeM: rec.adS,
      growthFraction: 1,
      breeding: false,
      offspring: 0,
      activity: 'resting',
      roleActivity: 'lost with the wreck',
      activityPattern: rec.act,
      diet: rec.die,
      dietCategory: rec.dieCat,
      feeding: { mode: null, detail: 'dead — not feeding' },
      territory: { state: 'none', detail: 'dead — holds no territory' },
      water: waterFor('crewman'),
      social: { behaviour: 'Crew', groupSize: Math.max(0, crew) },
      garment: garmentFor('crewman', { hullFraction: 0 }),
      weapon: weaponFor('crewman', { rangeM: null }),
      decompFraction: 0,
      decompStageName: 'Souls released',
      decompStages: rec.dstg,
      deathEpochMs: null,
      deathLaw: deathLawFor('crewman'),
      lifespanYears: null,
      lifespanBasis: 'live-read',
      crewStart,
      soulLingerSeconds: SOUL_LIFE_S,
    };
  }
  if (index >= crew) return null;

  const tenureAtFoundingDays = hash01(key, SEED_BIRTH) * 5 * 365.25;
  const ageDays = tenureAtFoundingDays + Math.max(0, (nowMsV - DUTCHMAN_FOUNDING_MS) / DAY_MS);
  const g = growthFor(rec, ageDays);
  const activity = activityNow(rec, key, new Date(nowMsV));
  const reloadFraction = null; // the page owns the reload timers; readiness reads off range here
  return {
    name: 'crewman',
    kind: 'crewman',
    key,
    ship: ship.id || ship.name || 'ship',
    shipName: ship.name || 'Ghost ship',
    berth: index,
    state: 'alive',
    generation: 0,
    ageDays: Math.round(ageDays * 10) / 10,
    ageYears: Math.round((ageDays / 365.25) * 100) / 100,
    stageIndex: g.stageIndex,
    stageName: g.stageName,
    stages: g.stages,
    sizeM: g.sizeM,
    adultSizeM: rec.adS,
    growthFraction: Math.round(g.fraction * 1000) / 1000,
    breeding: false,
    offspring: 0,
    activity,
    roleActivity: roleActivityFor('crewman', activity, inCombat),
    activityPattern: rec.act,
    diet: rec.die,
    dietCategory: rec.dieCat,
    feeding: feedingFor('crewman', activity, key, nowMsV),
    territory: territoryFor('crewman', { userInRange: inCombat }),
    water: waterFor('crewman'),
    social: { behaviour: 'Crew', groupSize: Math.max(0, crew) },
    garment: garmentFor('crewman', { hullFraction }),
    weapon: weaponFor('crewman', { rangeM, reloadFraction }),
    decompFraction: 0,
    decompStageName: null,
    deathEpochMs: null,
    deathLaw: deathLawFor('crewman'),
    lifespanYears: null,
    lifespanBasis: 'live-read',
    crewStart,
    soulLingerSeconds: SOUL_LIFE_S,
  };
}

/** Every crewman aboard a ship right now (empty berths skipped). */
export function crewLives(ship, now = Date.now(), player = null) {
  if (!ship) return [];
  const crew = typeof ship.crew === 'number' ? ship.crew : 0;
  const out = [];
  const n = ship.alive ? crew : (typeof ship._crewStart === 'number' ? ship._crewStart : crew);
  for (let i = 0; i < Math.max(0, n); i++) {
    const life = crewmanLife(ship, i, now, player);
    if (life) out.push(life);
  }
  return out;
}

/**
 * The tiny HUD wire for the foe hull line (page.jsx): the crew's
 * watch state, appended to the animal operators' lifeLine. Returns
 * '' when the ship carries no crew. Pure read.
 */
export function crewWatchLine(ship, player = null, now = Date.now()) {
  if (!ship || !ship.alive) return '';
  const first = crewmanLife(ship, 0, now, player);
  if (!first) return '';
  return ` · crew ${first.roleActivity}`;
}

// ---------------------------------------------------------------------------
// Duel-encounter foe life — READ from the duel state machine, never
// re-derived. `duel` is the voyage.js duel object, `duelKind` is
// 'sword' or 'pistol'. The foe has no body in the overlay — the
// DuelOverlay is 2D pips and text — so the robe and weapon here are
// the standing figure's, read at duel time.
// ---------------------------------------------------------------------------

/**
 * The duel foe right now. Sword: phase 'fight' = alive, 'won' =
 * fallen (decomposing, no remains), 'lost' = alive — the PLAYER
 * fell and the foe keeps your pride. Pistol: phase 'wait' = alive,
 * 'won' = outdrawn (decomposing, no remains), 'lost' = alive.
 * Pure read — it never mutates the duel and never touches the
 * reward (finishDuel applies that).
 */
export function duelFoeLife(duel, duelKind = 'sword', now = Date.now()) {
  const nowMsV = now instanceof Date ? now.getTime() : Number(now);
  const kind = 'duel-foe';
  const rec = lifeRecordFor('duellist');
  const key = `duel|${duelKind}`;
  const activity = activityNow(rec, key, new Date(nowMsV));
  if (!duel) {
    return {
      name: 'duel-foe',
      kind,
      duelKind,
      state: 'alive',
      stageName: 'Seasoned',
      activity,
      roleActivity: 'waiting',
      diet: rec.die,
      dietCategory: rec.dieCat,
      feeding: { mode: null, detail: 'not feeding right now' },
      territory: territoryFor(kind, {}),
      water: waterFor(kind),
      social: { behaviour: 'Small band', groupSize: 1 },
      garment: garmentFor(kind, { foeHp: DUEL_FOE_HP }),
      weapon: weaponFor(kind, { duelKind, foeHp: DUEL_FOE_HP, foeState: 'idle' }),
      decompFraction: 0,
      decompStageName: null,
      deathLaw: deathLawFor(kind),
      foeHp: DUEL_FOE_HP,
      phase: null,
      reward: 0,
      nowMs: nowMsV,
    };
  }
  if (duelKind === 'pistol') {
    const phase = duel.phase || 'wait';
    const reaction = typeof duel.reaction === 'number' ? duel.reaction : null;
    const reward = typeof duel.reward === 'number' ? duel.reward : 0;
    const fallen = phase === 'won';
    const stageName = fallen ? 'Outdrawn' : reaction != null && reaction > DUEL_PISTOL_SLOW_S ? 'Untouched' : 'Seasoned';
    return {
      name: 'duel-foe',
      kind,
      duelKind,
      state: fallen ? 'decomposing' : 'alive',
      stageName,
      activity: phase === 'wait' ? 'waiting for the signal' : fallen ? 'falling' : 'holstering his pistol',
      roleActivity: phase === 'wait' ? 'waiting for the signal' : fallen ? 'outdrawn' : 'standing over the loser',
      diet: rec.die,
      dietCategory: rec.dieCat,
      feeding: { mode: null, detail: fallen ? 'dead — not feeding' : 'not feeding right now' },
      territory: territoryFor(kind, { userInRange: phase === 'wait' }),
      water: waterFor(kind),
      social: { behaviour: 'Small band', groupSize: 1 },
      garment: garmentFor(kind, { foeHp: fallen ? 0 : DUEL_FOE_HP }),
      weapon: weaponFor(kind, { duelKind, phase, reaction, result: duel.result || null }),
      decompFraction: fallen ? 1 : 0,
      decompStageName: fallen ? 'Fallen — no remains' : null,
      deathLaw: deathLawFor(kind),
      foeHp: null,
      phase,
      result: duel.result || null,
      reaction,
      reward,
      nowMs: nowMsV,
    };
  }
  // Sword.
  const phase = duel.phase || 'fight';
  const foeHp = typeof duel.foeHp === 'number' ? duel.foeHp : DUEL_FOE_HP;
  const foeState = duel.foeState || 'idle';
  const fallen = phase === 'won';
  const stageName = fallen ? 'Fallen' : foeHp >= 3 ? 'Unmarked' : foeHp === 2 ? 'Bloodied' : 'Reeling';
  const activityLabel = fallen ? 'falling' : foeState === 'telegraph' ? 'raising his blade' : foeState === 'open' ? 'exposed' : 'circling';
  return {
    name: 'duel-foe',
    kind,
    duelKind,
    state: fallen ? 'decomposing' : 'alive',
    stageName,
    activity: activityLabel,
    roleActivity: fallen ? 'fallen' : foeState === 'telegraph' ? 'about to strike' : foeState === 'open' ? 'guard down' : 'fighting',
    diet: rec.die,
    dietCategory: rec.dieCat,
    feeding: { mode: null, detail: fallen ? 'dead — not feeding' : 'not feeding right now' },
    territory: territoryFor(kind, { userInRange: phase === 'fight' }),
    water: waterFor(kind),
    social: { behaviour: 'Small band', groupSize: 1 },
    garment: garmentFor(kind, { foeHp }),
    weapon: weaponFor(kind, { duelKind, foeHp, foeState, phase }),
    decompFraction: fallen ? 1 : 0,
    decompStageName: fallen ? 'Fallen — no remains' : null,
    deathLaw: deathLawFor(kind),
    foeHp,
    foeState,
    phase,
    playerHp: typeof duel.playerHp === 'number' ? duel.playerHp : 3,
    reward: phase === 'won' ? DUEL_SWORD_REWARD : 0,
    nowMs: nowMsV,
  };
}

// ---------------------------------------------------------------------------
// Population rule (Merlin, Nov 14 ~22:57): MORE THAN ONE COPY of
// every humanoid kind, SPREAD OUT. Minimums are this worker's call.
// The merchant is a SINGLETON BY DESIGN (one per island) and is
// listed here only so the exemption is explicit; the duel-encounter
// foe is 1-on-1 by design and is likewise exempt.
// ---------------------------------------------------------------------------

export const POPULATION_MINIMUMS = {
  crewman: {
    minLive: 4,
    unit: 'crewmen per foe ship',
    spread: 'waves of 1–3 ships, spawned around the player at 220–380 m on all bearings',
    howMet: 'engine.js makeAI — crew 4 + floor(difficulty * 2); spawnWave — 1–3 per wave',
  },
  merchant: {
    minLive: 8,
    unit: 'merchants, one per island',
    spread: 'one on each of the 8 islands',
    howMet: 'EXEMPT — singleton by design (voyage.js dressIslands: hasMerchant = true on every island); NOT multiplied',
  },
  duellist: {
    minLive: 2,
    unit: 'standing foes per island',
    spread: '2–3 seeded spots per island, 16–24 across the 8 islands',
    howMet: 'page.jsx dockAt — 2 + |island.seed| % 2 foes per island',
  },
  'duel-foe': {
    minLive: 1,
    unit: 'at a time, while a duel runs',
    spread: 'n/a — 1-on-1 by design',
    howMet: 'EXEMPT — one foe at a time in the DuelOverlay (voyage.js duel state machines); NOT a population, NOT multiplied',
  },
};

/**
 * Check live counts against the population minimums. `counts` is
 * { minCrewPerFoe, merchants, minDuellistsPerIsland, duelFoes }.
 * Returns one entry per kind with { min, actual, meets, note }.
 */
export function checkPopulation(counts = {}) {
  const c = counts || {};
  const crew = typeof c.minCrewPerFoe === 'number' ? c.minCrewPerFoe : 0;
  const merchants = typeof c.merchants === 'number' ? c.merchants : 0;
  const duellists = typeof c.minDuellistsPerIsland === 'number' ? c.minDuellistsPerIsland : 0;
  const duelFoes = typeof c.duelFoes === 'number' ? c.duelFoes : 0;
  return {
    crewman: { min: 4, actual: crew, meets: crew >= 4, note: 'at least 4 crewmen aboard every foe ship' },
    merchant: { min: 8, actual: merchants, meets: merchants === 8, note: 'exactly 1 merchant per island, 8 islands — singleton by design' },
    duellist: { min: 2, actual: duellists, meets: duellists >= 2, note: 'at least 2 standing foes on every island' },
    'duel-foe': { min: 1, actual: duelFoes, meets: duelFoes <= 1, note: 'encounter foe: exactly 0 or 1 at a time, by design' },
  };
}

// ---------------------------------------------------------------------------
// Merchant stalls — a PURE mirror of page.jsx dockAt, so the
// merchant spread can be verified headlessly: one stall per island,
// just inside the shore on the dock bearing (island centre + dock
// bearing x (r - 6)). No three.js, no DOM — the page renders the
// stall position; the merchant itself is the 2D panel.
// ---------------------------------------------------------------------------

export function merchantStalls(islands) {
  const list = Array.isArray(islands) ? islands : [];
  return list
    .filter((isl) => isl && isl.hasMerchant && typeof isl.x === 'number' && typeof isl.z === 'number' && isl.dock)
    .map((isl) => {
      const dx = isl.dock.x - isl.x, dz = isl.dock.z - isl.z;
      const dl = Math.hypot(dx, dz) || 1;
      const ux = dx / dl, uz = dz / dl;
      return {
        islandId: isl.id || 'isle-?',
        islandName: isl.name || null,
        x: isl.x + ux * ((typeof isl.r === 'number' ? isl.r : 60) - 6),
        z: isl.z + uz * ((typeof isl.r === 'number' ? isl.r : 60) - 6),
      };
    });
}

// ---------------------------------------------------------------------------
// Conductor entry points (mirror lib/earth4/operators.js)
// ---------------------------------------------------------------------------

/**
 * Enrich humanoids with life: adds `life` to every entry (mutates
 * and returns the same array). The existing systems are untouched —
 * the operators layer life on top of what they already hold.
 * Each entry is one of:
 *   { kind: 'crewman', ship, index, player? } — read live via crewmanLife.
 *   { kind: 'merchant', island } — read via merchantLife.
 *   { kind: 'duellist', island, index } — read via duellistLife.
 *   { kind: 'duel-foe', duel, duelKind? } — read live via duelFoeLife.
 *   { kind: 'merchant'|'duellist', key } — seeded timeline via lifeFor.
 * An empty crew berth enriches to `life: null` (no such crewman).
 */
export function enrichHumanoids(beings, now = Date.now()) {
  if (!Array.isArray(beings)) return beings;
  const t = now instanceof Date ? now.getTime() : Number(now);
  for (const b of beings) {
    if (!b || typeof b !== 'object') continue;
    if (b.kind === 'crewman' && b.ship) {
      b.life = crewmanLife(b.ship, typeof b.index === 'number' ? b.index : 0, t, b.player || null);
    } else if (b.kind === 'merchant' && b.island) {
      b.life = merchantLife(b.island, t);
    } else if (b.kind === 'duellist' && b.island) {
      b.life = duellistLife(b.island, typeof b.index === 'number' ? b.index : 0, t);
    } else if (b.kind === 'duel-foe' && b.duel) {
      b.life = duelFoeLife(b.duel, b.duelKind || 'sword', t);
    } else if (typeof b.kind === 'string') {
      b.life = lifeFor(b.kind, b.key || b.id || '', t, typeof b.lat === 'number' ? b.lat : 0);
    }
  }
  return beings;
}

/**
 * The tap-card life line, in Earth 4's shape: stage · activity ·
 * role · garment · weapon — or "Remains — <stage>" for the dead.
 * Crewmen carry their berth; duel foes carry their hp / reaction;
 * merchants carry their island.
 */
export function lifeLine(life) {
  if (!life) return '';
  if (life.state === 'decomposing') {
    return `Remains — ${life.decompStageName || life.stageName || 'gone'}`;
  }
  const act = life.roleActivity || life.activity || 'resting';
  let line = `${life.stageName || 'Unknown'} · ${act}`;
  if (life.garment && life.garment.label) line += ` · ${life.garment.label}`;
  if (life.weapon && life.weapon.label) line += ` · ${life.weapon.label}`;
  if (life.kind === 'crewman' && typeof life.berth === 'number') {
    line += ` · berth ${life.berth + 1} of ${life.social ? life.social.groupSize : '?'}`;
  }
  if (life.kind === 'duel-foe' && life.duelKind === 'sword' && typeof life.foeHp === 'number') {
    line += ` · foe ${life.foeHp}/${DUEL_FOE_HP} hp`;
  }
  if (life.kind === 'duel-foe' && life.duelKind === 'pistol' && typeof life.reaction === 'number') {
    line += ` · ${life.reaction.toFixed(2)} s`;
  }
  if (life.kind === 'merchant' && life.islandName) {
    line += ` · ${life.islandName}`;
  }
  return line;
}
