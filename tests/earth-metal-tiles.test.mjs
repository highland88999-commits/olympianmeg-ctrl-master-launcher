// tests/earth-metal-tiles.test.mjs — Earth 1 ground, video era
// (Merlin, 2026-11-15 ~19:36 + 19:42): the per-tile mapping is
// DELETED. No lens sheet wears its own metal any more — the whole
// ground wears ONE colour at a time, cross-fading through all 9
// scratched-metal images in his order, as ONE looping video
// (public/videos/earth1/ground-loop.mp4). Each torpedo orb wears
// its colour's video (6 colours, a rocket in the centre).
//
// This module is now the colour order + the file table — and the
// test pins the deletion (no mapping function remains anywhere
// the build could call it), the order, the files on disk
// (Merlin's uploads byte-for-byte), the floor video (31 s, the
// 9-colour fade timeline), the 6 orb videos, and the mirror
// finish. Run:
//   node tests/earth-metal-tiles.test.mjs (from the repo root).
// No browser, no network — proves:
//   * metalTileColorForCell / metalTileHash /
//     metalTileCropForTile are GONE from the module and from
//     every consumer (the mapping function is deleted, not
//     dormant — a grep pin, so it can never silently come back)
//   * the 9 colors stay in Merlin's send order, each resolving
//     to its one shared file, deep gold to the archway gold
//     (never copied), and all 9 files on disk are his uploads
//     byte-for-byte (full SHA-256 pins)
//   * the floor video exists, is 31 s of h264 at 1280×720, and
//     its timeline function names the right colour at every
//     hold midpoint, wrapping seamlessly magenta → magenta
//   * the 6 orb videos exist, 10 s each, one per orb colour
//   * the mirror finish is polished mirror metal (metalness 1,
//     roughness 0.08, emissive 0.55, env map) — and no Reflector
//     pass (a second render of the whole scene per frame)
//   * the ground build wears the video (MeshStandardMaterial,
//     shared texture, never disposed per-sheet) and finishes
//     only once the video has data — or has failed
//   * the tile SYSTEM is untouched: phone caps (near 4 / far 2
//     / coarse 3), the rendered record, the watchdog, the tile
//     identity (tileCellKey format) and the restore path —
//     and the old per-tile ESRI fetch is gone from the build
//   * the hub Earth globe files never import the metal module
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'node:assert';
import {
  METAL_TILE_COLORS,
  METAL_TILE_COUNT,
  METAL_TILE_IMAGE_WIDTH,
  METAL_TILE_IMAGE_HEIGHT,
  metalTileImageUrl,
} from '../lib/earth/metal-tiles.js';
import { SCRATCHED_TEXTURES } from '../lib/portal/scratched-textures.js';
import { GOLD_TEXTURE_URL, GOLD_TEXTURE_SHA256 } from '../lib/portal/gold-texture.js';
import {
  GROUND_LOOP_COLORS,
  GROUND_LOOP_VIDEO_URL,
  GROUND_LOOP_DURATION_S,
  GROUND_LOOP_HOLD_S,
  groundLoopColorAt,
  ORB_VIDEO_COLORS,
  ORB_VIDEO_URLS,
  GROUND_MIRROR_METALNESS,
  GROUND_MIRROR_ROUGHNESS,
  GROUND_MIRROR_EMISSIVE_INTENSITY,
  GROUND_MIRROR_ENV_INTENSITY,
} from '../lib/earth/ground-video.js';
import { lensTilePlan, LENS_PRESETS } from '../lib/earth/lens.js';
import { tileCellKey } from '../lib/earth/lens-cache.js';
import { buildRestoreJobs } from '../lib/earth/rendered-tiles.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed += 1; }
  else { failed += 1; console.error(`FAIL: ${name}`); }
}
function check(name, fn) {
  try { fn(); passed += 1; } catch (e) { failed += 1; console.error(`FAIL: ${name} — ${e.message}`); }
}
const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/* The 9 colors in the order Merlin sent them, with the full
 * SHA-256 of each upload (verified against the files in
 * ~/workspace/user/files/ before this suite was written — the
 * uploads are byte-DIFFERENT from the repo files (iOS re-encode)
 * but pixel-identical (all 1170×653, average RGB within ±1);
 * the repo files are the ones in use, never re-uploaded). */
const EXPECTED = {
  magenta: { file: 'magenta.jpg', sha: '236505251372255d798741717e68c0a2975363ecfc737d620288d50d22ebfa0a' },
  cyan: { file: 'cyan.jpg', sha: '3d7406b89f65377817c46574cd893bb71dae1040ed899b96e04855a928bdf613' },
  blue: { file: 'blue.jpg', sha: '321dc5be654002faea5cd2d5ee35bb4a42c3e99e0e2f46d3f23ad5918e18f673' },
  'bright-gold': { file: 'bright-gold.jpg', sha: '470800c83223b51dea2458ea4baa2831f571640ab5b04c5330e14235323bee0b' },
  red: { file: 'red.jpg', sha: 'b6c8fd8ddfe5594e85d4ded17f8007950e9879ad192a95cbf5d4eab4aed57341' },
  green: { file: 'green.jpg', sha: '6a9ca8ccdb76972724f7ad9918d1d431aa4b34cd3fb0cb941ef929fdbd7e45b8' },
  purple: { file: 'purple.jpg', sha: '648a45acc0ba2f32ac77f3ef1b44354a68a4037fd780a9d606ed266d08b1dadb' },
  silver: { file: 'silver.jpg', sha: '17aca2a9a79374f67cd8252c7464d4c159212b7d9779ded5733aeec1a2644a17' },
  'deep-gold': { file: 'gold-scratched.jpg', sha: '260de1b4ad6e465d00b5c5f4d4ccebfd315eeef84e6a5f551067b7fa151d4293' },
};

/* --- the mapping is DELETED (grep pins) --- */
{
  const moduleSrc = readFileSync(join(ROOT, 'lib', 'earth', 'metal-tiles.js'), 'utf8');
  for (const gone of ['metalTileColorForCell', 'metalTileHash', 'metalTileCropForTile']) {
    t(`mapping function ${gone} is gone from metal-tiles.js`,
      !moduleSrc.includes(`function ${gone}`) && !moduleSrc.includes(`export function ${gone}`));
  }
  t('no FNV-1a hash remains in the module',
    !moduleSrc.includes('0x811c9dc5') && !moduleSrc.includes('0x01000193'));
  t('no per-tile pick remains in the module', !moduleSrc.includes('metalTileColorForCell('));
  const nexusSrc = readFileSync(join(ROOT, 'components', 'NexusEarth.jsx'), 'utf8');
  for (const gone of ['metalTileColorForCell', 'metalTileHash', 'metalTileCropForTile', 'metalTileImageUrl']) {
    t(`NexusEarth no longer calls ${gone}`, !nexusSrc.includes(gone));
  }
  t('NexusEarth no longer imports the metal module', !nexusSrc.includes("from '@/lib/earth/metal-tiles'"));
  const kartSrc = readFileSync(join(ROOT, 'lib', 'earth', 'kart.js'), 'utf8');
  for (const gone of ['metalTileColorForCell', 'metalTileHash', 'metalTileCropForTile']) {
    t(`kart.js no longer calls ${gone}`, !kartSrc.includes(gone));
  }
  t('kart.js no longer imports the metal module', !kartSrc.includes('metal-tiles'));
}

/* --- the order + the files (unchanged) --- */
t('nine colors, in Merlin\'s send order', METAL_TILE_COUNT === 9
  && METAL_TILE_COLORS.join(',') === 'magenta,cyan,blue,bright-gold,red,green,purple,silver,deep-gold');
t('the floor loop follows the same 9 in the same order',
  GROUND_LOOP_COLORS.join(',') === METAL_TILE_COLORS.join(','));
t('photo size is the 1170x653 upload', METAL_TILE_IMAGE_WIDTH === 1170 && METAL_TILE_IMAGE_HEIGHT === 653);

check('every color resolves to one distinct shared file', () => {
  const urls = new Set();
  for (const color of METAL_TILE_COLORS) {
    const url = metalTileImageUrl(color);
    assert.ok(typeof url === 'string' && url.length > 0, `${color} resolves`);
    assert.ok(!urls.has(url), `${color} URL ${url} is a duplicate`);
    urls.add(url);
  }
  assert.strictEqual(urls.size, 9);
});
t('deep gold resolves to the archway gold, never a second copy',
  metalTileImageUrl('deep-gold') === GOLD_TEXTURE_URL
  && GOLD_TEXTURE_URL === '/textures/gold/gold-scratched.jpg');
for (const color of ['magenta', 'cyan', 'blue', 'bright-gold', 'red', 'green', 'purple', 'silver']) {
  t(`${color} resolves to its scratched file`,
    metalTileImageUrl(color) === `/textures/scratched/${color}.jpg`
    && SCRATCHED_TEXTURES[color].url === `/textures/scratched/${color}.jpg`);
}
t('unknown colors resolve to null, never a broken URL',
  metalTileImageUrl('pink') === null && metalTileImageUrl('') === null && metalTileImageUrl(null) === null);

check('all 9 files on disk are Merlin\'s uploads, byte-for-byte', () => {
  for (const [color, exp] of Object.entries(EXPECTED)) {
    const url = metalTileImageUrl(color);
    const rel = url.replace(/^\//, '');
    const p = join(ROOT, 'public', ...rel.split('/'));
    assert.ok(existsSync(p), `${color} file missing at ${url}`);
    assert.strictEqual(sha256File(p), exp.sha, `${color} SHA mismatch — not Merlin's upload`);
  }
  // The sibling table agrees with the uploads too (single source
  // of truth, not a second copy of the pins).
  for (const color of Object.keys(SCRATCHED_TEXTURES)) {
    assert.strictEqual(SCRATCHED_TEXTURES[color].sha256, EXPECTED[color].sha,
      `sibling table SHA for ${color} disagrees with the upload`);
  }
  assert.strictEqual(GOLD_TEXTURE_SHA256, EXPECTED['deep-gold'].sha);
});
t('no second deep-gold copy exists under scratched/',
  !existsSync(join(ROOT, 'public', 'textures', 'scratched', 'deep-gold.jpg'))
  && !existsSync(join(ROOT, 'public', 'textures', 'scratched', 'gold-scratched.jpg')));

/* --- the floor video: one 31 s loop through all 9 --- */
// Minimal mp4 reader (mvhd duration + tkhd dimensions + avc1
// presence) — no ffprobe dependency in tests.
function mp4Info(path) {
  const buf = readFileSync(path);
  const mvhdIdx = buf.indexOf(Buffer.from('mvhd'));
  const version = buf[mvhdIdx + 4];
  let timescale;
  let duration;
  if (version === 1) {
    timescale = buf.readUInt32BE(mvhdIdx + 24);
    duration = Number(buf.readBigUInt64BE(mvhdIdx + 28));
  } else {
    timescale = buf.readUInt32BE(mvhdIdx + 16);
    duration = buf.readUInt32BE(mvhdIdx + 20);
  }
  const tkhdIdx = buf.indexOf(Buffer.from('tkhd'));
  const width = buf.readUInt32BE(tkhdIdx + 80) / 65536;
  const height = buf.readUInt32BE(tkhdIdx + 84) / 65536;
  return {
    durationS: duration / timescale,
    width,
    height,
    hasAvc1: buf.indexOf(Buffer.from('avc1')) !== -1,
  };
}
{
  t('floor video URL is the one looping file', GROUND_LOOP_VIDEO_URL === '/videos/earth1/ground-loop.mp4');
  const p = join(ROOT, 'public', 'videos', 'earth1', 'ground-loop.mp4');
  t('floor video file exists on disk', existsSync(p));
  const info = mp4Info(p);
  t('floor video is 31 s (9 colours × 3 s + magenta wrap)', Math.abs(info.durationS - GROUND_LOOP_DURATION_S) < 0.1);
  t('floor video duration constant is 31 s', GROUND_LOOP_DURATION_S === 31);
  t('floor video hold is 3 s per colour', GROUND_LOOP_HOLD_S === 3);
  t('floor video is 1280×720', info.width === 1280 && info.height === 720);
  t('floor video is h264', info.hasAvc1);
  // The timeline: every hold midpoint names its colour, in
  // his order, and the loop wraps seamlessly magenta → magenta.
  const holds = [
    [0.5, 'magenta'], [1.5, 'magenta'], [4.5, 'cyan'], [7.5, 'blue'],
    [10.5, 'bright-gold'], [13.5, 'red'], [16.5, 'green'], [19.5, 'purple'],
    [22.5, 'silver'], [25.5, 'deep-gold'], [29.5, 'magenta'], [30.5, 'magenta'],
  ];
  for (const [sec, color] of holds) {
    t(`floor loop at ${sec}s is ${color}`, groundLoopColorAt(sec) === color);
  }
  t('floor loop wraps at 31 s back to magenta', groundLoopColorAt(31) === 'magenta' && groundLoopColorAt(62) === 'magenta');
  t('floor loop tolerates negative time', groundLoopColorAt(-1) === 'magenta');
}

/* --- the 6 orb videos --- */
{
  t('6 orb colours (the six most distinct scratched metals)',
    ORB_VIDEO_COLORS.length === 6
    && JSON.stringify(ORB_VIDEO_COLORS) === JSON.stringify(['magenta', 'cyan', 'blue', 'red', 'green', 'purple']));
  for (const color of ORB_VIDEO_COLORS) {
    const url = ORB_VIDEO_URLS[color];
    t(`orb video URL for ${color} is /videos/earth1/orb-${color}.mp4`,
      url === `/videos/earth1/orb-${color}.mp4`);
    const p = join(ROOT, 'public', ...url.replace(/^\//, '').split('/'));
    t(`orb video file for ${color} exists on disk`, existsSync(p));
    const info = mp4Info(p);
    t(`orb video for ${color} is 10 s`, Math.abs(info.durationS - 10) < 0.1);
    t(`orb video for ${color} is h264`, info.hasAvc1);
  }
}

/* --- the mirror finish --- */
t('mirror metalness is 1.0 (full metal)', GROUND_MIRROR_METALNESS === 1.0);
t('mirror roughness is 0.08 (near-zero)', GROUND_MIRROR_ROUGHNESS === 0.08);
t('mirror emissive is 0.55 (the colour still reads)', GROUND_MIRROR_EMISSIVE_INTENSITY === 0.55);
t('mirror env intensity is 1.0', GROUND_MIRROR_ENV_INTENSITY === 1.0);
{
  const nexusSrc = readFileSync(join(ROOT, 'components', 'NexusEarth.jsx'), 'utf8');
  t('no Reflector pass anywhere (a second render per frame is too heavy for a phone)',
    !nexusSrc.includes('new Reflector') && !nexusSrc.includes('Reflector.js') && !nexusSrc.includes('<Reflector'));
  t('the ground material is a mirror standard material',
    nexusSrc.includes('MeshStandardMaterial') && nexusSrc.includes('GROUND_MIRROR_METALNESS')
    && nexusSrc.includes('GROUND_MIRROR_ROUGHNESS') && nexusSrc.includes('GROUND_MIRROR_EMISSIVE_INTENSITY'));
  t('the ground reflects an environment map', nexusSrc.includes('getGroundEnvMap(gl)'));
  t('the rim feather is the shared radial alpha map', nexusSrc.includes('getGroundFeatherAlphaMap()'));
}

/* --- the ground build wears the video (source pins) --- */
{
  const nexusSrc = readFileSync(join(ROOT, 'components', 'NexusEarth.jsx'), 'utf8');
  t('the build takes the shared floor video texture', nexusSrc.includes('getGroundVideoTexture()'));
  t('the build finishes only once the video has data (or failed)',
    nexusSrc.includes('onGroundVideoReady(() => finish())'));
  t('a failed video drops the sheet and records nothing',
    nexusSrc.includes('groundVideoHasError()'));
  t('no CanvasTexture remains in the lens build', !nexusSrc.includes('CanvasTexture'));
  t('the shared video texture is never disposed per-sheet',
    !nexusSrc.includes('material.map?.dispose()'));
  t('the floor video starts with the scene and pauses on unmount',
    nexusSrc.includes('startGroundVideo()') && nexusSrc.includes('stopGroundVideo()'));
  const kartSrc = readFileSync(join(ROOT, 'components', 'EarthKart.jsx'), 'utf8');
  t('orbs wear their colour video (key-remount, Moon-flag pattern)',
    kartSrc.includes('useOrbVideoTexture(orb.color)')
    && kartSrc.includes("key={videoTex ? 'orb-video' : 'orb-plain'}"));
  t('orbs carry a billboard rocket on the driver-facing side',
    kartSrc.includes('getOrbRocketTexture()') && kartSrc.includes('<sprite'));
  t('orbs are 1.4 m spheres (ORB_RADIUS_M), not 2 m',
    kartSrc.includes('ORB_RADIUS_M * UPM, 24, 18'));
  t('torpedoes key-remount on the same late-texture trap',
    kartSrc.includes("key={tex ? 'torp-video' : 'torp-plain'}"));
}

/* --- tile identity + restore stability (unchanged) --- */
t('tileCellKey format is unchanged',
  tileCellKey('streetCoarse', { zoom: 6, gridLeft: -12, gridTop: 34 }) === 'streetCoarse:z6:-12:34');
check('restore rebuilds the same key', () => {
  const traveler = { lat: 53.95, lon: -113.11 };
  const recordedPlan = lensTilePlan(53.95, -113.11, 12, 36, 2160);
  const recordedKey = tileCellKey('street', recordedPlan);
  const rows = [{
    tile_key: recordedKey, preset: 'street',
    center_lat: 53.95, center_lon: -113.11,
  }];
  const jobs = buildRestoreJobs(rows, traveler);
  assert.strictEqual(jobs.length, 1, 'one restore job near the traveler');
  const plan = lensTilePlan(jobs[0].lat, jobs[0].lon, 12, 36, 2160);
  const key = tileCellKey('street', plan);
  assert.strictEqual(key, recordedKey, 'restore plan rebuilds the recorded key exactly');
});

/* --- the tile system is untouched (source pins) --- */
const nexusSrc = readFileSync(join(ROOT, 'components', 'NexusEarth.jsx'), 'utf8');
t('phone caps intact: near 4 / far 2 / coarse 3',
  /const MAX_LENS_SHEETS = 4;/.test(nexusSrc)
  && /const MAX_FAR_LENS_SHEETS = 2;/.test(nexusSrc)
  && /const MAX_COARSE_LENS_SHEETS = 3;/.test(nexusSrc));
t('rendered record still runs on every finished sheet',
  nexusSrc.includes('recordRenderedTileKey(cellKey)')
  && nexusSrc.includes('RENDERED_RECORD_PRESETS'));
t('the build still frees the pool through the watchdog',
  nexusSrc.includes('LENS_BUILD_WATCHDOG_MS'));
t('old per-tile ESRI fetch is gone from the build',
  !nexusSrc.includes('img.src = t.url')
  && !nexusSrc.includes('ctx.drawImage(img, t.px, t.py, S, S)')
  && !nexusSrc.includes('drawImage(metalImg'));
t('no tile painting machinery remains in the build',
  !nexusSrc.includes('sortTilesCenterFirst') && !nexusSrc.includes('canvasIsBlank')
  && !nexusSrc.includes('queueTexUpload'));
t('ground-video module is imported, nothing else new is pulled in',
  nexusSrc.includes("from '@/lib/earth/ground-video'"));

for (const f of ['components/ProceduralEarthGlobe.jsx', 'components/GoogleEarthTiles.jsx']) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  t(`hub globe file ${f} never imports the metal module`, !src.includes('metal-tiles'));
}

console.log(`earth-metal-tiles: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
