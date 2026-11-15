// tests/nether-video-wraps.test.mjs — NETHER VIDEO WRAPS, BATCH 1
// (Merlin, Nov 15 ~15:03 + spec change ~15:07): the sky and ground of
// the 13 nether realms wrapped in VIDEO. Revised count: 26 videos
// total = 13 unique lightning-hell SKY videos + 13 FLOOR videos
// (hazard liquids: lava, acid, poison, etc., one type per realm).
// BATCH 1 = three whole realms, sky + floor each = 6 videos:
// Hades (lightning hell sky + lava floor), Hell (lightning hell sky
// + lava/fire floor), Helheim (lightning hell sky + ice floor).
// The other 10 realms x (sky + floor) = 20 videos wait for Merlin's
// next messages — this suite asserts them as NOT YET PRESENT, honestly.
// Run: node tests/nether-video-wraps.test.mjs (repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  NETHER_FLOOR_VIDEO_TYPES,
  NETHER_VIDEO_FILES,
  NETHER_VIDEO_FLOOR_REALMS,
  NETHER_VIDEO_SKY_REALMS,
  floorVideoTypeForRealm,
  floorVideoUrlForRealm,
  skyVideoUrlForRealm,
} from '../lib/nether-realm/video-wraps.js';
import { REALM_SURFACE_KEYS } from '../lib/portal/realm-surfaces.js';

const BATCH_1 = ['hades', 'hell', 'helheim'];
const BATCH_2 = REALM_SURFACE_KEYS.filter((k) => !BATCH_1.includes(k));

/** Duration (seconds) out of an MP4's mvhd box — no ffmpeg needed. */
function mp4DurationSeconds(path) {
  const buf = readFileSync(path).subarray(0, 65536);
  const at = buf.indexOf(Buffer.from('mvhd'));
  assert.ok(at > 0, `${path} has an mvhd box`);
  const content = at + 4;
  const version = buf[content];
  if (version === 1) {
    const timescale = buf.readUInt32BE(content + 20);
    const duration = Number(buf.readBigUInt64BE(content + 24));
    return duration / timescale;
  }
  assert.equal(version, 0, `${path} mvhd version`);
  const timescale = buf.readUInt32BE(content + 12);
  const duration = buf.readUInt32BE(content + 16);
  return duration / timescale;
}

test('batch 1: the 3 sky videos exist on disk, are real files', () => {
  for (const realm of BATCH_1) {
    const path = `public/videos/nether/${realm}-sky.mp4`;
    assert.ok(existsSync(path), `${path} exists`);
    assert.ok(statSync(path).size > 1_000_000, `${path} is a real video (>1 MB)`);
  }
});

test('batch 1: the 3 floor videos exist on disk, are real files', () => {
  for (const realm of BATCH_1) {
    const path = `public/videos/nether/${realm}-floor.mp4`;
    assert.ok(existsSync(path), `${path} exists`);
    assert.ok(statSync(path).size > 1_000_000, `${path} is a real video (>1 MB)`);
  }
});

test('batch 1: all 6 videos are different files (unique content)', () => {
  const hashes = new Set();
  for (const path of NETHER_VIDEO_FILES) {
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
    assert.ok(!hashes.has(hash), `${path} is not a duplicate of another video`);
    hashes.add(hash);
  }
  assert.equal(hashes.size, 6, '6 distinct videos');
});

test('batch 1: videos are ambient loops of ~8-10 s', () => {
  for (const realm of BATCH_1) {
    for (const kind of ['sky', 'floor']) {
      const path = `public/videos/nether/${realm}-${kind}.mp4`;
      const dur = mp4DurationSeconds(path);
      assert.ok(dur >= 7 && dur <= 11, `${path} is ${dur.toFixed(2)} s (ambient loop)`);
    }
  }
});

test('sky URLs: batch 1 realms have one, batch 2 realms do not (yet)', () => {
  assert.deepEqual(NETHER_VIDEO_SKY_REALMS, BATCH_1);
  for (const realm of BATCH_1) {
    assert.equal(skyVideoUrlForRealm(realm), `/videos/nether/${realm}-sky.mp4`);
  }
  for (const realm of BATCH_2) {
    assert.equal(skyVideoUrlForRealm(realm), null, `${realm} sky video is batch 2`);
    assert.ok(!existsSync(`public/videos/nether/${realm}-sky.mp4`), `${realm}-sky.mp4 not on disk yet`);
  }
});

test('floor URLs: batch 1 realms have one, batch 2 realms do not (yet)', () => {
  assert.deepEqual(NETHER_VIDEO_FLOOR_REALMS, BATCH_1);
  for (const realm of BATCH_1) {
    assert.equal(floorVideoUrlForRealm(realm), `/videos/nether/${realm}-floor.mp4`);
  }
  for (const realm of BATCH_2) {
    assert.equal(floorVideoUrlForRealm(realm), null, `${realm} floor video is batch 2`);
    assert.ok(!existsSync(`public/videos/nether/${realm}-floor.mp4`), `${realm}-floor.mp4 not on disk yet`);
  }
});

test('floor types: one hazard liquid per batch-1 realm', () => {
  assert.deepEqual(NETHER_FLOOR_VIDEO_TYPES, { hades: 'lava', hell: 'lava', helheim: 'ice' });
  assert.equal(floorVideoTypeForRealm('hades'), 'lava');
  assert.equal(floorVideoTypeForRealm('hell'), 'lava');
  assert.equal(floorVideoTypeForRealm('helheim'), 'ice');
  for (const realm of BATCH_2) {
    assert.equal(floorVideoTypeForRealm(realm), null, `${realm} floor type is batch 2`);
  }
});

test('the video file list is exactly the 6 batch-1 files', () => {
  assert.deepEqual(
    [...NETHER_VIDEO_FILES].sort(),
    ['hades-floor', 'hades-sky', 'hell-floor', 'hell-sky', 'helheim-floor', 'helheim-sky']
      .map((n) => `public/videos/nether/${n}.mp4`).sort(),
  );
});

test('RealmSkyDome wears the video when live, image as fallback', () => {
  const src = readFileSync('components/RealmSkyDome.jsx', 'utf8');
  assert.ok(src.includes('skyVideoUrlForRealm'), 'dome asks the video map for a sky video');
  assert.ok(src.includes('useNetherVideoTexture'), 'dome mounts the video texture');
  assert.ok(src.includes('videoTex ?? tex'), 'video preferred, static image is the fallback');
  assert.ok(src.includes('skyUrlForRealm'), 'static sky image path still present');
});

test('batch-1 Ground() functions mount their floor video', () => {
  const files = {
    hades: 'app/nether-realm/world3d.js',
    hell: 'app/hell/world3d.js',
    helheim: 'app/helheim/world3d.js',
  };
  for (const [realm, path] of Object.entries(files)) {
    const src = readFileSync(path, 'utf8');
    assert.ok(src.includes('floorVideoUrlForRealm'), `${path} asks for a floor video`);
    assert.ok(src.includes(`floorVideoUrlForRealm('${realm}')`), `${path} asks for the ${realm} floor video`);
    assert.ok(src.includes('useNetherVideoTexture'), `${path} mounts the video texture`);
    assert.ok(src.includes('FLOOR_EMISSIVE_INTENSITY'), `${path} video floor glows at the painted level`);
  }
});

test('batch-2 realms are untouched: no floor video mounted yet', () => {
  const routeOf = { duat: 'duat', naraka: 'naraka', yomi: 'yomi', annwn: 'annwn', mictlan: 'mictlan', xibalba: 'xibalba', kur: 'kur', nav: 'nav', diyu: 'diyu', orun: 'orun' };
  for (const [realm, route] of Object.entries(routeOf)) {
    const src = readFileSync(`app/${route}/world3d.js`, 'utf8');
    assert.ok(!src.includes('floorVideoUrlForRealm'), `${route}/world3d.js has no floor video yet (batch 2)`);
  }
});
