// lib/earth/swim.js — swimming, diving, resurfacing for the hub
// Earth street walker (Merlin, 2026-10-20: "when in water, enable
// swimming and diving and resurfacing").
//
// Pure state + math, no DOM, no THREE — headless-testable, same
// discipline as lib/earth/roam.js and lib/earth/parachute.js. The
// swim state lives ON the roam state (roamState.swim, created by
// createRoamState) so every consumer reads one session object.
//
// The model:
// - Water is where the heightmap says ocean: the terrain surface
//   radius sits BELOW the base globe radius (sea level). Depth at
//   a point = (TERRAIN_RADIUS − surfaceRadiusAt) in display metres.
// - Walking in past WADE_ENTER_M of water switches the walker to
//   SWIM mode: he floats at the surface (feet FLOAT_DRAFT_M under
//   the waterline) and the move controls swim him around.
// - DIVE (held) sinks him; SURFACE (held) raises him; the dive
//   floor is the SEABED — the land layer stays the absolute
//   cutoff, so submerge is clamped to keep his feet at or above
//   the seabed surface he stands over.
// - Walking onto rising ground (depth < WADE_EXIT_M) ends swim
//   mode by itself. Hysteresis between enter/exit depths keeps
//   the shoreline from flickering the mode.
// - Everything vertical is in DISPLAY METRES at scale 1; the
//   scene layer multiplies by the Ant-Man scale like every other
//   roam quantity (the swimmer shrinks with the world — a
//   micrometre swimmer in a micrometre puddle).
import { surfaceRadiusAt, DISPLAY_UNITS_PER_METRE } from './placements.js';
import { TERRAIN_RADIUS } from '../terrain.js';

/** Water deeper than this (display metres) starts swimming. */
export const WADE_ENTER_M = 0.9;
/** Water shallower than this ends swimming (hysteresis). */
export const WADE_EXIT_M = 0.7;
/** How far the floating swimmer's feet sit under the waterline. */
export const FLOAT_DRAFT_M = 1.15;
/** Vertical swim speed, display metres per second. */
export const SWIM_VERTICAL_SPEED_M = 1.6;
/** Horizontal speed multiplier while swimming (a swim pace). */
export const SWIM_SPEED_FACTOR = 0.55;
/** The dive floor keeps the feet this far above the seabed. */
export const SEABED_CLEARANCE_M = 0.05;

/** A fresh swim sub-state (embedded in the roam state). */
export function createSwimState() {
  return {
    active: false, // swimming (surface or submerged)
    submergeM: 0, // held depth below the floating position, metres
    depthM: 0, // water depth under the walker, metres (<= 0 on land)
    altM: 0, // rig lift above the seabed point, metres (scene input)
  };
}

/** Water depth in display metres at lat/lon. Positive in water
 *  (the seabed that far below sea level), <= 0 on land (terrain
 *  that far above it). Without height data there is no water. */
export function waterDepthM(heightData, w, h, lat, lon) {
  if (!heightData) return 0;
  const r = surfaceRadiusAt(heightData, w, h, lat, lon);
  return (TERRAIN_RADIUS - r) / DISPLAY_UNITS_PER_METRE;
}

/** The rig lift (metres above the seabed surface point) for a swim
 *  state in water of depthM: floating puts the feet FLOAT_DRAFT_M
 *  under the waterline; submerge sinks from there; the lift never
 *  goes below 0 (feet on the seabed = the dive floor). */
export function swimAltMFor(swim, depthM) {
  if (!swim || depthM <= 0) return 0;
  return Math.max(0, depthM - FLOAT_DRAFT_M - (swim.submergeM || 0));
}

/** The deepest submerge allowed in water of depthM: sink until the
 *  feet rest SEABED_CLEARANCE_M above the seabed. */
export function maxSubmergeM(depthM) {
  return Math.max(0, depthM - FLOAT_DRAFT_M - SEABED_CLEARANCE_M);
}

/** The underwater veil's opacity for one frame (components/
 *  UnderwaterVeil.jsx). Round 3 keyed the veil on the CAMERA
 *  alone, so a submerged swimmer whose boom lifted the lens near
 *  the surface read as open air — pale sky, flickering wash
 *  (round 4, defect 7). The veil now answers to the SWIMMER too:
 *  - neither submerged nor camera under → 0 (veil hidden)
 *  - camera under, swimmer at the surface → the round-3 wash
 *  - swimmer submerged → the wash deepens with held depth, so a
 *    dive reads as water at any camera seat; if the lens is up in
 *    the air while the swimmer is down, the wash still applies
 *    (you are looking AT a submerged world through his dive). */
export function veilOpacityFor({ camUnder, submergeM } = {}) {
  const sub = Math.max(0, submergeM || 0);
  if (!camUnder && sub <= 0.05) return 0;
  const byDepth = 0.3 + Math.min(0.22, sub * 0.035);
  return camUnder ? Math.max(0.3, byDepth) : byDepth;
}

/**
 * Advance the swim state one frame. Mutates and returns
 * state.swim.
 * @param state  the roam state (reads state.lat/lon, writes .swim)
 * @param input  { dive, surface } — held-button booleans
 * @param dt     seconds
 * @param heightData/w/h  the decoded heightmap (null = no water)
 * @param opts.frozen     true while another system owns vertical
 *                        motion (bike mounted): the state is left
 *                        completely alone — the bike keeps its own
 *                        altitude story in the water, as before.
 * @param opts.suspended  true while the traveler is shrunk into
 *                        the Quantum Realm (Ant-Man scale < 0.5).
 *                        Swimming is a normal-size phenomenon: the
 *                        parachute dive SUSPENDS it — the state is
 *                        cleared (not frozen), the dive/surface
 *                        inputs are inert, and the console's swim
 *                        controls stand down (Earth round 4: the
 *                        realm ran a whole dive with live ▲/▼ DIVE
 *                        buttons and a "6.4 M DOWN" readout at
 *                        micrometre scale). depthM keeps tracking
 *                        the real water so growing back re-derives
 *                        a sane state on its own: still in water
 *                        past the wade threshold → surface swim,
 *                        dive depth reset to zero.
 */
export function stepSwim(state, input, dt, heightData, w, h, opts = {}) {
  const swim = state.swim || (state.swim = createSwimState());
  if (opts.suspended) {
    swim.depthM = heightData ? waterDepthM(heightData, w, h, state.lat, state.lon) : 0;
    swim.active = false;
    swim.submergeM = 0;
    swim.altM = 0;
    return swim;
  }
  if (opts.frozen || !(dt > 0)) {
    swim.depthM = heightData ? waterDepthM(heightData, w, h, state.lat, state.lon) : 0;
    swim.altM = swim.active ? swimAltMFor(swim, swim.depthM) : 0;
    return swim;
  }
  const depthM = waterDepthM(heightData, w, h, state.lat, state.lon);
  swim.depthM = depthM;

  if (!swim.active) {
    if (depthM >= WADE_ENTER_M) {
      swim.active = true;
      swim.submergeM = 0;
    }
  } else if (depthM < WADE_EXIT_M) {
    // Rising ground: walk out. The lift eases to 0 on its own as
    // the water shallows (depth − draft goes negative), so the
    // exit never pops.
    swim.active = false;
    swim.submergeM = 0;
  }

  if (swim.active) {
    const maxSub = maxSubmergeM(depthM);
    let sub = swim.submergeM || 0;
    if (input?.dive) sub += SWIM_VERTICAL_SPEED_M * dt;
    if (input?.surface) sub -= SWIM_VERTICAL_SPEED_M * dt;
    swim.submergeM = Math.min(maxSub, Math.max(0, sub));
    swim.altM = swimAltMFor(swim, depthM);
  } else {
    swim.submergeM = 0;
    swim.altM = 0;
  }
  return swim;
}
