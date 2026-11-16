// tests/portal-face-videos.test.mjs — VIDEO PORTAL FACES
// (Merlin, Nov 15 ~22:25): the faces of the portal cards in
// components/PortalRoom.jsx wear VIDEO, muted and looping, over the
// realm's illustrated graphic — which stays underneath as the
// fallback. This batch: 9 video faces of 25 unique realms — 3
// reused nether sky videos (hades/hell/helheim) + 6 new face videos
// (elysium, heaven, valhalla, duat, naraka, tiangong). The other 16
// realms keep their static illustrated graphic, named here so the
// next batch (6 per message) knows what is owed. Land of the Dead
// (Nov 16, 2026) joins the static set: no face video yet.
// Run: node tests/portal-face-videos.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORTAL_REALMS, realmsForSide } from '../lib/portal/realms.js';
import { PORTAL_GRAPHICS } from '../lib/portal/portal-graphics.js';
import {
  PORTAL_FACE_NEW_FILES,
  PORTAL_FACE_NEW_KEYS,
  PORTAL_FACE_REUSED_FILES,
  PORTAL_FACE_REUSED_KEYS,
  PORTAL_FACE_STATIC_KEYS,
  PORTAL_FACE_VIDEOS,
  faceForRealm,
  faceVideoUrlForRealm,
} from '../lib/portal/portal-face-videos.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FACE_DIR = join(ROOT, 'public/videos/portal-faces');

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
  const timescale = buf.readUInt32BE(content + 12);
  const duration = buf.readUInt32BE(content + 16);
  return duration / timescale;
}

test('every one of the 24 portal realms has a face (video or static fallback)', () => {
  assert.equal(PORTAL_REALMS.length, 24);
  for (const realm of PORTAL_REALMS) {
    const face = faceForRealm(realm.key);
    assert.ok(face.fallback, `${realm.key} has a fallback graphic`);
    const fallbackPath = join(ROOT, 'public', face.fallback.replace(/^\//, ''));
    assert.ok(existsSync(fallbackPath), `${realm.key} fallback exists: ${face.fallback}`);
    assert.ok(['video', 'static'].includes(face.kind), `${realm.key} kind is video|static`);
    if (face.kind === 'video') assert.ok(face.video, `${realm.key} video URL set`);
    else assert.equal(face.video, null, `${realm.key} static face has no video URL`);
  }
});

test('the 26 portal cards all map — 12 heaven + 14 nether + 24 gun', () => {
  assert.equal(realmsForSide('heaven').length, 12);
  assert.equal(realmsForSide('nether').length, 14);
  assert.equal(realmsForSide('gun').length, 24);
  for (const side of ['heaven', 'nether', 'gun']) {
    for (const realm of realmsForSide(side)) {
      const face = faceForRealm(realm.key);
      assert.ok(face.fallback, `${side}/${realm.key} has a face`);
    }
  }
});

test('dual-side realms reuse their OWN face on both cards (stated reuse)', () => {
  // Orun and Elysium each appear on two cards (heaven + nether).
  // Same realm key → same face URL on both cards. That is the only
  // reuse: no video is ever shared across two different realms.
  for (const key of ['orun', 'elysium']) {
    const heavenCard = realmsForSide('heaven').find((r) => r.key === key);
    const netherCard = realmsForSide('nether').find((r) => r.key === key);
    assert.ok(heavenCard && netherCard, `${key} is on both sides`);
    assert.equal(faceVideoUrlForRealm(heavenCard.key), faceVideoUrlForRealm(netherCard.key));
    assert.equal(faceForRealm(heavenCard.key).fallback, faceForRealm(netherCard.key).fallback);
  }
});

test('no video URL is shared across two different realm keys', () => {
  const seen = new Map();
  for (const [key, url] of Object.entries(PORTAL_FACE_VIDEOS)) {
    assert.ok(!seen.has(url), `${url} shared by ${seen.get(url)} and ${key}`);
    seen.set(url, key);
  }
  assert.equal(seen.size, 9, '9 video faces');
});

test('the 6 new face videos exist, are h264, ~10 s, and have no audio track', () => {
  assert.deepEqual([...PORTAL_FACE_NEW_KEYS].sort(), ['duat', 'elysium', 'heaven', 'naraka', 'tiangong', 'valhalla']);
  assert.equal(PORTAL_FACE_NEW_FILES.length, 6);
  const onDisk = readdirSync(FACE_DIR).filter((f) => f.endsWith('.mp4')).sort();
  assert.deepEqual(onDisk, ['duat.mp4', 'elysium.mp4', 'heaven.mp4', 'naraka.mp4', 'tiangong.mp4', 'valhalla.mp4']);
  for (const rel of PORTAL_FACE_NEW_FILES) {
    const path = join(ROOT, rel);
    assert.ok(existsSync(path), `${rel} exists`);
    const buf = readFileSync(path);
    assert.ok(buf.includes(Buffer.from('avc1')), `${rel} is h264 (avc1)`);
    assert.ok(!buf.includes(Buffer.from('mp4a')), `${rel} has no audio track`);
    const dur = mp4DurationSeconds(path);
    assert.ok(dur >= 9.5 && dur <= 10.5, `${rel} duration ${dur}s (expect ~10 s)`);
  }
});

test('the 3 reused nether sky videos exist and are the sky videos, not floors', () => {
  assert.deepEqual([...PORTAL_FACE_REUSED_KEYS].sort(), ['hades', 'helheim', 'hell']);
  for (const rel of PORTAL_FACE_REUSED_FILES) {
    assert.ok(rel.endsWith('-sky.mp4'), `${rel} is a sky video`);
    assert.ok(existsSync(join(ROOT, rel)), `${rel} exists`);
    const dur = mp4DurationSeconds(join(ROOT, rel));
    assert.ok(dur >= 7.5 && dur <= 10.5, `${rel} duration ${dur}s`);
  }
});

test('the 15 static-fallback realms are exactly the realms without video', () => {
  const videoKeys = new Set(Object.keys(PORTAL_FACE_VIDEOS));
  const staticKeys = new Set(PORTAL_FACE_STATIC_KEYS);
  assert.equal(staticKeys.size, 15);
  for (const realm of PORTAL_REALMS) {
    assert.equal(
      videoKeys.has(realm.key) !== staticKeys.has(realm.key),
      true,
      `${realm.key} is in exactly one of video/static`
    );
  }
  for (const key of PORTAL_FACE_STATIC_KEYS) {
    assert.ok(PORTAL_GRAPHICS[key], `${key} has its illustrated graphic`);
    assert.ok(existsSync(join(ROOT, 'public/art/portals', `${key}.jpg`)), `${key}.jpg exists`);
  }
});

test('the video face component is really wired into the portal room', () => {
  const roomSrc = readFileSync(join(ROOT, 'components/PortalRoom.jsx'), 'utf8');
  assert.ok(roomSrc.includes("from './PortalFaceVideo'"), 'PortalRoom imports PortalFaceVideo');
  assert.ok(roomSrc.includes('<PortalFaceVideo realmKey={realm.key} hue={realm.hue} />'), 'PortalRoom renders the face in each card');
  assert.ok(roomSrc.includes("position: 'relative', overflow: 'hidden'"), 'card anchors the absolute video layer');
  const compSrc = readFileSync(join(ROOT, 'components/PortalFaceVideo.jsx'), 'utf8');
  for (const attr of ['autoPlay', 'muted', 'loop', 'playsInline']) {
    assert.ok(compSrc.includes(attr), `video is ${attr}`);
  }
  assert.ok(compSrc.includes('onError'), 'video failure hides the layer (fallback shows)');
  assert.ok(compSrc.includes('onLoadedData'), 'video fades in when ready');
  assert.ok(compSrc.includes('rgba(6,8,18,0.62)'), 'video scrim matches the card scrim');
  assert.ok(compSrc.includes('165deg'), 'video hue gradient matches the card gradient');
});
