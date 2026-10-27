// lib/earth/street-flat.js — street-level flat mode (Merlin, 2026-10-26:
// "Make the earth surface flat... no more of this up and down stuff").
//
// When active, every street-level ground reading returns the same
// constant radius (TERRAIN_RADIUS, the sea-level sphere) instead of
// the heightmap displacement: the walker, bike, car, camera rig,
// street patch, lens drape, and every placed asset all agree on
// one flat floor, so nothing pitches, bobs, or sinks. Orbit/globe
// code never enables this — NexusEarth sets it only while roaming
// (diving_to_street / earth_roam) and clears it on phase change
// and unmount — so the orbit view keeps its real relief exactly.
//
// Deliberately a tiny mutable singleton, same pattern as roamState:
// the ground samplers in placements.js are pure functions used by
// tests, and they read this flag (default OFF, so every existing
// test pins the real terrain unchanged). Tests that cover flat
// mode enable it explicitly and restore it in a finally block.
let active = false;

/** Enable or disable street-level flat mode. */
export function setStreetFlatActive(v) {
  active = !!v;
}

/** True while street-level flat mode is on. */
export function isStreetFlatActive() {
  return active;
}
