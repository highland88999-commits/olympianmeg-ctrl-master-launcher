// lib/earth/swim.js — REMOVED 2026-10-26 (Earth 1 water removal).
//
// Earth 1 has no water: no oceans, lakes, or rivers, and no
// swimming, diving, resurfacing, buoyancy, or splash physics.
// The exposed seabed is ordinary walkable terrain — the walker
// stands on the heightmap surface everywhere, at normal walk
// pace, with no lift off the ground.
//
// This module is kept as an inert stub, NOT deleted, so existing
// importers keep resolving: every function now reports dry land
// (depth 0, lift 0, veil opacity 0, swim never active) and every
// step is a no-op that clears the state. Callers that matter
// (lib/earth/roam.js, components/EarthWalker.jsx,
// components/EarthFlightController.jsx, components/EarthConsole.jsx)
// no longer consult the swim state at all; the stub exists only
// so nothing breaks if a stale import remains.
//
// The constants below are retained for import compatibility
// only — they are no longer consulted by any live code path.
// Earth 2 water is untouched: it lives under separate governance
// (app/earth-2/**, lib/earth2/**) and never imports this module.

/** Retained for import compatibility; no longer consulted. */
export const WADE_ENTER_M = 0.9;
/** Retained for import compatibility; no longer consulted. */
export const WADE_EXIT_M = 0.7;
/** Retained for import compatibility; no longer consulted. */
export const FLOAT_DRAFT_M = 1.15;
/** Retained for import compatibility; no longer consulted. */
export const SWIM_VERTICAL_SPEED_M = 1.6;
/** Retained for import compatibility; no longer consulted. */
export const SWIM_SPEED_FACTOR = 0.55;
/** Retained for import compatibility; no longer consulted. */
export const SEABED_CLEARANCE_M = 0.05;

/** A fresh swim sub-state: always dry, never active. */
export function createSwimState() {
  return {
    active: false,
    submergeM: 0,
    depthM: 0,
    altM: 0,
  };
}

/** Water depth is always 0 on Earth 1: there is no water. */
export function waterDepthM() {
  return 0;
}

/** Rig lift from swimming is always 0: the walker stands on the ground. */
export function swimAltMFor() {
  return 0;
}

/** No dive is possible: the deepest submerge is 0. */
export function maxSubmergeM() {
  return 0;
}

/** The underwater veil never shows: there is no water to be under. */
export function veilOpacityFor() {
  return 0;
}

/**
 * Advance the swim state one frame. No-op: clears the state to
 * dry land and returns it. dive/surface inputs are ignored.
 */
export function stepSwim(state) {
  const swim = state.swim || (state.swim = createSwimState());
  swim.active = false;
  swim.submergeM = 0;
  swim.depthM = 0;
  swim.altM = 0;
  return swim;
}
