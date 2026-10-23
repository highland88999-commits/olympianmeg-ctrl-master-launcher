// lib/earth2/fossils.js
// EARTH 2 — FOSSILS (Merlin, 2026-10-22): users hunt dinosaurs;
// when one dies it drops FOSSILS; the fossils are carried to John
// Hammond at the Royal Tyrrell Museum (lib/earth2/museum.js) and
// exchanged for gold or aether (lib/earth2/hammond.js).
//
// VALUE VARIES (Merlin: "The value of all fossils should vary").
// Every fossil instance is rolled at the moment of the kill: its
// fossil type carries a base gold value — scaled by the species'
// size and apex status, so a T. rex skull is worth a Compsognathus
// rib many times over — and a CONDITION grade rolled per fossil
// (fragment / partial / complete / museum-grade) multiplies that
// base. The same tooth can surface as a 25-gold fragment or a
// 250-gold museum piece.
//
// The rolls here are game rolls, not world generation, so the
// procedural-seed law does not bind them — but the RNG is
// injectable, exactly like Dracula's gift table (lib/earth2/
// gifts.js), so tests drive every path with a seeded source and
// prove the rates. No bare Math.random decides anything; it only
// ever arrives as the default rng argument.
//
// PERSISTENCE, HONESTLY: the carried inventory persists on-device
// (localStorage), like the blood-sac tallies — no server fossil
// ledger exists until the earth2 tables grow one, and Hammond's
// payouts land on the same preview tallies the mounting phase
// wires. State helpers mirror lib/earth2/blood-sacs.js.

import { EARTH2_MODELS, EARTH2_MODEL_BY_SLUG } from './models.js';

export const FOSSIL_STORAGE_KEY = 'earth2:fossils:v1';

// ── Condition grades ─────────────────────────────────────────────
// The variance engine. Weights sum to 100; the multiplier climbs
// steeply — a museum-grade specimen is the same fossil, ten times
// the fragment's worth.
export const FOSSIL_CONDITIONS = [
  { id: 'fragment', label: 'Fragment', weight: 40, multiplier: 0.25 },
  { id: 'partial', label: 'Partial', weight: 35, multiplier: 0.6 },
  { id: 'complete', label: 'Complete', weight: 20, multiplier: 1 },
  { id: 'museum-grade', label: 'Museum-grade', weight: 5, multiplier: 2.5 },
];

export const FOSSIL_CONDITION_WEIGHT_TOTAL =
  FOSSIL_CONDITIONS.reduce((sum, c) => sum + c.weight, 0);

/** One condition grade by id, or null. */
export function fossilConditionById(id) {
  return FOSSIL_CONDITIONS.find((c) => c.id === id) || null;
}

/** Roll one condition grade on the injectable rng (() => [0,1)). */
export function rollFossilCondition(rng = Math.random) {
  const roll = (typeof rng === 'function' ? rng() : Math.random()) * FOSSIL_CONDITION_WEIGHT_TOTAL;
  let acc = 0;
  for (const c of FOSSIL_CONDITIONS) {
    acc += c.weight;
    if (roll < acc) return c;
  }
  return FOSSIL_CONDITIONS[FOSSIL_CONDITIONS.length - 1];
}

/** The gold value of a fossil: its type's base, graded. Never 0 —
 *  even a fragment of anything is worth a single gold piece. */
export function fossilGoldValue(baseGold, condition) {
  const mult = condition && Number.isFinite(condition.multiplier) ? condition.multiplier : 1;
  const base = Math.max(0, Number(baseGold) || 0);
  return Math.max(1, Math.round(base * mult));
}

// ── The drop tables ──────────────────────────────────────────────
// One entry per huntable species in the Bay roster (lib/earth2/
// models.js): the land dinosaurs, the flyers, the marine cast.
// Each drop: a fossil type in-universe, its base gold value at
// Complete grade, the chance a kill leaves one, and how many a
// lucky kill leaves (min–max). Apex species (the two hybrid
// super-predators and the T. rex) carry the premium their size
// and fame earn; the tiny species pay in charm, not weight.
//
// EXCLUSIONS — roster entries that deliberately drop NOTHING:
// - compy-swarm: not a species at all — a presence entry riding
//   the compsognathus model; its base species already drops.
// - giant-mosquito: an insect of the blood-sac loop; chitin does
//   not fossilise, and it already carries its own drop economy.
// - vampire-bat: a living mammal of Dracula's court, not fossil
//   fauna — Hammond's museum trades in the ancient dead.
// (Plants, landforms, the castle and Dracula himself are not
// creatures and were never candidates.)
export const FOSSIL_EXCLUSIONS = {
  'compy-swarm': 'A presence entry, not a species — it rides the compsognathus model, whose drops already cover it.',
  'giant-mosquito': 'An insect of the blood-sac loop — chitin does not fossilise, and it already drops blood sacs.',
  'vampire-bat': 'A living mammal of Dracula’s court, not fossil fauna — the museum trades in the ancient dead.',
};

const D = (type, baseGold, chance, min = 1, max = 1) => ({ type, baseGold, chance, min, max });

export const FOSSIL_DROPS = {
  // ── Land dinosaurs ───────────────────────────────────────────
  'tyrannosaurus-rex': [
    D('T. rex tooth', 110, 0.8, 1, 2),
    D('T. rex femur', 80, 1),
    D('T. rex skull', 240, 0.15),
  ],
  'triceratops': [
    D('Triceratops frill fragment', 55, 1),
    D('Triceratops horn', 85, 0.6),
    D('Triceratops femur', 60, 0.7),
  ],
  'brachiosaurus': [
    D('Brachiosaurus vertebra', 95, 1),
    D('Brachiosaurus femur', 120, 0.6),
    D('Brachiosaurus rib', 70, 0.7),
  ],
  'diplodocus': [
    D('Diplodocus vertebra', 90, 1),
    D('Diplodocus tail vertebra', 75, 0.8),
    D('Diplodocus rib', 65, 0.6),
  ],
  'stegosaurus': [
    D('Stegosaurus back plate', 80, 1),
    D('Stegosaurus tail spike', 95, 0.5),
    D('Stegosaurus femur', 55, 0.6),
  ],
  'ankylosaurus': [
    D('Ankylosaurus armour scute', 60, 1, 1, 2),
    D('Ankylosaurus tail club', 105, 0.5),
    D('Ankylosaurus femur', 50, 0.6),
  ],
  'velociraptor': [
    D('Velociraptor tooth', 25, 1, 1, 2),
    D('Velociraptor sickle claw', 45, 0.7),
    D('Velociraptor hand bone', 20, 0.6),
  ],
  'spinosaurus': [
    D('Spinosaurus sail spine', 100, 1),
    D('Spinosaurus tooth', 70, 0.7),
    D('Spinosaurus claw', 60, 0.5),
  ],
  'allosaurus': [
    D('Allosaurus tooth', 55, 1, 1, 2),
    D('Allosaurus claw', 45, 0.6),
    D('Allosaurus femur', 65, 0.5),
  ],
  'parasaurolophus': [
    D('Parasaurolophus femur', 55, 1),
    D('Parasaurolophus crest', 90, 0.5),
    D('Parasaurolophus rib', 40, 0.7),
  ],
  'dilophosaurus': [
    D('Dilophosaurus tooth', 30, 1),
    D('Dilophosaurus crest pair', 50, 0.5),
    D('Dilophosaurus claw', 28, 0.6),
  ],
  'pachycephalosaurus': [
    D('Pachycephalosaurus femur', 35, 1),
    D('Pachycephalosaurus dome skull', 75, 0.6),
    D('Pachycephalosaurus rib', 25, 0.6),
  ],
  'carnotaurus': [
    D('Carnotaurus tooth', 45, 1),
    D('Carnotaurus horn', 60, 0.6),
    D('Carnotaurus femur', 55, 0.5),
  ],
  'iguanodon': [
    D('Iguanodon tooth', 30, 1, 1, 2),
    D('Iguanodon thumb spike', 40, 0.6),
    D('Iguanodon femur', 50, 0.6),
  ],
  'gallimimus': [
    D('Gallimimus femur', 30, 1),
    D('Gallimimus hand bone', 20, 0.7),
    D('Gallimimus beak fragment', 22, 0.5),
  ],
  'compsognathus': [
    D('Compsognathus bone', 8, 1, 1, 2),
    D('Compsognathus tooth', 6, 0.6),
    D('Compsognathus skeleton', 60, 0.08),
  ],
  // The apex hybrids — the Bay's super-predators pay super prices.
  'indominus-rex': [
    D('Indominus tooth', 130, 1),
    D('Indominus claw', 110, 0.6),
    D('Indominus femur', 100, 0.5),
  ],
  'spinosaurus-rex': [
    D('Spinosaurus Rex sail spine', 140, 1),
    D('Spinosaurus Rex tooth', 95, 0.7),
    D('Spinosaurus Rex skull', 260, 0.12),
  ],

  // ── Flyers (pterosaurs — hollow bones, crests, beaks) ────────
  'pteranodon': [
    D('Pteranodon wing finger bone', 35, 1),
    D('Pteranodon beak', 30, 0.6),
    D('Pteranodon crest', 45, 0.4),
  ],
  'quetzalcoatlus': [
    D('Quetzalcoatlus wing finger bone', 70, 1),
    D('Quetzalcoatlus vertebra', 55, 0.7),
    D('Quetzalcoatlus beak', 50, 0.5),
  ],
  'hatzegopteryx': [
    D('Hatzegopteryx wing finger bone', 65, 1),
    D('Hatzegopteryx skull', 80, 0.4),
    D('Hatzegopteryx beak', 48, 0.5),
  ],
  'tapejara': [
    D('Tapejara wing bone', 28, 1),
    D('Tapejara crest', 55, 0.5),
    D('Tapejara beak', 20, 0.6),
  ],
  'nyctosaurus': [
    D('Nyctosaurus wing bone', 18, 1),
    D('Nyctosaurus crest', 40, 0.45),
    D('Nyctosaurus beak', 14, 0.6),
  ],
  'pterodactylus': [
    D('Pterodactylus wing bone', 12, 1),
    D('Pterodactylus tooth', 8, 0.7, 1, 2),
    D('Pterodactylus skull', 20, 0.3),
  ],
  'dimorphodon': [
    D('Dimorphodon wing bone', 12, 1),
    D('Dimorphodon skull', 22, 0.4),
    D('Dimorphodon tooth', 9, 0.7),
  ],
  'rhamphorhynchus': [
    D('Rhamphorhynchus tooth', 10, 1, 1, 2),
    D('Rhamphorhynchus wing bone', 14, 0.8),
    D('Rhamphorhynchus tail vane bone', 16, 0.4),
  ],
  'archaeopteryx': [
    D('Archaeopteryx wing bone', 6, 1),
    D('Archaeopteryx feather impression', 50, 0.25),
    D('Archaeopteryx tooth', 4, 0.6),
  ],

  // ── Marine (teeth, paddle bones — and ammonites, the sea's ───
  //    own fossils, shed by every swimmer's hunting ground) ────
  'mosasaurus': [
    D('Mosasaurus tooth', 75, 1, 1, 2),
    D('Mosasaurus paddle bone', 60, 0.6),
    D('Mosasaurus vertebra', 55, 0.7),
    D('Ammonite', 30, 0.5),
  ],
  'kronosaurus': [
    D('Kronosaurus tooth', 60, 1),
    D('Kronosaurus paddle bone', 55, 0.6),
    D('Ammonite', 30, 0.5),
  ],
  'elasmosaurus': [
    D('Elasmosaurus neck vertebra', 65, 1, 1, 2),
    D('Elasmosaurus paddle bone', 50, 0.6),
    D('Ammonite', 28, 0.5),
  ],
  'ichthyosaurus': [
    D('Ichthyosaurus vertebra', 30, 1, 1, 2),
    D('Ichthyosaurus rib', 22, 0.7),
    D('Ammonite', 25, 0.6),
  ],
  'plesiosaurus': [
    D('Plesiosaurus paddle bone', 40, 1),
    D('Plesiosaurus vertebra', 35, 0.7),
    D('Ammonite', 28, 0.5),
  ],
  'liopleurodon': [
    D('Liopleurodon tooth', 55, 1),
    D('Liopleurodon paddle bone', 42, 0.6),
    D('Ammonite', 28, 0.5),
  ],
  'tylosaurus': [
    D('Tylosaurus tooth', 70, 1, 1, 2),
    D('Tylosaurus vertebra', 50, 0.7),
    D('Ammonite', 30, 0.5),
  ],
  'megalodon': [
    D('Megalodon tooth', 95, 1, 1, 2),
    D('Megalodon vertebra', 45, 0.6),
    D('Ammonite', 30, 0.4),
  ],
};

/** The manifest entry for a slug, or null for strangers. */
export function fossilSpeciesEntry(slug) {
  return EARTH2_MODEL_BY_SLUG.get(slug) || null;
}

/** True when a kill of this species can leave fossils. */
export function isHuntableSpecies(slug) {
  return Object.hasOwn(FOSSIL_DROPS, slug);
}

/** Every huntable species slug, in roster order. */
export function huntableSpecies() {
  return EARTH2_MODELS.filter((m) => isHuntableSpecies(m.slug)).map((m) => m.slug);
}

/** The drop table for one species (a fresh copy), or null when
 *  the species drops nothing — excluded, or not a creature. */
export function fossilDropsFor(slug) {
  const drops = FOSSIL_DROPS[slug];
  if (!drops) return null;
  return drops.map((d) => ({ ...d }));
}

function typeSlug(type) {
  return String(type).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** One fossil instance, as it lands in the hunter's pack:
 *  { id, species, speciesName, type, condition, baseGold, goldValue }
 *  — the condition grade (an id from FOSSIL_CONDITIONS) and the
 *  gold value it grades to, both frozen at the kill. */
export function makeFossilInstance(slug, drop, rng = Math.random) {
  const rand = typeof rng === 'function' ? rng : Math.random;
  const entry = fossilSpeciesEntry(slug);
  const condition = rollFossilCondition(rand);
  const entropy = Math.floor(rand() * 4294967296).toString(36);
  return {
    id: `fossil-${slug}-${typeSlug(drop.type)}-${entropy}`,
    species: slug,
    speciesName: entry ? entry.name : slug,
    type: drop.type,
    condition: condition.id,
    baseGold: drop.baseGold,
    goldValue: fossilGoldValue(drop.baseGold, condition),
  };
}

/**
 * Roll what a kill leaves behind: for each drop in the species'
 * table, its chance decides whether it drops and min–max how many;
 * every individual fossil rolls its own condition grade. Returns
 * an array of fossil instances (possibly empty — a kill can come
 * up clean), or null when the species drops nothing at all.
 */
export function rollFossilDrops(slug, rng = Math.random) {
  const drops = FOSSIL_DROPS[slug];
  if (!drops) return null;
  const rand = typeof rng === 'function' ? rng : Math.random;
  const out = [];
  for (const drop of drops) {
    if (rand() >= drop.chance) continue;
    const span = Math.max(0, drop.max - drop.min);
    const count = drop.min + Math.floor(rand() * (span + 1));
    for (let i = 0; i < count; i++) out.push(makeFossilInstance(slug, drop, rand));
  }
  return out;
}

// ── The carried inventory ────────────────────────────────────────
// A pack of individual fossils — each one unique (its own grade,
// its own value), so the inventory is a list, not a count. The
// helpers mirror lib/earth2/blood-sacs.js: pure list functions,
// plus a storage-guarded reader/writer.

function sanitizeFossil(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.species !== 'string' || !raw.species) return null;
  if (typeof raw.type !== 'string' || !raw.type) return null;
  const condition = fossilConditionById(raw.condition);
  if (!condition) return null;
  const value = Math.floor(Number(raw.goldValue));
  if (!Number.isFinite(value) || value < 1) return null;
  const base = Math.floor(Number(raw.baseGold));
  const entry = fossilSpeciesEntry(raw.species);
  return {
    id: raw.id,
    species: raw.species,
    speciesName: entry ? entry.name : (typeof raw.speciesName === 'string' && raw.speciesName) || raw.species,
    type: raw.type,
    condition: condition.id,
    baseGold: Number.isFinite(base) && base > 0 ? base : value,
    goldValue: value,
  };
}

export function sanitizeFossilInventory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeFossil).filter(Boolean);
}

export function loadFossilInventory() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(FOSSIL_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeFossilInventory(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveFossilInventory(inventory) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(FOSSIL_STORAGE_KEY, JSON.stringify(sanitizeFossilInventory(inventory)));
  } catch {
    // storage unavailable — the pack just won't persist
  }
}

/** Add freshly dropped fossils to the pack. Returns the new list. */
export function addFossils(inventory, fossils) {
  const list = sanitizeFossilInventory(inventory);
  const fresh = sanitizeFossilInventory(fossils);
  return [...list, ...fresh];
}

/** One held fossil by its instance id, or null. */
export function findFossil(inventory, fossilId) {
  return sanitizeFossilInventory(inventory).find((f) => f.id === fossilId) || null;
}

/** Remove one fossil from the pack (Hammond took it). Returns the
 *  new list — unchanged when the id is not held. */
export function removeFossil(inventory, fossilId) {
  return sanitizeFossilInventory(inventory).filter((f) => f.id !== fossilId);
}

/** How many fossils the pack holds. */
export function countFossils(inventory) {
  return sanitizeFossilInventory(inventory).length;
}
