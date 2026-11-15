// World Engine datasheet — CHARACTER BUILDER (/world-engine/characters).
//
// WHAT READS IT: lib/world-engine/sectors.js (CHARACTER_SLIDERS),
// lib/world-engine/useEngineStore.js (CHARACTER_STORE_DEFAULTS +
// CREATURE_STORE_DEFAULTS), components/world-engine/MiniViewport.jsx
// (capsule preview: CapsuleGeometry(0.5, height, 4, 16), chest Omega badge),
// lib/world-engine/life-seed.js + life-render.js (creature archetypes and
// bauplans — re-exported here so the builder and the life layer share one
// vocabulary), lib/characters/forge-queue.js (the Tripo model queue —
// RELATED, not read by this builder: see QUEUE_NOTE below).
//
// WHERE EVERY ENTRY CAME FROM:
// - CHARACTER_STORE_DEFAULTS / CREATURE_STORE_DEFAULTS:
//   lib/world-engine/useEngineStore.js defaultCharacter / defaultCreature.
// - CHARACTER_SLIDERS: lib/world-engine/sectors.js SECTORS.characters.
// - ANIMATION_SETS: the store's defaultCharacter.animationSet is 'idle'
//   and NO other animation name appears anywhere in the World Engine
//   code — so the evidenced set is exactly ['idle']. See GAP below.
// - FAUNA_ARCHETYPES / LIFE_FAUNA / bauplan shape: life-seed.js
//   (10 archetypes; built-in planets have 6, user worlds get 4 more:
//   darter, leviathan, weaver, mimic) and life-render.js
//   (bauplan: bodyLength 0.4–2.5, bodyWidth 0.3–1.2, limbCount 0–8,
//   limbLength 0.2–1.5, stance 0–1, surface smooth/armored/frilled/
//   translucent; social solitary/pair/herd/swarm; count 4–24; size 0.5–2.0;
//   speed 0.2–2.0).
// - CHARACTER_KINDS: derived from the store itself, which carries BOTH a
//   `character` slice (humanoid) and a `creature` slice — the builder's
//   prompt covers "characters and creatures" (sectors.js tagline).
// - COST: lib/world-engine/economy.js COST_MAP.character (200) and
//   COST_MAP.creature (200) — both 200 Aether.
// - CHARACTER_PRESETS / CREATURE_PRESETS: WORKER'S CHOICE — no presets
//   existed in code. Humanoid presets stay inside the height slider
//   (0.5–5 m); creature presets use only FAUNA_ARCHETYPES with bauplan
//   numbers inside life-seed.js's own ranges.
//
// GAP (code shows it, no fix invented): the synthesis API sends ONE
// generic environment instruction (lib/world-engine/gemini.js
// SYSTEM_INSTRUCTION) for every non-weapon category, and
// applyAestheticEngine() returns only the 10 environment keys — so a
// character/creature synthesis today comes back as environment params and
// the character slice is effectively untouched by AI. A character-aware
// system instruction + a character branch in the aesthetic engine would
// be needed before AI character generation does anything. Flagged for
// Merlin's call; this sheet records the data the builder needs either way.
//
// QUEUE_NOTE: lib/characters/forge-queue.js is the Tripo rigged-GLB
// queue (68 entries, 50 needing new generation, Tripo balance 10 credits
// last verified Nov 14 — generation blocked on a top-up, Merlin's call).
// This builder outputs PARAMETERS, not GLB models, so it cannot replace a
// stand-in with a model; the queue and this builder are complementary,
// not the same path.

import { costFor } from '../economy.js';
import { FAUNA_ARCHETYPES, LIFE_FAUNA } from '../life-seed.js';

export { FAUNA_ARCHETYPES, LIFE_FAUNA };

export const BUILDER = {
  id: 'characters',
  sectorKey: 'characters',
  route: '/world-engine/characters',
  name: 'Character Builder',
  category: 'character',
  accent: '#ff00ff',
  costAether: costFor('character'),
  creatureCostAether: costFor('creature'),
  storeKey: 'character',
  storeSetter: 'setCharacterDimensions',
};

/** Humanoid vs creature — the two slices the store carries for this builder. */
export const CHARACTER_KINDS = [
  { id: 'humanoid', label: 'Humanoid', storeKey: 'character', preview: 'capsule', note: 'Procedural capsule preview in MiniViewport; height-driven.' },
  { id: 'creature', label: 'Creature', storeKey: 'creature', preview: 'bauplan', note: 'Procedural bauplan body in life-render.js; archetype-driven.' },
];

/** Animation sets — only 'idle' is evidenced anywhere in World Engine code. */
export const ANIMATION_SETS = ['idle'];

/** Body surfaces — from life-render.js buildFaunaSpecimen(). */
export const BODY_SURFACES = ['smooth', 'armored', 'frilled', 'translucent'];

/** Social structures — from life-seed.js generateLifeSeed(). */
export const SOCIAL_STRUCTURES = ['solitary', 'pair', 'herd', 'swarm'];

/** Creature size classes — only 'medium' is evidenced (store default). */
export const SIZE_CLASSES = ['tiny', 'small', 'medium', 'large', 'huge'];
export const SIZE_CLASS_EVIDENCED = ['medium'];

/**
 * Bauplan ranges — from generateLifeSeed() in life-seed.js. These are the
 * ranges the seed generator itself draws from, so presets inside them are
 * consistent with seed-grown life.
 */
export const BAUPLAN_RANGES = {
  bodyLength: { min: 0.4, max: 2.5 },
  bodyWidth: { min: 0.3, max: 1.2 },
  limbCount: { min: 0, max: 8, step: 1 },
  limbLength: { min: 0.2, max: 1.5 },
  stance: { min: 0, max: 1 },
  count: { min: 4, max: 24, step: 1 },
  size: { min: 0.5, max: 2.0 },
  speed: { min: 0.2, max: 2.0 },
};

/** Proportions — the store's shape; no clamp exists in code (see GAP note). */
export const PROPORTION_PARTS = ['head', 'torso', 'limbs'];
export const PROPORTION_RANGE = { min: 0.5, max: 2.0 };

/** Aggression — store default 0.5; no clamp exists in code (worker's choice 0–1). */
export const AGGRESSION_RANGE = { min: 0, max: 1 };

/** Store defaults — was defaultCharacter in useEngineStore.js. */
export const CHARACTER_STORE_DEFAULTS = {
  scale: { x: 1, y: 1, z: 1 },
  height: 1.8,
  proportions: { head: 1, torso: 1, limbs: 1 },
  position: { x: 0, y: 0, z: 0 },
  rotation: { y: 0 },
  color: '#ffffff',
  animationSet: 'idle',
};

/** Store defaults — was defaultCreature in useEngineStore.js. */
export const CREATURE_STORE_DEFAULTS = {
  scale: { x: 1, y: 1, z: 1 },
  sizeClass: 'medium',
  aggression: 0.5,
  color: '#00ff00',
};

/** Sliders — was SECTORS.characters.sliders in sectors.js. */
export const CHARACTER_SLIDERS = [
  { key: 'height', label: 'Height', min: 0.5, max: 5, step: 0.1, default: 1.8, format: (v) => `${v.toFixed(1)} m` },
];

/** Preview geometry — MiniViewport.jsx character case. */
export const CHARACTER_PREVIEW = {
  geometry: 'CapsuleGeometry',
  radius: 0.5,
  capSegments: 4,
  radialSegments: 16,
  badge: { size: 0.35, position: [0, 0.55, 0.52], note: 'Omega badge on the chest' },
  restHeight: (height) => height / 2 + 0.25,
};

/**
 * CHARACTER_PRESETS — WORKER'S CHOICE (no presets existed in code).
 * Heights inside the 0.5–5 m slider; proportions inside 0.5–2.0.
 */
export const CHARACTER_PRESETS = [
  { id: 'wayfarer', name: 'Wayfarer', description: 'An everyday traveller — average height, even build.', params: { height: 1.8, proportions: { head: 1, torso: 1, limbs: 1 }, color: '#ffffff', animationSet: 'idle' } },
  { id: 'sprite', name: 'Sprite', description: 'Small and quick — a pocket-sized companion.', params: { height: 0.9, proportions: { head: 1.3, torso: 0.9, limbs: 1.1 }, color: '#7fd4ff', animationSet: 'idle' } },
  { id: 'guardian', name: 'Guardian', description: 'Tall, broad, built to stand at a gate.', params: { height: 2.6, proportions: { head: 0.9, torso: 1.4, limbs: 1.1 }, color: '#c9a86a', animationSet: 'idle' } },
  { id: 'titan', name: 'Titan', description: 'Near the top of the scale — a living monument.', params: { height: 4.2, proportions: { head: 0.8, torso: 1.5, limbs: 1.2 }, color: '#8a8f98', animationSet: 'idle' } },
  { id: 'wisp', name: 'Wisp', description: 'Slight frame, long limbs — barely there at all.', params: { height: 1.5, proportions: { head: 1, torso: 0.8, limbs: 1.6 }, color: '#c084fc', animationSet: 'idle' } },
];

/**
 * CREATURE_PRESETS — WORKER'S CHOICE (no presets existed in code).
 * Archetypes from FAUNA_ARCHETYPES; bauplan numbers inside life-seed.js
 * ranges; sizeClass/aggression inside the ranges above.
 */
export const CREATURE_PRESETS = [
  { id: 'plains-grazer', name: 'Plains Grazer', description: 'Herd herbivore, calm and steady.', params: { archetype: 'grazer', bauplan: { bodyLength: 1.8, bodyWidth: 0.8, limbCount: 4, limbLength: 0.9, stance: 0.5, surface: 'smooth' }, color: '#3d8b4f', accent: '#d9c05b', count: 12, size: 1.0, speed: 0.6, social: 'herd' }, sizeClass: 'large', aggression: 0.1 },
  { id: 'shadow-stalker', name: 'Shadow Stalker', description: 'Solitary predator — low-slung, armored, patient.', params: { archetype: 'stalker', bauplan: { bodyLength: 2.2, bodyWidth: 0.7, limbCount: 4, limbLength: 1.1, stance: 0.3, surface: 'armored' }, color: '#2b2f36', accent: '#ff5500', count: 4, size: 1.4, speed: 1.6, social: 'solitary' }, sizeClass: 'large', aggression: 0.9 },
  { id: 'sky-flyer', name: 'Sky Flyer', description: 'Wings overhead — a creature of the open air.', params: { archetype: 'flyer', bauplan: { bodyLength: 1.2, bodyWidth: 0.5, limbCount: 2, limbLength: 0.6, stance: 0.7, surface: 'smooth' }, color: '#7fd4ff', accent: '#ffffff', count: 8, size: 1.0, speed: 1.8, social: 'swarm' }, sizeClass: 'medium', aggression: 0.2 },
  { id: 'deep-leviathan', name: 'Deep Leviathan', description: 'Massive slow titan — the life-render scales it 2.2x.', params: { archetype: 'leviathan', bauplan: { bodyLength: 2.5, bodyWidth: 1.2, limbCount: 0, limbLength: 0.2, stance: 0.2, surface: 'armored' }, color: '#0a2a5e', accent: '#2dd4bf', count: 4, size: 2.0, speed: 0.2, social: 'solitary' }, sizeClass: 'huge', aggression: 0.4 },
  { id: 'mimic', name: 'Mimic', description: 'Camouflaged ambusher — translucent, still, then gone.', params: { archetype: 'mimic', bauplan: { bodyLength: 1.0, bodyWidth: 0.6, limbCount: 6, limbLength: 0.7, stance: 0.4, surface: 'translucent' }, color: '#6b21a8', accent: '#c084fc', count: 6, size: 0.8, speed: 0.5, social: 'solitary' }, sizeClass: 'small', aggression: 0.6 },
  { id: 'swarm-darter', name: 'Swarm Darter', description: 'Fast, small, everywhere at once.', params: { archetype: 'darter', bauplan: { bodyLength: 0.5, bodyWidth: 0.3, limbCount: 4, limbLength: 0.4, stance: 0.6, surface: 'smooth' }, color: '#ffd700', accent: '#ff5500', count: 24, size: 0.5, speed: 2.0, social: 'swarm' }, sizeClass: 'tiny', aggression: 0.3 },
];
