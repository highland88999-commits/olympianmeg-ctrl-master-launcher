// tests/billboard-frame-fit.test.mjs
// Billboard frame fit (Merlin, 2026-10-31): the creative fills the
// WHOLE frame edge to edge inside the border rim — hub tower panels
// (face 12.64×7.0, canvas 1264×700) are landscape 16:9, and user
// uploads must fit it (enforced at both upload points, with the size
// stated up front). Street monuments (face 9.0×15.75) are still 4:7
// portrait — a 16:9 creative cover-crops there; that mismatch is
// Merlin's call.
// Run: node tests/billboard-frame-fit.test.mjs (from the repo root).
// No browser, no network — asserts on the pure fit helpers and on the
// wired source (same grep style as the hub suites).
import { readFileSync } from 'node:fs';
import {
  FRAME_ASPECT,
  FRAME_MIN_W,
  FRAME_MIN_H,
  FRAME_REC_W,
  FRAME_REC_H,
  fitsFrameAspect,
  fitsFramePixels,
  checkCreativeFit,
  SIZE_NOTICE,
  fitRejectMessage,
} from '../lib/billboards/creative-fit.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// --- frame spec: one 16:9 aspect, min 640×360, recommended 1280×720 ---
t('frame aspect is 16:9', Math.abs(FRAME_ASPECT - 16 / 9) < 1e-12);
t('frame minimum is 640×360', FRAME_MIN_W === 640 && FRAME_MIN_H === 360);
t('frame recommended is 1280×720', FRAME_REC_W === 1280 && FRAME_REC_H === 720);

// --- aspect rule: exact 16:9 passes; portrait/square/4:7 fail ---
t('exact 16:9 passes', checkCreativeFit(1280, 720).ok);
t('recommended 1280×720 passes', checkCreativeFit(1280, 720).ok);
t('brochure reel 1248×704 passes (16:9 within tolerance)', checkCreativeFit(1248, 704).ok);
t('portrait 9:16 fails aspect', !checkCreativeFit(720, 1280).aspectOk);
t('square 1:1 fails aspect', !checkCreativeFit(1080, 1080).aspectOk);
t('portrait 4:7 fails aspect', !checkCreativeFit(400, 700).aspectOk);
t('zero dims fail', !checkCreativeFit(0, 720).ok && !checkCreativeFit(1280, 0).ok);

// --- pixel rule: below the 640×360 minimum fails even at exact aspect ---
t('exact aspect but too small fails pixels', !checkCreativeFit(320, 180).pixelsOk && !checkCreativeFit(320, 180).ok);
t('639 wide fails pixels', !checkCreativeFit(639, 360).pixelsOk);
t('359 tall fails pixels', !checkCreativeFit(640, 359).pixelsOk);
t('pixels helper agrees with check', fitsFramePixels(640, 360) && !fitsFramePixels(639, 360));
t('aspect helper agrees with check', fitsFrameAspect(1280, 720) && !fitsFrameAspect(720, 1280));

// --- messages state the size plainly ---
t('size notice states 16:9', SIZE_NOTICE.includes('16:9'));
t('size notice states minimum 640×360', SIZE_NOTICE.includes('640×360'));
t('size notice states recommended 1280×720', SIZE_NOTICE.includes('1280×720'));
t('aspect rejection names the size and the file size',
  fitRejectMessage(720, 1280).includes('16:9') &&
  fitRejectMessage(720, 1280).includes('640×360') &&
  fitRejectMessage(720, 1280).includes('720×1280'));
t('pixel rejection names the minimum and the file size',
  fitRejectMessage(320, 180).includes('640×360') &&
  fitRejectMessage(320, 180).includes('320×180'));

// --- wired source: hub face fills the whole frame, edge to edge ---
const godTower = src('../components/GodTower.jsx');
t('hub face plane is 12.64×7.0', godTower.includes('FACE_PLANE_W = 12.64') && godTower.includes('FACE_PLANE_H = 7.0'));
t('hub face canvas is 1264×700', godTower.includes('FACE_PX_W = 1264') && godTower.includes('FACE_PX_H = 700'));
t('hub face is centered on the box (no dark slab below it)',
  godTower.includes('position={[0, 0, 0.24]}'));
t('hub border covers the full box face (12.84×7.2), face 0.1 inside it',
  godTower.includes('position={[0, 0, 0.16]}') && godTower.includes('args={[12.84, 7.2]}'));
t('hub backing box is 12.84×7.2', godTower.includes('args={[12.84, 7.2, 0.2]}'));
t('hub number badge stays overlaid on the face', godTower.includes('BillboardNumberBadge'));
t('hub stake texture cover-fits to the new face',
  src('../components/HomeScene.jsx').includes('applyCoverFit(ad, ad.image.width, ad.image.height, 12.64, 7.0)'));
t('hub panels still carry no prompt texts',
  !godTower.includes('VISIT SITE') && !godTower.includes('Advertise Here: Email Us'));

// --- wired source: monuments are still 4:7 (mismatch is Merlin's call) ---
const monument = src('../components/argo/BillboardMonument.jsx');
t('monument face is 9.0×15.75 (4:7)', monument.includes('FACE_W = 9.0') && monument.includes('FACE_H = 15.75'));
t('monument canvas matches the 4:7 face', monument.includes('CANVAS_W = 1800') && monument.includes('CANVAS_H = 3150'));
t('monument still carries no prompt texts',
  !monument.includes('VISIT SITE') && !monument.includes('Advertise Here: Email Us'));

// --- wired source: both upload points enforce fit and state the size ---
const request = src('../app/request-billboard/page.jsx');
const manager = src('../app/ad-spaces/page.jsx');
for (const [name, page] of [['request page', request], ['manager page', manager]]) {
  t(`${name} probes dimensions before upload`, page.includes('probeCreativeDimensions(file)'));
  t(`${name} rejects on fit failure`, page.includes('checkCreativeFit(') && page.includes('fitRejectMessage('));
  t(`${name} shows the size notice`, page.includes('SIZE_NOTICE'));
}

console.log(`\nbillboard-frame-fit: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
