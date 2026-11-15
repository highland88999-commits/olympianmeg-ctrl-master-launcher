// lib/earth3/operators.js
// EARTH 3 — OPERATOR AGENTS (Merlin, Nov 14 ~22:56, "Yes — all
// realms"; behaviour logic Nov 14 ~22:59). The agents that
// operate Earth 3's 17 wild dino species (Earth 2's real
// registry, minus Pachycephalosaurus — no model), following the
// Earth 4 pattern: a creature's whole life a pure function of
// (tile, species, device clock), NO stored state, NO server.
// Earth 4 itself is NOT touched.
//
// WHAT EARTH 3 ALREADY HAS (read, never rewritten):
//   * spawner.js — seeded tile law (6% of land tiles hold a
//     dino, one per tile, species by tile hash), 150 m spawn /
//     300 m despawn / wild cap 150, dry-ground rule, slow walk
//     circuits. The spawner is pure SPACE — no clock, no death.
//   * The backpack (lib/earth2/breeding.js + hatch.js) — eggs
//     hatch on tap, raise caps 1 / 4, companions ride across
//     realms via lib/dino-companion.js.
//
// DEATH LAW — AGE ONLY (MY CALL, FLAGGED): Earth 3's code has
// NO death law at all — no hunting, no gunplay, no kill, no
// carcass, no respawn in the scene or spawner; despawn at
// 300 m is NOT a death (the dino returns when the walker
// comes back). Per the build order, a realm with no death law
// in code or orders gets age-only as the default. Lifespans
// are the shared size convention (lib/life-clock.js —
// labelled 'convention', never listed data); after death the
// body decomposes 30 days (convention) and the next
// generation is born on the same tile, year-round (no season
// data in code). Nothing else kills in Earth 3.
//
// BEHAVIOUR LOGIC (Merlin, Nov 14 ~22:59) — implemented as
// pure decisions, bounded by what Earth 3's code can carry:
//   * diet drives feeding: carnivore + hungry → STALK / CHASE
//     activity (a hunt with NO kill — there is no kill routing
//     in Earth 3 and the spawner is stateless, so a kill could
//     never persist; every hunt ends in escape); omnivore →
//     hunt or graze (seeded); herbivore → graze.
//   * carnivores are TERRITORIAL: rivals in range resolve as a
//     seeded DOMINANCE display — the loser YIELDS and moves
//     off. It is NOT a death: a duel death would need stored
//     state the operators forbid, and inventing a kill here
//     would contradict the age-only default. (Merlin's call
//     whether duels should kill — that needs kill routing in
//     the scene first.)
//   * ALL creatures seek water: land dinos drink at the nearest
//     water (terrain biomeAt), thirst ≥ 0.6. No marine species
//     live in Earth 3 (only the 17 land dinos).
//   * user-hunt / user-death branches: DO NOT APPLY. Users are
//     NOT prey in Earth 3 — no hunt, no catch, no user death
//     exists in code — so those branches are left out entirely.
//   * the agents run every part of each creature — feeding,
//     territory, water, movement, rest, breeding — through the
//     operators, not as one-off scripts.
//
// POPULATION RULE (Merlin, Nov 14 ~22:57): more than one copy
// of every creature, spread out across the map. Minimum 3 live
// copies per species (this module's call), spread ≥ 500 m.
// VERIFIED, NOT FIXED: the spawner already meets it — a 2 km
// probe at the origin (showcase ground, cap 150) yields all 17
// species, minimum 4 copies, least-spread species spanning
// 1,059 m; a second land probe (-60,000, +40,000, real terrain)
// also yields all 17. Oceans hold no dinos (dry-ground rule),
// so the audit probes land. populationAudit() re-runs that
// check anywhere, any time.

import {
  DINO_SPECIES,
  DINO_SLUGS,
  dinosNear,
  WILD_CAP,
  SPAWN_RADIUS_M,
  terrainGround,
} from './spawner.js';
import {
  hash01,
  localHour,
  DAY_MS,
  YEAR_MS,
  lifespanYearsFor,
  clamp,
  isNightAt,
} from '../life-clock.js';

export const FOUNDING_MS = Date.UTC(2026, 10, 14); // Earth 3's spawn day
export const DECOMP_DAYS = 30; // convention — no decomposition data in code
export const MIN_COPIES = 3; // per-species minimum (this module's call)
export const SPREAD_MIN_M = 500; // copies of one species must span this far
export const TERRITORY_R_M = 50; // two carnivores inside this range meet
export const HUNGER_THRESHOLD = 0.72; // behaviour.js HUNT.hungerThreshold
export const THIRST_THRESHOLD = 0.6; // behaviour.js drink law
// Hunger / thirst cycles (convention — Earth 3 has no behaviour
// state yet; the clock phase stands in until the scene owns one).
export const HUNGER_CYCLE_MS = 45 * 60 * 1000;
export const THIRST_CYCLE_MS = 30 * 60 * 1000;

export function speciesFor(slug) {
  return DINO_SPECIES.find((s) => s.slug === String(slug || '')) || null;
}

export function dietFor(slug) {
  const s = speciesFor(slug);
  return s ? s.diet : 'herbivore';
}

export function lifespanFor(slug) {
  const s = speciesFor(slug);
  return { years: lifespanYearsFor(s ? s.scaleM : 5), basis: 'convention' };
}

// ── Birth Agent ──────────────────────────────────────────────
// Wild birth is the generational turnover on the clock (Earth 4
// pattern): after decomposition the next generation is born on
// the same tile, year-round — no breeding season in code, no
// nests or eggs in Earth 3 (nests live in Earth 2; eggs hatch
// in the backpack, which is shared — see companionLifeFor in
// lib/earth2/operators.js).
export function birthFor() {
  return {
    seasonal: false,
    note: 'Year-round — no breeding season or nest system in Earth 3 code',
  };
}

// ── Growth Agent ─────────────────────────────────────────────
/**
 * Growth state at `ageDays`: juvenile while young, adult after
 * — time-to-adult is 20% of lifespan (convention), size eased
 * from 55% to full adult size (the raised-dino juvenile scale).
 */
export function growthFor(slug, ageDays) {
  const s = speciesFor(slug);
  const adult = s ? s.scaleM : 5;
  const ttA = Math.max(30, lifespanFor(slug).years * 365.25 * 0.2);
  const frac = clamp(ageDays / ttA, 0, 1);
  const sizeM = adult * (0.55 + 0.45 * Math.sqrt(frac));
  return {
    fraction: frac,
    sizeM: Math.round(sizeM * 1000) / 1000,
    stageName: frac >= 1 ? 'Adult' : 'Juvenile',
    timeToAdultDays: Math.round(ttA),
  };
}

// ── Death Agent — AGE ONLY (my call, flagged above) ──────────
export const DEATH_CAUSES = Object.freeze(['age']);

/** Clock-phase hunger / thirst for a dino (convention — see header). */
export function hungerPhase(key, nowMs) {
  return ((Number(nowMs) / HUNGER_CYCLE_MS + hash01(key, 20261114)) % 1);
}

export function thirstPhase(key, nowMs) {
  return ((Number(nowMs) / THIRST_CYCLE_MS + hash01(key, 20261115)) % 1);
}

// ── Diet / Feeding Agent ─────────────────────────────────────
/**
 * What a dino does for food right now. Carnivore + hungry →
 * stalk/chase (a hunt with NO kill — no kill routing exists in
 * Earth 3, so every hunt ends in escape and death stays
 * age-only). Omnivore → hunt or graze, seeded by the hour.
 * Herbivore → graze. `state` may carry real hunger/thirst when
 * the scene owns it; otherwise the clock phase stands in.
 */
export function feedingDecision(dino, state, ctx = {}) {
  const slug = dino ? String(dino.slug || '') : '';
  const key = `${dino && dino.tileId != null ? dino.tileId : slug}|${slug}`;
  const nowMs = ctx.nowMs == null ? Date.now() : Number(ctx.nowMs);
  const hunger = state && Number.isFinite(state.hunger) ? state.hunger : hungerPhase(key, nowMs);
  const thirst = state && Number.isFinite(state.thirst) ? state.thirst : thirstPhase(key, nowMs);
  if (thirst >= THIRST_THRESHOLD) {
    return { action: 'drink', hunger, thirst, note: 'Thirst outranks hunger — walks to water' };
  }
  const diet = dietFor(slug);
  if (diet === 'carnivore' && hunger >= HUNGER_THRESHOLD) {
    return {
      action: 'stalk',
      hunger,
      thirst,
      target: null,
      note: 'Hungry carnivore stalks — hunts end in escape here (no kill routing in Earth 3)',
    };
  }
  if (diet === 'omnivore' && hunger >= HUNGER_THRESHOLD) {
    const hunt = hash01(`${key}|${Math.floor(nowMs / 3600000)}`, 20261103) < 0.5;
    return {
      action: hunt ? 'stalk' : 'graze',
      hunger,
      thirst,
      note: 'Hungry omnivore hunts or grazes — seeded by the hour',
    };
  }
  if (diet === 'herbivore') return { action: 'graze', hunger, thirst, note: 'Herbivore grazes' };
  return { action: 'graze', hunger, thirst, note: 'Forages' };
}

// ── Territory Agent ──────────────────────────────────────────
/**
 * Territorial decision for a carnivore. Rivals in range resolve
 * as a seeded DOMINANCE display — the loser YIELDS and moves
 * off. NOT a death (see the header: no stored state, no kill
 * routing, age-only death). Users never enter this: users are
 * not prey in Earth 3.
 */
export function territoryDecision(dino, rivals = [], opts = {}) {
  const nowMs = opts.nowMs == null ? Date.now() : Number(opts.nowMs);
  const slug = dino ? String(dino.slug || '') : '';
  if (dietFor(slug) !== 'carnivore') {
    return { mode: 'peace', note: 'Not a carnivore — no territory displays' };
  }
  const dx = dino ? Number(dino.x) || 0 : 0;
  const dz = dino ? Number(dino.z) || 0 : 0;
  const inRange = (Array.isArray(rivals) ? rivals : []).filter((r) => {
    if (!r || r.id === (dino && dino.id)) return false;
    return Math.hypot((Number(r.x) || 0) - dx, (Number(r.z) || 0) - dz) <= TERRITORY_R_M;
  });
  if (!inRange.length) return { mode: 'peace', note: 'No rival in territorial range' };
  const rival = inRange[0];
  const sA = Number((dino && dino.scaleM) || (speciesFor(slug) || {}).scaleM || 1);
  const sB = Number((rival && rival.scaleM) || (speciesFor(rival.slug) || {}).scaleM || 1);
  let winnerId;
  if (sA !== sB) winnerId = sA > sB ? (dino.id || slug) : rival.id;
  else {
    const ids = [String(dino.id || slug), String(rival.id || rival.slug)].sort().join('|');
    winnerId = hash01(ids, 20261114) < 0.5 ? (dino.id || slug) : rival.id;
  }
  const yields = winnerId !== (dino.id || slug);
  return {
    mode: 'dominance',
    rival,
    winnerId,
    loserYields: yields,
    note: yields
      ? 'A bigger rival holds the ground — this one yields and moves off (no death in Earth 3)'
      : 'Holds the ground — the rival yields (no death in Earth 3)',
  };
}

// ── Water Agent ──────────────────────────────────────────────
/**
 * Nearest water from (x, z) on `ground` ({ biomeAt }): scans
 * rings of 8 points out to maxR (default 400 m). Pure and
 * bounded. Earth 3 has no marine species — every dino drinks.
 */
export function nearestWater(x, z, ground = terrainGround, maxR = 400) {
  const g = ground || terrainGround;
  if (!g || typeof g.biomeAt !== 'function') return null;
  const step = 28;
  for (let r = step; r <= maxR; r += step) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const wx = x + Math.cos(a) * r;
      const wz = z + Math.sin(a) * r;
      if (g.biomeAt(wx, wz) === 'water') return { x: Math.round(wx * 10) / 10, z: Math.round(wz * 10) / 10, distM: r };
    }
  }
  return null;
}

/** Water decision for a dino: drink when thirsty, else none. */
export function waterDecision(dino, state, ctx = {}) {
  const slug = dino ? String(dino.slug || '') : '';
  const key = `${dino && dino.tileId != null ? dino.tileId : slug}|${slug}`;
  const nowMs = ctx.nowMs == null ? Date.now() : Number(ctx.nowMs);
  const thirst = state && Number.isFinite(state.thirst) ? state.thirst : thirstPhase(key, nowMs);
  if (thirst < THIRST_THRESHOLD) return { action: 'none', thirst, note: 'Not thirsty yet' };
  const shore = nearestWater(Number(dino.x) || 0, Number(dino.z) || 0, ctx.ground || terrainGround);
  return {
    action: 'drink-go',
    thirst,
    shore,
    note: shore ? 'Walks to the nearest water to drink' : 'Thirsty — no water within 400 m',
  };
}

// ── Habits Agent ─────────────────────────────────────────────
/** What the dino is doing right now: night → sleep (seeded
 *  80% per dino + day, the Earth 2 night-sleep law); day → the
 *  feeding action, or walking its circuit. Only a moving dino
 *  walks (Earth 4 convention). */
export function activityNow(dino, feeding, nowMs) {
  const t = nowMs == null ? Date.now() : Number(nowMs);
  const slug = dino ? String(dino.slug || '') : '';
  const key = `${dino && dino.tileId != null ? dino.tileId : slug}|${slug}`;
  if (isNightAt(new Date(t))) {
    const day = Math.floor(t / DAY_MS);
    const sleep = hash01(`${key}|${day}`, 20261023) < 0.8;
    return { activity: sleep ? 'sleep' : 'alert', moving: false };
  }
  const f = feeding ? feeding.action : 'graze';
  if (f === 'stalk' || f === 'chase') return { activity: f, moving: true };
  if (f === 'drink') return { activity: 'drink-go', moving: true };
  if (f === 'graze') return { activity: 'graze', moving: false };
  return { activity: 'wander', moving: true };
}

// ── Conductor: the whole life, from the clock ────────────────
function buildAlive(rec, slug, tileKey, nowMsV, ageDays, generation) {
  const g = growthFor(slug, ageDays);
  const feed = feedingDecision({ slug, tileId: tileKey, x: rec.x, z: rec.z }, rec.state || null, { nowMs: nowMsV, ground: rec.ground });
  const water = waterDecision({ slug, tileId: tileKey, x: rec.x, z: rec.z }, rec.state || null, { nowMs: nowMsV, ground: rec.ground });
  const act = activityNow({ slug, tileId: tileKey }, feed, nowMsV);
  const social = (speciesFor(slug) || {}).social || 'solo';
  return {
    realm: 'earth3',
    name: (speciesFor(slug) || {}).name || slug,
    slug,
    tile: tileKey,
    state: 'alive',
    generation,
    ageDays: Math.round(ageDays * 10) / 10,
    ageYears: Math.round((ageDays / 365.25) * 100) / 100,
    stageName: g.stageName,
    sizeM: g.sizeM,
    adultSizeM: (speciesFor(slug) || {}).scaleM || 5,
    growthFraction: Math.round(g.fraction * 1000) / 1000,
    breeding: true,
    breedingNote: 'Wild turnover — next generation on the same tile',
    activity: act.activity,
    moving: act.moving,
    feeding: feed.action,
    feedingNote: feed.note,
    territory: 'peace',
    territoryNote: 'No rival in territorial range',
    duel: null,
    water: water.action,
    waterNote: water.note,
    shore: water.shore || null,
    diet: dietFor(slug),
    social,
    groupSize: social === 'solo' ? 1 : 2 + Math.floor(hash01(`${tileKey}|${slug}`, 20261114) * 4),
    deathCause: null,
    decompFraction: 0,
    decompStageName: null,
    deathEpochMs: null,
    lifespanYears: lifespanFor(slug).years,
    lifespanBasis: 'convention',
    hour: Math.round(localHour(new Date(nowMsV)) * 10) / 10,
    night: isNightAt(new Date(nowMsV)),
  };
}

function buildDecomposing(slug, tileKey, nowMsV, deathMs, generation) {
  const g = growthFor(slug, lifespanFor(slug).years * 365.25);
  const frac = clamp((nowMsV - deathMs) / (DECOMP_DAYS * DAY_MS), 0, 1);
  return {
    realm: 'earth3',
    name: (speciesFor(slug) || {}).name || slug,
    slug,
    tile: tileKey,
    state: 'decomposing',
    generation,
    ageDays: Math.round(lifespanFor(slug).years * 365.25 * 10) / 10,
    ageYears: lifespanFor(slug).years,
    stageName: g.stageName,
    sizeM: g.sizeM,
    adultSizeM: (speciesFor(slug) || {}).scaleM || 5,
    growthFraction: 1,
    breeding: false,
    breedingNote: 'Decomposing — the next generation follows',
    activity: 'resting',
    moving: false,
    feeding: 'none',
    feedingNote: 'Dead — does not feed',
    territory: 'peace',
    territoryNote: 'Dead — holds no territory',
    duel: null,
    water: 'none',
    waterNote: 'Dead — does not drink',
    shore: null,
    diet: dietFor(slug),
    social: (speciesFor(slug) || {}).social || 'solo',
    groupSize: 1,
    deathCause: 'age',
    decompFraction: Math.round(frac * 1000) / 1000,
    decompStageName: 'Remains',
    deathEpochMs: deathMs,
    lifespanYears: lifespanFor(slug).years,
    lifespanBasis: 'convention',
    hour: Math.round(localHour(new Date(nowMsV)) * 10) / 10,
    night: isNightAt(new Date(nowMsV)),
  };
}

/**
 * The full life state of one Earth 3 dino at the device clock.
 * `dino` is a dinosNear() record ({ slug, tileId, x, z, ... })
 * or { slug, tileId }; `opts` may carry live state
 * ({ state: { hunger, thirst }, ground, rivals }) for the
 * feeding / territory / water decisions. Pure: the same
 * (tile, species, clock) always returns the same life.
 */
export function lifeFor(dino, now = Date.now(), opts = {}) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const slug = typeof dino === 'string' ? dino : String((dino && dino.slug) || 'unknown');
  const tileKey = dino && dino.tileId != null ? dino.tileId : slug;
  const rec = {
    x: dino && Number.isFinite(dino.x) ? dino.x : 0,
    z: dino && Number.isFinite(dino.z) ? dino.z : 0,
    state: (opts && opts.state) || null,
    ground: (opts && opts.ground) || terrainGround,
  };
  const lifespanMs = Math.max(1, lifespanFor(slug).years * YEAR_MS);
  const decompMs = Math.max(1, DECOMP_DAYS * DAY_MS);
  const key = `${tileKey}|${slug}`;
  const ageAtFounding = hash01(key, 20261114) * lifespanMs;
  let epoch = FOUNDING_MS - ageAtFounding;
  let generation = 0;
  let guard = 0;
  while (guard++ < 10000) {
    const death = epoch + lifespanMs;
    if (t < death) {
      const life = buildAlive(rec, slug, tileKey, t, (t - epoch) / DAY_MS, generation);
      // Territory is a live decision, not a clock one: fold it in.
      if (opts.rivals) {
        const terr = territoryDecision(
          { ...(typeof dino === 'object' ? dino : {}), slug, id: `e3-dino:${tileKey}` },
          opts.rivals,
          { nowMs: t },
        );
        life.territory = terr.mode;
        life.territoryNote = terr.note;
        life.duel = terr.mode === 'dominance'
          ? { rival: terr.rival || null, winnerId: terr.winnerId || null, loserYields: terr.loserYields }
          : null;
      }
      life.line = lifeLine(life);
      return life;
    }
    const free = death + decompMs;
    if (t < free) {
      const life = buildDecomposing(slug, tileKey, t, death, generation);
      life.line = lifeLine(life);
      return life;
    }
    epoch = free;
    generation++;
  }
  const life = buildAlive(rec, slug, tileKey, t, Math.max(0, (t - epoch) / DAY_MS), generation);
  life.line = lifeLine(life);
  return life;
}

/**
 * The tap-card life line, Earth 4 style: "stage · activity ·
 * breeding · group size", or "Remains — <stage>".
 */
export function lifeLine(life) {
  if (!life) return '';
  if (life.state === 'decomposing') {
    return `Remains — ${life.stageName || 'Adult'} — died of age`;
  }
  const parts = [life.stageName || 'Adult', life.activity || 'wander'];
  if (life.feeding === 'stalk') parts.push('Hunting (no kill — prey escapes)');
  else if (life.feeding === 'graze') parts.push('Grazing');
  if (life.water === 'drink-go') parts.push('Going to drink');
  if (life.territory === 'dominance') parts.push('Territorial display');
  if (life.groupSize > 1) parts.push(`Group of ${life.groupSize}`);
  return parts.join(' · ');
}

/**
 * Enrich spawner output with life: adds `life` to every dino
 * (mutates and returns the same array). The spawner itself is
 * untouched — the spatial law stays pure; the operators layer
 * time on top of it. `opts` carries shared live context
 * (ground, rivals, per-dino state by id).
 */
export function enrichCreatures(creatures, now = Date.now(), opts = {}) {
  if (!Array.isArray(creatures)) return creatures;
  const t = now instanceof Date ? now.getTime() : Number(now);
  for (const c of creatures) {
    if (!c || typeof c.slug !== 'string') continue;
    const per = opts.byId && c.id ? opts.byId[c.id] : {};
    c.life = lifeFor(c, t, { ...opts, ...per });
  }
  return creatures;
}

// ── Population Agent (Merlin, Nov 14 ~22:57) ────────────────
/**
 * Population audit over probe centres: calls dinosNear at each
 * centre (radius, ground, cap) and unions by dino id. Per
 * species: live copies in the union, max spread between copies
 * (metres), whether the minimum and the spread hold. Oceans
 * hold no dinos (dry-ground rule) — probe land. Pure except
 * for the spawner's own ground reads.
 */
export function populationAudit(probes, radius = SPAWN_RADIUS_M, ground = terrainGround, cap = WILD_CAP) {
  const seen = new Map();
  for (const p of Array.isArray(probes) ? probes : []) {
    if (!p) continue;
    for (const d of dinosNear(Number(p.x) || 0, Number(p.z) || 0, radius, ground, cap)) {
      if (!seen.has(d.id)) seen.set(d.id, d);
    }
  }
  const bySlug = new Map();
  for (const d of seen.values()) {
    if (!bySlug.has(d.slug)) bySlug.set(d.slug, []);
    bySlug.get(d.slug).push(d);
  }
  const perSpecies = {};
  for (const slug of DINO_SLUGS) {
    const list = bySlug.get(slug) || [];
    let maxSpread = 0;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        maxSpread = Math.max(maxSpread, Math.hypot((list[i].x || 0) - (list[j].x || 0), (list[i].z || 0) - (list[j].z || 0)));
      }
    }
    perSpecies[slug] = {
      count: list.length,
      maxSpreadM: Math.round(maxSpread),
      meetsMin: list.length >= MIN_COPIES,
      spreadOk: list.length < 2 ? false : maxSpread >= SPREAD_MIN_M,
    };
  }
  return {
    minCopies: MIN_COPIES,
    spreadMinM: SPREAD_MIN_M,
    probed: seen.size,
    species: perSpecies,
    missing: DINO_SLUGS.filter((s) => (bySlug.get(s) || []).length === 0),
    meetsRule: Object.values(perSpecies).every((s) => s.meetsMin && s.spreadOk),
  };
}

/** Population report for one creature list (same shape as the audit). */
export function populationReport(creatures) {
  const bySlug = new Map();
  for (const c of Array.isArray(creatures) ? creatures : []) {
    if (!c || typeof c.slug !== 'string') continue;
    if (!bySlug.has(c.slug)) bySlug.set(c.slug, []);
    bySlug.get(c.slug).push(c);
  }
  const perSpecies = {};
  for (const slug of DINO_SLUGS) {
    const list = bySlug.get(slug) || [];
    let maxSpread = 0;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        maxSpread = Math.max(maxSpread, Math.hypot((list[i].x || 0) - (list[j].x || 0), (list[i].z || 0) - (list[j].z || 0)));
      }
    }
    perSpecies[slug] = {
      count: list.length,
      maxSpreadM: Math.round(maxSpread),
      meetsMin: list.length >= MIN_COPIES,
      spreadOk: list.length < 2 ? false : maxSpread >= SPREAD_MIN_M,
    };
  }
  return {
    minCopies: MIN_COPIES,
    spreadMinM: SPREAD_MIN_M,
    species: perSpecies,
    missing: DINO_SLUGS.filter((s) => (bySlug.get(s) || []).length === 0),
    meetsRule: Object.values(perSpecies).every((s) => s.meetsMin && s.spreadOk),
  };
}
