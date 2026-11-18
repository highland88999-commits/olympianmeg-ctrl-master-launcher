// tests/earth2-endless.test.mjs
// EARTH 2 ENDLESS FREE ROAM (Merlin, Nov 18, 2026) — no edge, no
// wall, no turn-back. Run: node --test tests/earth2-endless.test.mjs
//
// The law, not the pixels: chunks tile the plane without gaps or
// seams; the heightfield runs past the parcel grid as open sea;
// the walker and the vehicles drive out past the old ±696 m wall
// and keep going; a reloaded wilderness position stands; the
// parcels stay exactly where they are — the registry is the HOME
// REGION, nothing beyond the grid is ownable, claimable or
// rentable; the scene streams terrain around the camera and the
// water follows it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WORLD_HALF_M,
  WORLD_SIZE_M,
  WATER_Y,
  heightAt,
  groundColorAt,
  parcelAtWorld,
  isInParcelGrid,
  stepWorldWalker,
} from '../lib/earth2/world.js';
import {
  CHUNK_M, CHUNK_TILES, STREAM_RADIUS_CHUNKS, STREAM_CHUNK_COUNT,
  chunkFor, chunkKey, chunkBounds, chunksAround, chunkSetDiff,
  chunkHeightField,
} from '../lib/earth2/terrain-streaming.js';
import {
  vehicleSpec,
  stepVehicle,
  sanitizeVehicleStates,
} from '../lib/earth2/vehicles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

const FLAT = { heightAt: () => 2, waterDepthAt: () => 0, colliders: [] };
function drive(state, spec, input, seconds, env = FLAT) {
  let st = { ...state };
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) st = stepVehicle(st, spec, input, dt, env);
  return st;
}

describe('earth-2 endless: chunk law', () => {
  it('chunkFor floors for negatives and on boundaries', () => {
    assert.deepEqual(chunkFor(0, 0), { cx: 0, cz: 0 });
    assert.deepEqual(chunkFor(63.9, 63.9), { cx: 0, cz: 0 });
    assert.deepEqual(chunkFor(64, 0), { cx: 1, cz: 0 });
    assert.deepEqual(chunkFor(-1, -1), { cx: -1, cz: -1 });
    assert.deepEqual(chunkFor(-64, -64), { cx: -1, cz: -1 });
    assert.deepEqual(chunkFor(-64.1, 0), { cx: -2, cz: 0 });
    assert.deepEqual(chunkFor(1000, -1000), { cx: 15, cz: -16 });
  });
  it('chunk bounds tile without gaps: neighbours share an edge', () => {
    const a = chunkBounds(0, 0);
    assert.deepEqual(a, { x0: 0, z0: 0, x1: CHUNK_M, z1: CHUNK_M });
    assert.equal(chunkBounds(1, 0).x0, a.x1, 'east neighbour starts where this one ends');
    assert.equal(chunkBounds(0, 1).z0, a.z1, 'south neighbour starts where this one ends');
    assert.equal(chunkBounds(-1, 0).x1, a.x0, 'west neighbour ends where this one starts');
    assert.equal(chunkKey(3, -2), '3,-2');
  });
  it('chunksAround is the full ring, centre first, no duplicates', () => {
    const ring = chunksAround(10, 26);
    assert.equal(ring.length, STREAM_CHUNK_COUNT, '15x15 = 225 chunks');
    assert.equal(STREAM_CHUNK_COUNT, (2 * STREAM_RADIUS_CHUNKS + 1) ** 2);
    assert.deepEqual({ cx: ring[0].cx, cz: ring[0].cz }, chunkFor(10, 26), 'centre first');
    assert.equal(new Set(ring.map((c) => c.key)).size, ring.length, 'keys unique');
    for (const c of ring) {
      assert.ok(Math.abs(c.cx - chunkFor(10, 26).cx) <= STREAM_RADIUS_CHUNKS);
      assert.ok(Math.abs(c.cz - chunkFor(10, 26).cz) <= STREAM_RADIUS_CHUNKS);
    }
  });
  it('chunkSetDiff drops the column left behind and loads the one ahead', () => {
    const here = chunksAround(0, 0).map((c) => c.key);
    const east = chunksAround(CHUNK_M + 1, 0).map((c) => c.key);
    const diff = chunkSetDiff(here, east);
    assert.equal(diff.drop.length, 2 * STREAM_RADIUS_CHUNKS + 1, 'one west column leaves');
    assert.equal(diff.load.length, 2 * STREAM_RADIUS_CHUNKS + 1, 'one east column arrives');
    assert.ok(diff.drop.every((k) => k.startsWith('-7,')), 'dropped column is the west one');
    assert.ok(diff.load.every((k) => k.startsWith('8,')), 'loaded column is the east one');
  });
  it('the ring streams far from home, past the old grid edge', () => {
    const ring = chunksAround(WORLD_HALF_M + 500, 0);
    assert.equal(ring.length, STREAM_CHUNK_COUNT);
    const centre = chunkFor(WORLD_HALF_M + 500, 0);
    assert.ok(ring.some((c) => c.cx === centre.cx && c.cz === centre.cz));
  });
});

describe('earth-2 endless: chunk height field', () => {
  it('a chunk is a 17x17 local grid whose heights are the seeded field', () => {
    const f = chunkHeightField(0, 0);
    const n = CHUNK_TILES + 1;
    assert.equal(f.positions.length, n * n * 3);
    assert.equal(f.colors.length, n * n * 3);
    assert.equal(f.uvs.length, n * n * 2);
    assert.equal(f.indices.length, CHUNK_TILES * CHUNK_TILES * 6);
    // Local coords run 0..64; the height at each vertex is the
    // world height at that vertex's world position.
    for (let i = 0; i < n * n; i += 7) {
      const lx = f.positions[i * 3];
      const lz = f.positions[i * 3 + 2];
      assert.ok(lx >= 0 && lx <= CHUNK_M && lz >= 0 && lz <= CHUNK_M);
      // Float32 storage: within 1e-5 of the float64 field.
      assert.ok(Math.abs(f.positions[i * 3 + 1] - heightAt(lx, lz)) < 1e-5);
      const col = groundColorAt(lx, lz);
      assert.ok(Math.abs(f.colors[i * 3] - col[0]) < 1e-6);
      assert.ok(Number.isFinite(f.colors[i * 3 + 1]));
    }
    // Far from home the field is still defined and finite.
    const far = chunkHeightField(15, -16);
    for (let i = 0; i < n * n; i += 11) {
      assert.ok(Number.isFinite(far.positions[i * 3 + 1]), `far height ${i} must be finite`);
    }
  });
  it('UVs are continuous across a chunk border (no texture seam)', () => {
    const west = chunkHeightField(0, 0);
    const east = chunkHeightField(1, 0);
    const n = CHUNK_TILES + 1;
    for (let iz = 0; iz < n; iz += 4) {
      // West chunk's east edge (ix = 16) is the same world x as
      // east chunk's west edge (ix = 0) — same u, same height.
      const wi = iz * n + CHUNK_TILES;
      const ei = iz * n;
      assert.equal(west.uvs[wi * 2], east.uvs[ei * 2], `u must match at row ${iz}`);
      assert.equal(west.positions[wi * 3 + 1], east.positions[ei * 3 + 1], `height must match at row ${iz}`);
    }
  });
  it('indices wind so faces point up (+Y)', () => {
    const f = chunkHeightField(0, 0);
    const n = CHUNK_TILES + 1;
    const at = (i) => [f.positions[i * 3], f.positions[i * 3 + 1], f.positions[i * 3 + 2]];
    for (let t = 0; t < f.indices.length; t += 3 * 7) {
      const [a, b, c] = [at(f.indices[t]), at(f.indices[t + 1]), at(f.indices[t + 2])];
      const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
      const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
      const ny = uz * vx - ux * vz;
      assert.ok(ny > 0, `triangle ${t / 3} must face up, normal-y ${ny}`);
    }
  });
});

describe('earth-2 endless: the sea goes on past the grid', () => {
  it('the heightfield past the grid is open sea — capped, finite, with real variation somewhere', () => {
    const spots = [
      [WORLD_HALF_M + 10, 0], [WORLD_HALF_M + 500, 300],
      [-WORLD_HALF_M - 100, 0], [0, WORLD_HALF_M + 1000],
      [WORLD_HALF_M + 5000, WORLD_HALF_M + 5000], [-5000, -5000],
    ];
    const heights = spots.map(([x, z]) => heightAt(x, z));
    for (const h of heights) {
      assert.ok(Number.isFinite(h), 'past-grid height must be finite');
      assert.ok(h <= -2.4 + 1e-9, `past-grid ground is sea floor (h=${h.toFixed(2)})`);
      assert.ok(h < WATER_Y, 'past-grid ground is below the waterline');
    }
    // The shelf is flat at −2.4 off land edges and falls away off
    // sea edges — across a wide sweep the floor genuinely varies,
    // and the bed colour varies everywhere (the visual texture).
    const sweep = new Set();
    const cols = new Set();
    for (let x = -3000; x <= 3000; x += 50) {
      for (let z = -3000; z <= 3000; z += 50) {
        if (Math.abs(x) < WORLD_HALF_M && Math.abs(z) < WORLD_HALF_M) continue;
        sweep.add(heightAt(x, z).toFixed(2));
        const c = groundColorAt(x, z);
        cols.add(c.map((v) => v.toFixed(3)).join(','));
      }
    }
    assert.ok(sweep.size > 1, 'the sea floor varies somewhere past the grid');
    assert.ok(cols.size > 10, 'the sea-bed colour varies past the grid');
    for (const [x, z] of spots) {
      const col = groundColorAt(x, z);
      assert.ok(col.every((v) => Number.isFinite(v) && v >= 0 && v <= 1), 'sea-bed colour stays in gamut');
    }
  });
  it('the coastal apron descends into the sea, no cliff at the edge', () => {
    let worst = 0;
    let prev = heightAt(WORLD_HALF_M - 30, 0);
    for (let x = WORLD_HALF_M - 29; x <= WORLD_HALF_M + 30; x += 1) {
      const h = heightAt(x, 0);
      worst = Math.max(worst, Math.abs(h - prev));
      prev = h;
    }
    assert.ok(worst < 2, `worst 1 m step across the edge is ${worst.toFixed(2)} m — no cliff`);
  });
});

describe('earth-2 endless: the parcels stay home', () => {
  it('isInParcelGrid draws the line the registry keeps', () => {
    assert.equal(isInParcelGrid(0, 0), true);
    assert.equal(isInParcelGrid(WORLD_HALF_M - 1, 0), true);
    assert.equal(isInParcelGrid(0, -WORLD_HALF_M + 1), true);
    assert.equal(isInParcelGrid(WORLD_HALF_M, 0), false);
    assert.equal(isInParcelGrid(0, WORLD_HALF_M), false);
    assert.equal(isInParcelGrid(WORLD_HALF_M + 500, 0), false);
    assert.equal(isInParcelGrid(-5000, -5000), false);
  });
  it('parcelAtWorld still answers the edge parcel past the grid (its clamp is the in-grid callers’ behaviour)', () => {
    assert.equal(parcelAtWorld(WORLD_HALF_M + 500, 0).id, parcelAtWorld(WORLD_HALF_M - 1, 0).id);
  });
  it('the parcel count and the grid size are untouched', () => {
    assert.equal(WORLD_SIZE_M, 1400);
    assert.equal(WORLD_HALF_M, 700);
  });
});

describe('earth-2 endless: walking and driving out', () => {
  it('the walker walks past the old edge and keeps swimming', () => {
    let p = { x: WORLD_HALF_M - 5, z: 0 };
    for (let i = 0; i < 40; i++) p = stepWorldWalker(p, -Math.PI / 2, { fwd: 1, strafe: 0 }, 0.25, [], true);
    assert.ok(p.x > WORLD_HALF_M + 50, `the walker crossed the old edge (x=${p.x.toFixed(1)})`);
    for (let i = 0; i < 40; i++) p = stepWorldWalker(p, -Math.PI / 2, { fwd: 1, strafe: 0 }, 0.25, [], true);
    assert.ok(p.x > WORLD_HALF_M + 100, `the walker keeps going (x=${p.x.toFixed(1)})`);
  });
  it('a rover drives past the old edge and keeps its speed', () => {
    const spec = vehicleSpec('rover');
    const st = drive({ x: WORLD_HALF_M - 5, z: 0, heading: Math.PI / 2, speed: 0 }, spec, { throttle: 1, steer: 0 }, 10);
    assert.ok(st.x > WORLD_HALF_M + 40, `the rover crossed the old edge (x=${st.x.toFixed(1)})`);
  });
  it('a flying craft flies past the old edge', () => {
    const spec = vehicleSpec('vtol');
    const st = drive(
      { x: WORLD_HALF_M - 5, z: 0, heading: Math.PI / 2, speed: 0, alt: 20 },
      spec, { throttle: 1, steer: 0 }, 10,
    );
    assert.ok(st.x > WORLD_HALF_M, `the VTOL crossed the old edge (x=${st.x.toFixed(1)})`);
  });
  it('a reloaded wilderness position stands — no snap back to the grid', () => {
    const states = sanitizeVehicleStates({ rover: { x: 5000, z: -3000, heading: 0 } });
    assert.equal(states.rover.x, 5000);
    assert.equal(states.rover.z, -3000);
  });
});

describe('earth-2 endless: the scene streams and never clamps', () => {
  it('the scene streams terrain around the camera, a couple of chunks per frame', () => {
    const scene = read('components/earth2/Earth2World.jsx');
    assert.ok(scene.includes('updateTerrainStreaming'), 'streaming update on the tick beat');
    assert.ok(scene.includes('pumpTerrainQueue'), 'build queue pumped every frame');
    assert.ok(scene.includes('chunkHeightField(cx, cz)'), 'chunks built from the seeded field');
    assert.ok(scene.includes('chunksAround(camera.position.x, camera.position.z)'), 'ring follows the camera');
    assert.ok(scene.includes('built < 2'), 'at most 2 chunks build per frame');
    assert.ok(!scene.includes('PlaneGeometry(WORLD_SIZE_M, WORLD_SIZE_M, 256, 256)'), 'old static plane is gone');
  });
  it('the water and the horizon sea follow the camera', () => {
    const scene = read('components/earth2/Earth2World.jsx');
    assert.ok(scene.includes('waterMesh.position.x'), 'water plane follows the camera');
    assert.ok(scene.includes('horizonSeaMesh.position.x'), 'horizon sea follows the camera');
    assert.ok(scene.includes('Math.round(camera.position.x / wt) * wt'), 'water texture snaps to its tile so it never swims');
  });
  it('parcel logic only ever applies on a real parcel', () => {
    const scene = read('components/earth2/Earth2World.jsx');
    assert.ok(scene.includes('isInParcelGrid(walker.x, walker.z)'), 'walker parcel reads are grid-guarded');
    assert.ok(scene.includes('hud.wild'), 'the HUD names the wilderness');
  });
  it('no world-edge clamp survives in the walker or vehicle law', () => {
    const world = read('lib/earth2/world.js');
    assert.ok(!world.includes('clamp(pushed.x, -WORLD_HALF_M'), 'walker edge clamp is gone');
    const vehicles = read('lib/earth2/vehicles.js');
    assert.ok(!vehicles.includes('WORLD_HALF_M'), 'no grid-half reference left in the vehicle law');
  });
});
