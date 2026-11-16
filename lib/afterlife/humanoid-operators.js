// lib/afterlife/humanoid-operators.js
// AFTERLIFE HUMANOID OPERATORS (Merlin, Nov 14 ~23:25: "Do the same
// thing we did for animals for humanoids please, garments, weapons
// handling, all of it."). The humanoid layer over the animal
// operators (lib/afterlife/operators.js — READ, NOT duplicated):
// the same seven agents (birth, growth, death, decomposition, diet,
// habits + conductor), in the same pure-function shape as Earth 4
// (lib/earth4/operators.js), plus a GARMENT agent and a WEAPONS
// agent, for the drift kinds of the 24 afterlife realms. A being's
// whole life stays a pure function of (realm, place, kind, device
// clock). NO stored state, NO server, NO new death law, NO SQL.
//
// WHAT THE HUMANOIDS ARE (enumerated from code, not assumed):
// every realm spawns exactly ONE drifting kind — 18 copies in
// lib/<realm>/world.js (8 + 6 + 4 across the three region discs) —
// rendered in app/<realm>/world3d.js as a SINGLE translucent CONE
// (coneGeometry [0.7, 2.4, 8], one meshStandardMaterial per disc).
// There is NO humanoid mesh: no head, no limbs, no hands, no
// separate garment mesh, no weapon mesh — the cone IS the figure.
// So garments here are DATA-ONLY labels tied to the cone that
// actually renders (name + the cone's real colour/opacity + wear
// by sojourn age), flagged dataOnly wherever they surface; they
// are never presented as a rendered clothing system the scene
// does not have. Weapons are a VERIFIED-ABSENT state: no drift
// figure in any of the 24 world3d.js files carries anything, and
// the three guardians carry nothing either (Cerberus: cylinders /
// spheres / boxes; Apep: spheres / torus; the Faithful Dog: boxes).
// Valhalla's gold shields are the hall's ROOF (y=16.5, along the
// ridge) — set dressing, not carried by any Shade.
//
// EXCLUDED (set dressing only, no meshes, no spawner — confirmed
// in the animal pass and re-verified here): Valhalla's Einherjar
// (a region name + label, "The Einherjar's Rest") and Annwn's
// Hounds (a region name + label, "The Hounds' Hunting Grounds",
// plus houndStones — stones, not hounds). Guardians are NOT
// humanoids and get no garment: Cerberus (Hades), Apep (Duat),
// the Faithful Dog (Mictlan) — eternal singletons, weaponless.
//
// BEHAVIOUR LOGIC (Merlin, Nov 14 ~22:59 — as established in the
// animal pass, re-verified, not re-decided): diet is 'none' — the
// dead do not eat, never hunger, never hunt. The territorial
// fight-to-death branch is implemented and evaluated but never
// fires (at most one carnivore per realm, never sharing a realm;
// Cerberus / Apep are carnivores by mythic role but no prey
// species exists). User-hunt and corpse-fight are OFF in all 25:
// zero user-as-prey mechanics and zero user-death outcomes in
// code — both branches are gated on flags that are false
// everywhere and return applies: false. Nothing here invents any
// of these.
//
// DEATH LAW: sojourn-end only — a soul fades over 7 days (Fading
// -> Wisp -> Gone), then a new soul arrives and the cell never
// stands empty. Decomposition for the dead IS the fade.
//
// POPULATION: min 12 live copies per realm, cap 18 — already met
// by the animal pass's third-disc fix (8 + 6 + 4). This module
// audits it (humanoidPopulationFor) and changes nothing about it.

import {
  SPECIES,
  REALM_KEYS,
  FOUNDING_MS,
  DAY_MS,
  MIN_LIVE_COPIES,
  SOJOURN_STAGES,
  FADE_STAGES,
  speciesFor,
  guardiansFor,
  arrivalsFor,
  growthFor,
  dietFor,
  territoryFor,
  waterFor,
  activityNow,
  socialFor,
  decompFor,
  deathFor,
  lifeFor,
  enrichCreatures,
  areaAt,
  populationFor,
  lifeLineFor,
  growthScale,
  userAsPrey,
  userDeathOutcome,
} from './operators.js';

export {
  SPECIES,
  REALM_KEYS,
  FOUNDING_MS,
  DAY_MS,
  MIN_LIVE_COPIES,
  SOJOURN_STAGES,
  FADE_STAGES,
  speciesFor,
  guardiansFor,
  areaAt,
  populationFor,
  lifeLineFor,
  growthScale,
  userAsPrey,
  userDeathOutcome,
};

// ── The figure, as rendered ──────────────────────────────────────
// FIGURE_MATERIALS[realm] is the drift cone's real material in
// each of the realm's three region discs, in rec.areas order
// (verified: in every app/<realm>/world3d.js the three [0.7, 2.4, 8]
// cone blocks appear in the same order as the areas list — West /
// first disc, East / second, North / third). The test suite
// re-reads all 24 world3d.js files and fails if this table drifts
// from the renderer. The cone is the whole figure: its colour IS
// the garment's colour, its opacity IS the garment's sheerness.
export const FIGURE_MATERIALS = {
  'nether-realm': [{ color: '#e8e8ee', opacity: 0.45 }, { color: '#2a2a33', opacity: 0.7 }, { color: '#2a2a33', opacity: 0.7 }],
  helheim: [{ color: '#dfe9f2', opacity: 0.45 }, { color: '#8fa8bc', opacity: 0.7 }, { color: '#8fa8bc', opacity: 0.7 }],
  yomi: [{ color: '#cfc4ee', opacity: 0.45 }, { color: '#241d33', opacity: 0.7 }, { color: '#241d33', opacity: 0.7 }],
  annwn: [{ color: '#e8eef8', opacity: 0.45 }, { color: '#2a2f33', opacity: 0.7 }, { color: '#2a2f33', opacity: 0.7 }],
  duat: [{ color: '#e8e8ee', opacity: 0.45 }, { color: '#2a2a33', opacity: 0.7 }, { color: '#e8e8ee', opacity: 0.45 }],
  mictlan: [{ color: '#e8e8ee', opacity: 0.45 }, { color: '#e8e8ee', opacity: 0.45 }, { color: '#2a2a33', opacity: 0.7 }],
  xibalba: [{ color: '#e8e8ee', opacity: 0.45 }, { color: '#e8e8ee', opacity: 0.45 }, { color: '#2a2a33', opacity: 0.7 }],
  hell: [{ color: '#e8e8ee', opacity: 0.45 }, { color: '#2a2a33', opacity: 0.7 }, { color: '#2a2a33', opacity: 0.7 }],
  naraka: [{ color: '#e8e8ee', opacity: 0.45 }, { color: '#2a2a33', opacity: 0.7 }, { color: '#2a2a33', opacity: 0.7 }],
  diyu: [{ color: '#e8e8ee', opacity: 0.45 }, { color: '#2a2a33', opacity: 0.7 }, { color: '#2a2a33', opacity: 0.7 }],
  kur: [{ color: '#c8b090', opacity: 0.45 }, { color: '#2a2a33', opacity: 0.7 }, { color: '#2a2a33', opacity: 0.7 }],
  nav: [{ color: '#9fd8b8', opacity: 0.5 }, { color: '#bfe8cc', opacity: 0.5 }, { color: '#9fd8b8', opacity: 0.5 }],
  orun: [{ color: '#fff3d0', opacity: 0.55 }, { color: '#fff3d0', opacity: 0.55 }, { color: '#fff3d0', opacity: 0.55 }],
  // Land of the Dead (Merlin, Nov 16, 2026): orchard pale, mere
  // pale-green (the realm's own wisp hue), gate dark — the far side
  // is where the dead pass on. Order is areas order: Bone Orchard /
  // Grey Mere / Pale Gate.
  'land-of-the-dead': [{ color: '#e8e8ee', opacity: 0.45 }, { color: '#bfe8d8', opacity: 0.5 }, { color: '#2a2a33', opacity: 0.7 }],
  elysium: [{ color: '#ffffff', opacity: 0.45 }, { color: '#ffffff', opacity: 0.5 }, { color: '#ffffff', opacity: 0.5 }],
  valhalla: [{ color: '#ffffff', opacity: 0.45 }, { color: '#ffffff', opacity: 0.5 }, { color: '#ffffff', opacity: 0.5 }],
  aaru: [{ color: '#ffffff', opacity: 0.45 }, { color: '#ffffff', opacity: 0.5 }, { color: '#ffffff', opacity: 0.5 }],
  heaven: [{ color: '#fffbe8', opacity: 0.55 }, { color: '#fffbe8', opacity: 0.7 }, { color: '#fffbe8', opacity: 0.7 }],
  svarga: [{ color: '#fffbe8', opacity: 0.55 }, { color: '#fffbe8', opacity: 0.7 }, { color: '#fffbe8', opacity: 0.7 }],
  takamagahara: [{ color: '#fffbe8', opacity: 0.55 }, { color: '#fffbe8', opacity: 0.7 }, { color: '#fffbe8', opacity: 0.7 }],
  'tir-na-nog': [{ color: '#fffbe8', opacity: 0.55 }, { color: '#fffbe8', opacity: 0.7 }, { color: '#fffbe8', opacity: 0.7 }],
  tlalocan: [{ color: '#ffffff', opacity: 0.6 }, { color: '#ffffff', opacity: 0.6 }, { color: '#ffffff', opacity: 0.6 }],
  'maya-sky': [{ color: '#ffffff', opacity: 0.6 }, { color: '#ffffff', opacity: 0.6 }, { color: '#ffffff', opacity: 0.6 }],
  vyraj: [{ color: '#ffffff', opacity: 0.6 }, { color: '#ffffff', opacity: 0.6 }, { color: '#ffffff', opacity: 0.6 }],
  tiangong: [{ color: '#ffffff', opacity: 0.6 }, { color: '#ffffff', opacity: 0.6 }, { color: '#ffffff', opacity: 0.6 }],
};

// Garment NAMES are my call (labels for the cone, not rendered
// distinctions — the renderer draws one cone per figure, so no
// realm can show a shroud apart from a robe). The name is the
// kind's dress by realm tradition; the colour/opacity are the
// renderer's own.
export const GARMENT_BY_KIND = {
  Shade: 'shroud',
  Wisp: 'mist shroud',
  Spirit: 'white cloth',
  Blessed: 'white robe',
  Apsara: 'silk drape',
  Kami: 'ceremonial robe',
  Fae: 'pale mantle',
  Drifter: 'drifting robe',
};

export const GARMENT_RENDERED_AS = 'single translucent cone — the figure’s whole silhouette is its garment; no separate garment mesh exists in world3d.js';

/** The drift cone's material for a realm's disc (0, 1, 2 = areas order). */
export function figureMaterialFor(realmKey, discIndex = 0) {
  const mats = FIGURE_MATERIALS[realmKey];
  if (!mats) return null;
  const idx = Math.max(0, Math.min(mats.length - 1, discIndex | 0));
  return mats[idx];
}

// ── Birth Agent ─────────────────────────────────────────────────
// The dead do not breed. A new soul ARRIVES when the previous one
// passes on and finishes fading — arrivals are continuous, there
// is no breeding season. The arrival wears a fresh garment.
export function humanoidBirthFor(rec) {
  const arrivals = arrivalsFor(rec);
  return {
    ...arrivals,
    kind: rec.kind,
    garmentAtArrival: {
      name: GARMENT_BY_KIND[rec.kind] || 'shroud',
      wear: 'fresh',
      dataOnly: true,
    },
  };
}

// ── Growth Agent ────────────────────────────────────────────────
// Souls arrive full-formed and do not grow. The "growth" is the
// sojourn itself: Newly arrived -> Wandering -> Old, by age
// fraction — and the garment wears with it.
export function humanoidGrowthFor(rec, ageDays) {
  return growthFor(rec, ageDays);
}

/** Garment wear by sojourn fraction: fresh -> worn -> threadbare. */
export function garmentWearFor(fraction) {
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  if (f < 1 / 3) return 'fresh';
  if (f < 2 / 3) return 'worn';
  return 'threadbare';
}

// ── Garment Agent ───────────────────────────────────────────────
// What the dead wear, by realm and kind: the kind's garment name,
// the drift cone's real colour/opacity in the disc the soul stands
// in, and wear by sojourn age. DATA-ONLY: the renderer draws one
// cone per figure, so the garment can never be shown apart from
// the figure — `dataOnly` is true and `renderedAs` says so, so no
// caller can mistake this for a clothing system the scene has.
// `state` 'fading' overrides wear: a fading soul's garment fades.
export function garmentFor(realmKey, x, z, ageDays, state = 'alive') {
  const rec = speciesFor(realmKey);
  if (!rec) return null;
  const areaKey = areaAt(realmKey, x, z);
  const discIndex = Math.max(0, rec.areas.findIndex((a) => a.key === areaKey));
  const material = figureMaterialFor(realmKey, discIndex);
  const fraction = Math.max(0, Math.min(1, (Number(ageDays) || 0) / Math.max(1, rec.sojournDays)));
  return {
    kind: rec.kind,
    name: GARMENT_BY_KIND[rec.kind] || 'shroud',
    wear: state === 'fading' ? 'fading' : garmentWearFor(fraction),
    color: material ? material.color : null,
    opacity: material ? material.opacity : null,
    area: areaKey,
    discIndex,
    renderedAs: GARMENT_RENDERED_AS,
    dataOnly: true,
  };
}

// ── Weapons Agent ───────────────────────────────────────────────
// VERIFIED ABSENT: no drift figure in any of the 24 world3d.js
// files carries a weapon — no sword, spear, bow, axe, dagger or
// staff mesh exists on any figure, and Duat's own scene header
// says "nothing fights, nothing charges". The dead do not fight.
// Guardians carry nothing either (their meshes hold no weapon).
// Valhalla's gold shields are the hall's roof, not carried arms.
// So the agent returns the verified-absent state for every kind
// and every guardian: carries 'none', with the reason attached —
// it never invents a weapon for the dead.
export function weaponsFor(realmKey, kindOrName) {
  const rec = speciesFor(realmKey);
  const kind = (rec && rec.kind) || null;
  const isGuardian = Boolean(
    kindOrName && guardiansFor(realmKey).some((g) => g.id === kindOrName || g.name === kindOrName),
  );
  const base = {
    carries: 'none',
    weapon: null,
    stance: null,
    condition: null,
    applies: false,
    kind: isGuardian ? String(kindOrName) : kind,
    guardian: isGuardian,
  };
  if (isGuardian) {
    return {
      ...base,
      reason: 'no weapon mesh on the guardian in world3d.js — the guardian guards, lurks or waits; it does not fight',
    };
  }
  if (realmKey === 'valhalla') {
    return {
      ...base,
      reason: 'the dead do not fight — no weapon mesh on any Shade in world3d.js; the gold shields are the hall’s roof (y=16.5, along the ridge), set dressing, not carried arms',
      setDressing: 'gold shields on the hall roof — not carried',
    };
  }
  return {
    ...base,
    reason: 'the dead do not fight — no weapon mesh on any drift figure in world3d.js; Duat’s scene header: “nothing fights, nothing charges”',
  };
}

// ── Death Agent ─────────────────────────────────────────────────
// Death has ONE cause that ever fires here: the sojourn ends and
// the soul passes on. The territorial fight-to-death is a real
// branch — a rival carnivore in range moves the death earlier —
// but no realm's roster ever puts one in range, so it never fires.
export function humanoidDeathFor(rec, key, epochMs, rivalsInRange) {
  return deathFor(rec, key, epochMs, rivalsInRange);
}

// ── Decomposition Agent ─────────────────────────────────────────
// After passing on, the soul fades: Fading -> Wisp -> Gone, over
// fadeDays. The fade IS the decomposition of the dead; the
// garment fades with the soul.
export function humanoidFadeFor(rec, frac) {
  return decompFor(rec, frac);
}

// ── Diet Agent ──────────────────────────────────────────────────
// Diet 'none' for the drifting dead: the dead do not eat, so they
// never hunger and never hunt. Guardians keep their animal-pass
// diets (Cerberus / Apep carnivore by mythic role — but no prey
// species exists, so the hunt never fires; the Faithful Dog 'none').
export function humanoidDietFor(rec, key, nowMs, prey = []) {
  return dietFor(rec, key, nowMs, prey);
}

// ── Habits Agent ────────────────────────────────────────────────
// Activity from the device clock: seeking water first (the seeded
// 6-hour river-bank cycle), then night rest (22:00–06:00 local the
// dead hover still), otherwise drifting. Guardians do not follow
// the day: Cerberus guards, the Dog waits, Apep lurks.
export function humanoidHabitsFor(rec, key, x, z, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const water = waterFor(rec, key, x, z, nowMs);
  return {
    activity: activityNow(rec, key, x, z, now, water),
    water,
    social: socialFor(rec, key),
  };
}

// ── Territory Agent (re-exported shape, humanoid entry point) ───
// Carnivores are territorial, but the user-hunt and corpse-fight
// branches are gated on flags that are false in all 24 realms:
// userAsPrey() and userDeathOutcome() are false everywhere, so
// huntsUser and fightsOverCorpse are always false, with the reason
// attached. Implemented, evaluated, never taken.
export function humanoidTerritoryFor(realmKey, self, others = [], userNear = false, userDead = false) {
  return territoryFor(realmKey, self, others, userNear, userDead);
}

// ── Conductor: the whole humanoid life, from the clock ──────────
// lifeFor() plus the garment the soul wears and the weapon it does
// not carry. Guardians are eternal and return state 'eternal' with
// no garment (their mesh is their own body) and no weapon.
export function humanoidLifeFor(realmKey, name, cellKey, now = Date.now(), opts = {}) {
  const life = lifeFor(realmKey, name, cellKey, now, opts);
  if (!life) return null;
  const rec = speciesFor(realmKey);
  const x = typeof opts.x === 'number' ? opts.x : 0;
  const z = typeof opts.z === 'number' ? opts.z : 0;
  const guardian = guardiansFor(realmKey).find((g) => g.id === cellKey || g.name === name);
  if (guardian) {
    return {
      ...life,
      garment: {
        kind: guardian.kind,
        name: null,
        wear: null,
        color: null,
        opacity: null,
        area: areaAt(realmKey, guardian.x, guardian.z),
        discIndex: 0,
        renderedAs: 'guardian mesh (Cerberus / Apep / the Faithful Dog) — no drift cone, no garment',
        dataOnly: true,
      },
      weapon: weaponsFor(realmKey, guardian.id),
    };
  }
  return {
    ...life,
    garment: garmentFor(realmKey, x, z, life.ageDays, life.state === 'fading' ? 'fading' : 'alive'),
    weapon: weaponsFor(realmKey, rec ? rec.kind : name),
  };
}

/**
 * Enrich spawner output with humanoid life: adds `life` (with
 * garment + weapon) to every creature (mutates and returns the
 * same array). The spawner itself is untouched.
 */
export function enrichHumanoids(creatures, realmKey, now = Date.now()) {
  if (!Array.isArray(creatures)) return creatures;
  const rec = speciesFor(realmKey);
  if (!rec) return creatures;
  const t = now instanceof Date ? now.getTime() : Number(now);
  for (const c of creatures) {
    if (!c || typeof c.id !== 'string') continue;
    c.life = humanoidLifeFor(realmKey, rec.kind, c.id, t, { x: c.x, z: c.z });
  }
  return creatures;
}

/**
 * Population audit for the humanoid population rule (Merlin, Nov 14
 * ~22:57): ≥ MIN_LIVE_COPIES live AND ≥ 3 areas, over the realm's
 * real spawner output. Adds the kind's garment and weapon state —
 * the same for every copy, so one summary covers the realm.
 */
export function humanoidPopulationFor(realmKey, creatures, now = Date.now()) {
  const audit = populationFor(realmKey, creatures, now);
  if (!audit) return null;
  const rec = speciesFor(realmKey);
  return {
    ...audit,
    garment: rec ? { kind: rec.kind, name: GARMENT_BY_KIND[rec.kind] || 'shroud', dataOnly: true } : null,
    weapon: weaponsFor(realmKey, rec ? rec.kind : null),
  };
}

/**
 * Tap-card life line, Earth 4 shape, extended for humanoids:
 * "Kind · stage · activity · garment (wear) · unarmed", or
 * "Remains — <stage> · garment (fading)" while fading. Guardians
 * read as their post: "Cerberus · guarding — The Gates · unarmed".
 * No tap cards exist in the 24 realms (pages carry only the
 * realm-info overlay) — this line is wired into that overlay via
 * lib/afterlife/realm-life-line.js, which already renders in all
 * 24 pages.
 */
export function humanoidLifeLineFor(life) {
  if (!life) return '';
  if (life.state === 'fading') {
    const g = life.garment && life.garment.name ? ` · ${life.garment.name} (fading)` : '';
    return `Remains — ${life.decompStageName || 'Fading'}${g}`;
  }
  if (life.state === 'eternal') {
    const place = life.territory && life.territory.territory ? ` — ${life.territory.territory.name}` : '';
    return `${life.name} · ${life.activity}${place} · unarmed`;
  }
  const garment = life.garment && life.garment.name
    ? ` · ${life.garment.name} (${life.garment.wear || 'worn'})`
    : '';
  const weapon = life.weapon && life.weapon.carries !== 'none' ? ` · ${life.weapon.weapon}` : ' · unarmed';
  const kind = life.name ? `${life.name} · ` : '';
  return `${kind}${life.stageName} · ${life.activity}${garment}${weapon}`;
}
