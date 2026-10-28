// tests/billboard-frame-fit.test.mjs
// Billboard frame fit (Merlin, 2026-10-27): the creative fills the
// WHOLE frame edge to edge inside the border rim — hub tower panels
// (face 12.64×7.0) and street monuments (face 9.0×15.75) share the tall
// portrait 4:7 aspect, and user uploads must fit it (enforced at both
// upload points, with the size stated up front).
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

// --- frame spec: one 4:7 aspect, min 400×700, recommended 800×1400 ---
t('frame aspect is 4:7', Math.abs(FRAME_ASPECT - 4 / 7) < 1e-12);
t('frame minimum is 400×700', FRAME_MIN_W === 400 && FRAME_MIN_H === 700);
t('frame recommended is 800×1400', FRAME_REC_W === 800 && FRAME_REC_H === 1400);

// --- aspect rule: exact 4:7 and phone 9:16 pass; landscape/square/3:4 fail ---
t('exact 4:7 passes', checkCreativeFit(400, 700).ok);
t('recommended 800×1400 passes', checkCreativeFit(800, 1400).ok);
t('phone portrait 9:16 passes (1.6% off 4:7, inside 5% tolerance)', checkCreativeFit(720, 1280).ok);
t('landscape 16:9 fails aspect', !checkCreativeFit(1280, 720).aspectOk);
t('square 1:1 fails aspect', !checkCreativeFit(1080, 1080).aspectOk);
t('portrait 3:4 fails aspect', !checkCreativeFit(900, 1200).aspectOk);
t('zero dims fail', !checkCreativeFit(0, 700).ok && !checkCreativeFit(400, 0).ok);

// --- pixel rule: below the 400×700 minimum fails even at exact aspect ---
t('exact aspect but too small fails pixels', !checkCreativeFit(200, 350).pixelsOk && !checkCreativeFit(200, 350).ok);
t('399 wide fails pixels', !checkCreativeFit(399, 700).pixelsOk);
t('699 tall fails pixels', !checkCreativeFit(400, 699).pixelsOk);
t('pixels helper agrees with check', fitsFramePixels(400, 700) && !fitsFramePixels(399, 700));
t('aspect helper agrees with check', fitsFrameAspect(400, 700) && !fitsFrameAspect(1280, 720));

// --- messages state the size plainly ---
t('size notice states 4:7', SIZE_NOTICE.includes('4:7'));
t('size notice states minimum 400×700', SIZE_NOTICE.includes('400×700'));
t('size notice states recommended 800×1400', SIZE_NOTICE.includes('800×1400'));
t('size notice states 9:16 fits', SIZE_NOTICE.includes('9:16'));
t('aspect rejection names the size and the file size',
  fitRejectMessage(1280, 720).includes('4:7') &&
  fitRejectMessage(1280, 720).includes('400×700') &&
  fitRejectMessage(1280, 720).includes('1280×720'));
t('pixel rejection names the minimum and the file size',
  fitRejectMessage(200, 350).includes('400×700') &&
  fitRejectMessage(200, 350).includes('200×350'));

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

// --- wired source: monuments share the 4:7 frame, face centered ---
const monument = src('../components/argo/BillboardMonument.jsx');
t('monument face is 9.0×15.75 (4:7)', monument.includes('FACE_W = 9.0') && monument.includes('FACE_H = 15.75'));
t('monument halo is the full frame face 9.45×16.2', monument.includes('MAG_W = 9.45') && monument.includes('MAG_H = 16.2'));
t('monument face is centered (no dark slab below it)',
  monument.includes('position={[0, 0, 0.4]}') && monument.includes('position={[0, 0, 0.32]}'));
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
