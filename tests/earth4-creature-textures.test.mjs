/**
 * earth4-creature-textures.test.mjs — procedural surface maps.
 *
 * Every surface family must produce a 128x128 colour map (RGBA,
 * luminance kept in 0.62-1.0 so map x class colour never goes black)
 * and a bump map, deterministically per seed, with the research
 * roughness per family. Materials are shared per (family, seed,
 * colour) — never per creature.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  TEXTURE_SIZE, FAMILY_STYLE, SURFACE_FAMILIES, hashString, mulberry32,
  valueNoise, surfaceMaps, materialForSurface, textureStats,
} from '../lib/earth4/creature-textures.js';

describe('seeded noise', () => {
  it('hashString is stable and spreads', () => {
    assert.equal(hashString('Mammalia'), hashString('Mammalia'));
    assert.notEqual(hashString('Mammalia'), hashString('Aves'));
  });

  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    assert.equal(a(), b());
    assert.equal(a(), b());
    const c = mulberry32(43);
    assert.notEqual(a(), c());
  });

  it('valueNoise is smooth and bounded', () => {
    const n0 = valueNoise(0.5, 0.5, 7);
    const n1 = valueNoise(0.51, 0.5, 7);
    assert.ok(n0 >= 0 && n0 <= 1);
    assert.ok(Math.abs(n0 - n1) < 0.1, 'neighbouring samples stay close');
    assert.equal(valueNoise(3.2, 9.7, 7), valueNoise(3.2, 9.7, 7));
  });
});

describe('surfaceMaps', () => {
  it('every family generates colour + bump maps at 128x128', () => {
    for (const family of SURFACE_FAMILIES) {
      const maps = surfaceMaps(family, 'TestClass');
      assert.equal(maps.map.image.width, TEXTURE_SIZE, family);
      assert.equal(maps.map.image.height, TEXTURE_SIZE, family);
      assert.equal(maps.map.image.data.length, TEXTURE_SIZE * TEXTURE_SIZE * 4, family);
      assert.equal(maps.bumpMap.image.data.length, TEXTURE_SIZE * TEXTURE_SIZE, family);
      assert.ok(maps.roughness > 0.2 && maps.roughness <= 1, `${family} roughness ${maps.roughness}`);
      assert.ok(maps.bumpScale > 0 && maps.bumpScale <= 0.2, `${family} bumpScale ${maps.bumpScale}`);
    }
  });

  it('colour maps stay in the 0.62-1.0 luminance band', () => {
    for (const family of SURFACE_FAMILIES) {
      const data = surfaceMaps(family, 'TestClass').map.image.data;
      let min = 255;
      let max = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < min) min = data[i];
        if (data[i] > max) max = data[i];
      }
      assert.ok(min >= Math.round(255 * 0.62) - 2, `${family}: min ${min}`);
      assert.ok(max <= 255, `${family}: max ${max}`);
      assert.ok(max > min + 10, `${family}: flat map`);
    }
  });

  it('same family + seed -> identical bytes; other seed -> different', () => {
    const a = surfaceMaps('fur', 'Mammalia').map.image.data;
    const b = surfaceMaps('fur', 'Mammalia').map.image.data;
    assert.deepEqual([...a], [...b]);
    const c = surfaceMaps('fur', 'Aves').map.image.data;
    assert.notDeepEqual([...a], [...c]);
  });

  it('unknown families fall back to skin', () => {
    const maps = surfaceMaps('no-such-family', 'TestClass');
    assert.equal(maps.roughness, FAMILY_STYLE.skin.roughness);
  });

  it('research roughness values hold', () => {
    assert.ok(FAMILY_STYLE.fur.roughness >= 0.8, 'dry fur is rough');
    assert.ok(FAMILY_STYLE.scale_fish.roughness <= 0.4, 'fish scales are glossy');
    assert.ok(FAMILY_STYLE.bark.roughness >= 0.9, 'bark is matte');
    assert.ok(FAMILY_STYLE.slime.roughness <= 0.3, 'slime is wet');
  });
});

describe('materialForSurface', () => {
  it('shares one material per (family, seed, colour)', () => {
    const colour = new THREE.Color(0x8a5a2b);
    const m1 = materialForSurface('fur', 'Mammalia', colour);
    const m2 = materialForSurface('fur', 'Mammalia', colour);
    assert.equal(m1, m2);
    const m3 = materialForSurface('fur', 'Aves', colour);
    assert.notEqual(m1, m3);
    assert.ok(m1.map && m1.bumpMap, 'textured');
    assert.ok(m1.userData.shared, 'shared — never disposed per creature');
  });

  it('textureStats counts the cache honestly', () => {
    const before = textureStats();
    surfaceMaps('thallus', 'SomeNewClass');
    const after = textureStats();
    assert.equal(after.textures, before.textures + 1);
    assert.ok(after.bytes > before.bytes);
  });
});
