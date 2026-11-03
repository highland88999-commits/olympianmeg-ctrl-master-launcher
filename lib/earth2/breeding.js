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
//   HATCH    — the egg cracks open after HATCH_MS; the baby is the
//              nest's species. Hatching REQUIRES land ownership —
//              "You need to own land to raise a dinosaur."
//   RAISE    — the baby follows its owner as an ALLY: it attacks
//              what the owner attacks (or what attacks the owner)
//              and never hunts its owner. Babies grow: baby →
//              juvenile (1 day) → adult (7 days). Adults raised by
//              hand stay allied for life.
//
// Pure arithmetic throughout: no three.js, no DOM, no clock, no
// Math.random — seeded hashes only, so nests sit in the same
// place for every visitor. The scene (Earth2World.jsx) renders
// and animates; the backpack holds the eggs.

import { EARTH2_MODEL_BY_SLUG } from './models.js';

// ── Timing ─────────────────────────────────────────────────────
/** An egg cracks open this long after it is stolen (10 minutes). */
export const EGG_HATCH_MS = 10 * 60 * 1000;

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

/** Milliseconds until the egg hatches (<= 0 means ready). */
export function eggHatchInMs(eggMeta, nowMs) {
  if (!eggMeta || eggMeta.stolenAt == null) return Infinity;
  return Number(eggMeta.stolenAt) + EGG_HATCH_MS - Number(nowMs);
}

/** True when the egg is ready to crack open. */
export function eggReadyToHatch(eggMeta, nowMs) {
  return eggHatchInMs(eggMeta, nowMs) <= 0;
}

/** True when the egg has gone cold (too old to hatch). */
export function eggIsCold(eggMeta, nowMs) {
  if (!eggMeta || eggMeta.stolenAt == null) return true;
  return Number(nowMs) - Number(eggMeta.stolenAt) > EGG_VIABLE_MS;
}

// ── The land gate ──────────────────────────────────────────────
/** True when the user owns at least one Earth 2 parcel.
 *  ownedRows: rows from the ownership list; email: the user. */
export function canRaiseDino(ownedRows, email) {
  const mine = String(email || '').toLowerCase();
  if (!mine || !Array.isArray(ownedRows)) return false;
  return ownedRows.some(
    (r) => r && String(r.owner_email || '').toLowerCase() === mine
  );
}

/** The plain-English refusal when the gate shuts. */
export const NO_LAND_MESSAGE =
  'You need to own land to raise a dinosaur. Buy a parcel first, then hatch your egg.';

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
