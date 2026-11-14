// lib/earth2/breeding.js
// EARTH 2 — DINO BREEDING (Merlin, 2026-11-03): "create a dinosaur
// egg that is rigged to crack open and spawn baby dinosaurs. Put
// them in nests, allow users to steal eggs from dinosaurs to raise
// their own Dinos as allies… they must own land to raise Dinos."
//
// The law:
//   NESTS    — deterministic (seeded) nests near herbivore herds,
//              1–3 eggs each, on dry land only.
//   STEAL    — walk up to a nest, take an egg (backpack item).
//              Stealing near a parent provokes it (aggro).
//   HATCH    — the user taps the egg in the backpack and it
//              hatches RIGHT AWAY — no wait (Merlin, 2026-11-14).
//              Hatching is user-caused, never on a timer. The
//              species picker still opens: the user chooses what
//              hatches. The baby hatches INTO the backpack.
//              Hatching is CAPPED, not gated on land: any user
//              may raise ONE dino; a land owner may raise up to
//              FOUR. A cold egg (stolen over 24 h ago) won't hatch.
//   RAISE    — the baby follows its owner as an ALLY: it attacks
//              what the owner attacks (or what attacks the owner)
//              and never hunts its owner. Babies grow: baby →
//              juvenile (1 day) → adult (7 days). Adults raised by
//              hand stay allied for life.
//   HOME     — the backpack IS home (Merlin, 2026-11-14): a
//              raised dino lives in the backpack unless summoned.
//              A land owner ALSO keeps a COPY of each of their
//              dinos at home on their land, all the time — the
//              same species and growth stage, miniature, grazing,
//              never following, never fighting. The copies are the
//              ones the owner meets at home.
//   SUMMON   — raised dinos ride in the backpack and summon to
//              and from it, in ANY realm the backpack lives in:
//              the dino spawns next to the user and follows them.
//              Sending it back returns it to the backpack.
//              The backpack record is the truth: it survives
//              reloads and travels realms, so a raised dino is
//              never lost to a refresh.
//   ENTER / LEAVE (Merlin, 2026-11-14) — crossing onto your own
//              parcel sends your travelling dinos back to the
//              backpack (the home copies are the ones you meet
//              there). Leaving respawns ONLY the dinos that were
//              out before you came home — unless you changed the
//              selection through the backpack while home, in
//              which case the newly selected ones spawn with you.
//              The backpack is where the selection changes: a
//              summon marks a dino to travel; a send-back unmarks
//              it (the `travel` flag on the record).
//
// Pure arithmetic throughout: no three.js, no DOM, no clock, no
// Math.random — seeded hashes only, so nests sit in the same
// place for every visitor. The scene (Earth2World.jsx) renders
// and animates; the backpack holds the eggs.

import { EARTH2_MODEL_BY_SLUG } from './models.js';

// ── Timing ─────────────────────────────────────────────────────
/** HATCH (Merlin, 2026-11-14): there is NO hatch clock. The
 *  user taps the egg in the backpack and it hatches RIGHT AWAY
 *  — hatching is user-caused, never on a timer. The old
 *  10-minute EGG_HATCH_MS auto-hatch timer is gone; the egg
 *  sits in the pack until tapped. */

/** A stolen egg stays viable this long before it goes cold (24 h). */
export const EGG_VIABLE_MS = 24 * 60 * 60 * 1000;

/** Baby → juvenile at 1 day, juvenile → adult at 7 days. */
export const JUVENILE_AGE_MS = 24 * 60 * 60 * 1000;
export const ADULT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ── Growth scales (fraction of adult scaleM) ───────────────────
export const GROWTH_SCALE = {
  baby: 0.22,
  juvenile: 0.55,
  adult: 1.0,
};

// ── Ally behaviour ─────────────────────────────────────────────
/** The ally trots to catch up past this distance (metres). */
export const ALLY_FOLLOW_RANGE_M = 8;
/** The ally never strays past this distance — it hurries back. */
export const ALLY_MAX_RANGE_M = 30;
/** How close the ally gets before it stops and idles. */
export const ALLY_IDLE_RANGE_M = 3;

// ── Nest species ───────────────────────────────────────────────
// Herbivore herds nest in the open (safer steals); a few
// carnivores nest too — their eggs are the prize, and the
// parents do NOT forgive thieves.
export const NEST_SPECIES = [
  // Herbivores — the common nests, near their herds.
  'triceratops',
  'stegosaurus',
  'brachiosaurus',
  'parasaurolophus',
  'iguanodon',
  'gallimimus',
  'ankylosaurus',
  'diplodocus',
  // Carnivores — rare nests, dangerous parents.
  'velociraptor',
  'dilophosaurus',
  'carnotaurus',
];

// ── Model paths ────────────────────────────────────────────────
/** The Tripo egg GLB (falls back to procedural when absent). */
export const EGG_MODEL_PATH = '/models/earth2/dino-egg.glb';

/** Baby model path for a species — Tripo GLB when it lands,
 *  otherwise the scene scales down the adult. */
export function babyModelPath(slug) {
  return `/models/earth2/baby-${slug}.glb`;
}

// ── Seeded rng ─────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slugSeed(slug) {
  let h = 0;
  const s = String(slug || '');
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return h;
}

// ── Nest placement ─────────────────────────────────────────────
// Nests are placed by the SCENE (it knows the herd anchors from
// world.js). This module computes the per-nest egg counts and
// validates placements — pure, testable.

/** How many eggs in a nest (1–3, seeded by nest id). */
export function nestEggCount(nestId) {
  const rng = mulberry32(slugSeed(`nest-${nestId}`));
  const roll = rng();
  if (roll < 0.45) return 1;
  if (roll < 0.85) return 2;
  return 3;
}

/** A nest record the scene builds at a herd anchor. */
export function makeNest(id, species, x, z, parcelIndex) {
  return {
    id: String(id),
    species: String(species),
    x: Number(x),
    z: Number(z),
    parcelIndex: parcelIndex == null ? -1 : Number(parcelIndex),
    eggs: nestEggCount(id),
    raided: false,
  };
}

/** True when a parent of this species would punish a thief. */
export function nestIsDangerous(species) {
  const entry = EARTH2_MODEL_BY_SLUG.get(species);
  return !!entry && entry.diet === 'carnivore';
}

// ── Stealing (Merlin, 2026-11-14) ─────────────────────────────
// The steal prompt is the green button — and it lived ONLY inside
// the CONTROLS panel, which unmounts its body when shrunk to its
// orb. On Merlin's phone the panel sat shrunk, so the button never
// rendered no matter how close he stood to a nest (proven by his
// two videos: the nest label reads fine, the walker stands a metre
// from the egg, no prompt ever appears). The prompt now lives at
// top level in the scene, and the reach is forgiving — 6 m — so a
// parent milling near the ring can't lock the walker out either.

/** How close the walker must be for the steal prompt (metres). */
export const STEAL_REACH_M = 6;

/** True when the walker stands close enough to steal from a nest. */
export function isNestInStealReach(walkerX, walkerZ, nest) {
  if (!nest || nest.raided || nest.eggs <= 0) return false;
  return Math.hypot(Number(walkerX) - nest.x, Number(walkerZ) - nest.z) < STEAL_REACH_M;
}

// ── Nest nameplates (Merlin, 2026-11-14) ──────────────────────
// Nests were invisible in the world — a twig ring on the ground
// with no label, no marker, nothing on the map. Every nest now
// wears a floating nameplate with its species and live egg
// count; the scene updates it on steal and removes it when
// the nest is raided.

/** How far a nest nameplate reads (metres). */
export const NEST_LABEL_MAX_DIST_M = 200;

/** How high the nameplate floats above the nest (metres). */
export const NEST_LABEL_HEIGHT_M = 2.5;

/** The display name for a nest's species (registry name, never the slug). */
export function nestSpeciesName(species) {
  const entry = EARTH2_MODEL_BY_SLUG.get(species);
  return entry ? entry.name : String(species || 'dinosaur');
}

/** Nameplate text for a nest: species + live egg count. */
export function nestLabelText(species, eggs) {
  const n = Math.max(0, Math.floor(Number(eggs) || 0));
  return `🥚 ${nestSpeciesName(species)} Nest · ${n} ${n === 1 ? 'egg' : 'eggs'}`;
}

// ── Eggs (backpack items) ──────────────────────────────────────
export const EGG_ITEM_ID = 'dino-egg';
export const EGG_ITEM_KIND = 'collectible';

/** The display name for an egg of a species. */
export function eggName(species) {
  const entry = EARTH2_MODEL_BY_SLUG.get(species);
  const label = entry ? entry.name : String(species || 'dinosaur');
  return `${label} Egg`;
}

/** Build the backpack item for a stolen egg. */
export function makeEggItem(species, stolenAtMs) {
  return {
    id: EGG_ITEM_ID,
    kind: EGG_ITEM_KIND,
    name: eggName(species),
    qty: 1,
    meta: {
      species: String(species),
      stolenAt: Number(stolenAtMs),
    },
  };
}

/** True when the egg's meta marks it as a dino egg. */
export function isEggItem(entry) {
  return !!entry && entry.id === EGG_ITEM_ID && !!entry.meta && !!entry.meta.species;
}

/** True when the egg has gone cold (too old to hatch). */
export function eggIsCold(eggMeta, nowMs) {
  if (!eggMeta || eggMeta.stolenAt == null) return true;
  return Number(nowMs) - Number(eggMeta.stolenAt) > EGG_VIABLE_MS;
}

// ── The land gate (is the user a land owner?) ────────────────
// The scene's owners list is a Map (parcelId → row) — and a
// Map is NOT an array, so every ownership check in this file
// goes through ownedRowsOf() first. Object.values(aMap) is []
// and silently made every landowner read as landless in the
// scene (found Nov 14, 2026 while remodelling home).
/** The ownership rows as an array — accepts a Map (parcelId →
// row), an array of rows, or a plain object keyed by parcel. */
export function ownedRowsOf(owners) {
  if (!owners) return [];
  if (typeof owners.values === 'function') return [...owners.values()];
  if (Array.isArray(owners)) return owners;
  if (typeof owners === 'object') return Object.values(owners);
  return [];
}

/** True when the user owns at least one Earth 2 parcel.
 *  ownedRows: the ownership list — a Map (parcelId → row), an
 *  array of rows, or a plain object keyed by parcel (see
 *  ownedRowsOf); email: the user. */
export function canRaiseDino(ownedRows, email) {
  const mine = String(email || '').toLowerCase();
  if (!mine) return false;
  return ownedRowsOf(ownedRows).some(
    (r) => r && String(r.owner_email || '').toLowerCase() === mine
  );
}

/** True when the given parcel belongs to this user. Accepts
 *  the same Map/array/object shapes as ownedRowsOf. */
export function isOwnParcel(owners, parcelId, email) {
  if (!parcelId || !email) return false;
  const mine = String(email).toLowerCase();
  const rows = ownedRowsOf(owners);
  return rows.some(
    (r) =>
      r && r.parcel_id === parcelId &&
      String(r.owner_email || '').toLowerCase() === mine
  );
}

// ── Raise caps (Merlin, 2026-11-14) ──────────────────────────
// The old gate ("no land, no hatch") is GONE: anyone may raise
// ONE dino from an egg; a land owner may raise up to FOUR. The
// cap counts every raised dino — live allies plus the ones
// resting in the backpack. A home COPY is not an item and never
// counts toward the cap.

/** How many dinos a user without land may raise. */
export const RAISE_CAP_FREE = 1;

/** How many dinos a land owner may raise. */
export const RAISE_CAP_LANDOWNER = 4;

/** The cap for this user (1, or 4 for a land owner). */
export function raiseCapFor(isLandowner) {
  return isLandowner ? RAISE_CAP_LANDOWNER : RAISE_CAP_FREE;
}

// ── Raised dinos (backpack items) ────────────────────────────
// A raised dino IS a backpack item — kind 'dino', one per dino,
// never stacked. The item is the record: it rides the shared
// backpack store (localStorage + the account copy), so it
// survives reloads and travels to every realm the backpack
// lives in. The scene renders the item's state; it never keeps
// a second copy of the truth.
export const DINO_ITEM_ID = 'dino-companion';
export const DINO_ITEM_KIND = 'dino';

/** Where a raised dino is right now. The travelling dino has
 *  TWO states — the backpack IS home (Merlin, 2026-11-14):
 *  'out' (summoned, beside its user) or 'pack' (in the
 *  backpack). A land owner ALSO keeps a COPY of each dino on
 *  their land, but a copy is a scene entity, never an item:
 *  the ally mode 'home' in the scene is the copy, not a
 *  backpack state. */
export const DINO_STATE_OUT = 'out'; // summoned — beside its user
export const DINO_STATE_PACK = 'pack'; // unsummoned — in the backpack

/** The two travelling states, for validation. */
export const DINO_STATES = [DINO_STATE_OUT, DINO_STATE_PACK];

/** The old 'home' state (2026-11-14 build): the travelling
 *  dino lived grazing on its owner's land. Superseded — the
 *  backpack is home now. Stored records from that build still
 *  carry 'home'; dinoStateOf() maps them to 'pack'. */
export const LEGACY_DINO_STATE_HOME = 'home';

/** Stable id for a raised dino: species + birth moment. */
export function dinoIdFor(species, bornAtMs) {
  return `dino-${String(species || 'dinosaur')}-${Number(bornAtMs) || 0}`;
}

/** The dino's id from its backpack item (legacy items without
 *  one derive it from species + birth moment). */
export function dinoIdOf(entry) {
  if (!entry || !entry.meta) return '';
  if (typeof entry.meta.dinoId === 'string' && entry.meta.dinoId) return entry.meta.dinoId;
  return dinoIdFor(entry.meta.species, entry.meta.bornAt);
}

/** Display name for a raised dino (registry name, never the slug). */
export function dinoDisplayName(species) {
  const entry = EARTH2_MODEL_BY_SLUG.get(species);
  const label = entry ? entry.name : String(species || 'dinosaur');
  return `${label} (companion)`;
}

/** Build the backpack item for a raised dino.
 *  travel: whether this dino spawns with its owner when they
 *  leave their parcel — set by a summon, cleared by a send-back
 *  (see setDinoItemState). A fresh hatch never travels. */
export function makeDinoItem(species, bornAtMs, { dinoId, state, homeParcelId, travel } = {}) {
  const bornAt = Number(bornAtMs) || Date.now();
  const id = dinoId || dinoIdFor(species, bornAt);
  const st = DINO_STATES.includes(state) ? state : DINO_STATE_PACK;
  return {
    id: DINO_ITEM_ID,
    kind: DINO_ITEM_KIND,
    name: dinoDisplayName(species),
    qty: 1,
    meta: {
      species: String(species),
      bornAt,
      dinoId: id,
      state: st,
      homeParcelId: homeParcelId || null,
      travel: travel === true,
    },
  };
}

/** True when the entry is a raised dino. */
export function isDinoItem(entry) {
  return !!entry && entry.kind === DINO_ITEM_KIND && !!entry.meta && !!entry.meta.species;
}

/** A dino item's state ('out' | 'pack'; legacy items without
 *  one read as 'pack'). A stored 'home' from the 2026-11-14
 *  build is NOT a valid state any more and reads as 'pack' —
 *  the backpack is home now; the land holds only copies. */
export function dinoStateOf(entry) {
  const st = entry && entry.meta ? entry.meta.state : null;
  return DINO_STATES.includes(st) ? st : DINO_STATE_PACK;
}

/** All raised dinos in a backpack item list. */
export function raisedDinoItems(items) {
  return (Array.isArray(items) ? items : []).filter(isDinoItem);
}

/**
 * How many dinos this user already raises: distinct dino ids
 * across the backpack items plus any live allies (a live ally
 * always has its item, but count it anyway so a record gap can
 * never let the cap be cheated).
 */
export function countRaisedDinos(items, liveDinoIds) {
  const ids = new Set(raisedDinoItems(items).map((it) => dinoIdOf(it)));
  for (const id of liveDinoIds || []) if (id) ids.add(String(id));
  return ids.size;
}

/** The cap check for hatching: { ok, cap, raised }. */
export function canHatchMore(items, isLandowner, liveDinoIds) {
  const cap = raiseCapFor(isLandowner);
  const raised = countRaisedDinos(items, liveDinoIds);
  return { ok: raised < cap, cap, raised };
}

/** The plain-English refusal when the cap is full (null when
 *  there is room — callers only show it when canHatchMore says
 *  no). */
export function raiseCapRefusal(raised, cap, isLandowner) {
  if (raised < cap) return null;
  if (!isLandowner) {
    return `You already raise ${cap} dino${cap === 1 ? '' : 's'} — that's the most without land. Buy a parcel to raise up to ${RAISE_CAP_LANDOWNER}.`;
  }
  return `You already raise ${cap} dinos — that's the most any land owner can raise.`;
}

/** The owner's home parcel for their home COPIES: their first
 *  owned parcel id (sorted, deterministic), or null when they
 *  own no land — then there is no land for copies to stand on
 *  and the backpack alone is home. Accepts the Map/array/object
 *  shapes of ownedRowsOf. */
export function homeParcelFor(ownedRows, claims, email) {
  const mine = String(email || '').toLowerCase();
  if (!mine) return null;
  const ids = new Set();
  for (const rows of [ownedRowsOf(ownedRows), ownedRowsOf(claims)]) {
    for (const r of rows) {
      if (!r) continue;
      if (String(r.owner_email || '').toLowerCase() !== mine) continue;
      if (typeof r.parcel_id === 'string' && r.parcel_id) ids.add(r.parcel_id);
    }
  }
  if (!ids.size) return null;
  return [...ids].sort()[0];
}

/** A deterministic graze spot near a parcel's center for one
 *  dino (3–7 m out, seeded by dino id so four dinos never stack
 *  on the same spot). */
export function homeSpotFor(center, dinoId) {
  const rng = mulberry32(slugSeed(`home-${dinoId || 'dino'}`));
  const a = rng() * Math.PI * 2;
  const r = 3 + rng() * 4;
  return {
    x: Number(center.x) + Math.cos(a) * r,
    z: Number(center.z) + Math.sin(a) * r,
  };
}

/** A new item list with one dino's state changed (pure; the
 *  item is never remade — its uid and history survive).
 *  travel: undefined leaves the travel flag as it was; true
 *  marks the dino to spawn with its owner when they leave
 *  their parcel (summon), false unmarks it (send-back). */
export function setDinoItemState(items, dinoId, state, homeParcelId, travel) {
  const st = DINO_STATES.includes(state) ? state : DINO_STATE_PACK;
  return (Array.isArray(items) ? items : []).map((it) => {
    if (!isDinoItem(it) || dinoIdOf(it) !== dinoId) return it;
    return {
      ...it,
      meta: {
        ...it.meta,
        state: st,
        homeParcelId: homeParcelId === undefined ? it.meta.homeParcelId || null : homeParcelId,
        travel: travel === undefined ? it.meta.travel === true : travel === true,
      },
    };
  });
}

// ── Entering / leaving home (Merlin, 2026-11-14) ─────────────
// ENTERING your own parcel: the travelling dinos return to the
// backpack — the `travel` flag is NOT touched, so the record
// still remembers who was out. LEAVING: only the dinos that
// were out before coming home respawn with the owner — which is
// exactly the dinos whose `travel` flag is set, because a
// summon marks it and a send-back clears it. Changing the
// selection through the backpack while home (summon or
// send-back there) changes what spawns on leaving.

/** A new item list with every travelling dino back in the
 *  backpack (pure). The travel flag is untouched on purpose:
 *  it is the memory of who was out. */
export function recallTravellersToPack(items) {
  return (Array.isArray(items) ? items : []).map((it) => {
    if (!isDinoItem(it) || dinoStateOf(it) !== DINO_STATE_OUT) return it;
    return { ...it, meta: { ...it.meta, state: DINO_STATE_PACK } };
  });
}

/** The dinos that spawn with the owner on leaving their parcel:
 *  the ones in the backpack with travel set (pure). A dino
 *  already out on the map is not listed again. */
export function dinosToSpawnOnLeaving(items) {
  return (Array.isArray(items) ? items : []).filter(
    (it) => isDinoItem(it) && it.meta.travel === true && dinoStateOf(it) === DINO_STATE_PACK
  );
}

// ── Home copies (Merlin, 2026-11-14) ─────────────────────────
// A land owner has a COPY of each of their dinos at home on
// their land ALL the time. A copy is NOT a backpack item — it
// is a scene entity derived from the item (same species, same
// bornAt so it grazes at the same growth stage), miniature
// (PARCEL_SHRINK_SCALE, the diorama rule), idle/grazing, never
// following, never fighting. The scene reconciles the copies
// from this list; the list is the truth, so a copy is never
// stranded when the item is recalled or its owner logs out.
// A copy exists only for a land owner: no home parcel, no
// copies. Copies are derived from the OWNER's own record —
// there is no server-side dino registry, so other visitors do
// not see them.
/** { dinoId, species, bornAt, homeParcelId, spot } per raised
 *  dino the owner keeps a home copy of (empty when landless).
 *  homeCenter: { x, z } of the home parcel's center — the
 *  caller owns the geometry (parcelById + parcelCenterWorld);
 *  this module stays pure. */
export function homeCopiesFor(items, ownedRows, claims, email, homeCenter) {
  const homeParcelId = homeParcelFor(ownedRows, claims, email);
  if (!homeParcelId || !homeCenter) return [];
  return raisedDinoItems(items).map((it) => ({
    dinoId: dinoIdOf(it),
    species: it.meta.species,
    bornAt: Number(it.meta.bornAt) || Date.now(),
    homeParcelId,
    spot: homeSpotFor(homeCenter, dinoIdOf(it)),
  }));
}

// ── Growth ─────────────────────────────────────────────────────
// Rig-driven growth (Merlin, 2026-11-03): babies are NOT uniformly
// scaled up. The Tripo babies carry the standard Mixamo skeleton,
// so growth drives through the RIG — bone groups scale at different
// rates (big baby head grows slow, short baby limbs lengthen fast),
// shifting proportions toward the adult as the dino matures. At
// full maturity the scene swaps to the adult species model.
//
// The pure module ships the bone-group map and per-stage scales;
// the scene (which owns three.js) applies them to the skeleton.

/** 'baby' | 'juvenile' | 'adult' for a dino born at bornAtMs. */
export function growthStage(bornAtMs, nowMs) {
  const age = Number(nowMs) - Number(bornAtMs);
  if (age >= ADULT_AGE_MS) return 'adult';
  if (age >= JUVENILE_AGE_MS) return 'juvenile';
  return 'baby';
}

/** Continuous growth 0 (newborn) → 1 (full adult). */
export function growthT(bornAtMs, nowMs) {
  const age = Number(nowMs) - Number(bornAtMs);
  if (age <= 0) return 0;
  return Math.min(1, age / ADULT_AGE_MS);
}

/** Scale multiplier for a growth stage (uniform fallback). */
export function growthScaleFor(stage) {
  return GROWTH_SCALE[stage] || GROWTH_SCALE.baby;
}

/** The rendered scale (metres) for an ally of a species at a stage. */
export function allyScaleM(species, stage) {
  const entry = EARTH2_MODEL_BY_SLUG.get(species);
  const adult = entry && entry.scaleM ? Number(entry.scaleM) : 5;
  return adult * growthScaleFor(stage);
}

// ── Rig bone groups (Mixamo hierarchy) ─────────────────────────
// SCENE USAGE — how Earth2World.jsx grows an ally through its rig:
//
//   import {
//     growthT, rigScalesFor, overallScaleAt, shouldSwapToAdult,
//   } from '@/lib/earth2/breeding';
//
//   // On each growth tick (or every few seconds — not every frame):
//   const now = Date.now();
//   if (shouldSwapToAdult(ally.bornAt, now)) {
//     swapAllyToAdultModel(ally); // adult species GLB, isAlly stays true
//   } else {
//     const t = growthT(ally.bornAt, now);
//     const entry = EARTH2_MODEL_BY_SLUG.get(ally.species);
//     // 1. Overall size: baby bind size → adult scaleM.
//     ally.root.scale.setScalar(overallScaleAt(t, entry.scaleM));
//     // 2. Proportional growth: scale each bone by its group.
//     const names = ally.skeleton.bones.map((b) => b.name);
//     const scales = rigScalesFor(names, t);
//     for (const bone of ally.skeleton.bones) {
//       const s = scales[bone.name] || 1;
//       bone.scale.set(s, s, s);
//     }
//   }
//   // ally.skeleton is the THREE.Skeleton from the baby GLB's
//   // SkinnedMesh (found by traversing the loaded model).
//   // The head stays relatively big while limbs lengthen —
//   // real proportional growth, not a balloon animal.
export const BONE_GROUP_HEAD = 'head';
export const BONE_GROUP_SPINE = 'spine';
export const BONE_GROUP_ARM = 'arm';
export const BONE_GROUP_LEG = 'leg';

/** Canonical Mixamo bone names per group (case-insensitive match). */
export const MIXAMO_BONE_GROUPS = {
  [BONE_GROUP_HEAD]: ['head', 'neck'],
  [BONE_GROUP_SPINE]: ['hips', 'spine', 'spine1', 'spine2', 'pelvis'],
  [BONE_GROUP_ARM]: [
    'leftshoulder', 'leftarm', 'leftforearm', 'lefthand',
    'rightshoulder', 'rightarm', 'rightforearm', 'righthand',
  ],
  [BONE_GROUP_LEG]: [
    'leftupleg', 'leftleg', 'leftfoot', 'lefttoebase',
    'rightupleg', 'rightleg', 'rightfoot', 'righttoebase',
  ],
};

/** Which growth group a Mixamo bone belongs to. */
export function boneGroupFor(boneName) {
  const n = String(boneName || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/^mixamorig/, '');
  for (const [group, names] of Object.entries(MIXAMO_BONE_GROUPS)) {
    if (names.includes(n)) return group;
  }
  // Fuzzy fallback for rig variants (thigh/shin, etc.)
  if (n.includes('head') || n.includes('neck') || n.includes('skull') || n.includes('jaw')) return BONE_GROUP_HEAD;
  if (n.includes('thigh') || n.includes('shin') || n.includes('knee') || n.includes('ankle')) return BONE_GROUP_LEG;
  if (n.includes('upperarm') || n.includes('forearm') || n.includes('elbow') || n.includes('wrist')) return BONE_GROUP_ARM;
  return BONE_GROUP_SPINE; // torso default
}

// ── Per-group growth scales ────────────────────────────────────
// Multiplier on the baby model's bind pose, per growth stage.
// Babies: big heads (1.2×), short limbs (0.75–0.8×).
// Adults: head settles (0.95×), torso and limbs lengthen (1.2–1.3×).
// The scene multiplies these by the overall growth scale.
export const BONE_GROWTH_SCALES = {
  baby: {
    [BONE_GROUP_HEAD]: 1.2,
    [BONE_GROUP_SPINE]: 1.0,
    [BONE_GROUP_ARM]: 0.8,
    [BONE_GROUP_LEG]: 0.75,
  },
  juvenile: {
    [BONE_GROUP_HEAD]: 1.05,
    [BONE_GROUP_SPINE]: 1.15,
    [BONE_GROUP_ARM]: 1.0,
    [BONE_GROUP_LEG]: 1.0,
  },
  adult: {
    [BONE_GROUP_HEAD]: 0.95,
    [BONE_GROUP_SPINE]: 1.3,
    [BONE_GROUP_ARM]: 1.2,
    [BONE_GROUP_LEG]: 1.25,
  },
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Bone-group scales at a continuous growthT (0 → 1).
 * Interpolates baby → juvenile → adult across the growth curve
 * (juvenile sits at t = JUVENILE_AGE_MS / ADULT_AGE_MS ≈ 0.143).
 * Returns { head, spine, arm, leg } multipliers.
 */
export function boneScalesAt(t) {
  const clamped = Math.max(0, Math.min(1, Number(t) || 0));
  const juvT = JUVENILE_AGE_MS / ADULT_AGE_MS;
  const baby = BONE_GROWTH_SCALES.baby;
  const juv = BONE_GROWTH_SCALES.juvenile;
  const adult = BONE_GROWTH_SCALES.adult;
  const out = {};
  for (const group of [BONE_GROUP_HEAD, BONE_GROUP_SPINE, BONE_GROUP_ARM, BONE_GROUP_LEG]) {
    if (clamped <= juvT) {
      const k = juvT > 0 ? clamped / juvT : 1;
      out[group] = lerp(baby[group], juv[group], k);
    } else {
      const k = (clamped - juvT) / (1 - juvT);
      out[group] = lerp(juv[group], adult[group], k);
    }
  }
  return out;
}

/**
 * Overall root scale at growthT: the baby model's bind size up to
 * the adult species scaleM. The bone-group scales above ride on
 * top of this for proportional (non-uniform) growth.
 */
export function overallScaleAt(t, adultScaleM) {
  const clamped = Math.max(0, Math.min(1, Number(t) || 0));
  const adult = Number(adultScaleM) > 0 ? Number(adultScaleM) : 5;
  const babyScale = adult * GROWTH_SCALE.baby;
  return lerp(babyScale, adult, clamped);
}

// ── Uniform hatch size (Merlin, 2026-11-03) ───────────────────
// "ensure they hatch around the same size" — a baby T-Rex and a
// baby raptor start at the same size, not at 22% of their very
// different adult sizes. The hatch size lerps to the adult
// scaleM across the growth curve, so every species converges
// on its true adult size while starting together.

/** Every species hatches at this size (metres). */
export const UNIFORM_HATCH_SIZE_M = 1.2;

/**
 * Overall root scale at growthT with uniform hatch size:
 * 1.2 m at birth → adult species scaleM at maturity.
 * The bone-group scales (rigScalesFor) ride on top for
 * proportional growth.
 */
export function uniformScaleAt(t, adultScaleM) {
  const clamped = Math.max(0, Math.min(1, Number(t) || 0));
  const adult = Number(adultScaleM) > 0 ? Number(adultScaleM) : 5;
  return lerp(UNIFORM_HATCH_SIZE_M, adult, clamped);
}

/**
 * Per-bone scales for a skeleton at growthT.
 * bones: array of bone names (strings).
 * Returns { [boneName]: scale } — the scene sets each
 * bone.scale to (scale, scale, scale) on the THREE.Bone.
 */
export function rigScalesFor(bones, t) {
  const groups = boneScalesAt(t);
  const out = {};
  for (const name of bones || []) {
    out[name] = groups[boneGroupFor(name)] || 1;
  }
  return out;
}

/** True when the ally is fully grown — the scene swaps to the adult model. */
export function shouldSwapToAdult(bornAtMs, nowMs) {
  return growthT(bornAtMs, nowMs) >= 1;
}

// ── Ally behaviour (pure decisions; the scene moves the mesh) ──
/**
 * Where the ally wants to be: follow the owner, never stray.
 * Returns 'follow' | 'idle' | 'return' for the scene's mover.
 */
export function allyMoveDecision(allyX, allyZ, ownerX, ownerZ) {
  const dx = ownerX - allyX;
  const dz = ownerZ - allyZ;
  const d = Math.hypot(dx, dz);
  if (d > ALLY_MAX_RANGE_M) return 'return'; // hurry back
  if (d > ALLY_FOLLOW_RANGE_M) return 'follow'; // trot to catch up
  if (d < ALLY_IDLE_RANGE_M) return 'idle'; // close enough
  return 'follow'; // drift nearer
}

/**
 * Who the ally attacks: the owner's current target, else whoever
 * just hurt the owner — never the owner, never itself.
 * ownerTarget / attacker: creature records or null.
 */
export function allyAttackTarget(ally, ownerTarget, attacker, ownerId) {
  const valid = (c) =>
    c && c.alive !== false && c.id !== ownerId && c.id !== ally.id && !c.isAlly;
  if (valid(ownerTarget)) return ownerTarget;
  if (valid(attacker)) return attacker;
  return null;
}

/** True when a wild predator must refuse an allied dino as prey. */
export function isAlliedDino(creature) {
  return !!creature && creature.isAlly === true;
}
