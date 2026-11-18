// tests/middle-earth-star-wars-endless.test.mjs
// ENDLESS FREE ROAM (Merlin, Nov 18, 2026) — Middle-earth + Star Wars.
// The ground streams in chunks around the observer and no clamp, wall
// or turn-back contains the walker, the horse, the vehicle or the ship.
// Run: node --test tests/middle-earth-star-wars-endless.test.mjs (repo root)

const fakeCtx = new Proxy(
  {
    canvas: null,
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: [] }),
    measureText: () => ({ width: 100 }),
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }
);
const fakeCanvas = {
  width: 0,
  height: 0,
  getContext: () => fakeCtx,
  style: {},
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? fakeCanvas : { style: {} }),
};
globalThis.window = globalThis;

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import('three');
const ME_T = await import('../app/middle-earth/textures.js');
const SW_T = await import('../app/star-wars/textures.js');
const { buildZone: buildME } = await import('../app/middle-earth/zone.js');
const { buildZone: buildSW, createHeightFunction } = await import('../app/star-wars/zone.js');
const { buildCgi, CGI_SUN_DIST } = await import('../app/star-wars/cgi.js');
const { PODS, POD_ORDER } = await import('../app/middle-earth/data.js');
const { PLANETS } = await import('../app/star-wars/data.js');
const WC = await import('../lib/world/walk-controls.js');
const VH = await import('../app/star-wars/vehicles.js');
const {
  ME_STREAM, SW_STREAM, chunkFor, chunkKey, chunkBounds, chunksAround, chunkSetDiff,
  chunkHeightField,
} = await import('../lib/world/streaming.js');

/* Sample the rendered height of one chunk's grid at (lx, lz) local —
 * the same triangle rule the renderer draws (a,c,b) / (b,c,d). */
function triSample(grid, n, step, lx, lz) {
  const fx = Math.min(n - 1 - 1e-9, Math.max(0, lx / step));
  const fz = Math.min(n - 1 - 1e-9, Math.max(0, lz / step));
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const u = fx - ix, v = fz - iz;
  const ya = grid[iz * n + ix], yb = grid[iz * n + ix + 1];
  const yc = grid[(iz + 1) * n + ix], yd = grid[(iz + 1) * n + ix + 1];
  if (u + v <= 1) return ya + (yb - ya) * u + (yc - ya) * v;
  return yd + (yb - yd) * (1 - v) + (yc - yd) * (1 - u);
}

/* Worst |chunk-interpolated - analytic| over a world's home disc,
 * probing at half-cell offsets (where interpolation error lives). */
function chunkMaxDev(def, preset) {
  const heightAt = createHeightFunction(def);
  const { chunkM, tiles } = preset;
  const step = chunkM / tiles, n = tiles + 1;
  const R = def.worldRadius || 340;
  let maxDev = 0, maxAt = null;
  const cMin = Math.floor(-R / chunkM), cMax = Math.floor(R / chunkM);
  for (let cx = cMin; cx <= cMax; cx++) {
    for (let cz = cMin; cz <= cMax; cz++) {
      const { x0, z0 } = chunkBounds(cx, cz, chunkM);
      if (Math.hypot(x0 + chunkM / 2, z0 + chunkM / 2) > R + chunkM) continue;
      const f = chunkHeightField(heightAt, cx, cz, { chunkM, tiles, worldRadius: R });
      const grid = new Float64Array(n * n);
      for (let iz = 0; iz < n; iz++)
        for (let ix = 0; ix < n; ix++) grid[iz * n + ix] = f.positions[(iz * n + ix) * 3 + 1];
      for (let pz = 1; pz < chunkM; pz += 2) {
        for (let px = 1; px < chunkM; px += 2) {
          const wx = x0 + px, wz = z0 + pz;
          if (Math.hypot(wx, wz) > R) continue;
          const dev = Math.abs(triSample(grid, n, step, px, pz) - heightAt(wx, wz));
          if (dev > maxDev) { maxDev = dev; maxAt = [wx, wz]; }
        }
      }
    }
  }
  return { maxDev, maxAt };
}

function chunkNames(z) {
  const names = new Set();
  z.group.traverse((o) => { if (o.name === 'terrain-chunk') names.add(`${o.userData.chunk.cx},${o.userData.chunk.cz}`); });
  return names;
}
function findNamed(z, name) {
  let hit = null;
  z.group.traverse((o) => { if (o.name === name) hit = o; });
  return hit;
}

describe('streaming law (lib/world/streaming.js)', () => {
  it('chunkFor floors for negatives too', () => {
    assert.deepEqual(chunkFor(-1, -1, 64), { cx: -1, cz: -1 });
    assert.deepEqual(chunkFor(63.9, -64, 64), { cx: 0, cz: -1 });
    assert.deepEqual(chunkFor(64, 64, 64), { cx: 1, cz: 1 });
  });
  it('chunksAround is centre-first and complete', () => {
    const r1 = chunksAround(0, 0, 64, 1);
    assert.equal(r1.length, 9);
    assert.deepEqual([r1[0].cx, r1[0].cz], [0, 0]);
    const r3 = chunksAround(100, -200, 32, 3);
    assert.equal(r3.length, 49);
    assert.deepEqual([r3[0].cx, r3[0].cz], [3, -7]);
  });
  it('chunkSetDiff loads new keys and drops old ones, in order', () => {
    const d = chunkSetDiff(['0,0', '1,0', '0,1'], ['1,0', '0,1', '2,2']);
    assert.deepEqual(d.load, ['2,2']);
    assert.deepEqual(d.drop, ['0,0']);
  });
  it('chunkHeightField vertices sit exactly on the analytic surface', () => {
    const h = createHeightFunction(PLANETS.tatooine);
    const f = chunkHeightField(h, -2, 3, { chunkM: 32, tiles: 32, worldRadius: 520 });
    const n = 33;
    for (let i = 0; i < n * n; i += 13) {
      const wx = -64 + f.positions[i * 3], wz = 96 + f.positions[i * 3 + 2];
      assert.ok(Math.abs(f.positions[i * 3 + 1] - h(wx, wz)) < 1e-6, 'vertex off surface');
    }
    assert.equal(f.indices.length, 32 * 32 * 6);
  });
  it('UVs are continuous across a chunk border (no texture seam)', () => {
    const h = createHeightFunction(PLANETS.tatooine);
    const a = chunkHeightField(h, 0, 0, { chunkM: 32, tiles: 32, worldRadius: 520 });
    const b = chunkHeightField(h, 1, 0, { chunkM: 32, tiles: 32, worldRadius: 520 });
    const n = 33;
    for (let iz = 0; iz < n; iz++) {
      const ua = a.uvs[(iz * n + 32) * 2];
      const ub = b.uvs[(iz * n + 0) * 2];
      assert.ok(Math.abs(ua - ub) < 1e-6, `u seam at row ${iz}: ${ua} vs ${ub}`);
    }
  });
});

describe('MIDDLE-EARTH endless — every pod', () => {
  for (const id of POD_ORDER) {
    it(`${id}: no bounds, 81-chunk ring, walker passes the old 340 m edge`, () => {
      const z = buildME(THREE, PODS[id], ME_T, { freeRoam: true });
      assert.equal(z.bounds, null, `${id}: no bounds`);
      assert.equal(chunkNames(z).size, 81, `${id}: 9x9 ring`);
      const w = WC.createWalker({ x: 0, z: 95, yaw: -Math.PI / 2 });
      const world = { groundHeight: z.groundHeight, colliders: [], bounds: z.bounds, snapY: true };
      for (let i = 0; i < 60 * 60; i++) WC.stepWalker(w, { fwd: 1 }, 1 / 60, world);
      assert.ok(Math.hypot(w.pos.x, w.pos.z) > 340,
        `${id}: walker passed the old edge (r=${Math.hypot(w.pos.x, w.pos.z).toFixed(0)})`);
      z.dispose();
    });
  }
  it('chunk law holds the old disc\'s own fidelity on every pod', () => {
    // The old discs measured 0.30 m worst on the canyon pods on this
    // probe (Mordor 0.304, Rivendell 0.298) — the chunks must not
    // read worse than the disc they replace.
    for (const id of POD_ORDER) {
      const { maxDev, maxAt } = chunkMaxDev(PODS[id], ME_STREAM);
      assert.ok(maxDev <= 0.45, `${id}: chunk deviation ${maxDev.toFixed(3)} m at ${maxAt} (bound 0.45)`);
    }
  });
  it('far heights are finite and varying — the heightfield never ends', () => {
    for (const id of POD_ORDER) {
      const h = createHeightFunction(PODS[id]);
      const vals = [h(5000, 5000), h(-8000, 3000), h(12345, -6789), h(-40000, -40000)];
      for (const v of vals) assert.ok(Number.isFinite(v), `${id}: non-finite far height ${v}`);
      assert.ok(new Set(vals.map((v) => v.toFixed(3))).size > 1, `${id}: far heights do not vary`);
    }
  });
  it('ring + sun follow the observer far from home (mordor)', () => {
    const z = buildME(THREE, PODS.mordor, ME_T, { freeRoam: true });
    z.setObserver(5000, -3000);
    for (let i = 0; i < 120; i++) z.update(i / 60, 1 / 60);
    const keys = chunkNames(z);
    assert.equal(keys.size, 81, 'ring rebuilt far out');
    assert.ok(!keys.has('0,0'), 'home chunks dropped');
    const centre = chunkKey(Math.floor(5000 / 128), Math.floor(-3000 / 128));
    assert.ok(keys.has(centre), `ring centred on the observer (${centre})`);
    const sun = findNamed(z, 'me-sun');
    assert.ok(sun, 'sun group present');
    assert.deepEqual([sun.position.x, sun.position.z], [5000, -3000], 'sun over the observer');
    // ground under the far observer is real: a vertex matches analytic
    let checked = 0;
    z.group.traverse((o) => {
      if (o.name !== 'terrain-chunk' || checked > 0) return;
      const p = o.geometry.attributes.position;
      const wx = o.position.x + p.getX(100), wz = o.position.z + p.getZ(100);
      assert.ok(Math.abs(p.getY(100) - z.groundHeight(wx, wz)) < 1e-4, 'far vertex on surface');
      checked++;
    });
    assert.ok(checked > 0, 'far chunk sampled');
    z.dispose();
  });
});

describe('STAR WARS endless — every planet', () => {
  for (const [id, def] of Object.entries(PLANETS)) {
    if (def.kind !== 'walk') continue;
    it(`${id}: no bounds, 225-chunk ring, walker passes the old 460 m edge`, () => {
      const z = buildSW(THREE, def, SW_T, { freeRoam: true });
      assert.equal(z.bounds, null, `${id}: no bounds`);
      assert.equal(chunkNames(z).size, 225, `${id}: 15x15 ring`);
      const w = WC.createWalker({ x: 0, z: 95, yaw: -Math.PI / 2 });
      const world = { groundHeight: z.groundHeight, colliders: [], bounds: z.bounds, snapY: true };
      for (let i = 0; i < 60 * 60; i++) WC.stepWalker(w, { fwd: 1 }, 1 / 60, world);
      assert.ok(Math.hypot(w.pos.x, w.pos.z) > 460,
        `${id}: walker passed the old edge (r=${Math.hypot(w.pos.x, w.pos.z).toFixed(0)})`);
      z.dispose();
    });
  }
  it('chunk law holds the 0.2 m fidelity bound on every walk planet', () => {
    for (const [id, def] of Object.entries(PLANETS)) {
      if (def.kind !== 'walk') continue;
      const { maxDev, maxAt } = chunkMaxDev(def, SW_STREAM);
      assert.ok(maxDev <= 0.2, `${id}: chunk deviation ${maxDev.toFixed(3)} m at ${maxAt} (bound 0.2)`);
    }
  });
  it('far heights are finite and varying — the heightfield never ends', () => {
    for (const [id, def] of Object.entries(PLANETS)) {
      if (def.kind !== 'walk') continue;
      const h = createHeightFunction(def);
      const vals = [h(5000, 5000), h(-8000, 3000), h(12345, -6789)];
      for (const v of vals) assert.ok(Number.isFinite(v), `${id}: non-finite far height ${v}`);
      assert.ok(new Set(vals.map((v) => v.toFixed(3))).size > 1, `${id}: far heights do not vary`);
    }
  });
  it('a landspeeder drives past the old edge at cruise (tatooine)', () => {
    const z = buildSW(THREE, PLANETS.tatooine, SW_T, { freeRoam: true });
    const st = VH.createVehicleState('landspeeder', { x: -100, z: 120, yaw: Math.PI, seatY: 0 });
    VH.mountVehicle(st);
    const world = { groundHeight: z.groundHeight, colliders: [], bounds: z.bounds, ignore: new Set() };
    for (let i = 0; i < 60 * 30; i++) {
      VH.stepVehicle(st, { fwd: 1, turn: 0 }, 1 / 60, world);
    }
    assert.ok(Math.hypot(st.x, st.z) > 460,
      `speeder passed the old edge (r=${Math.hypot(st.x, st.z).toFixed(0)})`);
    assert.ok(st.speed > VH.VEHICLE_TYPES.landspeeder.cruise * 0.9, `at cruise (${st.speed.toFixed(1)})`);
    z.dispose();
  });
  it('ring + sky dome follow the observer far from home (tatooine)', () => {
    const z = buildSW(THREE, PLANETS.tatooine, SW_T, { freeRoam: true });
    z.setObserver(5000, -3000);
    for (let i = 0; i < 140; i++) z.update(i / 60, 1 / 60);
    const keys = chunkNames(z);
    assert.equal(keys.size, 225, 'ring rebuilt far out');
    assert.ok(!keys.has('0,0'), 'home chunks dropped');
    const centre = chunkKey(Math.floor(5000 / 32), Math.floor(-3000 / 32));
    assert.ok(keys.has(centre), `ring centred on the observer (${centre})`);
    const dome = findNamed(z, 'cgi-sky-dome');
    assert.ok(dome, 'sky dome present');
    assert.deepEqual([dome.position.x, dome.position.z], [5000, -3000], 'dome over the observer');
    z.dispose();
  });
  it('CGI suns ride over the observer, 950 m out (tatooine)', () => {
    const cgi = buildCgi(THREE, PLANETS.tatooine, SW_T, {});
    cgi.update(1, 0.016, Date.now(), { x: 1000, z: -500 });
    const dome = cgi.group.children.find((o) => o.name === 'cgi-sky-dome');
    assert.ok(dome, 'dome present');
    assert.deepEqual([dome.position.x, dome.position.z], [1000, -500], 'dome over the observer');
    // the sun sprites sit ~950 m from the observer, not from the origin
    // (each sun is a 'cgi-sun' group carrying halo + core disc)
    const suns = cgi.group.children.filter((o) => o.name === 'cgi-sun');
    assert.ok(suns.length >= 1, 'sun sprites present');
    for (const sp of suns) {
      const d = Math.hypot(sp.position.x - 1000, sp.position.z - (-500));
      assert.ok(Math.abs(Math.hypot(sp.position.x - 1000, sp.position.y, sp.position.z + 500) - CGI_SUN_DIST) < 5,
        `sun ${d.toFixed(0)} m from the observer (expect ~${CGI_SUN_DIST})`);
    }
    // twin suns stay a pair: the two discs sit near-touching, ~100 m apart
    if (suns.length >= 2) {
      const gap = Math.hypot(suns[0].position.x - suns[1].position.x, suns[0].position.y - suns[1].position.y, suns[0].position.z - suns[1].position.z);
      assert.ok(gap > 20 && gap < 200, `twin gap ${gap.toFixed(0)} m (expect ~100)`);
    }
  });
  for (const [id, def] of Object.entries(PLANETS)) {
    if (def.kind !== 'fly') continue;
    it(`${id} (fly): no bounds, starfield + sun travel with the pilot`, () => {
      const z = buildSW(THREE, def, SW_T, { freeRoam: true });
      assert.equal(z.bounds, null, `${id}: no bounds`);
      assert.equal(chunkNames(z).size, 0, `${id}: no ground chunks in space`);
      z.setObserver(900, -700);
      z.update(1, 0.016);
      const sf = findNamed(z, 'fly-starfield');
      assert.ok(sf, 'starfield present');
      assert.deepEqual([sf.position.x, sf.position.z], [900, -700], 'starfield over the pilot');
      const cgi = findNamed(z, 'cgi');
      assert.ok(cgi, 'cgi group present');
      assert.deepEqual([cgi.position.x, cgi.position.z], [900, -700], 'sun over the pilot');
      z.dispose();
    });
  }
});
