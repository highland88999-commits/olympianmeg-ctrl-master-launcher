// lib/jupiter2/models.js — the REAL creature models for Jupiter 2
// (Merlin, Nov 15 ~14:44: no more WebGL placeholders).
//
// The models already exist elsewhere in the repo — this file only
// records WHICH ones Jupiter 2 uses and how big they stand here.
// Nothing here builds a model: the demobats come through the
// Hawkins loader (lib/hawkins/loader.js, instantiateHawkins) and
// the lightning monsters through the Monsterverse drop-in loader
// (app/hollow-earth/model-loader.js, kickOffGlb). Both loaders are
// imported by the scene; this file is the roster they read.
//
// LIGHTNING MONSTERS — the Monsterverse lightning-element families
// with a placed GLB on disk (verified Nov 15: all six exist under
// public/models/hollow-earth/, none truncated). Names, blurbs and
// heights are the families' own (families.js / spawns.js scaleM) —
// Jupiter 2 keeps each model true to its own design height.
//   slot-19 Volta — the lightning demon (2.2 m)
//   slot-20 Auric Storm — the golden lightning monster (2.0 m)
//   slot-17 Howler — the tornado monster, storm seat (3.0 m)
//   sky-dragon Stormwing — the storm dragon (3.2 m)
//   aureline Aureline the Dawnscale — the fantasy dragon (3.4 m)
//   eagle-talon Liberty 'Lib' Talon — the bald eagle (1.8 m)
// Seven deck slots, six distinct models: Volta stands twice (the
// second at a larger scale — the scene varies it), because
// slot-16 Storm Herald and slot-39 Storm Roarer have NO GLB on
// disk (verified missing Nov 15) — they cannot be used until
// Merlin re-sends them, so no placeholder stands in for them.
//
// DEMOBATS — the Hawkins demobats GLB (public/models/hawkins/
// demobats.glb, 596,080 bytes, 78-joint humanoid-retarget rig —
// its arm chains skin the wings and the Hawkins rig flaps them).
// The Hawkins loader normalizes the model to its manifest height
// (7 Hawkins units); Jupiter 2 stands it 2.0 m tall (worker's
// choice — the procedural bat it replaces spanned ~4.4 m, and a
// 2 m bat still reads from the deck while the bats circle at
// 13–17 m). The scene derives the scale from the manifest so a
// manifest change carries through.

import { modelUrlFor } from '../../app/hollow-earth/models.js';

export { modelUrlFor };

export const LIGHTNING_MONSTER_MODELS = [
  { key: 'slot-19', name: 'Volta', heightM: 2.2, blurb: 'Cyan-glowing leader of the volt pack, throwing bolts from range.' },
  { key: 'slot-20', name: 'Auric Storm', heightM: 2.0, blurb: 'Golden, hunched, claws out, lightning at its back.' },
  { key: 'slot-17', name: 'Howler', heightM: 3.0, blurb: 'A winged storm-head lurking in the clouds — the strike comes from above.' },
  { key: 'sky-dragon', name: 'Stormwing', heightM: 3.2, blurb: 'A storm dragon riding the high winds, striking from above.' },
  { key: 'aureline', name: 'Aureline the Dawnscale', heightM: 3.4, blurb: 'Hoards sunrises, not gold — bright, brassy, laughter like breaking light.' },
  { key: 'eagle-talon', name: "Liberty 'Lib' Talon", heightM: 1.8, blurb: 'Sees everything, judges most of it, shares the good thermals.' },
  // Second Volta: six distinct real models, seven deck slots.
  { key: 'slot-19', name: 'Volta', heightM: 2.2, blurb: 'Cyan-glowing leader of the volt pack, throwing bolts from range.' },
];

/** The lightning-monster model for deck slot `index`. */
export function lightningModelFor(index) {
  return LIGHTNING_MONSTER_MODELS[index % LIGHTNING_MONSTER_MODELS.length];
}

// Demobats: one Hawkins model, nine instances (the count is
// LIGHTNING_MONSTER_COUNT's twin, DEMOBAT_COUNT in profile.js).
export const DEMOBAT_MODEL_ID = 'demobats';
export const DEMOBAT_HEIGHT_M = 2.0; // worker's choice — see header
