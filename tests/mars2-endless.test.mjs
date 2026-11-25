// tests/mars2-endless.test.mjs
// MARS 2 ENDLESS FREE ROAM (Merlin, Nov 18, 2026) — no edge, no
// wall, no turn-back. Run: node --test tests/mars2-endless.test.mjs
//
// The law, not the pixels: chunks tile the plane without gaps or
// seams; the crater rim saturates instead of growing into a
// mountain at distance; the rover drives past the old rim and
// stays on the dunes; the ship's floor is the dunes anywhere and
// it lands anywhere; the home region (outpost, Mons, spawn) is
// exactly where it was; the scene streams terrain around the
// camera and never clamps the walker.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateMarsProfile, MARS_RIM_CAP_M } from '../lib/mars/engine.js';
import {
  CHUNK_M, CHUNK_TILES, STREAM_RADIUS_CHUNKS, STREAM_CHUNK_COUNT,
  chunkFor, chunkKey, chunkBounds, chunksAround, chunkSetDiff,
  chunkHeightField,
} from '../lib/mars2/streaming.js';
import { MARS2_SEED, WORLD_RADIUS, WALKER_SPAWN, outpostSite } from '../lib/mars2/world.js';
import { mars2TerrainHeight } from '../lib/mars2/terrain.js';
import { monsSite } from '../lib/mars/cgi.js';
import {
  ROVER_TOP_SPEED_MPS, WALK_SPEED_MPS,
  summonRover, updateRover,
} from '../lib/mars2/rovers.js';
import {
  SHIP_REST_M,
  createShip, updateShip, requestShipLanding, canDismountShip, shipIsLanded,
} from '../lib/mars2/spaceship.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

const profile = generateMarsProfile(MARS2_SEED);
// The one height law for Mars 2: the mining zones are levelled
// flat (Nov 25), so the chunk field, the rover and the ship all
// read the levelled height — identical to the raw field outside
// the zones, flat inside them.
const ground = (x, z) => mars2TerrainHeight(x, z, profile);
const keys = (over = {}) => ({ fwd: false, back: false, left: false, right: false, ...over });

describe('mars-2 endless: chunk law', () => {
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
    assert.deepEqual(chunkSetDiff(here, here), { load: [], drop: [] });
  });
});

describe('mars-2 endless: chunk height field', () => {
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
});

describe('mars-2 endless: the rim saturates, the dunes go on', () => {
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

describe('mars-2 endless: driving and flying far out', () => {
  it('the rover drives past the old rim, unclamped, and stays on the dunes', () => {
    // Heading -PI/2 faces +X: out from (80, 0), away from home.
    const rover = summonRover(null, { x: 80, z: 0, heading: -Math.PI / 2 });
    for (let i = 0; i < 1200; i++) updateRover(rover, keys({ fwd: true }), 1 / 60, ground);
    assert.ok(Math.hypot(rover.x, rover.z) > WORLD_RADIUS + 50, `rover got ${Math.hypot(rover.x, rover.z).toFixed(0)} m out`);
    assert.ok(Math.abs(rover.speed - ROVER_TOP_SPEED_MPS) < 0.01, 'no rim shed: still at top speed');
    assert.ok(rover.speed > WALK_SPEED_MPS);
    assert.equal(rover.y, ground(rover.x, rover.z), 'still on the terrain');
    assert.ok(rover.wheelSpin > 0, 'wheels spin while driving');
  });
  it('the ship floor is the dunes anywhere: descending far out stops on the ground', () => {
    const far = createShip(500, 0, 0);
    far.active = true;
    far.y = ground(500, 0) + 30;
    let steps = 0;
    const floorY = ground(500, 0) + SHIP_REST_M;
    while (far.y > floorY + 0.01 && steps < 4000) {
      updateShip(far, keys({ back: true }), 'vertical', 0.05, ground);
      steps++;
    }
    assert.ok(Math.abs(far.y - floorY) < 0.01, `ship rests on the dunes at ${far.y.toFixed(2)}, floor ${floorY.toFixed(2)}`);
    assert.ok(far.y > SHIP_REST_M + 5, 'the floor is the dune, not the y = 0 plane');
  });
  it('the ship lands anywhere: OUT far from home touches down and steps out', () => {
    const ship = createShip(500, 0, 0);
    ship.active = true;
    ship.y = 60;
    assert.equal(requestShipLanding(ship), true);
    assert.equal(ship.landing, true);
    assert.ok(!('landBlocked' in ship), 'no blocked-landing flag any more');
    let steps = 0;
    while (!shipIsLanded(ship) && steps < 4000) {
      updateShip(ship, keys(), 'horizontal', 0.05, ground);
      steps++;
    }
    assert.ok(shipIsLanded(ship), `auto-landing touched down far out in ${steps} steps`);
    assert.ok(canDismountShip(ship), 'landed far out, the walker can step out');
    assert.ok(Math.hypot(ship.x, ship.z) > WORLD_RADIUS, 'still far from home');
  });
});

describe('mars-2 endless: the home region is untouched', () => {
  it('WORLD_RADIUS is still the home-region radius (88 m)', () => {
    assert.equal(WORLD_RADIUS, 88);
    assert.deepEqual(WALKER_SPAWN, { x: 10, z: 26 });
  });
  it('the outpost and the Mons sit where they always did, inside the home region', () => {
    const site = outpostSite(profile);
    assert.ok(site.dist >= 16 && site.dist <= 24);
    assert.ok(Math.hypot(site.x, site.z) < WORLD_RADIUS);
    const mons = monsSite(profile);
    assert.ok(mons.dist >= 70 && mons.dist <= 78);
    assert.ok(Math.hypot(mons.x, mons.z) < WORLD_RADIUS);
  });
});

describe('mars-2 endless: the scene streams and never clamps', () => {
  it('the scene renders the streaming terrain around the camera', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('Mars2StreamingTerrain'), 'streaming terrain component');
    assert.ok(!scene.includes('Mars2Terrain profile'), 'old fixed plane is gone');
    assert.ok(!scene.includes('PlaneGeometry(180, 180'), 'no fixed 180 m plane');
    assert.ok(scene.includes('chunksAround(camera.position.x'), 'ring follows the camera');
    assert.ok(scene.includes('chunkHeightField(profile, cx, cz)'), 'chunks built from the seeded field');
    assert.ok(scene.includes('built < 2'), 'at most 2 chunks build per frame');
  });
  it('no rim clamp survives anywhere in the scene', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(!scene.includes('if (r > WORLD_RADIUS)'), 'walker rim clamp is gone');
    assert.ok(!scene.includes('WORLD_RADIUS'), 'WORLD_RADIUS is not referenced in the scene at all');
    assert.ok(!scene.includes('landBlocked'), 'no blocked-landing flag in the scene');
    assert.ok(!scene.includes('updateRover(rover, k, dt, groundHeight, WORLD_RADIUS)'), 'rover call carries no rim');
  });
  it('the sky and the weather follow the camera, not the origin', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('function Mars2Sun'), 'Mars 2 draws its own sun');
    assert.ok(scene.includes('<Mars2Sun timeOfDay={timeOfDay} />'), 'the sun is mounted');
    const rigLine = scene.split('\n').find((l) => l.includes('<DayNightRig'));
    assert.ok(rigLine && !rigLine.includes(' sun'), 'the rig runs with its sun off');
    assert.ok(scene.includes('function OrbitTargetFollower'), 'orbit target follows the walker');
    assert.ok(scene.includes('<OrbitTargetFollower orbitRef={orbitRef} walkerRef={walkerRef} />'), 'follower is mounted');
    for (const name of ['Mars2Cgi', 'Mars2Weather', 'Mars2Stars', 'Mars2RedMoon']) {
      const body = scene.slice(scene.indexOf(`function ${name}`), scene.indexOf(`function ${name}`) + 4000);
      assert.ok(body.includes('followRef'), `${name} follows the camera`);
    }
  });
});
