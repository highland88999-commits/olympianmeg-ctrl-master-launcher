// tests/earth3-cgi.test.mjs
// EARTH 3 CGI — the world around the real dinos and real trees
// (Merlin, Nov 14, 2026). Helpers live in lib/earth3/cgi.js and
// are pure functions of the device clock; the scene only wires
// them in. Run: node --test tests/earth3-cgi.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  PLANET_CGI_EPOCH_MS,
  groundDetailMaps,
  waterShimmerOffset,
  waterShimmerTexture,
  sunShimmer,
  cloudBreath,
  vegetationSway,
  makeEarth3Dust,
  arcticIceMaps,
} from '../lib/earth3/cgi.js';
import { updateDustField } from '../lib/planet-cgi/motion.js';
import { planetMaps } from '../lib/planet-cgi/textures.js';

const T0 = PLANET_CGI_EPOCH_MS + 60000;

describe('earth3 ground detail', () => {
  it('is a near-white detail map + real bump, tiled, cached per seed', () => {
    const a = groundDetailMaps('earth3-ground');
    assert.ok(a.map instanceof THREE.DataTexture);
    assert.ok(a.bumpMap instanceof THREE.DataTexture);
    assert.equal(a.map.image.width, 256);
    assert.ok(a.bumpScale > 0, 'bumpScale set');
    assert.equal(a.map.repeat.x, 24, 'tiled 24x so the grain reads');
    assert.equal(a.bumpMap.repeat.x, 24);
    // Near-white: it multiplies the vertex-colour zones without
    // repainting them (mean ~0.88, never below ~0.72).
    const d = a.map.image.data;
    let sum = 0;
    let lo = 255;
    for (let i = 0; i < d.length; i += 4) {
      sum += d[i];
      if (d[i] < lo) lo = d[i];
    }
    const mean = sum / (d.length / 4);
    assert.ok(mean > 200 && mean < 245, `detail mean ${mean.toFixed(1)} stays near-white`);
    assert.ok(lo >= 180, `darkest grain ${lo} never repaints a zone`);
    // The bump carries real relief, not flat grey.
    const bd = a.bumpMap.image.data;
    let blo = 255;
    let bhi = 0;
    for (let i = 0; i < bd.length; i++) {
      if (bd[i] < blo) blo = bd[i];
      if (bd[i] > bhi) bhi = bd[i];
    }
    assert.ok(bhi - blo > 40, 'ground bump has relief');
    assert.equal(a, groundDetailMaps('earth3-ground'), 'same seed returns the cached pair');
    assert.notEqual(a.map, groundDetailMaps('other-seed').map, 'different seed, different map');
  });

  it('the rock and iceCap families resolve through planetMaps', () => {
    for (const fam of ['rock', 'iceCap']) {
      const { map, bumpMap } = planetMaps(fam, 'earth3-check');
      assert.ok(map instanceof THREE.DataTexture);
      assert.ok(bumpMap instanceof THREE.DataTexture);
    }
  });
});

describe('earth3 water shimmer', () => {
  it('scroll offsets live in 0..1, move with the clock, deterministic', () => {
    const a = waterShimmerOffset(T0);
    const b = waterShimmerOffset(T0 + 1000);
    assert.ok(a.u >= 0 && a.u < 1 && a.v >= 0 && a.v < 1);
    assert.notDeepEqual(a, b, 'the shimmer scrolls');
    assert.deepEqual(a, waterShimmerOffset(T0), 'same instant, same offset');
    // U and V run on different rates, so the sheet never slides
    // as one diagonal.
    assert.notEqual(a.u, a.v);
  });

  it('the shimmer texture is white streaks on transparency', () => {
    const tex = waterShimmerTexture('earth3-water');
    assert.equal(tex.image.width, 256);
    assert.equal(tex.repeat.x, 3);
    const d = tex.image.data;
    let transparent = 0;
    let opaque = 0;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 30) transparent++;
      if (d[i] > 180) opaque++;
    }
    assert.ok(transparent > 0 && opaque > 0, 'streaks, not a sheet');
  });
});

describe('earth3 sky', () => {
  it('sun shimmer breathes 0..1 on the real clock', () => {
    const a = sunShimmer(T0);
    const b = sunShimmer(T0 + 3000);
    assert.ok(a >= 0 && a <= 1);
    assert.notEqual(a, b, 'the glow breathes');
    assert.equal(a, sunShimmer(T0), 'same instant, same shimmer');
  });

  it('cloud breath stays 0.70..1.00, varies with clock and phase', () => {
    const a = cloudBreath(T0, 0);
    const b = cloudBreath(T0 + 2000, 0);
    const c = cloudBreath(T0, 2.4);
    for (const v of [a, b, c]) assert.ok(v >= 0.7 && v <= 1.0, `breath ${v}`);
    assert.notEqual(a, b, 'breath moves with the clock');
    assert.notEqual(a, c, 'phase separates the clouds');
    assert.equal(a, cloudBreath(T0, 0), 'deterministic');
  });
});

describe('earth3 vegetation sway', () => {
  it('leans a fraction of a degree, bounded, per-plant phase, clock-driven', () => {
    const a = vegetationSway(0, T0);
    const b = vegetationSway(0, T0 + 1000);
    const c = vegetationSway(7, T0);
    assert.ok(Math.abs(a.rz) <= 0.05, 'rz within amplitude');
    assert.ok(Math.abs(a.rx) <= 0.03, 'rx within 0.6 * amplitude');
    assert.notDeepEqual(a, b, 'sway moves with the clock');
    assert.notDeepEqual(a, c, 'neighbours sway on their own phase');
    assert.deepEqual(a, vegetationSway(0, T0), 'same instant, same lean');
  });
});

describe('earth3 dust motes', () => {
  it('two fields: main over the gardens, small over the island', () => {
    const [main, island] = makeEarth3Dust();
    assert.equal(main.geometry.getAttribute('position').count, 220);
    assert.equal(island.geometry.getAttribute('position').count, 60);
    assert.equal(island.position.x, -50);
    assert.equal(island.position.z, 175);
    assert.equal(main.position.x, 0, 'main field is centred on the plaza');
  });

  it('motes drift without leaving their box, deterministically', () => {
    const [main, island] = makeEarth3Dust();
    updateDustField(main, T0 + 20000);
    updateDustField(island, T0 + 20000);
    const check = (field, w, h, yBase) => {
      const arr = field.geometry.getAttribute('position').array;
      const n = field.geometry.getAttribute('position').count;
      for (let i = 0; i < n; i++) {
        assert.ok(Math.abs(arr[i * 3]) <= w / 2 + 0.6, 'motes stay in the box (x)');
        assert.ok(arr[i * 3 + 1] >= yBase - 0.3 && arr[i * 3 + 1] <= yBase + h + 0.3, 'motes stay in the box (y)');
        assert.ok(Math.abs(arr[i * 3 + 2]) <= w / 2 + 0.6, 'motes stay in the box (z)');
      }
    };
    check(main, 260, 4.5, 0.3);
    check(island, 90, 4, 6.4);
    // Same instant, same positions; a later instant moves them.
    const snap = Array.from(main.geometry.getAttribute('position').array.slice(0, 9));
    updateDustField(main, T0 + 20000);
    assert.deepEqual(Array.from(main.geometry.getAttribute('position').array.slice(0, 9)), snap);
    updateDustField(main, T0 + 26000);
    assert.notDeepEqual(Array.from(main.geometry.getAttribute('position').array.slice(0, 9)), snap);
  });
});

describe('earth3 arctic ice', () => {
  it('iceCap is white-blue crystal with crevasse relief', () => {
    const { map, bumpMap, roughness } = arcticIceMaps('earth3-arctic');
    assert.ok(map instanceof THREE.DataTexture);
    assert.ok(roughness > 0 && roughness < 1);
    const d = map.image.data;
    let r = 0;
    let g = 0;
    let b = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
    }
    assert.ok(r / n > 200, 'ice is white');
    assert.ok(b / n >= r / n, 'ice leans blue, not warm');
    const bd = bumpMap.image.data;
    let lo = 255;
    let hi = 0;
    for (let i = 0; i < bd.length; i++) {
      if (bd[i] < lo) lo = bd[i];
      if (bd[i] > hi) hi = bd[i];
    }
    assert.ok(hi - lo > 30, 'ice bump carries crevasse relief');
  });
});
