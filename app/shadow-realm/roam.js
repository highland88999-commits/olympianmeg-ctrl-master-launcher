// app/shadow-realm/roam.js — open-world GRID free-roam helpers.
//
// Pure JavaScript (no JSX, no Three.js) so the headless test suite can
// import it directly. Roam mode = the infinite grid with NO track: no track
// mesh, no barrier walls, no lap tracker, no finish line, no finish
// screen. The rider spawns at the grid origin facing +Z (the Rig's nose
// convention) and rides anywhere — the GridGround + fog read as infinite.
//
// The regen boost pipeline (boostCharge -> SURGE_SECS in lib/bike-motion)
// is mode-independent by design: it keeps charging everywhere on the
// grid — "regenerative land", not just the track corridor.

export function isRoam(mode) {
  return mode === 'roam';
}

// Deterministic spawn pose: dead center of the infinite grid, facing +Z.
export function roamSpawn() {
  return { x: 0, z: 0, heading: 0 };
}

// Mode gating: one decision per concern, all driven by isRoam.
export function shouldRenderTrack(mode) {
  return !isRoam(mode);
}

export function shouldTrackLaps(mode) {
  return !isRoam(mode) && mode === 'race';
}

export function shouldResolveBarriers(mode) {
  return !isRoam(mode);
}
