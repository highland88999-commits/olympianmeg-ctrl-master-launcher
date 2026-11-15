// app/star-wars/operators.js
// STAR WARS — OPERATOR AGENTS (Merlin, Nov 15 ~01:22, "agents for
// all characters and animals found in there please"). The agents
// that operate every character and animal in the Star Wars code,
// following the all-realms seven-agent pattern (lib/earth2/
// operators.js, app/middle-earth/operators.js): birth, growth,
// death, decomposition, diet, habits + conductor `lifeFor` — a
// creature's whole life a pure function of (place, kind, device
// clock), no stored state, no server.
//
// ENUMERATION — read from code, nothing invented (data.js,
// characters.js, landmarks.js AMBIENT, zone.js SCATTER_KINDS):
//   * 19 worlds in PLANETS (tatooine, naboo, coruscant, kamino,
//     geonosis, mustafar, yavin-4, alderaan, death-star, hoth,
//     dagobah, bespin, endor, jakku, takodana, starkiller,
//     ahch-to, crait, exegol). The task brief said 16 — the code
//     carries 19; ahch-to, crait and exegol are real worlds too.
//   * 2 named characters, both with a GLB model
//     (characters.js CHARACTER_MODELS): 'knight' Jedi Knight on
//     Tatooine, 'dark-lord' Sith Lord on Mustafar. Both are
//     SINGLETONS BY DESIGN (a named figure, one per galaxy).
//   * 10 ambient kinds (landmarks.js AMBIENT_TYPES), all
//     procedural — no GLB, nothing model-gated: bantha, jawa,
//     bird, wampa, tauntaun, ewok, porg, probe-droid, fish,
//     tuskan. SCATTER_KINDS holds NO animals — rock, mesa,
//     vaporator, trees, crags, spires and the like are terrain
//     dressing only, never creatures.
//   * Nothing is model-gated: every enumerated character has
//     its GLB on disk (knight.glb, dark-lord.glb) and every
//     ambient kind is built procedurally in landmarks.js.
//
// DEATH LAW — read from code, never invented:
//   * There is NO death, damage, hunt or combat code anywhere
//     in app/star-wars. Characters are dressing ("never
//     objectives", characters.js); ambient creatures only
//     wander (landmarks.js update fns); the Tusken mission text
//     ("They shoot straighter than stormtroopers") is flavour
//     copy, not a combat system — no shot, no hit, no kill.
//     So death is null for every kind: operators PERSIST
//     (death: null), never invent a death, a hunt, or a
//     user-death outcome. Nothing decomposes, because nothing
//     dies. A dead branch exists in lifeLine only as a
//     defensive shape — the code can never produce it.
//
// DIET / HABITS — read from the builders where the code shows
// them (wander radius, speed, flight, hover, hop), flagged as
// DEFAULT wherever the code carries no diet at all. A default
// is labelled 'default' in the life record, never passed off
// as coded. Water: no drink law exists in code; fish live in
// the water (Kamino), everything else reports 'none'.
//
// POPULATION RULE (Merlin, Nov 14 ~22:57): more than one copy
// per kind, spread out — except named singletons by design.
// Every ambient kind already meets it in data.js (lowest
// counts: wampa 2 on Hoth; everything else 3–8 per world, plus
// mission extraAmbient). populationExtras() returns the
// deterministic second copy for any kind that ever falls
// below the minimum — today it returns [] everywhere.

import { PLANETS } from './data.js';
import { hash01, localHour, isNightAt, DAY_MS } from '../../lib/life-clock.js';

// ── Population law ──────────────────────────────────────────
/** Minimum live copies per ambient kind per world. */
export const MIN_COPIES = 2;
/** Second copies sit at least this far from the first. */
export const SPREAD_MIN_M = 60;
/** Named figures are singletons by design — never doubled. */
export const SINGLETONS = Object.freeze(['knight', 'dark-lord']);

// ── Death law (read from code — see header) ─────────────────
export const DEATH_LAW = Object.freeze({
  exists: false,
  causes: [],
  note: 'No death, damage, hunt or combat code exists anywhere in app/star-wars — '
    + 'characters are dressing and ambient creatures only wander, so every '
    + 'character and animal persists (death: null). The Tusken mission line '
    + 'about shooting is flavour copy, not a combat system.',
});

// ── Profiles ────────────────────────────────────────────────
// Motion read from landmarks.js ambient builders (wander radius
// + speed + gait). Diet is a flagged DEFAULT unless noted:
// no diet exists in Star Wars code for any kind.
// labelH: metres above the group's origin the floating label sits.
export const AMBIENT_PROFILES = Object.freeze({
  bantha: {
    name: 'Bantha', kind: 'animal', labelH: 3.6,
    dayActivity: 'wandering', moving: true,
    habit: 'Slow drift in a wide circle, grazing as it goes',
    diet: 'herbivore', dietBasis: 'default',
    feeding: 'graze', feedingNote: 'Grazes the dunes (default — no diet in code)',
  },
  jawa: {
    name: 'Jawa', kind: 'folk', labelH: 2.2,
    dayActivity: 'scurrying', moving: true,
    habit: 'Scurries in tight circles, robe bobbing, eyes glowing',
    diet: 'scavenger', dietBasis: 'default',
    feeding: 'scavenge', feedingNote: 'Picks over scrap (default — no diet in code)',
  },
  bird: {
    name: 'Bird', kind: 'animal', labelH: 2.2,
    dayActivity: 'circling', moving: true,
    habit: 'Flaps in wide circles overhead, rising and falling',
    diet: 'seeds and insects', dietBasis: 'default',
    feeding: 'forage', feedingNote: 'Forages on the wing (default — no diet in code)',
  },
  wampa: {
    name: 'Wampa', kind: 'animal', labelH: 4.6,
    dayActivity: 'lumbering', moving: true,
    habit: 'Lumbers slowly across the ice, swaying as it goes',
    diet: 'carnivore', dietBasis: 'default',
    feeding: 'prowl', feedingNote: 'Prowls the ice — no hunt in code, it never attacks',
  },
  tauntaun: {
    name: 'Tauntaun', kind: 'animal', labelH: 3.6,
    dayActivity: 'hopping', moving: true,
    habit: 'Hops along in a wide loop, legs kicking',
    diet: 'herbivore', dietBasis: 'default',
    feeding: 'graze', feedingNote: 'Grazes the snowfields (default — no diet in code)',
  },
  ewok: {
    name: 'Ewok', kind: 'folk', labelH: 2.2,
    dayActivity: 'scurrying', moving: true,
    habit: 'Scurries about the forest floor in quick hops',
    diet: 'omnivore', dietBasis: 'default',
    feeding: 'forage', feedingNote: 'Forages the forest floor (default — no diet in code)',
  },
  porg: {
    name: 'Porg', kind: 'animal', labelH: 2.0,
    dayActivity: 'hopping', moving: true,
    habit: 'Hops about the cliffs, wings fluttering',
    diet: 'fish', dietBasis: 'default',
    feeding: 'forage', feedingNote: 'Forages the cliffs (default — no diet in code)',
  },
  'probe-droid': {
    name: 'Probe Droid', kind: 'droid', labelH: 3.6,
    dayActivity: 'patrolling', moving: true,
    habit: 'Hovers and drifts on patrol, legs dangling, eye glowing',
    diet: 'none', dietBasis: 'none',
    feeding: 'none', feedingNote: 'A machine — no diet, it patrols day and night',
  },
  fish: {
    name: 'Fish', kind: 'animal', labelH: 2.0,
    dayActivity: 'swimming', moving: true,
    habit: 'Swims lazy loops under the platforms, tail swaying',
    diet: 'plankton', dietBasis: 'default',
    feeding: 'forage', feedingNote: 'Feeds in the shallows (default — no diet in code)',
  },
  tuskan: {
    name: 'Tusken Raider', kind: 'folk', labelH: 2.6,
    dayActivity: 'wandering', moving: true,
    habit: 'Wanders the dunes on foot, staff in hand',
    diet: 'omnivore', dietBasis: 'default',
    feeding: 'forage', feedingNote: 'Forages the dunes (default — no diet in code)',
  },
});

// Named-character profiles — habit lines read from the data.js
// comments ("keeps a quiet watch over the Lars homestead" /
// "waits on the fortress approach"). Saber facts from saber.js:
// hilt draws inside 24 m, blade ignites at 12 m.
export const CHARACTER_PROFILES = Object.freeze({
  knight: {
    name: 'Jedi Knight', kind: 'character', planet: 'tatooine',
    model: 'knight', labelH: 2.6,
    activity: 'keeping watch',
    habit: 'Keeps a quiet watch over the Lars homestead, facing Mos Eisley',
    saber: 'blue', saberNote: 'Saber answers within 12 m',
  },
  'dark-lord': {
    name: 'Sith Lord', kind: 'character', planet: 'mustafar',
    model: 'dark-lord', labelH: 2.8,
    activity: 'waiting',
    habit: 'Waits on the fortress approach, taller than any man has a right to be',
    saber: 'red', saberNote: 'Saber answers within 12 m',
  },
});

// ── Enumeration (single source of truth: PLANETS) ───────────
/** Every world, named character and ambient kind in the code. */
export function enumerate() {
  const worlds = Object.values(PLANETS).map((p) => ({
    id: p.id, name: p.name, ep: p.ep, kind: p.kind, biome: p.biome,
  }));
  const characters = [];
  for (const p of Object.values(PLANETS)) {
    for (const c of (Array.isArray(p.characters) ? p.characters : [])) {
      characters.push({
        id: c.id, name: c.name, model: c.model, planet: p.id,
        planetName: p.name, at: Array.isArray(c.at) ? [...c.at] : [0, 0],
        singleton: SINGLETONS.includes(c.id),
        modelGated: false,
      });
    }
  }
  const ambientByType = {};
  for (const p of Object.values(PLANETS)) {
    const defs = (Array.isArray(p.ambient) ? p.ambient : []).concat(
      // Mission extraAmbient counts toward the world's population too.
      ...((Array.isArray(p.missions) ? p.missions : [])
        .map((m) => (Array.isArray(m.extraAmbient) ? m.extraAmbient : []))),
    );
    for (const a of defs) {
      if (!ambientByType[a.type]) ambientByType[a.type] = { type: a.type, planets: [], total: 0 };
      if (!ambientByType[a.type].planets.includes(p.id)) ambientByType[a.type].planets.push(p.id);
      ambientByType[a.type].total += a.count | 0;
    }
  }
  return {
    worlds,
    characters,
    ambient: Object.values(ambientByType),
    // Nothing is model-gated: both named figures have GLBs on
    // disk and every ambient kind is procedural in landmarks.js.
    modelGated: [],
  };
}

// ── Birth / Growth / Death / Decomposition ──────────────────
/** No birth in Star Wars code: creatures are placed, not born. */
export function birthFor() {
  return {
    born: false,
    note: 'No birth, nests or eggs in Star Wars code — creatures are placed, not born',
  };
}

/** Everything is placed as an adult — no growth in code. */
export function growthFor() {
  return {
    stage: 'adult', t: 1, stageName: 'Adult',
    note: 'Placed as adults — no growth stages in code',
  };
}

/**
 * Death state for any kind. The code has no death path, so this
 * always returns alive with a null cause — the operator persists
 * rather than inventing a death.
 */
export function deathFor() {
  return {
    state: 'alive',
    cause: null,
    note: DEATH_LAW.note,
  };
}

/** Nothing ever dies, so nothing decomposes. */
export function decompositionFor() {
  return {
    exists: false,
    note: 'Nothing ever dies in Star Wars code, so nothing decomposes',
  };
}

// ── Diet / Habits ───────────────────────────────────────────
export function dietFor(type) {
  const p = AMBIENT_PROFILES[type];
  if (!p) return { diet: 'unknown', basis: 'unknown', note: 'Unknown ambient type' };
  return { diet: p.diet, basis: p.dietBasis, note: p.feedingNote };
}

export function habitFor(type) {
  const p = AMBIENT_PROFILES[type];
  if (!p) return { activity: 'idle', note: 'Unknown ambient type' };
  return { activity: p.dayActivity, habit: p.habit, moving: p.moving };
}

// ── Activity (device clock) ─────────────────────────────────
/**
 * What a kind is doing right now. Day: the motion its builder
 * in landmarks.js gives it. Night: living kinds rest (a stated
 * convention, seeded per creature + day — no sleep law exists
 * in code); the probe droid patrols on, and the named figures
 * keep their watch / wait. Pure: same inputs, same activity.
 */
export function activityNow(kind, type, nowMs, seedKey) {
  const t = nowMs == null ? Date.now() : Number(nowMs);
  const night = isNightAt(new Date(t));
  if (type === 'probe-droid') return { activity: 'patrolling', moving: true, night };
  if (kind === 'character') {
    const p = CHARACTER_PROFILES[type];
    return { activity: p ? p.activity : 'waiting', moving: false, night };
  }
  const p = AMBIENT_PROFILES[type];
  if (!p) return { activity: 'idle', moving: false, night };
  if (night) {
    // Rest is a convention, not a coded law — seeded per creature
    // and day so the same creature rests the same night.
    const day = Math.floor(t / DAY_MS);
    const rests = hash01(`${seedKey || type}|${day}`, 20261115) < 0.8;
    return { activity: rests ? 'resting' : p.dayActivity, moving: !rests && p.moving, night };
  }
  return { activity: p.dayActivity, moving: p.moving, night };
}

// ── Per-kind life ───────────────────────────────────────────
/** Life of one named character (a PLANETS characters[] def). */
export function characterLifeFor(charDef, now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const id = (charDef && charDef.id) || 'figure';
  const p = CHARACTER_PROFILES[id] || { name: (charDef && charDef.name) || id, kind: 'character', activity: 'waiting', habit: '', saberNote: '' };
  const death = deathFor();
  const growth = growthFor();
  const act = activityNow('character', id, t, id);
  const life = {
    realm: 'star-wars',
    kind: 'character',
    id,
    name: p.name,
    model: (charDef && charDef.model) || p.model || null,
    planet: p.planet || null,
    singleton: SINGLETONS.includes(id),
    state: death.state,
    deathCause: death.cause,
    deathNote: death.note,
    stage: growth.stage,
    stageName: growth.stageName,
    growthT: growth.t,
    activity: act.activity,
    moving: act.moving,
    feeding: 'none',
    feedingNote: 'A named figure — no diet in code',
    diet: 'none',
    dietBasis: 'none',
    habit: p.habit,
    saber: p.saber || null,
    saberNote: p.saberNote || '',
    territory: 'peace',
    territoryNote: 'No territory law in code — named figures stand their ground',
    water: 'none',
    waterNote: 'No drink law in Star Wars code',
    breeding: false,
    breedingNote: 'No breeding in Star Wars code',
    groupSize: 1,
    hour: Math.round(localHour(new Date(t)) * 10) / 10,
    night: act.night,
  };
  life.line = lifeLine(life);
  return life;
}

/**
 * Life of one ambient creature. `creature` is
 * { type, planet, index } — index is the copy number within its
 * world (0-based), which seeds the night-rest draw.
 */
export function ambientLifeFor(creature, now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const type = (creature && creature.type) || 'unknown';
  const p = AMBIENT_PROFILES[type];
  const planetId = (creature && creature.planet) || null;
  const planet = planetId ? PLANETS[planetId] : null;
  const index = (creature && Number.isInteger(creature.index)) ? creature.index : 0;
  const death = deathFor();
  const growth = growthFor();
  const act = activityNow(p ? p.kind : 'animal', type, t, `${planetId || 'any'}|${type}|${index}`);
  const count = countFor(planetId, type);
  const life = {
    realm: 'star-wars',
    kind: p ? p.kind : 'animal',
    type,
    name: p ? p.name : type,
    planet: planetId,
    planetName: planet ? planet.name : null,
    index,
    state: death.state,
    deathCause: death.cause,
    deathNote: death.note,
    stage: growth.stage,
    stageName: growth.stageName,
    growthT: growth.t,
    activity: act.activity,
    moving: act.moving,
    feeding: p ? p.feeding : 'none',
    feedingNote: p ? p.feedingNote : 'Unknown ambient type',
    diet: p ? p.diet : 'unknown',
    dietBasis: p ? p.dietBasis : 'unknown',
    habit: p ? p.habit : '',
    territory: 'peace',
    territoryNote: 'No territory law in code — ambient creatures wander, never fight',
    water: type === 'fish' ? 'lives-in-water' : 'none',
    waterNote: type === 'fish'
      ? 'Lives in the water under the Kamino platforms'
      : 'No drink law in Star Wars code',
    breeding: false,
    breedingNote: 'No breeding in Star Wars code',
    groupSize: count,
    labelH: p ? p.labelH : 2.2,
    hour: Math.round(localHour(new Date(t)) * 10) / 10,
    night: act.night,
  };
  life.line = lifeLine(life);
  return life;
}

/** How many of an ambient type its world carries (defs + mission extras). */
export function countFor(planetId, type) {
  const p = planetId ? PLANETS[planetId] : null;
  if (!p) return 0;
  let n = 0;
  for (const a of (Array.isArray(p.ambient) ? p.ambient : [])) {
    if (a.type === type) n += a.count | 0;
  }
  for (const m of (Array.isArray(p.missions) ? p.missions : [])) {
    for (const a of (Array.isArray(m.extraAmbient) ? m.extraAmbient : [])) {
      if (a.type === type) n += a.count | 0;
    }
  }
  return n;
}

// ── Conductor ───────────────────────────────────────────────
/**
 * The full life state of one Star Wars character or animal at
 * the device clock. `creature` carries
 * { kind: 'character', id } for a named figure, or
 * { kind: 'ambient' | 'animal' | 'folk' | 'droid', type, planet,
 * index } for an ambient creature. Pure: same inputs, same life.
 */
export function lifeFor(creature, now = Date.now(), opts = {}) {
  if (!creature) return null;
  if (creature.kind === 'character' || creature.id) {
    const def = { id: creature.id, name: creature.name, model: creature.model };
    return characterLifeFor(def, now);
  }
  return ambientLifeFor(
    { type: creature.type || creature.kind, planet: creature.planet, index: creature.index },
    now,
  );
}

/** The tap-card / floating-label life line, Earth 4 style. */
export function lifeLine(life) {
  if (!life) return '';
  if (life.state === 'dead') return `Remains — ${life.name || 'Creature'}`;
  if (life.kind === 'character') {
    const parts = [life.stageName || 'Adult', life.activity || 'waiting'];
    if (life.saberNote) parts.push(life.saberNote);
    return parts.join(' · ');
  }
  const parts = [life.stageName || 'Adult', life.activity || 'idle'];
  if (life.feeding === 'graze') parts.push('Grazing');
  else if (life.feeding === 'scavenge') parts.push('Scavenging');
  else if (life.feeding === 'forage') parts.push('Foraging');
  else if (life.feeding === 'prowl') parts.push('Prowling — never attacks');
  else if (life.feeding === 'none' && life.kind === 'droid') parts.push('No diet — a machine');
  if (life.water === 'lives-in-water') parts.push('Lives in the water');
  if (life.groupSize > 1) parts.push(`Group of ${life.groupSize}`);
  return parts.join(' · ');
}

/**
 * The label text for one character or animal: name plus life
 * line — the two-line floating tag the zone wears above it.
 * Pure: the scene refreshes it ~once a second from lifeFor.
 * Returns { name, line, text, life }.
 */
export function labelTextFor(creature, now = Date.now(), opts = {}) {
  const life = lifeFor(creature, now, opts);
  if (!life) return { name: '', line: '', text: '', life: null };
  return { name: life.name, line: life.line, text: `${life.name}\n${life.line}`, life };
}

/**
 * Enrich a creature list with life: adds `life` to every entry
 * (mutates and returns the same array). The zone's records are
 * untouched — the operators layer time on top of them.
 */
export function enrichCreatures(creatures, now = Date.now(), opts = {}) {
  if (!Array.isArray(creatures)) return creatures;
  const t = now instanceof Date ? now.getTime() : Number(now);
  for (const c of creatures) {
    if (!c || typeof c !== 'object') continue;
    c.life = lifeFor(c, t, opts);
  }
  return creatures;
}

// ── Population Agent ────────────────────────────────────────
/**
 * Population report for one world (or all worlds when no id is
 * given): per ambient kind the def count, whether the 2-copy
 * minimum holds, and whether the named figures are the
 * by-design singletons. Alderaan and the Death Star carry no
 * ambient life at all — that is the def, not a failure.
 */
export function populationReport(planetId) {
  const ids = planetId ? [planetId] : Object.keys(PLANETS);
  const perPlanet = {};
  let meetsRule = true;
  for (const id of ids) {
    const p = PLANETS[id];
    if (!p) continue;
    const perType = {};
    const types = new Set();
    for (const a of (Array.isArray(p.ambient) ? p.ambient : [])) types.add(a.type);
    for (const m of (Array.isArray(p.missions) ? p.missions : [])) {
      for (const a of (Array.isArray(m.extraAmbient) ? m.extraAmbient : [])) types.add(a.type);
    }
    for (const type of types) {
      const count = countFor(id, type);
      perType[type] = { count, meetsMin: count >= MIN_COPIES };
      if (count < MIN_COPIES) meetsRule = false;
    }
    const named = (Array.isArray(p.characters) ? p.characters : [])
      .map((c) => ({ id: c.id, name: c.name, singleton: SINGLETONS.includes(c.id) }));
    perPlanet[id] = { planet: id, name: p.name, perType, named, meetsMin: Object.values(perType).every((s) => s.meetsMin) };
    if (!perPlanet[id].meetsMin) meetsRule = false;
  }
  return { minCopies: MIN_COPIES, spreadMinM: SPREAD_MIN_M, perPlanet, meetsRule, singletons: [...SINGLETONS] };
}

/**
 * The deterministic second copy for any ambient kind that falls
 * below the population minimum on a world: mirrored across the
 * world centre, pushed out until ≥ SPREAD_MIN_M from the first
 * copy's seeded home. Today every kind meets the minimum, so
 * this returns [] — it is the enforcement hook, not dead code.
 */
export function populationExtras(planetId) {
  const out = [];
  const ids = planetId ? [planetId] : Object.keys(PLANETS);
  for (const id of ids) {
    const p = PLANETS[id];
    if (!p) continue;
    const types = new Set();
    for (const a of (Array.isArray(p.ambient) ? p.ambient : [])) types.add(a.type);
    for (const m of (Array.isArray(p.missions) ? p.missions : [])) {
      for (const a of (Array.isArray(m.extraAmbient) ? m.extraAmbient : [])) types.add(a.type);
    }
    for (const type of types) {
      const count = countFor(id, type);
      if (count >= MIN_COPIES) continue;
      // One seeded home for the first copy (mirrors zone.js
      // ambient placement: a ring 14–230 m out, seeded by planet).
      const a = hash01(`${id}|${type}|home`, 20261115) * Math.PI * 2;
      const r = 14 + hash01(`${id}|${type}|r`, 20261115) * 100;
      const hx = Math.cos(a) * r;
      const hz = Math.sin(a) * r;
      let x = -hx;
      let z = -hz;
      const d = Math.hypot(x - hx, z - hz);
      if (d < SPREAD_MIN_M) {
        const dir = Math.hypot(x, z) || 1;
        const push = (SPREAD_MIN_M - d) / 2 + 10;
        x += (x / dir) * push;
        z += (z / dir) * push;
      }
      out.push({
        type, planet: id, copy: count,
        x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10,
        operatorExtra: true, anchor: 'second',
        note: 'Second copy — the population rule (more than one copy, spread out)',
      });
    }
  }
  return out;
}
