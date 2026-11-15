// tests/moon-cgi.test.mjs
// MOON CGI — the /moon scene is a CGI moon now (Merlin, Nov 14, 2026).
// The lunar surface, Earth and rocks come from the shared planet-CGI
// module (lib/planet-cgi); Earth turns on the real clock under its
// own drifting cloud layer, dust motes drift around the pad, the
// flag waves, and the OLYMPUS label is a small label again — not a
// billboard filling the spawn screen. The hub Moon's orbit is
// verified here too: it already advances on the real clock, so no
// fix was needed. Run: node --test tests/moon-cgi.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import { MOON_ORBIT_RADIUS, MOON_ORBIT_SPEED, moonPositionAt } from '../lib/hub-layout.js';
import { EARTH_CENTER, orbitTime } from '../lib/god-orbits.js';
import {
  MOON_EARTH_SPIN_RATE,
  MOON_OLYMPUS_LABEL_SIZE,
  MOON_FLAG_CLOTH,
  MOON_DUST_FIELD,
} from '../lib/moon.js';
import { planetMaps } from '../lib/planet-cgi/textures.js';
import {
  PLANET_CGI_EPOCH_MS,
  spinAngle,
  cloudDriftAngle,
  makeDustField,
  updateDustField,
  waveFlag,
} from '../lib/planet-cgi/motion.js';

const moonSceneSrc = readFileSync(new URL('../components/MoonScene.jsx', import.meta.url), 'utf8');
const hubMoonSrc = readFileSync(new URL('../components/HubMoon.jsx', import.meta.url), 'utf8');

describe('hub Moon orbit (verify it moves)', () => {
  it('one orbit takes exactly 240 s', () => {
    assert.equal(MOON_ORBIT_SPEED, (Math.PI * 2) / 240);
  });

  it('moonPositionAt advances with t and returns after one orbit', () => {
    const p0 = moonPositionAt(0);
    const p60 = moonPositionAt(60);
    const d = Math.hypot(p60.x - p0.x, p60.y - p0.y, p60.z - p0.z);
    assert.ok(d > 100, `the Moon moves a long way in 60 s (moved ${d.toFixed(1)})`);
    // Still on the orbit: 180 out from Earth, in the XZ plane.
    for (const t of [0, 60, 137, 240]) {
      const p = moonPositionAt(t);
      const r = Math.hypot(p.x - EARTH_CENTER.x, p.z - EARTH_CENTER.z);
      assert.ok(Math.abs(r - MOON_ORBIT_RADIUS) < 1e-9, `orbit radius holds at t=${t}`);
    }
    const p240 = moonPositionAt(240);
    assert.ok(Math.hypot(p240.x - p0.x, p240.y - p0.y, p240.z - p0.z) < 1e-9, 'back where it started after one orbit');
  });

  it('moonPositionAt(orbitTime()) advances on the real clock', () => {
    const now = orbitTime();
    assert.ok(typeof now === 'number' && now >= 0, 'orbitTime is a live clock');
    const a = moonPositionAt(now);
    const b = moonPositionAt(now + 60);
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 100, 'a minute later the Moon is elsewhere');
  });
});

describe('Moon CGI wiring', () => {
  it('HubMoon delegates the lunar texture to the shared module', () => {
    assert.ok(hubMoonSrc.includes("planetMaps('lunarRegolith', 'moon')"), 'makeMoonTexture delegates to planetMaps');
    assert.ok(hubMoonSrc.includes('bumpMap={maps.bumpMap}'), 'hub orb applies the bump map');
    assert.ok(!hubMoonSrc.includes('CanvasTexture'), 'no one-off canvas texture left');
  });

  it('MoonScene uses the shared module for surface, Earth, dust and flag', () => {
    assert.ok(moonSceneSrc.includes("makeMoonTexture } from './HubMoon'"), 'surface still one source of truth with the hub orb');
    assert.ok(moonSceneSrc.includes("planetMaps('earthLike', 'earth')"), 'Earth is the shared earthLike map');
    assert.ok(moonSceneSrc.includes('cloudLayerTexture'), 'clouds live on their own layer');
    assert.ok(moonSceneSrc.includes('cloudDriftAngle'), 'clouds drift on the real clock');
    assert.ok(moonSceneSrc.includes('makeDustField'), 'dust motes at the pad');
    assert.ok(moonSceneSrc.includes('waveFlag'), 'the flag waves');
    assert.ok(moonSceneSrc.includes("materialForPlanet('rock'"), 'rocks use the shared rock material');
    assert.ok(!moonSceneSrc.includes('makeEarthTexture'), 'the flat canvas Earth is gone');
    assert.ok(!moonSceneSrc.includes('fontSize={0.9}'), 'the giant OLYMPUS billboard size is gone');
  });

  it('the lunar surface the scene uses has a real bump map', () => {
    const { map, bumpMap } = planetMaps('lunarRegolith', 'moon');
    assert.ok(map instanceof THREE.DataTexture);
    assert.ok(bumpMap instanceof THREE.DataTexture);
    const bd = bumpMap.image.data;
    let lo = 255;
    let hi = 0;
    for (let i = 0; i < bd.length; i++) {
      if (bd[i] < lo) lo = bd[i];
      if (bd[i] > hi) hi = bd[i];
    }
    assert.ok(hi - lo > 120, 'moon bump has deep relief');
  });

  it('Earth turns on the real clock and clouds outrun the surface', () => {
    const t0 = PLANET_CGI_EPOCH_MS + 60000;
    const a0 = spinAngle(MOON_EARTH_SPIN_RATE, t0);
    const a1 = spinAngle(MOON_EARTH_SPIN_RATE, t0 + 10000);
    assert.notEqual(a0, a1, 'Earth has turned 10 s later');
    assert.ok(a0 >= 0 && a0 < Math.PI * 2, 'spin angle wraps 0..2π');
    const c0 = cloudDriftAngle(MOON_EARTH_SPIN_RATE, t0);
    assert.ok(c0 > a0, 'clouds lead the ground at the same instant');
    assert.notEqual(c0, cloudDriftAngle(MOON_EARTH_SPIN_RATE, t0 + 10000), 'clouds drift too');
    // Same instant, same angles — deterministic on every phone.
    assert.equal(spinAngle(MOON_EARTH_SPIN_RATE, t0), a0);
  });
});

describe('flag, dust, label', () => {
  it('the flag cloth is segmented and waves at the free edge, pinned at the pole', () => {
    assert.equal(MOON_FLAG_CLOTH.width, 1.15);
    assert.equal(MOON_FLAG_CLOTH.height, 0.65);
    assert.ok(MOON_FLAG_CLOTH.segmentsX >= 12 && MOON_FLAG_CLOTH.segmentsY >= 6, 'enough segments to ripple');
    const geo = new THREE.PlaneGeometry(
      MOON_FLAG_CLOTH.width,
      MOON_FLAG_CLOTH.height,
      MOON_FLAG_CLOTH.segmentsX,
      MOON_FLAG_CLOTH.segmentsY,
    );
    let freeMax = 0;
    for (let k = 0; k < 8; k++) {
      const now = PLANET_CGI_EPOCH_MS + k * 700;
      waveFlag(geo, now, MOON_FLAG_CLOTH.width, MOON_FLAG_CLOTH.amplitude);
      const pos = geo.getAttribute('position');
      const arr = pos.array;
      let poleMax = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = geo.userData.flagBase[i * 3];
        const z = Math.abs(arr[i * 3 + 2]);
        if (x < -0.5) poleMax = Math.max(poleMax, z);
        if (x > 0.5) freeMax = Math.max(freeMax, z);
      }
      assert.ok(poleMax < 0.005, `pole edge pinned at t+${k * 700}ms`);
    }
    assert.ok(freeMax > 0.02, 'free edge waves');
    assert.ok(freeMax <= MOON_FLAG_CLOTH.amplitude + 1e-9, 'wave never exceeds its amplitude');
  });

  it('dust motes stay inside the landing-site box', () => {
    const field = makeDustField(MOON_DUST_FIELD);
    assert.equal(field.geometry.getAttribute('position').count, MOON_DUST_FIELD.count);
    const { width, height, depth, yBase } = MOON_DUST_FIELD;
    for (let k = 0; k < 6; k++) {
      updateDustField(field, PLANET_CGI_EPOCH_MS + k * 5000);
      const arr = field.geometry.getAttribute('position').array;
      for (let i = 0; i < MOON_DUST_FIELD.count; i++) {
        // Drift is ±0.55 sideways, ±0.28 vertical (see motion.js).
        assert.ok(Math.abs(arr[i * 3]) <= width / 2 + 0.55 + 1e-6, 'motes stay in the box (x)');
        assert.ok(arr[i * 3 + 1] >= yBase - 0.28 - 1e-6 && arr[i * 3 + 1] <= yBase + height + 0.28 + 1e-6, 'motes stay in the box (y)');
        assert.ok(Math.abs(arr[i * 3 + 2]) <= depth / 2 + 0.55 + 1e-6, 'motes stay in the box (z)');
      }
    }
  });

  it('the OLYMPUS label is small and the scene uses the constant', () => {
    assert.ok(MOON_OLYMPUS_LABEL_SIZE <= 0.35, `label is a label, not a billboard (${MOON_OLYMPUS_LABEL_SIZE})`);
    assert.ok(MOON_OLYMPUS_LABEL_SIZE < 0.9, 'smaller than the old screen-filling 0.9');
    assert.ok(moonSceneSrc.includes('fontSize={MOON_OLYMPUS_LABEL_SIZE}'), 'the scene renders the constant, not a literal');
  });
});
