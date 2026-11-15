// tests/planet-cgi.test.mjs
// PLANET CGI — shared procedural planet module (Merlin, Nov 14, 2026).
// Textures are seeded DataTextures (node-safe), motion is a pure
// function of the device clock. Run: node --test tests/planet-cgi.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  PLANET_FAMILIES,
  PLANET_TEXTURE_SIZE,
  planetMaps,
  materialForPlanet,
  GREAT_RED_SPOT_UV,
  spotSwirlTexture,
  cloudLayerTexture,
  planetTextureStats,
} from '../lib/planet-cgi/textures.js';
import {
  PLANET_CGI_EPOCH_MS,
  spinAngle,
  bandFlowOffset,
  cloudDriftAngle,
  makeDustField,
  updateDustField,
  waveFlag,
  lightningFlash,
  devilFor,
} from '../lib/planet-cgi/motion.js';

describe('planet textures', () => {
  it('every family builds a 256x256 colour + bump pair', () => {
    for (const fam of PLANET_FAMILIES) {
      const { map, bumpMap, roughness, bumpScale } = planetMaps(fam, 'test-seed');
      assert.ok(map instanceof THREE.DataTexture);
      assert.ok(bumpMap instanceof THREE.DataTexture);
      assert.equal(map.image.width, PLANET_TEXTURE_SIZE);
      assert.equal(map.image.height, PLANET_TEXTURE_SIZE);
      assert.equal(bumpMap.image.width, PLANET_TEXTURE_SIZE);
      assert.ok(roughness > 0 && roughness <= 1, `${fam} roughness`);
      assert.ok(bumpScale > 0, `${fam} bumpScale`);
      // Colour bytes are real RGBA (alpha 255 everywhere).
      const data = map.image.data;
      for (let i = 3; i < data.length; i += 4 * 997) {
        assert.equal(data[i], 255);
      }
    }
  });

  it('maps are deterministic per seed and cached per key', () => {
    const a = planetMaps('marsRegolith', 'olympus-mons');
    const b = planetMaps('marsRegolith', 'olympus-mons');
    assert.equal(a, b, 'same key returns the cached pair');
    const c = planetMaps('marsRegolith', 'valles-marineris');
    assert.notEqual(a.map, c.map, 'different seed, different map');
    // Byte-identical across two fresh builds of the same key.
    const d = planetMaps('lunarRegolith', 'mare-imbrium');
    const e = planetMaps('lunarRegolith', 'mare-imbrium');
    assert.deepEqual(
      Array.from(d.map.image.data.slice(0, 4096)),
      Array.from(e.map.image.data.slice(0, 4096)),
    );
  });

  it('unknown families fall back to rock, never throw', () => {
    const { map } = planetMaps('not-a-family', 'x');
    assert.ok(map instanceof THREE.DataTexture);
    assert.equal(planetTextureStats().textures >= 1, true);
  });

  it('lunar regolith is grey and cratered, mars regolith is red', () => {
    const moon = planetMaps('lunarRegolith', 'crater-check');
    const mars = planetMaps('marsRegolith', 'dune-check');
    const mean = (tex) => {
      const d = tex.image.data;
      let r = 0;
      let g = 0;
      let b = 0;
      const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
      }
      return [r / n, g / n, b / n];
    };
    const [mr, mg, mb] = mean(moon.map);
    assert.ok(Math.abs(mr - mg) < 6 && Math.abs(mg - mb) < 6, 'moon is grey');
    assert.ok(mr > 90 && mr < 190, 'moon mid-grey');
    const [rr, rg, rb] = mean(mars.map);
    assert.ok(rr > rg + 40 && rg > rb + 10, 'mars is rust-red');
    // The moon's bump map carries real relief (craters), not flat grey.
    const bd = moon.bumpMap.image.data;
    let lo = 255;
    let hi = 0;
    for (let i = 0; i < bd.length; i++) {
      if (bd[i] < lo) lo = bd[i];
      if (bd[i] > hi) hi = bd[i];
    }
    assert.ok(hi - lo > 120, 'moon bump has deep relief');
  });

  it('gas giant bands run horizontally (latitude), earth has oceans', () => {
    const gas = planetMaps('gasGiant', 'jupiter');
    const d = gas.map.image.data;
    const W = PLANET_TEXTURE_SIZE;
    // A horizontal row varies little (one band); a vertical column
    // crosses many bands, so it varies far more.
    const rowVar = (y) => {
      let lo = 255;
      let hi = 0;
      for (let x = 0; x < W; x++) {
        const v = d[(y * W + x) * 4];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      return hi - lo;
    };
    const colVar = (x) => {
      let lo = 255;
      let hi = 0;
      for (let y = 0; y < W; y++) {
        const v = d[(y * W + x) * 4];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      return hi - lo;
    };
    assert.ok(colVar(40) > rowVar(64) * 1.5, 'bands are horizontal');
    const earth = planetMaps('earthLike', 'home');
    const ed = earth.map.image.data;
    let blue = 0;
    for (let i = 0; i < ed.length; i += 4) {
      if (ed[i + 2] > ed[i] + 60 && ed[i + 2] > 150) blue++;
    }
    assert.ok(blue > ed.length / 4 / 4, 'earth is mostly ocean blue');
  });

  it('materials are shared per family+seed+tint', () => {
    const a = materialForPlanet('marsRegolith', 's', '#ffffff');
    const b = materialForPlanet('marsRegolith', 's', '#ffffff');
    assert.equal(a, b);
    assert.ok(a.userData.shared);
    assert.equal(a.map, planetMaps('marsRegolith', 's').map);
  });

  it('the Great Red Spot overlay is a transparent rust ellipse', () => {
    assert.ok(GREAT_RED_SPOT_UV.u > 0 && GREAT_RED_SPOT_UV.u < 1);
    assert.ok(GREAT_RED_SPOT_UV.v > 0 && GREAT_RED_SPOT_UV.v < 1);
    const tex = spotSwirlTexture();
    assert.equal(tex.image.width, 128);
    const d = tex.image.data;
    const center = (64 * 128 + 64) * 4;
    assert.ok(d[center + 3] > 200, 'spot core is opaque');
    assert.ok(d[3] < 40, 'spot corners are transparent');
    assert.ok(d[center] > d[center + 1] + 60, 'spot is rust-red');
  });

  it('the cloud layer is white streaks on transparency', () => {
    const tex = cloudLayerTexture('test-clouds');
    assert.equal(tex.image.width, 256);
    const d = tex.image.data;
    let transparent = 0;
    let opaque = 0;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 30) transparent++;
      if (d[i] > 180) opaque++;
    }
    assert.ok(transparent > 0 && opaque > 0, 'clouds are streaks, not a sheet');
    assert.ok(d[0] === 255 && d[1] === 255 && d[2] === 255, 'clouds are white');
  });
});

describe('planet motion', () => {
  it('spin is a pure function of the real clock', () => {
    const t = PLANET_CGI_EPOCH_MS + 60000;
    assert.equal(spinAngle(0.02, t), 1.2);
    assert.equal(spinAngle(0.02, t), spinAngle(0.02, t), 'same instant, same angle');
    assert.notEqual(spinAngle(0.02, t), spinAngle(0.02, t + 1000));
    assert.equal(spinAngle(0, t), 0);
  });

  it('band flow wraps 0..1 and clouds outrun the surface', () => {
    const a = bandFlowOffset(0.01, PLANET_CGI_EPOCH_MS + 50000);
    assert.ok(a >= 0 && a < 1);
    assert.equal(bandFlowOffset(0.01, PLANET_CGI_EPOCH_MS + 100000), 0);
    const t = PLANET_CGI_EPOCH_MS + 30000;
    assert.ok(cloudDriftAngle(0.02, t) > spinAngle(0.02, t), 'clouds lead the ground');
  });

  it('dust motes drift without leaving their box', () => {
    const field = makeDustField({ count: 50, width: 30, height: 6, depth: 30, seed: 't' });
    assert.equal(field.geometry.getAttribute('position').count, 50);
    updateDustField(field, PLANET_CGI_EPOCH_MS + 20000);
    const arr = field.geometry.getAttribute('position').array;
    for (let i = 0; i < 50; i++) {
      assert.ok(Math.abs(arr[i * 3]) <= 16, 'motes stay in the box (x)');
      assert.ok(arr[i * 3 + 1] >= 0 && arr[i * 3 + 1] <= 7, 'motes stay in the box (y)');
      assert.ok(Math.abs(arr[i * 3 + 2]) <= 16, 'motes stay in the box (z)');
    }
    // Deterministic: the same instant gives the same positions.
    const snap = Array.from(arr.slice(0, 9));
    updateDustField(field, PLANET_CGI_EPOCH_MS + 20000);
    assert.deepEqual(Array.from(field.geometry.getAttribute('position').array.slice(0, 9)), snap);
  });

  it('a flag waves at the free edge and stays pinned at the pole', () => {
    const geo = new THREE.PlaneGeometry(1.15, 0.65, 12, 6);
    waveFlag(geo, PLANET_CGI_EPOCH_MS + 3000, 1.15, 0.06);
    const arr = geo.getAttribute('position').array;
    // Leftmost column (pole edge, x = -w/2) barely moves; rightmost
    // (free edge) moves most.
    let poleMax = 0;
    let freeMax = 0;
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = geo.userData.flagBase[i * 3];
      const z = Math.abs(arr[i * 3 + 2]);
      if (x < -0.5) poleMax = Math.max(poleMax, z);
      if (x > 0.5) freeMax = Math.max(freeMax, z);
    }
    assert.ok(poleMax < 0.005, 'pole edge pinned');
    assert.ok(freeMax > 0.02, 'free edge waves');
    // Same instant, same wave.
    const snap = Array.from(arr.slice(0, 12));
    waveFlag(geo, PLANET_CGI_EPOCH_MS + 3000, 1.15, 0.06);
    assert.deepEqual(Array.from(geo.getAttribute('position').array.slice(0, 12)), snap);
  });

  it('lightning is mostly dark with sharp flashes, 0..1 always', () => {
    let flashed = 0;
    for (let i = 0; i < 200; i++) {
      const v = lightningFlash(PLANET_CGI_EPOCH_MS + i * 90, 't', 9000);
      assert.ok(v >= 0 && v <= 1);
      if (v > 0) flashed++;
    }
    assert.ok(flashed > 0 && flashed < 100, 'flashes are occasional, not constant');
    assert.equal(lightningFlash(PLANET_CGI_EPOCH_MS + 450, 't'), lightningFlash(PLANET_CGI_EPOCH_MS + 450, 't'));
  });

  it('the flash chance is tunable per storm — 0 never flashes, 1 always flashes', () => {
    let none = 0;
    let all = 0;
    for (let i = 0; i < 400; i++) {
      if (lightningFlash(PLANET_CGI_EPOCH_MS + i * 90, 't', 9000, 0) > 0) none++;
      if (lightningFlash(PLANET_CGI_EPOCH_MS + i * 90, 't', 9000, 1) > 0) all++;
    }
    assert.equal(none, 0, 'chance 0 never flashes');
    assert.equal(all, 400, 'chance 1 flashes every slice');
    // The default is the old rate (0.14): callers that pass no
    // chance keep exactly the sky they had.
    let def = 0;
    for (let i = 0; i < 400; i++) {
      if (lightningFlash(PLANET_CGI_EPOCH_MS + i * 90, 't') > 0) def++;
    }
    assert.ok(def > 0 && def < 200, `default rate still occasional (${def}/400)`);
  });

  it('dust devils live, wander and die on a 40 s cycle', () => {
    const d0 = devilFor(0, PLANET_CGI_EPOCH_MS + 1000);
    assert.ok(d0.alive);
    assert.ok(d0.height >= 4 && d0.height <= 13);
    assert.ok(d0.opacity >= 0 && d0.opacity <= 1);
    const d1 = devilFor(0, PLANET_CGI_EPOCH_MS + 1000);
    assert.deepEqual(d0, d1, 'same instant, same devil');
    const later = devilFor(0, PLANET_CGI_EPOCH_MS + 39000);
    assert.ok(later.opacity < d0.opacity || !later.alive, 'devils fade with age');
    assert.notEqual(devilFor(0, PLANET_CGI_EPOCH_MS + 41000).x, d0.x, 'a new cycle seeds elsewhere');
  });
});
