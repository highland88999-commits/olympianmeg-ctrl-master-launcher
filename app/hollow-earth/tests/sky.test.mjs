// WS4 sky (2026-11-16): the savage sky video (G-02 video wiring)
// + the static dome fallback + landmark art files (G-03).
// The video file is already made — this pins that the repo copy
// and every art file actually exist on disk, byte-identical for
// the video, and that the dome builder never blanks the scene.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';

const THREE = await import('three');
const {
  HOLLOW_EARTH_SKY_VIDEO_URL, HOLLOW_EARTH_SKY_ART_URL,
  HOLLOW_EARTH_SKY_DOME_RADIUS, HOLLOW_EARTH_SKY_FILES,
  buildSkyDome, applySkyTint, setSkyDomeMap,
} = await import('../sky.js');
const { artForLandmark, LANDMARK_ART_TYPES, LANDMARK_ART_FILES } = await import('../landmark-art.js');

const repoFile = (rel) => new URL(`../../../${rel}`, import.meta.url);

test('G-02: sky URLs + dome radius (370 m sits inside the 382 m shell)', () => {
  assert.equal(HOLLOW_EARTH_SKY_VIDEO_URL, '/videos/hollow-earth/monsterverse-sky.mp4');
  assert.equal(HOLLOW_EARTH_SKY_ART_URL, '/art/hollow-earth/hollow-earth-sky.jpg');
  assert.equal(HOLLOW_EARTH_SKY_DOME_RADIUS, 370);
  assert.deepEqual(HOLLOW_EARTH_SKY_FILES, [
    'public/videos/hollow-earth/monsterverse-sky.mp4',
    'public/art/hollow-earth/hollow-earth-sky.jpg',
  ]);
});

test('G-02: sky video file exists in the repo at the verified size', () => {
  const url = repoFile('public/videos/hollow-earth/monsterverse-sky.mp4');
  assert.ok(existsSync(url), 'monsterverse-sky.mp4 missing from public/videos/hollow-earth/');
  assert.equal(statSync(url).size, 6590704, 'sky video size must match the verified 6,590,704 B master');
});

test('G-02/G-03: static sky image + all eight landmark art files exist', () => {
  assert.ok(existsSync(repoFile('public/art/hollow-earth/hollow-earth-sky.jpg')), 'hollow-earth-sky.jpg missing');
  assert.equal(LANDMARK_ART_FILES.length, 8);
  for (const rel of LANDMARK_ART_FILES) {
    assert.ok(existsSync(repoFile(rel)), `${rel} missing`);
    assert.ok(statSync(repoFile(rel)).size > 100000, `${rel} suspiciously small`);
  }
  for (const type of LANDMARK_ART_TYPES) {
    assert.ok(artForLandmark(type).endsWith(`/${type}.jpg`), `${type} art URL`);
  }
});

test('G-02: dome builder — flat tint until a map lands, tint retints, map clears', () => {
  const dome = buildSkyDome(THREE, 0x2a1e3f);
  assert.equal(dome.userData.skyDome, true);
  assert.equal(dome.geometry.parameters.radius, 370, 'dome sits inside the 382 m shell (was 780, outside it)');
  assert.equal(dome.material.side, THREE.BackSide, 'dome must be BackSide');
  assert.equal(dome.material.fog, false, 'dome must ignore fog');
  assert.equal(dome.material.color.getHex(), 0x2a1e3f, 'dome starts on the flat dusk tint');
  assert.equal(dome.material.map, null, 'no map until a texture lands — never blank');
  applySkyTint(dome, 0x6a7ab0);
  assert.equal(dome.material.color.getHex(), 0x6a7ab0, 'cycle retint must multiply the dome');
  const fakeTex = new THREE.Texture();
  setSkyDomeMap(dome, fakeTex);
  assert.equal(dome.material.map, fakeTex);
  setSkyDomeMap(dome, null);
  assert.equal(dome.material.map, null, 'clearing the map returns to the flat tint');
});
