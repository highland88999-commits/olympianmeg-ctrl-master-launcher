// tests/billboard-blank-stopgap.test.mjs
// Blank-billboard stopgap (Merlin, Nov 26, 2026): ALL billboard
// faces rendered as plain blank screens — no canvas art, no video —
// until the hub crash was fixed for real. LIFTED Nov 26, 2026 by
// the shared canvas-face cache (tests/billboard-face-cache.test.mjs):
// the flag is now false and the boards are back. The flag stays as
// the emergency kill-switch — one edit re-blanks the boards — and
// the gates below stay in the source so it still works. The round-1
// deferral latch stays in the tree and still gates video content.
// Run: node tests/billboard-blank-stopgap.test.mjs (from the repo root).
// No browser, no network — asserts on the flag module and on the
// wired source (same grep style as the hub suites).
//
// Rules under test:
// - The flag exists in exactly one place and is false (boards back).
// - GodTower: the canvas-face effect still checks the flag first;
//   the video-state effect still checks it before any record; the
//   hub preload still checks it before collecting URLs; the number
//   badge still renders only when not blank.
// - BillboardMonument: the effect still checks the flag before any
//   canvas or video is created.
// - The round-1 deferral latch is intact (releasePanelVideoLoad
//   still exported, still the only src assignment in GodTower).
// - The blank fallback is already the render path: with no face
//   texture and no ready video, the face renders the plain dark
//   material — no new render branch was needed.
import { readFileSync } from 'node:fs';
import { BILLBOARDS_BLANK } from '../lib/billboards-blank.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const godTower = readFileSync(new URL('../components/GodTower.jsx', import.meta.url), 'utf8');
const monument = readFileSync(new URL('../components/argo/BillboardMonument.jsx', import.meta.url), 'utf8');
const flagSrc = readFileSync(new URL('../lib/billboards-blank.js', import.meta.url), 'utf8');

// --- the flag itself: LIFTED — the boards are back ---
t('flag module exports BILLBOARDS_BLANK false', BILLBOARDS_BLANK === false);
t('flag is the only definition', (flagSrc.match(/BILLBOARDS_BLANK\s*=\s*false/g) || []).length === 1);
t('flag module says how to re-blank', /set BILLBOARDS_BLANK[^a-zA-Z0-9]{0,10}to true/i.test(flagSrc));

// --- GodTower imports the flag ---
t('GodTower imports BILLBOARDS_BLANK from lib/billboards-blank',
  /import \{ BILLBOARDS_BLANK \} from '@\/lib\/billboards-blank'/.test(godTower));

// --- canvas faces: the effect returns before any canvas ---
{
  // usePanelFaceTexture's effect: the blank check must come before
  // the stake branch and before createBillboardFaceCanvas.
  const eff = godTower.slice(godTower.indexOf('function usePanelFaceTexture'));
  const blankAt = eff.indexOf('if (BILLBOARDS_BLANK) return;');
  const stakeAt = eff.indexOf('if (slot.key === STAKE_SLOT.key)');
  const canvasAt = eff.indexOf('createBillboardFaceCanvas(slot');
  t('face effect checks the flag first', blankAt !== -1 && blankAt < stakeAt && blankAt < canvasAt);
}

// --- video records: the effect returns before any record ---
{
  const eff = godTower.slice(godTower.indexOf('function usePanelVideoState'));
  const blankAt = eff.indexOf('if (BILLBOARDS_BLANK) return undefined;');
  const recAt = eff.indexOf('getPanelVideoRecord(');
  t('video effect checks the flag before creating a record', blankAt !== -1 && blankAt < recAt);
}

// --- hub preload: returns before collecting URLs ---
{
  const fn = godTower.slice(godTower.indexOf('export function preloadHubPanelVideos'));
  const blankAt = fn.indexOf('if (BILLBOARDS_BLANK) return Promise.resolve([]);');
  const collectAt = fn.indexOf('collectPanelVideoUrls(');
  t('preload checks the flag before collecting URLs', blankAt !== -1 && blankAt < collectAt);
}

// --- number badge: does not render while blank ---
t('badge render is gated on !BILLBOARDS_BLANK',
  /typeof badgeNumber === 'number' && !BILLBOARDS_BLANK/.test(godTower));

// --- blank fallback is the existing render path ---
t('face falls back to plain dark material with no texture',
  /color=\{faceTex \? \(hovered \? '#dddddd' : '#ffffff'\) : '#0a0f1e'\}/.test(godTower));

// --- round-1 deferral latch intact (flag lifted, latch still gates) ---
t('releasePanelVideoLoad still exported', /export function releasePanelVideoLoad\(\)/.test(godTower));
t('still exactly one video.src assignment in GodTower',
  (godTower.match(/\.video\.src = /g) || []).length === 1);
t('hold latch still starts held', /let panelVideoLoadHeld = true;/.test(godTower));

// --- BillboardMonument imports the flag and gates its effect ---
t('Monument imports BILLBOARDS_BLANK from lib/billboards-blank',
  /import \{ BILLBOARDS_BLANK \} from '\.\.\/\.\.\/lib\/billboards-blank'/.test(monument));
{
  const eff = monument.slice(monument.indexOf('useEffect(() => {'));
  const blankAt = eff.indexOf('if (BILLBOARDS_BLANK) return undefined;');
  const canvasAt = eff.indexOf("document.createElement('canvas')");
  const videoAt = eff.indexOf("document.createElement('video')");
  t('monument effect checks the flag before canvas/video', blankAt !== -1 && blankAt < canvasAt && blankAt < videoAt);
}
t('monument blank fallback is plain dark material',
  /color: texture \? '#ffffff' : '#0a0f1e'/.test(monument));

console.log(`billboard-blank-stopgap: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
