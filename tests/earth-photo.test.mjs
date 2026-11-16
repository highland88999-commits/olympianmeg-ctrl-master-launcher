// tests/earth-photo.test.mjs
// EARTH PHOTO WRAP — the Earth wears Merlin's night map (Nov 15, 2026).
// His photograph of Earth at night (city lights, 1170x585 2:1 equirect)
// wraps both Earth globes: the Earth in the /moon sky (MoonScene
// EarthInSky, via makeEarthPhotoTexture — the Moon wrap's pattern,
// procedural earthLike maps as the fallback) and the hub's procedural
// fallback globe (ProceduralEarthGlobe — the photo IS its night
// texture slot, public/textures/earth/earth-night.jpg, so the day
// side keeps the day satellite imagery and the terminator still
// works). The Google photorealistic tiles globe is streamed imagery
// and cannot be wrapped — it stays untouched. Run:
// node --test tests/earth-photo.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TERRAIN_TEXTURES } from '../lib/terrain.js';

const moonSceneSrc = readFileSync(new URL('../components/MoonScene.jsx', import.meta.url), 'utf8');
const globeSrc = readFileSync(new URL('../components/ProceduralEarthGlobe.jsx', import.meta.url), 'utf8');
const nexusSrc = readFileSync(new URL('../components/NexusEarth.jsx', import.meta.url), 'utf8');
const terrainSrc = readFileSync(new URL('../lib/terrain.js', import.meta.url), 'utf8');

const EARTH_NIGHT_SHA256 = '69f5fcec594d3da97589a52f6989afc5a739e3c0f6e1d17d1c0d630437a87ce1';

// Minimal JPEG dimension reader (SOF0/SOF2) — no image deps.
function jpegDimensions(buf) {
  assert.equal(buf[0], 0xff);
  assert.equal(buf[1], 0xd8, 'not a JPEG (no SOI marker)');
  let off = 2;
  while (off < buf.length - 1) {
    if (buf[off] !== 0xff) { off += 1; continue; }
    const marker = buf[off + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
    const len = buf.readUInt16BE(off + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      return { width: buf.readUInt16BE(off + 7), height: buf.readUInt16BE(off + 5) };
    }
    off += 2 + len;
  }
  throw new Error('no SOF marker found in the Earth photo');
}

describe('Earth night photo file', () => {
  it('the photo is Merlin\u2019s file at the night slot, JPEG, 1170x585, exactly 2:1', () => {
    const buf = readFileSync(new URL('../public/textures/earth/earth-night.jpg', import.meta.url));
    assert.equal(buf.length, 77837, 'the photo is Merlin\u2019s file, uncut (77,837 bytes)');
    assert.equal(buf[0], 0xff);
    assert.equal(buf[1], 0xd8, 'JPEG magic');
    const { width, height } = jpegDimensions(buf);
    assert.equal(width, 1170, 'photo is 1170 wide');
    assert.equal(height, 585, 'photo is 585 high');
    assert.equal(width, height * 2, 'exactly 2:1 — a proper equirectangular map');
    assert.equal(
      createHash('sha256').update(buf).digest('hex'),
      EARTH_NIGHT_SHA256,
      'byte-identical to the upload Merlin sent',
    );
  });

  it('the day and height textures are untouched', () => {
    const day = readFileSync(new URL('../public/textures/earth/earth-day.jpg', import.meta.url));
    assert.equal(day.length, 244680, 'day satellite imagery untouched');
    const topo = readFileSync(new URL('../public/textures/earth/earth-topology.png', import.meta.url));
    assert.equal(topo.length, 378243, 'elevation heightmap untouched');
    assert.equal(topo[0], 0x89, 'topology still a PNG');
  });
});

describe('Moon-sky Earth wraps the photo (makeEarthPhotoTexture)', () => {
  it('MoonScene loads the photo and keeps the procedural maps as fallback', () => {
    assert.ok(moonSceneSrc.includes("EARTH_NIGHT_PHOTO_URL = '/textures/earth/earth-night.jpg'"), 'the photo URL is a named constant at the night slot');
    assert.ok(moonSceneSrc.includes('export function makeEarthPhotoTexture()'), 'the shared Earth photo texture is exported');
    assert.ok(moonSceneSrc.includes("planetMaps('earthLike', 'earth')"), 'procedural earthLike maps still the fallback');
    assert.ok(moonSceneSrc.includes('new THREE.TextureLoader().load('), 'the photo loads through TextureLoader');
    assert.ok(moonSceneSrc.includes('EARTH_NIGHT_PHOTO_URL,'), 'the loader loads the named photo URL');
    assert.ok(moonSceneSrc.includes('tex.image = loaded.image'), 'the photo swaps into the shared texture on load');
    assert.ok(moonSceneSrc.includes('photo failed'), 'a failed load keeps the procedural canvas');
    assert.ok(moonSceneSrc.includes("typeof document === 'undefined'"), 'node/prerender stays procedural (no DOM)');
    assert.ok(!moonSceneSrc.includes('makeEarthTexture'), 'the old flat-canvas Earth function stays gone');
  });

  it('the photo is north-up on the sphere and the fallback keeps its orientation', () => {
    assert.ok(moonSceneSrc.includes('tex.flipY = false'), 'procedural canvas matches the south-up DataTexture');
    assert.ok(moonSceneSrc.includes('tex.flipY = true'), 'the north-up photo flips to the pole on load');
    assert.ok(moonSceneSrc.includes('tex.colorSpace = THREE.SRGBColorSpace'), 'photo keeps sRGB colour like the procedural map');
  });

  it('EarthInSky uses the photo texture and keeps its clouds, rim and label', () => {
    assert.ok(moonSceneSrc.includes('useMemo(() => makeEarthPhotoTexture(), [])'), 'the sky Earth renders the photo texture');
    assert.ok(moonSceneSrc.includes('<sphereGeometry args={[EARTH_RADIUS, 48, 32]}'), 'the sky Earth is a sphere — the equirect wrap is correct');
    assert.ok(moonSceneSrc.includes('cloudLayerTexture'), 'clouds still live on their own layer');
    assert.ok(moonSceneSrc.includes('EARTH_ATMO_RADIUS'), 'the atmosphere rim stays');
    assert.ok(moonSceneSrc.includes('MOON_OLYMPUS_LABEL_SIZE'), 'the OLYMPUS label stays as-is');
    assert.ok(moonSceneSrc.includes('◈ EARTH'), 'the EARTH label stays');
  });
});

describe('hub procedural globe wears the photo on its night side', () => {
  it('the night slot still points at the replaced file and the globe loads it', () => {
    assert.equal(TERRAIN_TEXTURES.night, '/textures/earth/earth-night.jpg', 'the night slot path is unchanged — the photo IS that file');
    assert.equal(TERRAIN_TEXTURES.day, '/textures/earth/earth-day.jpg', 'the day slot is untouched');
    assert.ok(terrainSrc.includes("night: '/textures/earth/earth-night.jpg'"), 'the constant still pins the night path');
    assert.ok(globeSrc.includes('load(TERRAIN_TEXTURES.night)'), 'the globe loads the night texture through its loader');
    assert.ok(globeSrc.includes('nightTexture'), 'the shader still blends the night texture');
    assert.ok(globeSrc.includes('dayTexture'), 'the day side keeps the day satellite imagery');
  });

  it('the Google photorealistic tiles globe is untouched', () => {
    assert.ok(nexusSrc.includes('<GoogleEarthTiles'), 'tiles stay the primary hub globe');
    assert.ok(!nexusSrc.includes('EARTH_NIGHT_PHOTO_URL'), 'the tiles globe does not take the photo');
    assert.ok(!nexusSrc.includes('earth-night.jpg'), 'no photo wiring in the tiles path');
    assert.ok(nexusSrc.includes('<ProceduralEarthGlobe'), 'the fallback globe still renders');
  });
});
