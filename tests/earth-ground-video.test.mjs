// tests/earth-ground-video.test.mjs — the Earth 1 video ground
// module (Merlin, 2026-11-15 ~19:36–19:42): ONE looping floor
// video fading through his 9 scratched-metal colours in his
// order, 6 orb videos (a rocket in the centre of each), and the
// polished mirror finish the floor wears.
//
// This suite pins the module's own contract: the fade timeline
// (the video IS the loop — the function names the colour at any
// second), the 6 orb colours and their URLs, the mirror law, and
// the lazy-singleton contract — no document/window access at
// import time, so node tests can import the pure parts safely
// and every browser singleton answers null (never throws)
// without a document. The files on disk (durations, codecs)
// and the build wiring are pinned in
// tests/earth-metal-tiles.test.mjs.
//
// Run: node tests/earth-ground-video.test.mjs (from the repo root).
import {
  GROUND_LOOP_COLORS,
  GROUND_LOOP_VIDEO_URL,
  GROUND_LOOP_DURATION_S,
  GROUND_LOOP_HOLD_S,
  GROUND_LOOP_FADE_S,
  groundLoopColorAt,
  ORB_VIDEO_COLORS,
  ORB_VIDEO_URLS,
  GROUND_MIRROR_METALNESS,
  GROUND_MIRROR_ROUGHNESS,
  GROUND_MIRROR_EMISSIVE_INTENSITY,
  GROUND_MIRROR_ENV_INTENSITY,
  getGroundVideoTexture,
  groundVideoHasError,
  startGroundVideo,
  stopGroundVideo,
  onGroundVideoReady,
  getOrbVideoTexture,
  acquireOrbVideo,
  releaseOrbVideo,
  getGroundEnvMap,
  getGroundFeatherAlphaMap,
  getOrbRocketTexture,
} from '../lib/earth/ground-video.js';
import { METAL_TILE_COLORS } from '../lib/earth/metal-tiles.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- The loop: 9 colours in his order, 3 s each, magenta wraps ---
t('loop colours are his 9 in his order',
  JSON.stringify(GROUND_LOOP_COLORS) === JSON.stringify(METAL_TILE_COLORS)
  && GROUND_LOOP_COLORS.join(',') === 'magenta,cyan,blue,bright-gold,red,green,purple,silver,deep-gold');
t('loop video is the one file', GROUND_LOOP_VIDEO_URL === '/videos/earth1/ground-loop.mp4');
t('loop is 31 s: 9 holds of 3 s + the magenta wrap', GROUND_LOOP_DURATION_S === 31);
t('hold is 3 s, fade is 1 s', GROUND_LOOP_HOLD_S === 3 && GROUND_LOOP_FADE_S === 1);
{
  // Every second of the loop names its colour (the fade names
  // the colour being faded INTO, so the boundary seconds read
  // the incoming colour — the video frames were verified the
  // same way, by average RGB at the hold midpoints).
  const expected = [
    'magenta', 'magenta', 'magenta', // 0–2 s
    'cyan', 'cyan', 'cyan', // 3–5 s
    'blue', 'blue', 'blue', // 6–8 s
    'bright-gold', 'bright-gold', 'bright-gold', // 9–11 s
    'red', 'red', 'red', // 12–14 s
    'green', 'green', 'green', // 15–17 s
    'purple', 'purple', 'purple', // 18–20 s
    'silver', 'silver', 'silver', // 21–23 s
    'deep-gold', 'deep-gold', 'deep-gold', // 24–26 s
    'magenta', 'magenta', 'magenta', 'magenta', // 27–30 s (wrap)
  ];
  for (let s = 0; s < 31; s++) {
    t(`loop second ${s} is ${expected[s]}`, groundLoopColorAt(s + 0.5) === expected[s]);
  }
  t('loop wraps: 31 s is magenta again', groundLoopColorAt(31.5) === 'magenta');
  t('loop wraps: 62 s is magenta again', groundLoopColorAt(62.5) === 'magenta');
  t('loop tolerates fractional seconds', groundLoopColorAt(4.9) === 'cyan');
  t('loop tolerates negative time', groundLoopColorAt(-0.5) === 'magenta');
  t('loop tolerates huge time', groundLoopColorAt(3100.5) === 'magenta');
}

// --- The orb videos: 6 colours, one video each ---
t('6 orb colours (the six most distinct metals)',
  JSON.stringify(ORB_VIDEO_COLORS) === JSON.stringify(['magenta', 'cyan', 'blue', 'red', 'green', 'purple']));
for (const color of ORB_VIDEO_COLORS) {
  t(`orb video URL for ${color}`, ORB_VIDEO_URLS[color] === `/videos/earth1/orb-${color}.mp4`);
}
t('orb videos are a subset of the 9 loop colours',
  ORB_VIDEO_COLORS.every((c) => GROUND_LOOP_COLORS.includes(c)));
t('bright-gold, silver and deep-gold have no orb video (floor loop only)',
  ORB_VIDEO_URLS['bright-gold'] === undefined
  && ORB_VIDEO_URLS.silver === undefined
  && ORB_VIDEO_URLS['deep-gold'] === undefined);
t('unknown orb colours resolve to no video', ORB_VIDEO_URLS.pink === undefined);

// --- The mirror law ---
t('mirror metalness is 1.0', GROUND_MIRROR_METALNESS === 1.0);
t('mirror roughness is 0.08', GROUND_MIRROR_ROUGHNESS === 0.08);
t('mirror emissive is 0.55', GROUND_MIRROR_EMISSIVE_INTENSITY === 0.55);
t('mirror env intensity is 1.0', GROUND_MIRROR_ENV_INTENSITY === 1.0);

// --- Lazy singletons: safe without a document (node) ---
t('floor video texture is null without a document', getGroundVideoTexture() === null);
t('floor video has no error without a document', groundVideoHasError() === false);
t('orb video texture is null without a document', getOrbVideoTexture('magenta') === null);
t('orb video texture is null for an unknown colour', getOrbVideoTexture('pink') === null);
t('feather alpha map is null without a document', getGroundFeatherAlphaMap() === null);
t('rocket texture is null without a document', getOrbRocketTexture() === null);
t('env map is null without a renderer', getGroundEnvMap(null) === null);
t('onGroundVideoReady returns an unsubscribe without a document',
  typeof onGroundVideoReady(() => {}) === 'function');
{
  let threw = false;
  try {
    startGroundVideo();
    stopGroundVideo();
    acquireOrbVideo('magenta');
    releaseOrbVideo('magenta');
    acquireOrbVideo('pink');
    releaseOrbVideo('pink');
  } catch { threw = true; }
  t('video lifecycle calls never throw without a document', !threw);
}

console.log(`earth-ground-video: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
