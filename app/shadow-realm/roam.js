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

// ---------------------------------------------------------------------------
// Endless grid (Merlin, Nov 18, 2026 — the grid has no edge): the roam
// ground streams in chunks around the camera, so the bike never rides
// off the end of the old fixed 2400 m plane. Pure law, no three.js —
// the scene turns a chunk into a plane + grid lines. Chunks are flat
// (the grid has no heightfield), so the law is just the ring math.
// ---------------------------------------------------------------------------

export const GRID_CHUNK_M = 400;
// 5x5 = 25 chunks, 2000 m of grid around the camera. Fog (140–950 m)
// has fully swallowed the ring edge (±1000 m) before it can read as
// a wall; the old plane ended at ±1200 m, already past full fog.
export const GRID_STREAM_RADIUS_CHUNKS = 2;
export const GRID_STREAM_CHUNK_COUNT = (2 * GRID_STREAM_RADIUS_CHUNKS + 1) ** 2;

// Which chunk a world point belongs to (floors for negatives too).
export function gridChunkFor(x, z) {
  return { cx: Math.floor(x / GRID_CHUNK_M), cz: Math.floor(z / GRID_CHUNK_M) };
}

export function gridChunkKey(cx, cz) {
  return `${cx},${cz}`;
}

// World bounds of a chunk: [x0, z0] is its near corner.
export function gridChunkBounds(cx, cz) {
  return { x0: cx * GRID_CHUNK_M, z0: cz * GRID_CHUNK_M, x1: (cx + 1) * GRID_CHUNK_M, z1: (cz + 1) * GRID_CHUNK_M };
}

// The chunks around a world point, centre first.
export function gridChunksAround(x, z) {
  const { cx, cz } = gridChunkFor(x, z);
  const out = [];
  for (let ring = 0; ring <= GRID_STREAM_RADIUS_CHUNKS; ring++) {
    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        out.push({ cx: cx + dx, cz: cz + dz, key: gridChunkKey(cx + dx, cz + dz) });
      }
    }
  }
  return out;
}

// Set difference for a ring move: which chunks to load, which to drop.
export function gridChunkSetDiff(oldKeys, newKeys) {
  const oldSet = new Set(oldKeys);
  const newSet = new Set(newKeys);
  return {
    load: newKeys.filter((k) => !oldSet.has(k)),
    drop: oldKeys.filter((k) => !newSet.has(k)),
  };
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
