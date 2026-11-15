// lib/earth2/operators.js
// EARTH 2 — OPERATOR AGENTS (Merlin, Nov 14 ~22:56, "Yes — all
// realms"; behaviour logic Nov 14 ~22:59). The agents that
// operate Earth 2's creatures, following the Earth 4 pattern
// (lib/earth4/operators.js): seven agents plus a conductor
// `lifeFor`, a creature's life a pure function of (place,
// species, device clock) — NO stored state, NO server. Earth 4
// itself is NOT touched: its no-hunting / age-only law stands.
//
// WHAT EARTH 2 ALREADY HAS (read, never rewritten):
//   * breeding.js — nests (11 species, 1–3 eggs), egg steal
//     (6 m reach), 24 h egg viability, tap-to-hatch, raise caps
//     (1 per user, 4 for landowners), growth baby → juvenile
//     (1 day) → adult (7 days), backpack home, summon/recall,
//     home copies on the owner's parcel.
//   * behaviour.js — the behaviour machine (graze/dig/drink/
//     sleep/stalk/chase/flee/eat/sated), hunger rising over
//     210 s, thirst over 170 s, pickPreyTarget (walker IS prey
//     when vulnerable; USER FIRST), pickGuardianTarget
//     (Spinosaurus hunts predators, defends users).
//   * lifecycle.js — kill → carcass (lingers 55 s, sinks) →
//     respawn 40 s later at a FAR anchor, same biome family.
//   * parcel-sanctuary.js — owned parcels are dino-free; a
//     hunt ends at the parcel line.
//   * world.js — DINO_PLAN: 15 land species in herds/packs,
//     Spinosaurus on the shore, Spinosaurus Rex at the tar pit,
//     a volcano herd, the compy swarm (12), the Bay's 9 flyers
//     and 8 marines (creatures.js), 6 mosquitos, 18 bats.
//
// DEATH LAW (from code + Merlin's orders — never invented):
//   * a wild dino dies by PREDATION (a predator's caught chase
//     routes through lifecycle.kill), by the GUARDIAN
//     (Spinosaurus kills predators), by the HUNTER (user
//     gunfire, 2–8 shots by size — dinoHitPoints), by a
//     BLOOD-SAC kill (a feeding mosquito shot), or — Merlin
//     Nov 14 ~22:59 — by a TERRITORIAL DUEL (two carnivores in
//     range fight to the death; the guardian is exempt, its law
//     is hunt-predators). AGE NEVER KILLS in Earth 2: no age
//     death exists in code, so none is implemented.
//   * a raised/companion dino NEVER dies: allies are never prey
//     (isAlliedDino) and no death path exists for them.
//   * the walker, caught: killWalker (Earth2World.jsx) — the
//     catcher feeds (hunger 0.08, 'eat' 16–30 s) and the walker
//     wakes at home base. There is NO walker corpse entity: the
//     corpse-fight branch runs as a CONTEST OVER THE KILL SITE
//     (rival carnivores in range fight the eater for the meal).
//
// BEHAVIOUR LOGIC (Merlin, Nov 14 ~22:59) — implemented here
// as pure decisions the scene executes; the state machines in
// behaviour.js / lifecycle.js are untouched:
//   * diet drives feeding: carnivore + hungry → hunt other
//     animals (or the user first, per pickPreyTarget); omnivore
//     → hunt or graze (seeded); herbivore → graze.
//   * carnivores are TERRITORIAL: in range of each other they
//     fight to the death — UNLESS a vulnerable user is in range,
//     when they hunt the user and fight each other FOR that
//     meal; should the user die (be caught), they fight over
//     the kill site.
//   * ALL creatures seek water: marines live in it, land dinos
//     travel to it to drink (thirst ≥ 0.6, the behaviour law).
//   * the agents run every part of each creature — feeding,
//     territory, water, movement, rest, breeding — through the
//     operators, not as one-off scripts.
//
// POPULATION RULE (Merlin, Nov 14 ~22:57): more than one copy
// of every creature, spread out across the map. Minimum 2
// copies per species (this module's call), copies spread ≥
// 300 m apart across ≥ 2 anchors. worldCreatures() as coded
// FAILS it for two species (Spinosaurus ×1, Spinosaurus Rex
// ×1) and leaves every other species on a SINGLE anchor (one
// herd parcel); populationExtras() returns the deterministic
// second-anchor copies that fix it. The Bay's flyers and
// marines are singletons too (one circuit each); bayExtras()
// returns each a second circuit. Swarms (compies 12, mosquitos
// 6, bats 18) meet the minimum but are single-cluster BY
// DESIGN — no second swarm is added (his call).

import {
  EARTH2_MODELS,
  EARTH2_MODEL_BY_SLUG,
} from './models.js';
import {
  NEST_SPECIES,
  nestEggCount,
  growthStage,
  growthT,
  isAlliedDino,
} from './breeding.js';
import {
  behaviourCaps,
  HUNT,
  HUNGER_RISE_S,
  THIRST_RISE_S,
  pickPreyTarget,
} from './behaviour.js';
import {
  DEFAULT_RESPAWN_DELAY_S,
  DEFAULT_CARCASS_LINGER_S,
  carcassSink,
} from './lifecycle.js';
import {
  COMPY_SWARM,
  MOSQUITO_CONFIG,
  BAT_SWARM,
  SWIMMERS,
  FLYERS,
} from './creatures.js';
import {
  hash01,
  localHour,
  DAY_MS,
  lifespanYearsFor,
  isNightAt,
} from '../life-clock.js';

// ── Population law ──────────────────────────────────────────
/** Minimum live copies per species (this module's call). */
export const MIN_COPIES = 2;
/** Copies of one species must span at least this far apart. */
export const SPREAD_MIN_M = 300;
/** Two carnivores inside this range are in territorial range. */
export const TERRITORY_R_M = 50;
/** After a walker is caught, rivals contest the kill site this long. */
export const CORPSE_CONTEST_S = 30;

// ── Registry reads ──────────────────────────────────────────
export function entryFor(slug) {
  return EARTH2_MODEL_BY_SLUG.get(String(slug || '')) || null;
}

export function dietFor(slug) {
  const e = entryFor(slug);
  return e ? e.diet : 'herbivore';
}

export function socialFor(slug) {
  const e = entryFor(slug);
  return e ? e.social : 'solo';
}

/** Lifespan years for a species — CONVENTION (no lifespan data
 *  in code); drives growth stages only, never a death. */
export function lifespanFor(slug) {
  const e = entryFor(slug);
  return { years: lifespanYearsFor(e ? e.scaleM : 5), basis: 'convention' };
}

// ── Birth Agent (breeding.js — read, never rewritten) ───────
/** Nest/breeding state for a species: the 11 nest species nest
 *  near their herds (1–3 eggs, seeded); the rest never nest. */
export function breedingFor(slug) {
  if (NEST_SPECIES.includes(String(slug || ''))) {
    return {
      nests: true,
      eggs: nestEggCount(`${slug}-herd`),
      note: 'Nests near the herd — eggs can be stolen and raised',
    };
  }
  return { nests: false, eggs: 0, note: 'No nests — this species does not nest' };
}

/**
 * Growth state of a RAISED dino (backpack law): baby → juvenile
 * at 1 day, adult at 7 days. Wild dinos are placed as adults —
 * growthForWild() below. `bornAtMs` is the backpack record's.
 */
export function growthForRaised(bornAtMs, nowMs) {
  const stage = growthStage(bornAtMs, nowMs);
  return {
    stage,
    t: growthT(bornAtMs, nowMs),
    stageName: stage === 'baby' ? 'Baby' : stage === 'juvenile' ? 'Juvenile' : 'Adult',
  };
}

/** Wild dinos are placed as adults (world.js DINO_PLAN). */
export function growthForWild() {
  return { stage: 'adult', t: 1, stageName: 'Adult' };
}

// ── Death Agent (lifecycle.js — read, never rewritten) ──────
export const DEATH_CAUSES = Object.freeze([
  'predation', // caught by a predator's chase (lifecycle.kill)
  'guardian', // killed by the Spinosaurus guardian
  'hunter', // shot by the user (2–8 shots by size)
  'blood-sac', // a feeding mosquito, shot
  'territorial-duel', // two carnivores, one range (Merlin Nov 14 ~22:59)
]);

/**
 * Death state for a creature. `opts` carries the lifecycle
 * status the scene already owns: { status: 'alive' | 'dead' |
 * 'pending', cause, killerSlug, diedAt, nowS }. AGE IS NEVER
 * A CAUSE HERE: no age death exists in Earth 2 code. A
 * companion dino (isAlly) has no death at all.
 */
export function deathFor(creature, opts = {}) {
  const isAlly = !!creature && (creature.isAlly === true || isAlliedDino(creature));
  if (isAlly) {
    return {
      state: 'alive',
      cause: 'none',
      note: 'Allied dinos are never prey — no death path exists for them',
    };
  }
  const status = opts.status || 'alive';
  if (status === 'alive') return { state: 'alive', cause: null, note: null };
  const cause = DEATH_CAUSES.includes(opts.cause) ? opts.cause : 'predation';
  const diedAt = Number(opts.diedAt) || 0;
  const nowS = Number(opts.nowS) || 0;
  const lingerS = DEFAULT_CARCASS_LINGER_S;
  const respawnAt = diedAt + DEFAULT_RESPAWN_DELAY_S;
  return {
    state: status === 'pending' ? 'respawning' : 'dead',
    cause,
    killerSlug: opts.killerSlug || null,
    diedAt,
    carcass: {
      lingerS,
      sinkFraction: carcassSink({ diedAt, lingerS }, nowS),
      respawnAt,
      respawnDelayS: DEFAULT_RESPAWN_DELAY_S,
      note: 'Carcass lingers, sinks, then the same species returns at a far anchor',
    },
  };
}

// ── Diet / Feeding Agent (behaviour.js caps + Merlin's logic)
 /**
 * What a creature does for food right now. `state` is the
 * behaviour state the scene owns ({ hunger, thirst, mode });
 * when absent, hunger/thirst are read off the clock phase
 * (deterministic per creature + hour — a stated convention).
 * `ctx` carries { walker, nearby, nowMs }: walker = { x, z,
 * alive, walkerImmune } | null; nearby = scene creature
 * records for pickPreyTarget. Returns the feeding action; the
 * scene executes the stalk/chase/eat through behaviour.js.
 */
export function feedingDecision(entry, state, ctx = {}) {
  const caps = behaviourCaps(entry);
  const nowMs = ctx.nowMs == null ? Date.now() : Number(ctx.nowMs);
  const key = `${entry ? entry.slug : 'unknown'}`;
  const hunger = state && Number.isFinite(state.hunger)
    ? state.hunger
    : ((nowMs / (HUNGER_RISE_S * 1000) + hash01(key, 20261023)) % 1);
  const thirst = state && Number.isFinite(state.thirst)
    ? state.thirst
    : ((nowMs / (THIRST_RISE_S * 1000) + hash01(key, 20261031)) % 1);
  // Thirst outranks appetite (behaviour.js chooseBehaviour).
  if (caps.drinker && thirst >= 0.6) {
    return { action: 'drink', hunger, thirst, note: 'Thirst outranks hunger — walks to water' };
  }
  if (caps.predator && hunger >= HUNT.hungerThreshold) {
    const target = ctx.nearby
      ? pickPreyTarget(
        { x: ctx.x || 0, z: ctx.z || 0, id: ctx.id || key },
        ctx.nearby,
      )
      : null;
    return {
      action: target && target.isWalker ? 'hunt-user' : 'hunt-prey',
      hunger,
      thirst,
      target: target ? (target.isWalker ? 'walker' : target.slug || target.id) : null,
      note: 'Hungry carnivore hunts — the user first when vulnerable',
    };
  }
  if (entry && entry.diet === 'omnivore' && hunger >= HUNT.hungerThreshold) {
    // Omnivore: hunt or graze, seeded by the clock hour.
    const hunt = hash01(`${key}|${Math.floor(nowMs / 3600000)}`, 20261103) < 0.5;
    return {
      action: hunt ? 'hunt-prey' : 'graze',
      hunger,
      thirst,
      note: 'Hungry omnivore hunts or grazes — seeded by the hour',
    };
  }
  if (caps.grazer) return { action: 'graze', hunger, thirst, note: 'Herbivore grazes' };
  if (caps.digger) return { action: 'dig', hunger, thirst, note: 'Forages' };
  return { action: 'idle', hunger, thirst, note: 'No feeding drive right now' };
}

// ── Territory Agent (Merlin, Nov 14 ~22:59) ─────────────────
/**
 * Territorial decision for a carnivore. `rivals` are other
 * live carnivores [{ id, slug, x, z, scaleM }]; `walker` is
 * { x, z, alive, walkerImmune } | null; `opts` carries
 * { userCaughtAtMs, catchSite: { x, z }, catcherId, nowMs }.
 * The guardian (Spinosaurus) is EXEMPT: its coded law is
 * hunt-predators / defend-users (pickGuardianTarget), not
 * duelling. Returns the territorial mode; the scene routes a
 * duel's loser through lifecycle.kill.
 */
export function territoryDecision(predator, rivals = [], walker = null, opts = {}) {
  const nowMs = opts.nowMs == null ? Date.now() : Number(opts.nowMs);
  const entry = predator && predator.slug ? entryFor(predator.slug) : null;
  if (entry && entry.guardian === true) {
    return { mode: 'guardian-duty', note: 'The guardian hunts predators — it never duels' };
  }
  if (entry && entry.diet !== 'carnivore') {
    return { mode: 'peace', note: 'Not a carnivore — no territory fights' };
  }
  const px = predator ? Number(predator.x) || 0 : 0;
  const pz = predator ? Number(predator.z) || 0 : 0;
  const inRange = (Array.isArray(rivals) ? rivals : []).filter((r) => {
    if (!r || r.id === (predator && predator.id)) return false;
    if (r.slug && entryFor(r.slug) && entryFor(r.slug).guardian === true) return false;
    return Math.hypot((Number(r.x) || 0) - px, (Number(r.z) || 0) - pz) <= TERRITORY_R_M;
  });
  // The user was just caught: rivals fight over the kill site.
  if (opts.userCaughtAtMs != null && opts.catchSite) {
    const ageS = (nowMs - Number(opts.userCaughtAtMs)) / 1000;
    if (ageS >= 0 && ageS <= CORPSE_CONTEST_S) {
      const dSite = Math.hypot(px - opts.catchSite.x, pz - opts.catchSite.z);
      if (dSite <= TERRITORY_R_M) {
        const isCatcher = predator && predator.id === opts.catcherId;
        return {
          mode: isCatcher ? 'eat' : 'contest-corpse',
          rival: inRange[0] || null,
          note: isCatcher
            ? 'The catcher feeds at the kill site'
            : 'The user is gone — rivals fight over the kill site',
        };
      }
    }
  }
  // A vulnerable user in range: hunt the user, fight rivals for the meal.
  if (walker && walker.alive !== false && walker.walkerImmune === false) {
    const dUser = Math.hypot((Number(walker.x) || 0) - px, (Number(walker.z) || 0) - pz);
    if (dUser <= HUNT.stalkRangeM) {
      return {
        mode: inRange.length ? 'contest-meal' : 'hunt-user',
        rival: inRange[0] || null,
        note: inRange.length
          ? 'Carnivores hunt the user — and fight each other for the meal'
          : 'Hunts the user (USER FIRST — the walker outranks dino prey)',
      };
    }
  }
  if (inRange.length) {
    const rival = inRange[0];
    const outcome = duelOutcome(predator, rival);
    return {
      mode: 'duel',
      rival,
      winnerId: outcome.winnerId,
      loserId: outcome.loserId,
      note: 'Two carnivores in range fight to the death — the loser dies',
    };
  }
  return { mode: 'peace', note: 'No rival in territorial range' };
}

/** Seeded duel winner: bigger wins; ties break on the pair hash. */
export function duelOutcome(a, b) {
  const sa = Number((a && a.scaleM) || (a && a.slug && entryFor(a.slug) && entryFor(a.slug).scaleM) || 1);
  const sb = Number((b && b.scaleM) || (b && b.slug && entryFor(b.slug) && entryFor(b.slug).scaleM) || 1);
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

// ── Water Agent ──────────────────────────────────────────────
/**
 * Water state for a creature. `water` is an optional adapter
 * the scene builds from world.js ({ isWaterAt(x, z),
 * nearestShore(x, z) → { x, z, dist } | null }); without it
 * the operator reports intent only, never a position.
 * Marines live in the water; the Megalodon hunts swimmers
 * there. Land dinos drink when thirst ≥ 0.6 (behaviour law).
 * Flyers, mosquitos and bats carry no drink law in code.
 */
export function waterDecision(entry, state, ctx = {}) {
  const caps = behaviourCaps(entry);
  const kind = entry ? entry.kind : null;
  if (kind === 'marine') {
    return {
      action: 'lives-in-water',
      note: 'A marine — it lives in the water; the Meg hunts swimmers there',
    };
  }
  if (!caps.drinker) {
    return { action: 'none', note: 'No drink law in code for this kind' };
  }
  const thirst = state && Number.isFinite(state.thirst) ? state.thirst : 0;
  if (thirst < 0.6) return { action: 'none', thirst, note: 'Not thirsty yet' };
  const shore = ctx.water && typeof ctx.water.nearestShore === 'function'
    ? ctx.water.nearestShore(ctx.x || 0, ctx.z || 0)
    : null;
  return {
    action: 'drink-go',
    thirst,
    shore,
    note: shore ? 'Walks to the shoreline to drink' : 'Thirsty — walks to water (no shore reader passed)',
  };
}

// ── Habits Agent ─────────────────────────────────────────────
/**
 * What the creature is doing right now. `mode` is the behaviour
 * mode the scene owns when present; otherwise the clock decides:
 * night → sleep (the 80% night-sleep law in chooseBehaviour,
 * seeded per creature + day), day → graze / wander / alert.
 * Only a moving creature walks its circuit (Earth 4 convention).
 */
export function activityNow(entry, mode, nowMs) {
  const t = nowMs == null ? Date.now() : Number(nowMs);
  const known = [
    'idle', 'graze', 'dig', 'alert', 'wander', 'drink-go', 'drink',
    'sleep', 'stalk', 'chase', 'flee', 'eat', 'sated', 'winded',
  ];
  if (mode && known.includes(mode)) {
    return { activity: mode, moving: mode === 'wander' || mode === 'stalk' || mode === 'chase' || mode === 'flee' || mode === 'drink-go' };
  }
  const key = `${entry ? entry.slug : 'unknown'}`;
  if (isNightAt(new Date(t))) {
    const day = Math.floor(t / DAY_MS);
    const sleep = hash01(`${key}|${day}`, 20261023) < 0.8;
    return { activity: sleep ? 'sleep' : 'alert', moving: false };
  }
  const caps = behaviourCaps(entry);
  if (caps.grazer) return { activity: 'graze', moving: false };
  if (caps.predator) return { activity: 'wander', moving: true };
  return { activity: 'wander', moving: true };
}

// ── Group (social) Agent ─────────────────────────────────────
/** Group size for a species: the registry social life, seeded
 *  per place — herds/packs 3–6 (the DINO_PLAN copy range),
 *  flocks 4–8, solo 1. Display + life line. */
export function groupFor(slug, placeKey) {
  const social = socialFor(slug);
  const key = `${placeKey || ''}|${slug}`;
  if (social === 'herd' || social === 'pack') {
    return { social, groupSize: 3 + Math.floor(hash01(key, 20261114) * 4) };
  }
  if (social === 'flock') {
    return { social, groupSize: 4 + Math.floor(hash01(key, 20261114) * 5) };
  }
  return { social, groupSize: 1 };
}

// ── Conductor ────────────────────────────────────────────────
/**
 * The full life state of one Earth 2 creature at the device
 * clock. `creature` is a worldCreatures() record (or a Bay /
 * companion record) — { slug, copy, id, x, z, kind?, bornAt?,
 * isAlly? }. `opts` carries the live state the scene owns:
 * { status, cause, killerSlug, diedAt, nowS, behaviourMode,
 * hunger, thirst, walker, rivals, nearby, water, catchSite,
 * userCaughtAtMs, catcherId }. Pure: same inputs, same life.
 */
export function lifeFor(creature, now = Date.now(), opts = {}) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const slug = creature ? String(creature.slug || creature.type || 'unknown') : 'unknown';
  const entry = entryFor(slug);
  const name = entry ? entry.name : slug;
  const placeKey = creature
    ? `${creature.parcelIndex != null ? `p${creature.parcelIndex}` : `${Math.round(Number(creature.x) || 0)},${Math.round(Number(creature.z) || 0)}`}|${creature.copy != null ? creature.copy : 0}`
    : slug;
  const isAlly = !!creature && (creature.isAlly === true || isAlliedDino(creature));
  const isRaised = isAlly || (creature && creature.bornAt != null);
  const death = deathFor(creature, opts);
  const growth = isRaised && creature.bornAt != null
    ? growthForRaised(Number(creature.bornAt), t)
    : growthForWild();
  const breeding = breedingFor(slug);
  const feed = feedingDecision(entry, { hunger: opts.hunger, thirst: opts.thirst }, {
    ...opts,
    x: creature ? Number(creature.x) || 0 : 0,
    z: creature ? Number(creature.z) || 0 : 0,
    id: creature ? creature.id || `${slug}#${creature.copy || 0}` : slug,
    nowMs: t,
  });
  const territory = entry && entry.diet === 'carnivore'
    ? territoryDecision(
      { ...(creature || {}), id: creature ? creature.id || `${slug}#${creature.copy || 0}` : slug, slug },
      opts.rivals || [],
      opts.walker || null,
      { ...opts, nowMs: t },
    )
    : { mode: 'peace', note: 'Not a carnivore — no territory fights' };
  const water = waterDecision(entry, { thirst: opts.thirst }, {
    x: creature ? Number(creature.x) || 0 : 0,
    z: creature ? Number(creature.z) || 0 : 0,
    water: opts.water || null,
  });
  const act = activityNow(entry, opts.behaviourMode, t);
  const group = groupFor(slug, placeKey);
  const life = {
    realm: 'earth2',
    name,
    slug,
    kind: entry ? entry.kind : 'dinosaur',
    diet: entry ? entry.diet : 'herbivore',
    social: group.social,
    groupSize: group.groupSize,
    state: death.state,
    deathCause: death.cause,
    carcass: death.carcass || null,
    stage: growth.stage,
    stageName: growth.stageName,
    growthT: Math.round((growth.t || 0) * 1000) / 1000,
    activity: act.activity,
    moving: act.moving,
    feeding: feed.action,
    feedingNote: feed.note,
    territory: territory.mode,
    territoryNote: territory.note,
    duel: territory.mode === 'duel' || territory.mode === 'contest-meal' || territory.mode === 'contest-corpse'
      ? { rival: territory.rival || null, winnerId: territory.winnerId || null, loserId: territory.loserId || null }
      : null,
    water: water.action,
    waterNote: water.note,
    shore: water.shore || null,
    breeding: breeding.nests,
    nestEggs: breeding.eggs,
    breedingNote: breeding.note,
    isAlly,
    lifespanYears: lifespanFor(slug).years,
    lifespanBasis: 'convention',
    hour: Math.round(localHour(new Date(t)) * 10) / 10,
    night: isNightAt(new Date(t)),
  };
  life.line = lifeLine(life);
  return life;
}

/**
 * The tap-card life line, Earth 4 style: "stage · activity ·
 * breeding · group size", or "Remains — <stage>" for the dead.
 */
export function lifeLine(life) {
  if (!life) return '';
  if (life.state === 'dead' || life.state === 'respawning') {
    const cause = life.deathCause ? ` — killed by ${life.deathCause}` : '';
    return `Remains — ${life.stageName || 'Adult'}${cause}`;
  }
  const parts = [life.stageName || 'Adult', life.activity || 'idle'];
  if (life.isAlly) parts.push('Ally — follows you');
  else if (life.breeding) parts.push(`Nests nearby (${life.nestEggs} eggs)`);
  if (life.feeding === 'hunt-user' || life.feeding === 'hunt-prey') parts.push('Hunting');
  else if (life.feeding === 'graze') parts.push('Grazing');
  if (life.water === 'drink-go') parts.push('Going to drink');
  if (life.territory === 'duel' || life.territory === 'contest-meal' || life.territory === 'contest-corpse') {
    parts.push(life.territory === 'duel' ? 'Territorial duel' : 'Fighting over the meal');
  }
  if (life.groupSize > 1) parts.push(`Group of ${life.groupSize}`);
  return parts.join(' · ');
}

/**
 * The label text for one creature: its name plus its life line
 * ("name + life line") — the two-line floating tag the scenes
 * wear under the name. Pure: the scene refreshes it ~once a
 * second from lifeFor and writes only the line; the DOM never
 * recomputes a life. Returns { name, line, text, life }.
 */
export function labelTextFor(creature, now = Date.now(), opts = {}) {
  const life = lifeFor(creature, now, opts);
  return { name: life.name, line: life.line, text: `${life.name}\n${life.line}`, life };
}

/**
 * The Bay placement list for one species: the first circuit
 * from creatures.js plus the operator second circuit from
 * bayExtras() (mirrored centre, opposite direction). The Bay
 * scene stands one animal per entry — same model, same profile
 * shape. A species with no base profile yields no entries (the
 * Bay's fallback lives in the scene, not here).
 */
export function bayCircuitsFor(kind, slug) {
  const first = kind === 'flyer'
    ? FLYERS[slug]
    : kind === 'marine' ? SWIMMERS[slug] : null;
  if (!first) return [];
  const out = [{ copy: 0, circuit: first }];
  const extra = bayExtras().find((e) => e.slug === slug && e.kind === kind);
  if (extra) out.push({ copy: 1, circuit: extra.circuit });
  return out;
}

/**
 * Enrich scene output with life: adds `life` to every creature
 * (mutates and returns the same array). The spawner / world
 * list is untouched — the operators layer time on top of it.
 * `opts` carries the shared live context (walker, rivals,
 * water adapter, lifecycle statuses by id).
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

/** A raised (backpack) dino's life — shared by Middle-earth
 *  and Hollow Earth, where companions ride the same backpack.
 *  The backpack record is the truth; growth + ally law only. */
export function companionLifeFor(dinoItem, now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const meta = (dinoItem && dinoItem.meta) || {};
  const slug = String(meta.species || 'unknown');
  const entry = entryFor(slug);
  const growth = growthForRaised(Number(meta.bornAt) || t, t);
  const life = {
    realm: 'companion',
    name: entry ? entry.name : slug,
    slug,
    kind: 'dinosaur',
    diet: entry ? entry.diet : 'herbivore',
    social: socialFor(slug),
    groupSize: 1,
    state: 'alive',
    deathCause: 'none',
    carcass: null,
    stage: growth.stage,
    stageName: growth.stageName,
    growthT: Math.round((growth.t || 0) * 1000) / 1000,
    activity: meta.state === 'out' ? 'follow' : 'rest',
    moving: meta.state === 'out',
    feeding: entry && entry.diet === 'carnivore' ? 'hunt-prey' : 'graze',
    feedingNote: 'Allied — attacks what its owner attacks, never its owner',
    territory: 'peace',
    territoryNote: 'Allied — never duels, never hunts its owner',
    duel: null,
    water: 'none',
    waterNote: 'Follows its owner — drinks where the owner goes',
    shore: null,
    breeding: false,
    nestEggs: 0,
    breedingNote: 'Raised by hand — it does not nest',
    isAlly: true,
    lifespanYears: lifespanFor(slug).years,
    lifespanBasis: 'convention',
    hour: Math.round(localHour(new Date(t)) * 10) / 10,
    night: isNightAt(new Date(t)),
  };
  life.line = lifeLine(life);
  return life;
}

// ── Population Agent (Merlin, Nov 14 ~22:57) ────────────────
/**
 * Population report for a creature list (worldCreatures()).
 * Per species: live copies, distinct anchors (parcelIndex),
 * whether the minimum and the spread hold. Pachycephalosaurus
 * never appears (no model) — reported as model-gated, not as
 * a population failure.
 */
export function populationReport(creatures) {
  const bySlug = new Map();
  for (const c of Array.isArray(creatures) ? creatures : []) {
    if (!c || typeof c.slug !== 'string') continue;
    if (!bySlug.has(c.slug)) bySlug.set(c.slug, []);
    bySlug.get(c.slug).push(c);
  }
  const perSpecies = {};
  for (const [slug, list] of bySlug) {
    const anchors = new Set(list.map((c) => c.parcelIndex != null ? c.parcelIndex : `${Math.round(c.x / 100)},${Math.round(c.z / 100)}`));
    let maxSpread = 0;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        maxSpread = Math.max(maxSpread, Math.hypot((list[i].x || 0) - (list[j].x || 0), (list[i].z || 0) - (list[j].z || 0)));
      }
    }
    perSpecies[slug] = {
      count: list.length,
      anchors: anchors.size,
      maxSpreadM: Math.round(maxSpread),
      meetsMin: list.length >= MIN_COPIES,
      spreadOk: anchors.size >= 2 || maxSpread >= SPREAD_MIN_M,
    };
  }
  const placed = EARTH2_MODELS.filter((m) => m.kind === 'dinosaur' && m.status === 'placed' && m.file);
  const missing = placed.filter((m) => !perSpecies[m.slug]).map((m) => m.slug);
  return {
    minCopies: MIN_COPIES,
    spreadMinM: SPREAD_MIN_M,
    species: perSpecies,
    missing,
    modelGated: ['pachycephalosaurus'],
    meetsRule: Object.values(perSpecies).every((s) => s.meetsMin && s.spreadOk) && missing.length === 0,
  };
}

function mirrorAnchor(x, z, seedKey) {
  // Mirror across the map centre, seeded jitter, then push out
  // until ≥ SPREAD_MIN_M from the centre line — a mirrored
  // anchor near the centre would sit on top of the original.
  let mx = -Number(x) || 0;
  let mz = -Number(z) || 0;
  mx += (hash01(`${seedKey}|jx`, 20261114) - 0.5) * 30;
  mz += (hash01(`${seedKey}|jz`, 20261114) - 0.5) * 30;
  return { x: mx, z: mz };
}

function farEnough(x, z, others) {
  return others.every((o) => Math.hypot((Number(o.x) || 0) - x, (Number(o.z) || 0) - z) >= SPREAD_MIN_M);
}

/**
 * The deterministic second-anchor copies that bring a creature
 * list up to the population rule: every species to ≥ MIN_COPIES,
 * spread over ≥ 2 anchors ≥ SPREAD_MIN_M apart. Each extra is a
 * full spawn record ({ slug, copy, x, z, heading, parcelIndex:
 * -1, walk, operatorExtra: true }) the scene can stand up
 * exactly like a worldCreatures() record. Pure: same list in,
 * same extras out. The scene wiring that renders them is owed
 * (see the report) — this module is the enforcement.
 */
export function populationExtras(creatures) {
  const list = Array.isArray(creatures) ? creatures : [];
  const bySlug = new Map();
  for (const c of list) {
    if (!c || typeof c.slug !== 'string') continue;
    if (!bySlug.has(c.slug)) bySlug.set(c.slug, []);
    bySlug.get(c.slug).push(c);
  }
  const extras = [];
  for (const [slug, members] of bySlug) {
    const entry = entryFor(slug);
    if (!entry || entry.kind !== 'dinosaur') continue;
    const anchors = new Set(members.map((c) => c.parcelIndex != null ? c.parcelIndex : `${Math.round(c.x / 100)},${Math.round(c.z / 100)}`));
    const first = members[0];
    const need = Math.max(MIN_COPIES - members.length, anchors.size < 2 ? 1 : 0);
    for (let i = 0; i < need; i++) {
      const seedKey = `${slug}|extra-${i}`;
      let { x, z } = mirrorAnchor(first.x, first.z, seedKey);
      // Push radially out from the centre until far enough from
      // every existing copy of this species (bounded, seeded).
      let guard = 0;
      while (!farEnough(x, z, members.concat(extras.filter((e) => e.slug === slug))) && guard++ < 8) {
        const d = Math.hypot(x, z) || 1;
        x = (x / d) * (d + 150);
        z = (z / d) * (d + 150);
      }
      const firstWalk = first.walk || null;
      extras.push({
        slug,
        copy: members.length + i,
        x: Math.round(x * 10) / 10,
        z: Math.round(z * 10) / 10,
        heading: hash01(seedKey, 20261115) * Math.PI * 2,
        parcelIndex: -1,
        walk: firstWalk
          ? { cx: Math.round(x * 10) / 10, cz: Math.round(z * 10) / 10, r: firstWalk.r, speed: firstWalk.speed, a0: hash01(seedKey, 20261116) * Math.PI * 2 }
          : null,
        operatorExtra: true,
        anchor: 'second',
      });
    }
  }
  return extras;
}

/**
 * The Bay's second circuits: every flyer (9 species) and marine
 * (8 species) flies/swims exactly ONE circuit in creatures.js —
 * all singletons. Each gets a second circuit, mirrored centre,
 * opposite direction, same profile. Pure records; the Bay scene
 * renders them beside the first circuits.
 */
export function bayExtras() {
  const out = [];
  for (const [slug, p] of Object.entries(FLYERS)) {
    out.push({
      slug,
      kind: 'flyer',
      copy: 1,
      circuit: { cx: -p.cx, cz: -p.cz, r: p.r, h: p.h, speed: p.speed, dir: -p.dir },
      operatorExtra: true,
      anchor: 'second',
    });
  }
  for (const [slug, p] of Object.entries(SWIMMERS)) {
    out.push({
      slug,
      kind: 'marine',
      copy: 1,
      // No cx/cz: SWIMMERS profiles carry no centre (the swim driver
      // rides LAKE.center and reads only rx/rz) — mirroring a centre
      // that does not exist produced NaN in every marine circuit.
      // Same ellipse, opposite direction.
      circuit: { rx: p.rx, rz: p.rz, speed: p.speed, dir: -p.dir },
      operatorExtra: true,
      anchor: 'second',
    });
  }
  return out;
}

/** Swarm census: compies (12), mosquitos (6), bats (18) — each
 *  meets the copy minimum but is single-cluster BY DESIGN (a
 *  swarm is one meadow / one castle). No second swarm is added. */
export function swarmReport() {
  return {
    'compsognathus-swarm': { count: COMPY_SWARM.count, clusters: 1, note: 'One meadow swarm by design' },
    'giant-mosquito': { count: MOSQUITO_CONFIG.count, clusters: 1, note: 'One Bay circuit set by design' },
    'vampire-bat': { count: BAT_SWARM.count, clusters: 1, note: 'One castle swarm by design' },
    meetsMin: true,
    singleClusterByDesign: true,
  };
}
