// tests/mars-cgi.test.mjs
// MARS CGI — the seeded exobiology surface gets the planet-cgi
// treatment (Merlin, Nov 14, 2026): marsRegolith texture multiplied
// over the vertex-coloured terrain, drifting dust, dust devils on
// the real clock, an Olympus Mons landmark, and breathing storm
// haze. Run: node --test tests/mars-cgi.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { generateMarsProfile, getTerrainHeight } from '../lib/mars/engine.js';
import {
  terrainMaterial,
  disposeTerrainMaterial,
  monsSite,
  monsSlopeMaterial,
  monsCapMaterial,
  hazeSpriteTexture,
  devilStreakTexture,
  MARS_TERRAIN_TEXTURE_REPEAT,
  DUST_DEVIL_COUNT,
  DUST_DEVIL_AREA,
  HAZE_COUNT,
  MONS_HEIGHT,
  MONS_RADIUS,
} from '../lib/mars/cgi.js';
import { planetMaps } from '../lib/planet-cgi/textures.js';
import {
  PLANET_CGI_EPOCH_MS,
  spinAngle,
  bandFlowOffset,
  makeDustField,
  updateDustField,
  devilFor,
} from '../lib/planet-cgi/motion.js';

const SEED = 'MARS-CGI-TEST';
const profile = generateMarsProfile(SEED);

const meanRgb = (tex) => {
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

describe('mars terrain texture', () => {
  it('marsRegolith exists and is rust-red', () => {
    const { map, bumpMap } = planetMaps('marsRegolith', SEED);
    assert.ok(map instanceof THREE.DataTexture);
    assert.ok(bumpMap instanceof THREE.DataTexture);
    const [r, g, b] = meanRgb(map);
    assert.ok(r > g + 40 && g > b + 10, `mars is rust-red, got ${r},${g},${b}`);
  });

  it('the ice-cap family exists and is pale (for the Mons summit)', () => {
    const { map } = planetMaps('iceCap', SEED);
    const [r, g, b] = meanRgb(map);
    assert.ok(r > 200 && g > 200 && b > 200, `ice cap is pale, got ${r},${g},${b}`);
    assert.ok(b >= r, 'ice cap leans blue-white');
  });

  it('the terrain material multiplies the map over vertex colours', () => {
    const mat = terrainMaterial(profile);
    assert.equal(mat.vertexColors, true, 'vertex colours stay on — map multiplies, not replaces');
    assert.ok(mat.map instanceof THREE.DataTexture);
    assert.ok(mat.bumpMap instanceof THREE.DataTexture);
    assert.equal(mat.map.repeat.x, MARS_TERRAIN_TEXTURE_REPEAT);
    assert.equal(mat.map.repeat.y, MARS_TERRAIN_TEXTURE_REPEAT);
    assert.equal(mat.bumpScale, planetMaps('marsRegolith', SEED).bumpScale);
    assert.equal(mat.roughness, planetMaps('marsRegolith', SEED).roughness);
    // The repeat lives on a clone: the shared cache is untouched.
    const shared = planetMaps('marsRegolith', SEED);
    assert.notEqual(mat.map, shared.map, 'terrain uses a cloned map');
    assert.equal(shared.map.repeat.x, 1, 'shared map repeat unpolluted');
    disposeTerrainMaterial(mat);
  });

  it('terrain material + Mons do not mutate the profile', () => {
    const before = JSON.stringify({
      seed: profile.seed,
      freq1: profile.freq1,
      freq2: profile.freq2,
      amp1: profile.amp1,
      amp2: profile.amp2,
      basins: profile.basins,
      counts: profile.counts,
    });
    terrainMaterial(profile);
    monsSite(profile);
    monsSlopeMaterial(profile);
    monsCapMaterial(profile);
    const after = JSON.stringify({
      seed: profile.seed,
      freq1: profile.freq1,
      freq2: profile.freq2,
      amp1: profile.amp1,
      amp2: profile.amp2,
      basins: profile.basins,
      counts: profile.counts,
    });
    assert.equal(after, before, 'seeds and profile values untouched');
  });
});

describe('mars dust', () => {
  it('dust motes stay in their box over the terrain', () => {
    const field = makeDustField({
      count: 120, width: 170, height: 8, depth: 170, yBase: 0.3, seed: SEED + '-dust',
    });
    assert.equal(field.geometry.getAttribute('position').count, 120);
    for (const dt of [0, 20000, 60000, 300000]) {
      updateDustField(field, PLANET_CGI_EPOCH_MS + dt);
      const arr = field.geometry.getAttribute('position').array;
      for (let i = 0; i < 120; i++) {
        assert.ok(Math.abs(arr[i * 3]) <= 86, `motes stay in the box (x) at ${dt}ms`);
        assert.ok(arr[i * 3 + 1] >= 0 && arr[i * 3 + 1] <= 9, `motes stay in the box (y) at ${dt}ms`);
        assert.ok(Math.abs(arr[i * 3 + 2]) <= 86, `motes stay in the box (z) at ${dt}ms`);
      }
    }
    // Deterministic: the same instant gives the same positions.
    updateDustField(field, PLANET_CGI_EPOCH_MS + 20000);
    const snap = Array.from(field.geometry.getAttribute('position').array.slice(0, 9));
    updateDustField(field, PLANET_CGI_EPOCH_MS + 20000);
    assert.deepEqual(
      Array.from(field.geometry.getAttribute('position').array.slice(0, 9)),
      snap,
    );
  });
});

describe('mars dust devils', () => {
  it('three devils, cycling on a 40 s life: fade and reseed', () => {
    assert.equal(DUST_DEVIL_COUNT, 3);
    const t0 = PLANET_CGI_EPOCH_MS + 1000;
    const d0 = devilFor(0, t0, DUST_DEVIL_AREA);
    assert.ok(d0.alive);
    assert.ok(d0.height >= 4 && d0.height <= 13);
    assert.ok(d0.opacity >= 0 && d0.opacity <= 1);
    assert.ok(Math.abs(d0.x) <= DUST_DEVIL_AREA / 2 + 14, 'devil stays on the patch (x)');
    assert.ok(Math.abs(d0.z) <= DUST_DEVIL_AREA / 2, 'devil stays on the patch (z)');
    assert.deepEqual(d0, devilFor(0, t0, DUST_DEVIL_AREA), 'same instant, same devil');
    // Late in life the devil fades out.
    const late = devilFor(0, PLANET_CGI_EPOCH_MS + 39000, DUST_DEVIL_AREA);
    assert.ok(late.opacity < d0.opacity || !late.alive, 'devils fade with age');
    // Next cycle seeds elsewhere.
    const next = devilFor(0, PLANET_CGI_EPOCH_MS + 41000, DUST_DEVIL_AREA);
    assert.notEqual(next.x, d0.x, 'a new cycle seeds elsewhere');
    // Every devil index is its own column.
    const d1 = devilFor(1, t0, DUST_DEVIL_AREA);
    assert.notDeepEqual([d1.x, d1.z], [d0.x, d0.z]);
    // The spin advances with the clock.
    assert.notEqual(devilFor(0, t0 + 5000, DUST_DEVIL_AREA).spin, d0.spin);
  });

  it('the devil streak texture is ragged, not a flat sheet', () => {
    const tex = devilStreakTexture();
    assert.equal(tex.image.width, 64);
    assert.equal(tex.wrapS, THREE.RepeatWrapping, 'streaks wrap around the column');
    const d = tex.image.data;
    let lo = 255;
    let hi = 0;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < lo) lo = d[i];
      if (d[i] > hi) hi = d[i];
    }
    assert.ok(hi - lo > 60, 'streaks vary in alpha');
    assert.ok(hi > 150, 'some streaks are dense');
    assert.ok(lo < 200, 'some streaks are faint');
  });
});

describe('mars olympus mons', () => {
  it('the site is seeded, deterministic, and stands on the terrain', () => {
    const a = monsSite(profile);
    const b = monsSite(generateMarsProfile(SEED));
    assert.deepEqual(a, b, 'same seed, same mountain');
    assert.ok(a.dist >= 70 && a.dist <= 78, `mons on the outer rise, got ${a.dist}`);
    assert.ok(Math.hypot(a.x, a.z) >= 70, 'mons clear of the basins and play area');
    assert.equal(a.y, getTerrainHeight(a.x, a.z, profile), 'mons base sits on the ground');
    assert.equal(a.height, MONS_HEIGHT);
    assert.equal(a.radius, MONS_RADIUS);
    // The summit cap covers the tip: cap apex just above the main apex.
    assert.ok(a.capY + a.capHeight / 2 > a.height, 'cap apex proud of the main apex');
    assert.ok(a.capRadius > 0 && a.capRadius < a.radius, 'cap is a summit, not a second mountain');
    const other = monsSite(generateMarsProfile('ARES-OTHER-SEED'));
    assert.notDeepEqual([other.x, other.z], [a.x, a.z], 'different seed, different site');
  });

  it('slope is rust, summit is ice, both shared per seed', () => {
    const slope = monsSlopeMaterial(profile);
    const [r, g, b] = meanRgb(slope.map);
    assert.ok(r > g + 40, 'mons slope is rust-red');
    const cap = monsCapMaterial(profile);
    const [cr, cg, cb] = meanRgb(cap.map);
    assert.ok(cr > 200 && cb >= cr, 'mons summit is pale ice');
    assert.equal(monsSlopeMaterial(profile), slope, 'slope material cached');
    assert.equal(monsCapMaterial(profile), cap, 'cap material cached');
  });
});

describe('mars storm haze', () => {
  it('the haze sprite is a soft disc: dense centre, transparent edge', () => {
    const tex = hazeSpriteTexture();
    assert.equal(tex.image.width, 64);
    assert.equal(tex.image.height, 64);
    const d = tex.image.data;
    const alpha = (x, y) => d[(y * 64 + x) * 4 + 3];
    assert.ok(alpha(32, 32) > 200, 'haze centre is dense');
    assert.ok(alpha(0, 0) < 10, 'haze corners are transparent');
    assert.ok(alpha(32, 0) < alpha(32, 16), 'haze fades toward the edge');
    assert.ok(HAZE_COUNT >= 3, 'several haze sprites, not one sheet');
  });

  it('band/texture offsets move with the clock', () => {
    const t = PLANET_CGI_EPOCH_MS + 60000;
    assert.notEqual(bandFlowOffset(0.01, t), bandFlowOffset(0.01, t + 30000));
    assert.notEqual(spinAngle(0.02, t), spinAngle(0.02, t + 1000));
    assert.equal(bandFlowOffset(0.01, t), bandFlowOffset(0.01, t), 'same instant, same offset');
    assert.ok(bandFlowOffset(0.01, t) >= 0 && bandFlowOffset(0.01, t) < 1, 'offset wraps 0..1');
  });
});
