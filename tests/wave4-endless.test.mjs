// tests/wave4-endless.test.mjs — Wave 4 endless cities & small worlds
// (Merlin, Nov 18, 2026): no edge, no wall, no turn-back — like Mars 2.
// Run: node --test tests/wave4-endless.test.mjs
//
// The law, not the pixels: chunks tile the plane without gaps or
// seams; the ring follows the focus and builds centre-first; the
// outskirt block generators are deterministic per block and follow
// the same law as their home generators; the home regions stay
// exactly where they were; every converted scene streams ground and
// never clamps the walker/driver.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  CHUNK_M, STREAM_RADIUS_CHUNKS, STREAM_CHUNK_COUNT,
  chunkFor, chunkKey, chunkBounds, chunksAround, chunkSetDiff,
  flatChunkField, hashString32, mulberry32, ChunkRing,
} from '../lib/infinite/streaming.js';
import {
  generateCityBlock, generateTownBlock, generateBabelBlock,
  blocksInChunk, isHomeBlock,
} from '../lib/gta/blocks.js';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(repo, p), 'utf8');

// --- shared chunk law -------------------------------------------------
test('chunk law: size + ring count', () => {
  assert.equal(CHUNK_M, 64);
  assert.equal(STREAM_RADIUS_CHUNKS, 3);
  assert.equal(STREAM_CHUNK_COUNT, 49);
});

test('chunk law: chunkFor floors negatives', () => {
  assert.deepEqual(chunkFor(0, 0), { cx: 0, cz: 0 });
  assert.deepEqual(chunkFor(63, 63), { cx: 0, cz: 0 });
  assert.deepEqual(chunkFor(64, -1), { cx: 1, cz: -1 });
  assert.deepEqual(chunkFor(-1, -1), { cx: -1, cz: -1 });
  assert.deepEqual(chunkFor(-65, 129), { cx: -2, cz: 2 });
});

test('chunk law: bounds tile without gaps', () => {
  for (const [cx, cz] of [[0, 0], [-3, 2], [100, -50]]) {
    const b = chunkBounds(cx, cz);
    assert.equal(b.x1 - b.x0, 64);
    assert.equal(b.z1 - b.z0, 64);
    assert.equal(chunkBounds(cx + 1, cz).x0, b.x1);
    assert.equal(chunkBounds(cx, cz + 1).z0, b.z1);
  }
});

test('chunk law: ring is centre-first, complete, unique', () => {
  const ring = chunksAround(10, -20);
  assert.equal(ring.length, 49);
  assert.deepEqual([ring[0].cx, ring[0].cz], [0, -1]);
  const keys = new Set(ring.map((c) => c.key));
  assert.equal(keys.size, 49);
  // every chunk within radius 3 of the focus chunk is present
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      assert.ok(keys.has(chunkKey(0 + dx, -1 + dz)));
    }
  }
});

test('chunk law: set diff', () => {
  const a = chunksAround(0, 0).map((c) => c.key);
  const b = chunksAround(200, 0).map((c) => c.key);
  const d = chunkSetDiff(a, b);
  assert.ok(d.load.length > 0 && d.drop.length > 0);
  assert.equal(d.load.length, d.drop.length);
  assert.ok(d.load.every((k) => !a.includes(k)));
  assert.ok(d.drop.every((k) => !b.includes(k)));
});

test('chunk law: flat quad faces +Y, UVs continuous across a border', () => {
  const tileM = 40, ox = -300, oz = -300;
  const a = flatChunkField(0, 0, tileM, ox, oz);
  const b = flatChunkField(1, 0, tileM, ox, oz);
  // shared edge: a's east verts == b's west verts in UV space
  assert.equal(a.uvs[2], b.uvs[0]); // (64,0) vs (64,0)
  assert.equal(a.uvs[3], b.uvs[1]);
  assert.equal(a.uvs[6], b.uvs[4]); // (64,64) vs (64,64)
  assert.equal(a.uvs[7], b.uvs[5]);
  // winding: triangle (0,2,1) normal is +Y
  const [ax, ay, az] = [a.positions[0], a.positions[1], a.positions[2]];
  const [bx, by, bz] = [a.positions[6], a.positions[7], a.positions[8]];
  const [cx, cy, cz] = [a.positions[3], a.positions[4], a.positions[5]];
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  const ny = uz * vx - ux * vz;
  assert.ok(ny > 0, 'first triangle normal points +Y');
  // UVs are tile units: one tile per 40 m
  assert.ok(Math.abs((a.uvs[2] - a.uvs[0]) - 64 / tileM) < 1e-5);
});

test('chunk law: hash + RNG are deterministic', () => {
  assert.equal(hashString32('mega-city:block:1:2:1337'), hashString32('mega-city:block:1:2:1337'));
  assert.notEqual(hashString32('mega-city:block:1:2:1337'), hashString32('mega-city:block:1:3:1337'));
  const r1 = mulberry32(42), r2 = mulberry32(42);
  for (let i = 0; i < 10; i++) assert.equal(r1(), r2());
});

test('chunk ring: follows the focus, centre-first, budget respected', () => {
  const built = [];
  const dropped = [];
  const ring = new ChunkRing({
    radius: 1, budget: 2,
    onLoad: (key, cx, cz) => { built.push(key); return { cx, cz }; },
    onDrop: (key) => { dropped.push(key); },
  });
  let res = ring.update(0, 0);
  assert.equal(res.built, 2); // budget caps the first fill
  assert.equal(built[0], '0,0'); // centre builds first
  while (ring.size < 9) ring.update(0, 0);
  assert.equal(ring.size, 9);
  res = ring.update(1000, 1000); // jump far away
  assert.ok(dropped.length > 0);
  assert.ok(res.total <= 9);
  ring.disposeAll();
  assert.equal(ring.size, 0);
});

// --- outskirt block generators ----------------------------------------
const MEGA_OPTS = {
  seed: 1337, blockSize: 40, roadWidth: 12,
  districts: [
    { id: 'downtown', cx: 0, cz: 0, r: 120, minH: 60, maxH: 160, color: 0x8a94a6 },
    { id: 'harbor', cx: -180, cz: 140, r: 100, minH: 15, maxH: 40, color: 0x7a8494 },
    { id: 'residential', cx: 160, cz: -120, r: 110, minH: 10, maxH: 30, color: 0x9aa2b2 },
    { id: 'industrial', cx: -140, cz: -160, r: 90, minH: 12, maxH: 35, color: 0x6e7686 },
  ],
  outer: { minH: 15, maxH: 40, color: 0x8a94a6, id: 'outer' },
  water: { cx: -180, cz: 140, r: 50 },
};

test('mega-city block: deterministic per block, same law as home', () => {
  const a = generateCityBlock(320, 40, MEGA_OPTS);
  const b = generateCityBlock(320, 40, MEGA_OPTS);
  assert.deepEqual(a, b);
  const c = generateCityBlock(360, 40, MEGA_OPTS);
  assert.notDeepEqual(a, c);
  assert.ok(a.buildings.length >= 1 && a.buildings.length <= 3);
  for (const bd of a.buildings) {
    assert.ok(bd.w >= 12 && bd.w < 26);
    assert.ok(bd.h >= 15 && bd.h < 40); // outer district here
    assert.equal(bd.district, 'outer');
    assert.ok(Math.abs(bd.x - 320) < 20 && Math.abs(bd.z - 40) < 20);
  }
});

test('mega-city block: downtown towers stay tall, harbor water stays empty', () => {
  const dt = generateCityBlock(0, 0, MEGA_OPTS);
  assert.ok(dt.buildings.every((bd) => bd.h >= 60 && bd.district === 'downtown'));
  const w = generateCityBlock(-180, 140, MEGA_OPTS);
  assert.equal(w.buildings.length, 0);
});

test('truman block: deterministic, houses only, beach + POIs stay clear', () => {
  const opts = {
    seed: 4242, blockSize: 60,
    pois: [{ x: 0, z: 0 }, { x: 100, z: 150 }, { x: 0, z: -300 }, { x: 250, z: 200 }, { x: 200, z: 250 }, { x: 150, z: 100 }],
    beachX: 150,
  };
  const a = generateTownBlock(-220, -220, opts);
  const b = generateTownBlock(-220, -220, opts);
  assert.deepEqual(a, b);
  assert.ok(a.houses.length >= 2 && a.houses.length <= 3);
  assert.equal(a.houses.length, a.buildings.length);
  for (const h of a.houses) {
    assert.ok(h.w >= 10 && h.w < 14 && h.h >= 6 && h.h < 9);
    assert.ok(h.lawn);
  }
  assert.equal(generateTownBlock(200, 0, opts).houses.length, 0); // beach
  assert.equal(generateTownBlock(0, 0, opts).houses.length, 0); // POI
});

test('babel block: deterministic, plaza clear, heights fall with distance', () => {
  const opts = { seed: 2026, blockSize: 44, roadWidth: 14, plazaRadius: 55 };
  const near = generateBabelBlock(88, 0, opts); // just outside the plaza
  const far = generateBabelBlock(880, 0, opts);
  assert.deepEqual(near, generateBabelBlock(88, 0, opts));
  assert.equal(generateBabelBlock(0, 0, opts).buildings.length, 0); // plaza
  assert.ok(near.buildings.length >= 1 && near.buildings.length <= 2);
  const nearH = Math.max(...near.buildings.map((b) => b.h));
  const farH = Math.max(...far.buildings.map((b) => b.h));
  assert.ok(nearH > farH, 'towers shrink with distance from the tower');
  assert.ok(farH <= 18 + 50 * 0.3 + 20 + 1);
});

test('blocks in chunk: centres tile the chunk, home test matches the home grid', () => {
  const blocks = blocksInChunk(0, 0, { blockSize: 40, homeHalf: 300 });
  // chunk [0,64) x [0,64): block centres at -280+40k -> 0, 40 (x), 0, 40 (z)
  assert.deepEqual(blocks.map((b) => [b.bx, b.bz]).sort(), [[0, 0], [0, 40], [40, 0], [40, 40]]);
  assert.ok(blocks.every((b) => isHomeBlock(b.bx, b.bz, 300)));
  const far = blocksInChunk(10, 0, { blockSize: 40, homeHalf: 300 });
  assert.ok(far.length > 0 && far.every((b) => !isHomeBlock(b.bx, b.bz, 300)));
  // every block centre belongs to exactly one chunk
  const seen = new Set();
  for (let cx = -6; cx <= 6; cx++) {
    for (const b of blocksInChunk(cx, 0, { blockSize: 40, homeHalf: 300 })) {
      const k = `${b.bx},${b.bz}`;
      assert.ok(!seen.has(k), `block ${k} owned twice`);
      seen.add(k);
    }
  }
});

// --- source pins: the scenes stream and never clamp --------------------
// (These read the scene sources — the law above is tested directly;
// the pins below prove the wiring landed in each file.)
test('source pins: gta player/vehicle have no world clamp', () => {
  for (const f of ['lib/gta/player.js', 'lib/gta/vehicle.js']) {
    const src = read(f);
    assert.ok(!/Math\.max\(-\d+/.test(src), `${f} must not clamp the world`);
  }
});

// --- source pins: each converted world streams and never clamps ------
// (Interiors keep their clamps by design: the subway platform,
// the hermes room, the skyscraper rooms, the Duat arena.)
test('source pins: mega-city + truman stream ground and buildings', () => {
  for (const [f, gen] of [
    ['app/mega-city/gta-scene.js', 'generateCityBlock'],
    ['app/truman/gta-scene.js', 'generateTownBlock'],
    ['app/babel/gta-scene.js', 'generateBabelBlock'],
  ]) {
    const src = read(f);
    assert.ok(src.includes('new ChunkRing'), `${f} streams`);
    assert.ok(src.includes(gen), `${f} grows outskirt blocks`);
    assert.ok(src.includes('chunkGroundMesh'), `${f} streams ground`);
    assert.ok(src.includes('skyGroup') || src.includes('sun.target'), `${f} sky follows the player`);
  }
});

test('source pins: babel floors are endless where the ground is open', () => {
  const walk = read('lib/babel/walk.js');
  const areaLine = (area) => walk.split('\n').find((l) => l.trimStart().startsWith(`${area}:`));
  for (const area of ['tower', 'sylva', 'duat', 'avalon']) {
    const line = areaLine(area);
    assert.ok(line && line.includes('endless: true'), `${area} is endless`);
  }
  const hermes = areaLine('hermes');
  assert.ok(hermes && !hermes.includes('endless'), 'hermes stays an interior');
  for (const f of ['components/babel/Tower.jsx', 'components/babel/FloorSylva.jsx', 'components/babel/FloorDuat.jsx', 'components/babel/FloorAvalon.jsx']) {
    assert.ok(read(f).includes('StreamingGround'), `${f} streams ground`);
  }
});

test('source pins: hawkins lifts the box clamp and streams both layers', () => {
  const src = read('app/hawkins/engine.js');
  assert.ok(!src.includes('Math.max(-700'), 'the ±700 x clamp is gone');
  assert.ok(!src.includes('Math.max(-4600'), 'the -4600..900 z clamp is gone');
  assert.ok(src.includes('new ChunkRing'), 'hawkins streams');
  assert.ok(src.includes('E.groundUD.material'), 'the Upside-Down layer streams in step');
  assert.ok(src.includes('1600 - 90 * k'), 'dashes follow the home road law');
  assert.ok(src.includes('E.bloodSun') && src.includes('E.moonLight'), 'sky follows the player');
});

test('source pins: skyscraper exterior streams, interiors untouched', () => {
  const eng = read('app/skyscraper/components/NexusEngine.jsx');
  assert.ok(!eng.includes('Math.max(-1950'), 'the ±1950 exterior clamp is gone');
  assert.ok(eng.includes('Math.max(-28') || eng.includes('clamp(28'), 'interior rooms keep their ±28 bounds');
  const ext = read('app/skyscraper/components/Exterior.jsx');
  assert.ok(ext.includes('name="DRIVE_CityFloor"') && ext.includes('name="DRIVE_CloudFloor"'), 'streamed chunks carry the DRIVE_ names the bike raycasts');
  assert.ok(ext.includes('name="DRIVE_FloorUnder"'), 'the underworld raycast floor streams too');
});

test('source pins: aethelgard, world-nexus and agora lift their circle clamps', () => {
  const aeth = read('components/aethelgard/RainforestScene.jsx');
  assert.ok(!aeth.includes('WORLD_R - 3'), 'the aethelgard circle clamp is gone');
  assert.ok(read('components/aethelgard/Ground.jsx').includes('StreamingGround'), 'aethelgard streams its floor');
  const nexus = read('app/world-nexus/scene.js');
  assert.ok(!nexus.includes('if (d0 > WORLD_R)'), 'the world-nexus circle clamp is gone');
  assert.ok(nexus.includes('new ChunkRing'), 'world-nexus streams');
  assert.ok(nexus.includes('nexusStars.position.set'), 'the nexus stars ride the player');
  const agora = read('components/agora/AgoraScene.jsx');
  assert.ok(!agora.includes('if (r > WALK_RADIUS)'), 'the agora walker clamp is gone');
  assert.ok(agora.includes('StreamingGround'), 'agora streams its cobbles');
  assert.ok(agora.includes('points.position.set'), 'the agora stars ride the walker');
});
