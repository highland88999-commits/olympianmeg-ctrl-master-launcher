// tests/billboard-panel-video.test.mjs
// Hub tower panel video playback (Merlin, 2026-10-27): real video on
// the panel face — no static first-frame poster, no prompt bars, no
// tint — preloaded in billboard-number order 1→44 before the towers
// present.
// Run: node tests/billboard-panel-video.test.mjs (from the repo root).
// No browser, no network — asserts on the pure helpers and on the
// wired source (same grep style as the hub suites).
//
// Rules under test:
// - Cover-fit math fills the face edge to edge, center-cropped,
//   never stretched, never spilling outside the frame.
// - The preload list runs 1→44, includes every rotating entry's
//   video, skips images, and dedupes identical URLs to first sight.
// - The preload runner loads strictly in order, dedupes, and never
//   throws on a dead video (the hub gate can never hang).
// - Hub panel faces carry no prompt bars; the tap-to-link path and
//   the true-color video material survive.
import { readFileSync } from 'node:fs';
import {
  videoCoverFit,
  collectPanelVideoUrls,
  preloadInOrder,
} from '../lib/billboards/panel-video.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// --- cover-fit math: video fills the face, cropped, never stretched ---
{
  // Landscape video (16:9) on the portrait 4.0×7.0 face: full height,
  // sides cropped.
  const fit = videoCoverFit(4.0, 7.0, 16, 9);
  t('landscape video: full height', approx(fit.repeat[1], 1));
  t('landscape video: sides cropped', approx(fit.repeat[0], 9 / 28));
  t('landscape video: crop centered', approx(fit.offset[0], 19 / 56) && approx(fit.offset[1], 0));
}
{
  // Portrait video (9:16) on the portrait face: full width, top/bottom cropped.
  const fit = videoCoverFit(4.0, 7.0, 9, 16);
  t('portrait video: full width', approx(fit.repeat[0], 1));
  t('portrait video: top/bottom cropped', fit.repeat[1] < 1 && fit.repeat[1] > 0);
  t('portrait video: crop centered', approx(fit.offset[0], 0) && fit.offset[1] > 0);
}
{
  // Square video on the portrait face: full height, sides cropped.
  const fit = videoCoverFit(4.0, 7.0, 1, 1);
  t('square video: full height', approx(fit.repeat[1], 1));
  t('square video: sides cropped', approx(fit.repeat[0], 4.0 / 7.0));
}
{
  // Exact 4:7 video on the 4.0×7.0 face: edge to edge, nothing cropped.
  const fit = videoCoverFit(4.0, 7.0, 4, 7);
  t('exact 4:7 video: no crop', approx(fit.repeat[0], 1) && approx(fit.repeat[1], 1));
  t('exact 4:7 video: no offset', approx(fit.offset[0], 0) && approx(fit.offset[1], 0));
}
t('cover-fit rejects zero width', videoCoverFit(0, 7.0, 16, 9) === null);
t('cover-fit rejects zero video height', videoCoverFit(4.0, 7.0, 16, 0) === null);
t('cover-fit rejects negative dims', videoCoverFit(-4.0, 7.0, 16, 9) === null);
t('cover-fit rejects NaN', videoCoverFit(4.0, 7.0, NaN, 9) === null);
{
  // Bounds invariant across aspects: crop stays inside the frame and
  // exactly one axis touches edge to edge (true cover, no gaps).
  const pairs = [[4.0, 7.0, 16, 9], [4.0, 7.0, 9, 16], [4.0, 7.0, 1, 1], [4.0, 7.0, 4, 3], [4.0, 7.0, 21, 9]];
  for (const [fw, fh, vw, vh] of pairs) {
    const fit = videoCoverFit(fw, fh, vw, vh);
    const [rx, ry] = fit.repeat;
    const [ox, oy] = fit.offset;
    t(
      `cover bounds hold for ${vw}x${vh}`,
      rx > 0 && rx <= 1 && ry > 0 && ry <= 1 &&
        ox >= 0 && oy >= 0 && ox + rx <= 1 + 1e-9 && oy + ry <= 1 + 1e-9 &&
        (approx(rx, 1) || approx(ry, 1))
    );
  }
}

// --- preload list: 1→44 order, every rotating video, deduped ---
{
  const A = 'https://example.com/a.mp4';
  const B = 'https://example.com/b.jpg';
  const C = 'https://example.com/c.mp4';
  const D = 'https://example.com/d.mp4';
  const towers = [
    [
      { key: 'p0', entries: [{ creativeType: 'video', creativeUrl: A }, { creativeType: 'image', creativeUrl: B }] },
      { key: 'p1', name: 'image only' },
      { key: 'p2', creativeType: 'video', creativeUrl: C },
      { key: 'p3', entries: [{ creativeType: 'video', creativeUrl: A }] },
    ],
    [
      { key: 'p0', entries: [{ creativeType: 'video', creativeUrl: D }, { creativeType: 'video', creativeUrl: A }] },
      null,
      { key: 'p2', entries: [] },
      { key: 'p3', creativeType: 'image', creativeUrl: B },
    ],
  ];
  const numberFor = (ti, pi) => ti * 4 + pi + 1;
  const list = collectPanelVideoUrls(towers, numberFor);
  t(
    'preload list is 1→44 with first-sight dedupe',
    JSON.stringify(list) === JSON.stringify([
      { number: 1, url: A },
      { number: 3, url: C },
      { number: 5, url: D },
    ])
  );
  t('preload list skips image entries', !list.some((e) => e.url === B));
  t('preload list ignores null slots', list.length === 3);
}
t('preload list rejects bad input', collectPanelVideoUrls(null, () => 1).length === 0);
t('preload list rejects bad numberFor', collectPanelVideoUrls([[{ key: 'x' }]], null).length === 0);
{
  const towers = [[{ key: 'x', creativeType: 'video', creativeUrl: 'u' }]];
  t('preload list drops out-of-range numbers', collectPanelVideoUrls(towers, () => 45).length === 0);
  t('preload list drops number 0', collectPanelVideoUrls(towers, () => 0).length === 0);
}

// --- preload runner: strict order, dedupe, never throws ---
{
  const seen = [];
  const loader = async (url) => { seen.push(url); return true; };
  const results = await preloadInOrder(
    [{ number: 1, url: 'a' }, { number: 2, url: 'b' }, { number: 3, url: 'a' }],
    loader
  );
  t('runner loads in list order', JSON.stringify(seen) === JSON.stringify(['a', 'b']));
  t('runner dedupes identical URLs', results.length === 2);
  t('runner marks successes', results.every((r) => r.ok));
}
{
  const seen = [];
  const loader = async (url) => {
    seen.push(url);
    if (url === 'bad') throw new Error('dead video');
    return true;
  };
  let threw = false;
  let results = null;
  try {
    results = await preloadInOrder(
      [{ number: 1, url: 'bad' }, { number: 2, url: 'good' }, { number: 3, url: 'ok' }],
      loader
    );
  } catch { threw = true; }
  t('runner never throws on a dead video', !threw);
  t('runner keeps going after a failure', JSON.stringify(seen) === JSON.stringify(['bad', 'good', 'ok']));
  t(
    'runner marks the dead video failed and the rest honestly',
    results[0].ok === false && results[1].ok === true && results[2].ok === true
  );
}
{
  const results = await preloadInOrder(null, async () => true);
  t('runner handles null list', Array.isArray(results) && results.length === 0);
}

// --- wired source guards (same grep style as the hub suites) ---
const godTowerSrc = readFileSync(
  new URL('../components/GodTower.jsx', import.meta.url),
  'utf8'
);
const homeSceneSrc = readFileSync(
  new URL('../components/HomeScene.jsx', import.meta.url),
  'utf8'
);
t('hub panel faces carry no prompt bar text', !godTowerSrc.includes('VISIT SITE'));
t('hub panel faces carry no inquiry bar text', !godTowerSrc.includes('Advertise Here: Email Us'));
t(
  'tap-to-link survives: face tap still opens the entry link',
  godTowerSrc.includes('onLaunchExternal(effectiveSlot.trackingUrl)')
);
t(
  'video face is true color: unlit and untone-mapped',
  godTowerSrc.includes('meshBasicMaterial map={videoState.texture') &&
    godTowerSrc.includes('toneMapped={false}')
);
t(
  'hub load sequence preloads panel videos in the background, never gating towers',
  homeSceneSrc.includes('preloadHubPanelVideos(towerPanels)') &&
    !homeSceneSrc.includes('panelVideosReady') &&
    !homeSceneSrc.includes('billboardManifestSettled')
);
t(
  'towers present without waiting on video preload or manifest settle',
  homeSceneSrc.includes('if (!textures) return null') &&
    !homeSceneSrc.includes('!panelVideosReady')
);
t(
  'videos swap in progressively: video face renders only once its URL is ready',
  godTowerSrc.includes('videoState.ready ? (') &&
    godTowerSrc.includes('map={videoState.texture}')
);
t(
  'unloaded panel shows the honest branded face, never black or blank',
  godTowerSrc.includes('map={faceTex || undefined}') &&
    godTowerSrc.includes("color={faceTex ? (hovered ? '#dddddd' : '#ffffff') : '#0a0f1e'}")
);

// --- per-panel view-play (Merlin, 2026-11-24): play in view, pause
// out of view, resume from where it paused — per PANEL, not per URL ---
t(
  'per-panel records: one video element per panel, keyed by panel + URL',
  godTowerSrc.includes('panelVideoRecordKey(viewerId, url)') &&
    godTowerSrc.includes('`${viewerId}::${url}`') &&
    !godTowerSrc.includes('viewers: new Set()')
);
t(
  'panel elements preload metadata only (132 faces must not all buffer media at mount)',
  godTowerSrc.includes("video.preload = 'metadata'") &&
    !godTowerSrc.includes("video.preload = 'auto'")
);
t(
  'in-view seat is per panel: play/pause follows this panel only',
  godTowerSrc.includes('setPanelVideoViewer(viewerId, videoUrl, inView)') &&
    godTowerSrc.includes('rec.inView = inView')
);
t(
  'resume, never restart: no currentTime reset on the play path',
  !godTowerSrc.includes('currentTime = 0') &&
    !godTowerSrc.includes('currentTime=0')
);
t(
  'preload warms the middle faces in board order via their own records',
  godTowerSrc.includes('`panel-${number + MIDDLE_LEVEL_BADGE_BASE}`') &&
    godTowerSrc.includes('ensurePanelVideo(url, `panel-${number + MIDDLE_LEVEL_BADGE_BASE}`)')
);
t(
  'tab-hide still pauses every panel video, visible resumes the in-view ones',
  godTowerSrc.includes("document.addEventListener('visibilitychange', refreshPanelVideoPlayback)") &&
    godTowerSrc.includes('const hidden = typeof document !== \'undefined\' && document.hidden')
);

console.log(`\nbillboard-panel-video: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
