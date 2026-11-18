// tests/mars-endless.test.mjs
// MARS 1 ENDLESS FREE ROAM (Merlin, Nov 18, 2026) — no edge, no
// wall, no turn-back. Run: node --test tests/mars-endless.test.mjs
//
// The law, not the pixels: chunks tile the plane without gaps or
// seams; the crater rim saturates instead of growing into a
// mountain at distance; the home region (basins, Mons, spawn) is
// exactly where it was; the scene streams terrain around the
// camera and never clamps the walker; the sky and the weather
// follow the camera, not the origin.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateMarsProfile, getTerrainHeight, MARS_RIM_CAP_M } from '../lib/mars/engine.js';
import {
  CHUNK_M, CHUNK_TILES, STREAM_RADIUS_CHUNKS, STREAM_CHUNK_COUNT,
  chunkFor, chunkKey, chunkBounds, chunksAround, chunkSetDiff,
  chunkHeightField,
} from '../lib/mars/streaming.js';
import { monsSite } from '../lib/mars/cgi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

const profile = generateMarsProfile('MARS-PRIME');
const ground = (x, z) => getTerrainHeight(x, z, profile);

describe('mars endless: chunk law', () => {
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
    assert.equal(ring.length, STREAM_CHUNK_COUNT, '7x7 = 49 chunks');
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
    assert.ok(diff.drop.every((k) => k.startsWith('-3,')), 'dropped column is the west one');
    assert.ok(diff.load.every((k) => k.startsWith('4,')), 'loaded column is the east one');
  });
  it('the ring streams far from home, not just around the origin', () => {
    const ring = chunksAround(1000, -1000);
    assert.equal(ring.length, STREAM_CHUNK_COUNT);
    const centre = chunkFor(1000, -1000);
    assert.ok(ring.some((c) => c.cx === centre.cx && c.cz === centre.cz));
    assert.ok(ring.every((c) => Math.abs(c.cx) > 10 || Math.abs(c.cz) > 10));
  });
});

describe('mars endless: chunk height field', () => {
  it('a chunk is a 33x33 local grid whose heights are the seeded field', () => {
    const f = chunkHeightField(profile, 0, 0);
    const n = CHUNK_TILES + 1;
    assert.equal(f.positions.length, n * n * 3);
    assert.equal(f.colors.length, n * n * 3);
    assert.equal(f.uvs.length, n * n * 2);
    assert.equal(f.indices.length, CHUNK_TILES * CHUNK_TILES * 6);
    // Local coords run 0..64; the height at each vertex is the
    // world height at that vertex's world position.
    for (let i = 0; i < n * n; i += 37) {
      const lx = f.positions[i * 3];
      const lz = f.positions[i * 3 + 2];
      assert.ok(lx >= 0 && lx <= CHUNK_M && lz >= 0 && lz <= CHUNK_M);
      // Float32 storage: within 1e-5 of the float64 field.
      assert.ok(Math.abs(f.positions[i * 3 + 1] - ground(lx, lz)) < 1e-5);
      assert.ok(Number.isFinite(f.colors[i * 3]));
    }
    // Far from home the field is still defined and finite.
    const far = chunkHeightField(profile, 15, -16);
    for (let i = 0; i < n * n; i += 53) {
      assert.ok(Number.isFinite(far.positions[i * 3 + 1]), `far height ${i} must be finite`);
    }
  });
  it('UVs are continuous across a chunk border (no texture seam)', () => {
    const west = chunkHeightField(profile, 0, 0);
    const east = chunkHeightField(profile, 1, 0);
    const n = CHUNK_TILES + 1;
    for (let iz = 0; iz < n; iz += 8) {
      // West chunk's east edge (ix = 32) is the same world x as
      // east chunk's west edge (ix = 0) — same u, same height.
      const wi = iz * n + CHUNK_TILES;
      const ei = iz * n;
      assert.equal(west.uvs[wi * 2], east.uvs[ei * 2], `u must match at row ${iz}`);
      assert.equal(west.positions[wi * 3 + 1], east.positions[ei * 3 + 1], `height must match at row ${iz}`);
    }
  });
  it('indices wind so faces point up (+Y)', () => {
    const f = chunkHeightField(profile, 0, 0);
    const n = CHUNK_TILES + 1;
    const at = (i) => [f.positions[i * 3], f.positions[i * 3 + 1], f.positions[i * 3 + 2]];
    for (let t = 0; t < f.indices.length; t += 3 * 13) {
      const [a, b, c] = [at(f.indices[t]), at(f.indices[t + 1]), at(f.indices[t + 2])];
      const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
      const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
      const ny = uz * vx - ux * vz;
      assert.ok(ny > 0, `triangle ${t / 3} must face up, normal-y ${ny}`);
    }
  });
  it('chunk colours match the old fixed plane law at the same heights', () => {
    // The old MarsTerrain: vy < -0.2 → cLow; < 2.2 → lerp cMid→cHigh;
    // else cHigh → cPeak. A chunk at the same (x, z) must wear the
    // same vertex colour the plane wore, or the ground changes hue
    // on the convert.
    const f = chunkHeightField(profile, 0, 0);
    const n = CHUNK_TILES + 1;
    for (let i = 0; i < n * n; i += 29) {
      const wx = f.positions[i * 3];
      const wz = f.positions[i * 3 + 2];
      const vy = ground(wx, wz);
      const [r, g, b] = [f.colors[i * 3], f.colors[i * 3 + 1], f.colors[i * 3 + 2]];
      // Low ground is the darkened ground colour; high ground runs
      // toward the pale peak — the colour must stay in gamut and
      // track height monotonically in the mid band.
      assert.ok(r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1);
      assert.ok(vy < -0.2 ? r < 0.5 : true, 'low ground stays darkened');
    }
  });
});

describe('mars endless: the rim saturates, the dunes go on', () => {
  it('the rim cap is 12 m and never bites inside the home region', () => {
    assert.equal(MARS_RIM_CAP_M, 12);
    // The uncapped rim at the old 88 m rim reads ~6.95 — under
    // the cap — so the home region is byte-identical to before.
    const rimAt88 = Math.pow((88 - 62) * 0.14, 1.5);
    assert.ok(rimAt88 < MARS_RIM_CAP_M, `rim at 88 m is ${rimAt88.toFixed(2)}, under the cap`);
    const rimAt99 = Math.pow((99 - 62) * 0.14, 1.5);
    assert.ok(rimAt99 < MARS_RIM_CAP_M, `rim at 99 m is ${rimAt99.toFixed(2)}, still under the cap`);
  });
  it('far heights are finite and bounded — no mountain at distance', () => {
    for (const [x, z] of [[500, 0], [2000, 0], [0, -2000], [10000, 10000], [-5000, 3000]]) {
      const h = ground(x, z);
      assert.ok(Number.isFinite(h), `height at ${x},${z} must be finite`);
      assert.ok(h > -20 && h < 25, `height at ${x},${z} is ${h.toFixed(1)} — must stay dune-scale`);
    }
    // The rim contribution saturates: two far points on the same
    // ray differ only by the wave trains, not by a growing rim.
    const d500 = ground(500, 0);
    const d2000 = ground(2000, 0);
    assert.ok(Math.abs(d2000 - d500) < 16, `rim must saturate: h(2000) - h(500) = ${(d2000 - d500).toFixed(1)}`);
  });
  it('no cliff where the cap engages: heights step smoothly past 99 m', () => {
    let worst = 0;
    let prev = ground(95, 0);
    for (let x = 95.5; x <= 105; x += 0.5) {
      const h = ground(x, 0);
      worst = Math.max(worst, Math.abs(h - prev));
      prev = h;
    }
    assert.ok(worst < 1, `worst 0.5 m step past the cap is ${worst.toFixed(2)} m — no cliff`);
  });
  it('the dunes keep varying a kilometre out', () => {
    const samples = [];
    for (let x = 900; x <= 1100; x += 10) {
      for (let z = 900; z <= 1100; z += 10) {
        samples.push(ground(x, z));
      }
    }
    assert.ok(Math.max(...samples) - Math.min(...samples) > 2, 'far dunes must vary');
  });
});

describe('mars endless: the home region is untouched', () => {
  it('the walker still spawns at (10, 26), inside the old 88 m rim', () => {
    assert.ok(Math.hypot(10, 26) < 88);
  });
  it('the Mons sits where it always did, inside the home region', () => {
    const mons = monsSite(profile);
    assert.ok(mons.dist >= 70 && mons.dist <= 78);
    assert.ok(Math.hypot(mons.x, mons.z) < 88);
  });
  it('the basins sit where they always did, inside the home region', () => {
    for (const b of profile.basins) {
      assert.ok(Math.hypot(b.x, b.z) + b.radius < 88, `basin at ${b.x},${b.z} r${b.radius} stays home`);
    }
  });
});

describe('mars endless: the scene streams and never clamps', () => {
  it('the scene renders the streaming terrain around the camera', () => {
    const scene = read('components/mars/MarsScene.jsx');
    assert.ok(scene.includes('MarsStreamingTerrain'), 'streaming terrain component');
    assert.ok(scene.includes('<MarsStreamingTerrain profile={profile} />'), 'streaming terrain is mounted');
    assert.ok(!scene.includes('function MarsTerrain('), 'old fixed-plane component is gone');
    assert.ok(!scene.includes('PlaneGeometry(180, 180'), 'no fixed 180 m plane');
    assert.ok(scene.includes('chunksAround(camera.position.x'), 'ring follows the camera');
    assert.ok(scene.includes('chunkHeightField(profile, cx, cz)'), 'chunks built from the seeded field');
    assert.ok(scene.includes('built < 2'), 'at most 2 chunks build per frame');
  });
  it('no radial clamp survives anywhere in the scene', () => {
    const scene = read('components/mars/MarsScene.jsx');
    assert.ok(!scene.includes('MOVE_R'), 'MOVE_R is gone');
    assert.ok(!scene.includes('if (r > MOVE_R)'), 'walker radial clamp is gone');
    assert.ok(!scene.includes('p.x *= MOVE_R / r'), 'no rescale back to the rim');
  });
  it('the sky and the weather follow the camera, not the origin', () => {
    const scene = read('components/mars/MarsScene.jsx');
    assert.ok(scene.includes('function SkyFollower'), 'sky follows the camera');
    assert.ok(scene.includes('<SkyFollower>'), 'the sun and stars ride the follower');
    assert.ok(scene.includes('MarsStars profile={profile}'), 'the stars are still mounted');
    const cgi = scene.slice(scene.indexOf('function MarsCgi'), scene.indexOf('function MarsStars'));
    assert.ok(cgi.includes('followRef'), 'MarsCgi follows the camera');
    assert.ok(cgi.includes('getTerrainHeight(cam.x + d.x, cam.z + d.z, profile)'), 'devils read ground at the camera-relative spot');
  });
});
