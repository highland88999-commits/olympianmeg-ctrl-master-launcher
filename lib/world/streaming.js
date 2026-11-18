// lib/world/streaming.js
// ENDLESS FREE ROAM — shared streaming-terrain law (Merlin, Nov 18,
// 2026: "make all 3d worlds infinite space too", like Mars 2).
// Mars 2's pattern (lib/mars2/streaming.js), generalised: the ground
// streams in square chunks around the observer, generated from the
// world's own pure height function — what you see is exactly what
// you walk on, everywhere, with no edge, no wall, no turn-back.
//
// Pure law only: no React, no three.js objects — the zone turns a
// chunk's height field into a BufferGeometry. Chunk geometry is built
// in chunk-local coordinates (vertices 0..chunkM) with the world
// offset on the mesh, so GPU precision never degrades with distance;
// walker/vehicle/ship math stays float64 on the CPU.
//
// Per-world presets (measured Nov 18, 2026 — see the wave-3 STATE):
//   MIDDLE-EARTH: 128 m chunks, 64 tiles (2 m/vertex), radius 4
//     (9x9 = 81 chunks, 1152 m ring). The fog is light (0.0016), so
//     the ring is wide: its edge sits 576 m out, ~43% fogged — the
//     Mars-2-accepted figure. 2 m vertices hold the old disc's own
//     fidelity on every pod (canyon pods 0.27-0.40 m vs the disc's
//     0.30; non-canyon <= 0.06); 4 m reads 0.84-1.23 m on canyon
//     walls, so 2 m it is. 1 chunk/frame (worst chunk build 7 ms).
//   STAR WARS walk: 32 m chunks, 32 tiles (1 m/vertex), radius 7
//     (15x15 = 225 chunks, 480 m ring). The fog is heavy (0.0075+),
//     so the ring edge at 240 m is ~4% visible — invisible. 1 m
//     vertices are REQUIRED on the canyon world: 2 m reads 0.353 m
//     on Tatooine's carve wall (the suite pins 0.2 m); 1 m reads
//     0.108 m. 32 m chunks keep the worst build at 3.7 ms, so
//     2 chunks/frame stays smooth even racing a pod.
// UVs are in DISC space (u = wx / (2 * worldRadius) + 0.5) with the
// zone's existing texture repeat, so the tiling is byte-identical
// to the old radial disc in the home region — the maps already use
// RepeatWrapping, so UVs outside 0..1 tile on forever.

export const ME_STREAM = { chunkM: 128, tiles: 64, radiusChunks: 4, perFrame: 1 };
export const SW_STREAM = { chunkM: 32, tiles: 32, radiusChunks: 7, perFrame: 2 };

// Which chunk a world point belongs to (floors for negatives too).
export function chunkFor(x, z, chunkM) {
  return { cx: Math.floor(x / chunkM), cz: Math.floor(z / chunkM) };
}

export function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

// World bounds of a chunk: [x0, z0] is its near corner.
export function chunkBounds(cx, cz, chunkM) {
  return { x0: cx * chunkM, z0: cz * chunkM, x1: (cx + 1) * chunkM, z1: (cz + 1) * chunkM };
}

// The chunks around a world point, centre first (a ring of
// radiusChunks in each direction). Centre-first matters: when the
// observer crosses a chunk boundary the nearest ground builds
// first, so the walker never stands on a gap.
export function chunksAround(x, z, chunkM, radiusChunks) {
  const { cx, cz } = chunkFor(x, z, chunkM);
  const out = [];
  for (let ring = 0; ring <= radiusChunks; ring++) {
    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        out.push({ cx: cx + dx, cz: cz + dz, key: chunkKey(cx + dx, cz + dz) });
      }
    }
  }
  return out;
}

// Set difference for a ring move: which chunks to load, which to
// drop. Both lists come back in the same centre-first order the
// ring was built in.
export function chunkSetDiff(oldKeys, newKeys) {
  const oldSet = new Set(oldKeys);
  const newSet = new Set(newKeys);
  return {
    load: newKeys.filter((k) => !oldSet.has(k)),
    drop: oldKeys.filter((k) => !newSet.has(k)),
  };
}

// The height field for one chunk, in chunk-local coordinates:
// positions are (x, height, z) with x/z in 0..chunkM; UVs are the
// old disc's UVs (world / (2 * worldRadius) + 0.5), continuous
// across chunk borders, so the ground texture never seams and the
// home region renders exactly as the disc did. Indices wind so
// face normals point +Y.
export function chunkHeightField(heightAt, cx, cz, opts) {
  const o = opts || {};
  const chunkM = o.chunkM || 64;
  const tiles = o.tiles || 32;
  const worldRadius = o.worldRadius || 340;
  const step = chunkM / tiles;
  const n = tiles + 1;
  const positions = new Float32Array(n * n * 3);
  const uvs = new Float32Array(n * n * 2);
  const indices = new Uint16Array(tiles * tiles * 6);
  const { x0, z0 } = chunkBounds(cx, cz, chunkM);
  let vi = 0;
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const lx = ix * step;
      const lz = iz * step;
      const wx = x0 + lx;
      const wz = z0 + lz;
      positions[vi * 3] = lx;
      positions[vi * 3 + 1] = heightAt(wx, wz);
      positions[vi * 3 + 2] = lz;
      uvs[vi * 2] = wx / (2 * worldRadius) + 0.5;
      uvs[vi * 2 + 1] = wz / (2 * worldRadius) + 0.5;
      vi++;
    }
  }
  let ii = 0;
  for (let iz = 0; iz < tiles; iz++) {
    for (let ix = 0; ix < tiles; ix++) {
      const a = iz * n + ix;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices[ii++] = a;
      indices[ii++] = c;
      indices[ii++] = b;
      indices[ii++] = b;
      indices[ii++] = c;
      indices[ii++] = d;
    }
  }
  return { positions, uvs, indices };
}
