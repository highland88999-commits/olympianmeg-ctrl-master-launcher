// tests/afterlife-endless.test.mjs
// AFTERLIFE ENDLESS FREE ROAM (Merlin, Nov 18, 2026) — no edge, no
// wall, no turn-back, on all 25 afterlife realms. Run:
// node --test tests/afterlife-endless.test.mjs
//
// The law, not the pixels: chunks tile the flat plane without gaps
// or seams; every chunk samples the old r=400 disc's UVs exactly,
// so the home region reads byte-identical; the walker steps past
// the old 380 m rim (260 m ghost-rider) unclamped, in every realm;
// the rivers / mist wall / Bifröst stay — they are home-region
// terrain with a bridge, not a world edge; the scene streams the
// ground around the walker and the sky rides with them.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import {
  CHUNK_M, CHUNK_TILES, STREAM_RADIUS_CHUNKS, STREAM_CHUNK_COUNT,
  HOME_DISC_RADIUS_M,
  chunkFor, chunkKey, chunkBounds, chunksAround, chunkSetDiff,
  discUV, flatChunkField, buildChunkGeometry,
} from '../lib/afterlife/streaming.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// Every realm's movement law, imported as a namespace so the suite
// can also assert the clamp export is GONE.
const REALMS_380 = [
  'heaven', 'hell', 'nether-realm', 'aaru', 'annwn', 'diyu', 'duat',
  'elysium', 'helheim', 'kur', 'mictlan', 'naraka', 'nav', 'orun',
  'svarga', 'takamagahara', 'tir-na-nog', 'tlalocan', 'vyraj',
  'xibalba', 'yomi', 'maya-sky', 'tiangong', 'valhalla',
];
const DOME_REALMS = [
  'annwn', 'diyu', 'duat', 'helheim', 'hell', 'kur', 'mictlan',
  'naraka', 'nav', 'nether-realm', 'orun', 'xibalba', 'yomi',
];
const worlds = {};
for (const r of [...REALMS_380, 'ghost-rider']) {
  worlds[r] = await import(`../lib/${r}/world.js`);
}

describe('afterlife endless: chunk law', () => {
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

describe('afterlife endless: the chunk floor IS the old disc', () => {
  it('discUV matches the real CircleGeometry UVs at every vertex', () => {
    // The ground truth, not the derivation: build the exact disc
    // the realms used (<circleGeometry args={[400, 64]} />) and
    // compare its UVs against discUV at the vertex's world spot.
    // The disc is rotated [-PI/2, 0, 0], so local (x, y) lands at
    // world (x, -y).
    const geo = new THREE.CircleGeometry(HOME_DISC_RADIUS_M, 64);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    assert.equal(pos.count, uv.count);
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i);
      const wz = -pos.getY(i);
      const want = discUV(wx, wz);
      assert.ok(approx(uv.getX(i), want.u, 1e-6), `vertex ${i} u: ${uv.getX(i)} vs ${want.u}`);
      assert.ok(approx(uv.getY(i), want.v, 1e-6), `vertex ${i} v: ${uv.getY(i)} vs ${want.v}`);
    }
    geo.dispose();
  });
  it('discUV anchors: centre, rim and the v-flip', () => {
    assert.deepEqual(discUV(0, 0), { u: 0.5, v: 0.5 });
    assert.deepEqual(discUV(400, 0), { u: 1, v: 0.5 });
    assert.deepEqual(discUV(-400, 0), { u: 0, v: 0.5 });
    assert.deepEqual(discUV(0, 400), { u: 0.5, v: 0 });
    assert.deepEqual(discUV(0, -400), { u: 0.5, v: 1 });
  });
  it('a flat chunk is a 33x33 local grid at y=0 with the disc UVs', () => {
    const f = flatChunkField(0, 0);
    const n = CHUNK_TILES + 1;
    assert.equal(f.positions.length, n * n * 3);
    assert.equal(f.uvs.length, n * n * 2);
    assert.equal(f.indices.length, CHUNK_TILES * CHUNK_TILES * 6);
    for (let i = 0; i < n * n; i += 29) {
      const lx = f.positions[i * 3];
      const lz = f.positions[i * 3 + 2];
      assert.ok(lx >= 0 && lx <= CHUNK_M && lz >= 0 && lz <= CHUNK_M);
      assert.equal(f.positions[i * 3 + 1], 0, 'flat ground: y is 0');
      const want = discUV(lx, lz);
      assert.ok(approx(f.uvs[i * 2], want.u, 1e-6), `u at vertex ${i}`);
      assert.ok(approx(f.uvs[i * 2 + 1], want.v, 1e-6), `v at vertex ${i}`);
    }
    // Far from home the field is still defined and finite.
    const far = flatChunkField(15, -16);
    for (let i = 0; i < n * n; i += 53) {
      assert.ok(Number.isFinite(far.uvs[i * 2]) && Number.isFinite(far.uvs[i * 2 + 1]));
      assert.equal(far.positions[i * 3 + 1], 0);
    }
  });
  it('UVs are continuous across a chunk border (no texture seam)', () => {
    const west = flatChunkField(0, 0);
    const east = flatChunkField(1, 0);
    const n = CHUNK_TILES + 1;
    for (let iz = 0; iz < n; iz += 8) {
      // West chunk's east edge (ix = 32) is the same world x as
      // east chunk's west edge (ix = 0) — same u.
      const wi = iz * n + CHUNK_TILES;
      const ei = iz * n;
      assert.equal(west.uvs[wi * 2], east.uvs[ei * 2], `u must match at row ${iz}`);
      assert.equal(west.uvs[wi * 2 + 1], east.uvs[ei * 2 + 1], `v must match at row ${iz}`);
    }
  });
  it('indices wind so faces point up (+Y), and the geometry carries +Y normals', () => {
    const f = flatChunkField(0, 0);
    const n = CHUNK_TILES + 1;
    const at = (i) => [f.positions[i * 3], f.positions[i * 3 + 1], f.positions[i * 3 + 2]];
    for (let t = 0; t < f.indices.length; t += 3 * 13) {
      const [a, b, c] = [at(f.indices[t]), at(f.indices[t + 1]), at(f.indices[t + 2])];
      const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
      const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
      const ny = uz * vx - ux * vz;
      assert.ok(ny > 0, `triangle ${t / 3} must face up, normal-y ${ny}`);
    }
    const geo = buildChunkGeometry(2, -3);
    assert.equal(geo.attributes.position.count, n * n);
    assert.equal(geo.attributes.uv.count, n * n);
    assert.ok(geo.attributes.normal, 'normals are computed');
    for (let i = 0; i < geo.attributes.normal.count; i += 97) {
      assert.ok(approx(geo.attributes.normal.getX(i), 0, 1e-6));
      assert.ok(approx(geo.attributes.normal.getY(i), 1, 1e-6));
      assert.ok(approx(geo.attributes.normal.getZ(i), 0, 1e-6));
    }
    geo.dispose();
  });
});

describe('afterlife endless: every realm walks past its old rim', () => {
  for (const realm of REALMS_380) {
    it(`${realm}: stepPosition crosses 380 m unclamped, river still bars`, () => {
      const w = worlds[realm];
      assert.ok(!('clampPosition' in w), 'the clamp export is gone');
      assert.equal(w.WORLD_RADIUS, 380, 'WORLD_RADIUS stays the home-region radius');
      assert.ok(Math.hypot(w.SPAWN.x, w.SPAWN.z) < w.WORLD_RADIUS, 'spawn sits inside the home region');
      // Past the old rim, east along z=100 (clear of every river band).
      const past = w.stepPosition(370, 100, 30, 0);
      assert.equal(past.blocked, false);
      assert.ok(approx(past.x, 400));
      assert.ok(approx(past.z, 100));
      // A kilometre out, still walking.
      const far = w.stepPosition(5000, 100, 100, 0);
      assert.equal(far.blocked, false);
      assert.ok(approx(far.x, 5100));
      // The river still bars its crossing off the bridge (orun's
      // ford is the exception: its river is wadeable by design).
      if (realm !== 'orun') {
        const blocked = w.stepPosition(50, 30, 0, -60);
        assert.equal(blocked.blocked, true, 'river still blocks off-bridge');
        assert.deepEqual({ x: blocked.x, z: blocked.z }, { x: 50, z: 30 });
      }
    });
  }
  it('ghost-rider: stepPosition crosses its 260 m rim unclamped', () => {
    const w = worlds['ghost-rider'];
    assert.ok(!('clampPosition' in w), 'the clamp export is gone');
    assert.equal(w.WORLD_RADIUS, 260, 'ghost-rider keeps its 260 m home radius');
    const past = w.stepPosition(250, 0, 30, 0);
    assert.equal(past.blocked, false);
    assert.ok(approx(past.x, 280));
    const far = w.stepPosition(5000, 0, 100, 0);
    assert.equal(far.blocked, false);
    assert.ok(approx(far.x, 5100));
  });
  it('nether-realm: the river + bridge still bar every other crossing', () => {
    const w = worlds['nether-realm'];
    assert.equal(w.stepBlockedByRiver(0, 150, 0, -150), false, 'bridge crossing stays open');
    assert.equal(w.stepBlockedByRiver(50, 150, 50, -150), true, 'off-bridge crossing stays barred');
    assert.equal(w.stepBlockedByRiver(50, 30, 50, 0), true, 'stepping into the water stays barred');
  });
  it('annwn: the mist wall still bars every crossing off the causeway', () => {
    const w = worlds.annwn;
    assert.equal(w.stepBlockedByBarrier(0, 150, 0, -150), false, 'causeway crossing stays open');
    assert.equal(w.stepBlockedByBarrier(50, 150, 50, -150), true, 'off-causeway crossing stays barred');
  });
});

describe('afterlife endless: the home region is untouched', () => {
  it('WORLD_RADIUS is still the home-region radius in every realm', () => {
    for (const realm of REALMS_380) assert.equal(worlds[realm].WORLD_RADIUS, 380, realm);
    assert.equal(worlds['ghost-rider'].WORLD_RADIUS, 260, 'ghost-rider');
  });
  it('every portal arch still sits inside its home region', () => {
    for (const realm of [...REALMS_380, 'ghost-rider']) {
      const w = worlds[realm];
      for (const p of w.PORTALS) {
        assert.ok(Math.hypot(p.x, p.z) < w.WORLD_RADIUS, `${realm} arch ${p.key} inside home`);
      }
    }
  });
});

describe('afterlife endless: the scenes stream and never clamp', () => {
  it('every scene renders the shared streaming ground, not the fixed disc', () => {
    for (const realm of [...REALMS_380, 'ghost-rider']) {
      const scene = read(`app/${realm}/world3d.js`);
      assert.ok(scene.includes('StreamingGround'), `${realm}: streaming ground component`);
      assert.ok(scene.includes('<Ground playerRef={playerRef} />'), `${realm}: Ground takes the player ref`);
      assert.ok(!scene.includes('circleGeometry args={[400, 64]}'), `${realm}: fixed r=400 disc is gone`);
      assert.ok(!scene.includes('clampPosition'), `${realm}: no clamp in the scene`);
    }
  });
  it('every scene follows the rig sun/moon with the walker', () => {
    for (const realm of [...REALMS_380, 'ghost-rider']) {
      const scene = read(`app/${realm}/world3d.js`);
      assert.ok(scene.includes('<DayNightRig sun moon followRef={playerRef}'),
        `${realm}: rig sun/moon follow the walker`);
    }
  });
  it('every sky-dome realm follows the dome with the walker', () => {
    for (const realm of DOME_REALMS) {
      const scene = read(`app/${realm}/world3d.js`);
      // Nether-realm's dome key is 'hades' (its realm key), not its route.
      const key = realm === 'nether-realm' ? 'hades' : realm;
      assert.ok(scene.includes(`<RealmSkyDome realmKey="${key}" followRef={playerRef} />`),
        `${realm}: sky dome follows the walker`);
    }
  });
  it('the shared rig + dome honour followRef, and stay put without it', () => {
    const rig = read('components/DayNightRig.jsx');
    assert.ok(rig.includes('followRef = null'), 'rig followRef defaults to null');
    assert.ok(rig.includes('sunMoonGroupRef'), 'rig wraps the sun/moon visuals in one group');
    assert.ok(rig.includes('sm.position.set(fp.x, 0, fp.z)'), 'rig rides the visuals with the walker');
    const dome = read('components/RealmSkyDome.jsx');
    assert.ok(dome.includes('followRef = null'), 'dome followRef defaults to null');
    assert.ok(dome.includes('m.position.set(p.x, 0, p.z)'), 'dome rides with the walker');
  });
  it('the shared streaming ground builds at most 2 chunks per frame and disposes', () => {
    const comp = read('components/afterlife/StreamingGround.jsx');
    assert.ok(comp.includes('chunksAround'), 'ring follows the walker');
    assert.ok(comp.includes('built < 2'), 'at most 2 chunks build per frame');
    assert.ok(comp.includes('entry.geometry.dispose()'), 'dropped chunks are disposed');
    assert.ok(comp.includes('RepeatWrapping'), 'maps repeat past the old disc');
    assert.ok(comp.includes('receiveShadow = true'), 'chunks receive shadows like the old disc');
  });
});
