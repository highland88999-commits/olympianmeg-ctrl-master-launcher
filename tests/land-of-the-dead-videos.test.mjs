// tests/land-of-the-dead-videos.test.mjs — LAND OF THE DEAD VIDEO WRAPS
// (Merlin, Nov 16 ~04:19): sky + floor videos wired the nether way
// (lib/nether-realm/video-wraps.js) — sky via the shared RealmSkyDome,
// floor via the ground video texture with the painted-surface fallback.
// Both 10.000 s, h264, 1280x720, muted, 0.25 s seam dissolve so they
// loop (dissolve, not pixel-exact — same loop honesty as the nether
// wraps). The first floor generation (Day of the Dead festival altar
// — painted sugar-skull tiles, marigolds, candles) was the wrong tone
// and was DISCARDED, not in the repo; only the v2 floor is wired.
// Run: node tests/land-of-the-dead-videos.test.mjs (repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import {
  LOTD_FLOOR_VIDEO_URL,
  LOTD_SKY_VIDEO_URL,
  LOTD_VIDEO_FILES,
  LOTD_VIDEO_MD5,
  NETHER_VIDEO_FILES,
  NETHER_VIDEO_FLOOR_REALMS,
  NETHER_VIDEO_SKY_REALMS,
  floorVideoTypeForRealm,
  floorVideoUrlForRealm,
  skyVideoUrlForRealm,
} from '../lib/nether-realm/video-wraps.js';

/** md5 hex of a file. */
function md5(path) {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

/** Duration (seconds) out of an MP4's mvhd box — no ffmpeg needed.
 * Reads the whole file: these clips keep their moov box past the
 * first 64 KB, unlike the nether batch-1 files. */
function mp4DurationSeconds(path) {
  const buf = readFileSync(path);
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

test('the two videos exist on disk at the verified sizes', () => {
  assert.equal(statSync('public/videos/land-of-the-dead/sky.mp4').size, 2334312);
  assert.equal(statSync('public/videos/land-of-the-dead/floor.mp4').size, 2498633);
});

test('the two videos match the md5s verified at wiring time', () => {
  assert.equal(md5('public/videos/land-of-the-dead/sky.mp4'), LOTD_VIDEO_MD5.sky);
  assert.equal(md5('public/videos/land-of-the-dead/sky.mp4'), 'c40295264df6d6b6ef2357c77162fba8');
  assert.equal(md5('public/videos/land-of-the-dead/floor.mp4'), LOTD_VIDEO_MD5.floor);
  assert.equal(md5('public/videos/land-of-the-dead/floor.mp4'), 'be9cf8d365c9f8b32f27f0b2a03cca5d');
});

test('the two videos are different files and are 10 s ambient loops', () => {
  assert.notEqual(
    createHash('sha256').update(readFileSync('public/videos/land-of-the-dead/sky.mp4')).digest('hex'),
    createHash('sha256').update(readFileSync('public/videos/land-of-the-dead/floor.mp4')).digest('hex'),
    'sky and floor are distinct videos',
  );
  for (const kind of ['sky', 'floor']) {
    const dur = mp4DurationSeconds(`public/videos/land-of-the-dead/${kind}.mp4`);
    assert.ok(dur >= 9 && dur <= 11, `${kind}.mp4 is ${dur.toFixed(2)} s (10 s loop)`);
  }
});

test('no other video lives in the land-of-the-dead folder (v1 altar discarded)', () => {
  assert.deepEqual(readdirSync('public/videos/land-of-the-dead').sort(), ['floor.mp4', 'sky.mp4']);
  assert.deepEqual([...LOTD_VIDEO_FILES].sort(), [
    'public/videos/land-of-the-dead/floor.mp4',
    'public/videos/land-of-the-dead/sky.mp4',
  ]);
});

test('the URL helpers return the land-of-the-dead videos', () => {
  assert.equal(skyVideoUrlForRealm('land-of-the-dead'), '/videos/land-of-the-dead/sky.mp4');
  assert.equal(skyVideoUrlForRealm('land-of-the-dead'), LOTD_SKY_VIDEO_URL);
  assert.equal(floorVideoUrlForRealm('land-of-the-dead'), '/videos/land-of-the-dead/floor.mp4');
  assert.equal(floorVideoUrlForRealm('land-of-the-dead'), LOTD_FLOOR_VIDEO_URL);
});

test('the nether batch-1 lists are untouched by the land-of-the-dead branch', () => {
  assert.deepEqual(NETHER_VIDEO_SKY_REALMS, ['hades', 'hell', 'helheim']);
  assert.deepEqual(NETHER_VIDEO_FLOOR_REALMS, ['hades', 'hell', 'helheim']);
  assert.equal(NETHER_VIDEO_FILES.length, 6, 'nether file list is still exactly the 6 batch-1 files');
  assert.equal(skyVideoUrlForRealm('hades'), '/videos/nether/hades-sky.mp4');
  assert.equal(floorVideoUrlForRealm('hell'), '/videos/nether/hell-floor.mp4');
});

test('the land-of-the-dead floor is not a hazard liquid (no floor type)', () => {
  // Cracked ashen earth, not lava/acid/poison/ice — the types map is
  // hazard liquids only, so this stays null by design.
  assert.equal(floorVideoTypeForRealm('land-of-the-dead'), null);
});

test('the scene mounts the sky dome and the floor video with the painted fallback', () => {
  const src = readFileSync('app/land-of-the-dead/world3d.js', 'utf8');
  assert.ok(src.includes('<RealmSkyDome realmKey="land-of-the-dead"'), 'sky dome mounted for this realm');
  assert.ok(src.includes("floorVideoUrlForRealm('land-of-the-dead')"), 'floor video asked for by key');
  assert.ok(src.includes('useNetherVideoTexture'), 'floor mounts the video texture');
  assert.ok(src.includes('FLOOR_EMISSIVE_INTENSITY'), 'video floor glows at the painted level');
  assert.ok(src.includes('GROUND_COLOR'), 'painted ashen ground is the fallback while the video loads');
  assert.ok(!src.includes("import(\"./scene\")"), 'no stale ./scene dynamic import');
  assert.ok(existsSync('public/art/realms/land-of-the-dead-sky.jpg'), 'static sky image fallback exists');
});
