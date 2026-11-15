// tests/jupiter-cgi.test.mjs
// JUPITER CGI — hub backdrop pass (Merlin, Nov 14, 2026).
// Jupiter has no walkable scene: the pass lives on the hub sphere —
// procedural gas-giant bands that flow, a swirling Great Red Spot,
// storm lightning. Run: node --test tests/jupiter-cgi.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  PLANET_TEXTURE_SIZE,
  planetMaps,
  GREAT_RED_SPOT_UV,
  spotSwirlTexture,
  spotAnchorOnSphere,
} from '../lib/planet-cgi/textures.js';
import {
  PLANET_CGI_EPOCH_MS,
  bandFlowOffset,
  spinAngle,
  lightningFlash,
} from '../lib/planet-cgi/motion.js';

// The rates HomeScene wires for Jupiter (components/HomeScene.jsx).
const JUPITER_BAND_FLOW_RATE = 0.003;
const JUPITER_SPOT_SWIRL_RATE = 0.03;
const JUPITER_RADIUS = 88;

describe('jupiter bands', () => {
  it('gas-giant bands run horizontally (latitude), not vertically', () => {
    const gas = planetMaps('gasGiant', 'jupiter');
    const d = gas.map.image.data;
    const W = PLANET_TEXTURE_SIZE;
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
    assert.ok(colVar(120) > rowVar(128) * 1.5, 'bands are horizontal (second sample)');
  });

  it('the band map wraps in U, so the flow has no seam', () => {
    const { map, bumpMap } = planetMaps('gasGiant', 'jupiter');
    assert.equal(map.wrapS, THREE.RepeatWrapping);
    assert.equal(bumpMap.wrapS, THREE.RepeatWrapping);
  });

  it('band offset changes with the clock and wraps 0..1', () => {
    const t0 = PLANET_CGI_EPOCH_MS;
    assert.equal(bandFlowOffset(JUPITER_BAND_FLOW_RATE, t0), 0);
    // 60 s of flow shifts the bands ~18% of a wrap — visible drift.
    const a60 = bandFlowOffset(JUPITER_BAND_FLOW_RATE, t0 + 60000);
    assert.ok(Math.abs(a60 - 0.18) < 1e-9, `60 s of flow is 0.18, got ${a60}`);
    assert.notEqual(
      bandFlowOffset(JUPITER_BAND_FLOW_RATE, t0 + 1000),
      bandFlowOffset(JUPITER_BAND_FLOW_RATE, t0 + 2000),
      'offset moves with the clock',
    );
    for (let i = 0; i < 50; i++) {
      const o = bandFlowOffset(JUPITER_BAND_FLOW_RATE, t0 + i * 7000);
      assert.ok(o >= 0 && o < 1, `offset stays in 0..1, got ${o}`);
    }
    // Wrap: a full cycle returns to 0 (checked at a round rate).
    assert.equal(bandFlowOffset(0.01, PLANET_CGI_EPOCH_MS + 100000), 0);
    assert.ok(bandFlowOffset(0.01, PLANET_CGI_EPOCH_MS + 99900) > 0.9, 'approaches 1 before wrapping');
  });
});

describe('great red spot', () => {
  it('the spot UV sits on the southern temperate belt', () => {
    // v = 1 is the north pole, v = 0 the south pole: latitude is
    // (v - 0.5) * 180. Jupiter's southern temperate belt is ~15–40°S.
    const { u, v } = GREAT_RED_SPOT_UV;
    assert.ok(u > 0 && u < 1, 'u is on the map');
    const latitude = (v - 0.5) * 180;
    assert.ok(latitude < -15 && latitude > -40, `spot latitude is ${latitude}° (southern temperate belt)`);
  });

  it('the spot anchor lands on the sphere, south of the equator', () => {
    const anchor = spotAnchorOnSphere(GREAT_RED_SPOT_UV, JUPITER_RADIUS, 1.0);
    // On the surface (+1 lift), southern hemisphere.
    assert.ok(Math.abs(anchor.position.length() - (JUPITER_RADIUS + 1.0)) < 1e-6, 'anchor sits on the sphere');
    assert.ok(anchor.position.y < 0, 'anchor is south of the equator');
    const latitude = Math.asin(anchor.position.y / anchor.position.length()) * 180 / Math.PI;
    assert.ok(latitude < -15 && latitude > -40, `anchor latitude is ${latitude.toFixed(1)}°`);
    // The normal is unit length and points out of the sphere.
    assert.ok(Math.abs(anchor.normal.length() - 1) < 1e-9, 'normal is unit length');
    assert.ok(anchor.normal.dot(anchor.position) > 0, 'normal points outward');
    // The quaternion turns +Z (a decal plane's facing) onto the normal.
    assert.ok(Math.abs(anchor.quaternion.length() - 1) < 1e-9, 'quaternion is unit length');
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(anchor.quaternion);
    assert.ok(facing.distanceTo(anchor.normal) < 1e-9, 'plane faces outward');
    // The storm light sits just above the surface, at the storm.
    assert.ok(Math.abs(anchor.lightPosition.length() - (JUPITER_RADIUS + 16)) < 1e-6, 'storm light hugs the surface');
    assert.ok(anchor.lightPosition.distanceTo(anchor.position) < 20, 'storm light is at the storm');
  });

  it('the spot overlay is a transparent rust ellipse', () => {
    const tex = spotSwirlTexture();
    assert.equal(tex.image.width, 128);
    const d = tex.image.data;
    const center = (64 * 128 + 64) * 4;
    assert.ok(d[center + 3] > 200, 'spot core is opaque');
    assert.ok(d[3] < 40, 'spot corners are transparent');
    assert.ok(d[center] > d[center + 1] + 60, 'spot is rust-red');
  });

  it('the spot swirls slowly on its own clock', () => {
    const t = PLANET_CGI_EPOCH_MS + 30000;
    const a = spinAngle(JUPITER_SPOT_SWIRL_RATE, t);
    assert.ok(a > 0 && a < Math.PI * 2, 'swirl angle is a real rotation');
    assert.equal(spinAngle(JUPITER_SPOT_SWIRL_RATE, t), spinAngle(JUPITER_SPOT_SWIRL_RATE, t), 'same instant, same swirl');
    assert.notEqual(a, spinAngle(JUPITER_SPOT_SWIRL_RATE, t + 1000), 'swirl moves with the clock');
    // Slow: a full turn takes over 3 minutes, so 10 s is a small turn.
    const turn10s = spinAngle(JUPITER_SPOT_SWIRL_RATE, t + 10000) - a;
    assert.ok(turn10s > 0 && turn10s < 0.5, '10 s of swirl is a small turn');
  });
});

describe('jupiter lightning', () => {
  it('flashes are occasional and always in 0..1', () => {
    let flashed = 0;
    let peak = 0;
    for (let i = 0; i < 400; i++) {
      const v = lightningFlash(PLANET_CGI_EPOCH_MS + i * 90, 'jupiter-storms');
      assert.ok(v >= 0 && v <= 1, `flash stays in 0..1, got ${v}`);
      if (v > 0) flashed++;
      if (v > peak) peak = v;
    }
    assert.ok(flashed > 0, 'storms do flash');
    assert.ok(flashed < 200, `flashes are occasional, not constant (${flashed}/400 slices)`);
    assert.ok(peak > 0.5, 'flashes peak hard, then decay');
    // Deterministic: the same instant flashes the same way.
    assert.equal(
      lightningFlash(PLANET_CGI_EPOCH_MS + 450, 'jupiter-storms'),
      lightningFlash(PLANET_CGI_EPOCH_MS + 450, 'jupiter-storms'),
    );
  });
});
