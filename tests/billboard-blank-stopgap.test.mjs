// tests/billboard-blank-stopgap.test.mjs
// Blank-billboard stopgap (Merlin, Nov 26, 2026): ALL billboard
// faces render as plain blank screens — no canvas art, no video —
// until the hub crash is fixed for real and the boards come back.
// One flag in one place (lib/billboards-blank.js); one edit there
// brings them back. The round-1 deferral latch stays in the tree,
// superseded by the flag while it is true.
// Run: node tests/billboard-blank-stopgap.test.mjs (from the repo root).
// No browser, no network — asserts on the flag module and on the
// wired source (same grep style as the hub suites).
//
// Rules under test:
// - The flag exists in exactly one place and is true.
// - GodTower: the canvas-face effect returns before any canvas is
//   created; the video-state effect returns before any record is
//   created; the hub preload returns before any URL is collected;
//   the number badge does not render while blank.
// - BillboardMonument: the effect returns before any canvas or
//   video is created.
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

// --- the flag itself ---
t('flag module exports BILLBOARDS_BLANK true', BILLBOARDS_BLANK === true);
t('flag is the only definition', (flagSrc.match(/BILLBOARDS_BLANK\s*=\s*true/g) || []).length === 1);
t('flag module says how to revert', /set BILLBOARDS_BLANK to false/i.test(flagSrc));

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

// --- round-1 deferral latch intact (superseded, not removed) ---
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
