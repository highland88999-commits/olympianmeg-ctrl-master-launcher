// tests/menu-audit-video.test.mjs — Headless tests for the 2026-10-02 menu
// audit batch: space-video backgrounds wired into menus that lacked one,
// and the 15 ARGO prompt slots staged for the graphics queue.
// Run: node tests/menu-audit-video.test.mjs (from the repo root).
// No browser, no network.
import { readFileSync } from 'fs';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- 1. ARGO (Earth Fleet Command) gets the space video --------------------
const argo = readFileSync('app/argo/page.jsx', 'utf8');
t('argo: imports StoreSpaceBackground',
  argo.includes("import StoreSpaceBackground from '@/components/store/StoreSpaceBackground'"));
t('argo: renders <StoreSpaceBackground />',
  argo.includes('<StoreSpaceBackground />'));
// The video must sit behind the 3D canvas: it is rendered before <Canvas
// in the root div, and the canvas paints above it in DOM order.
t('argo: video rendered before the 3D Canvas',
  argo.indexOf('<StoreSpaceBackground />') < argo.indexOf('<Canvas'));
t('argo: 3D canvas still present (video is a backdrop, not a replacement)',
  argo.includes('<Canvas'));

// --- 2. World Engine dashboard (9-builder menu) gets the space video -------
const dash = readFileSync('app/world-engine/dashboard/page.jsx', 'utf8');
t('dashboard: imports StoreSpaceBackground',
  dash.includes("import StoreSpaceBackground from '@/components/store/StoreSpaceBackground'"));
t('dashboard: renders <StoreSpaceBackground />',
  dash.includes('<StoreSpaceBackground />'));
// Store pattern: content lifts above the fixed z-0 video via relative z-10.
t('dashboard: content wrapper is relative z-10',
  /className="relative z-10 max-w-6xl/.test(dash));
t('dashboard: all 9 builder modules still listed',
  (dash.match(/route: '\/world-engine\//g) || []).length >= 9);

// --- 3. The shared video component still honors reduced motion -------------
const bg = readFileSync('components/store/StoreSpaceBackground.jsx', 'utf8');
t('background: prefers-reduced-motion falls back to the poster',
  bg.includes('prefers-reduced-motion') && bg.includes('STORE_SPACE_POSTER'));
t('background: video is muted/looping/inline (autoplay-safe on phones)',
  bg.includes('muted') && bg.includes('loop') && bg.includes('playsInline'));
t('background: legibility veil keeps text crisp',
  bg.includes('from-black/55'));

// --- 4. Menus that already had a video were NOT re-wired --------------------
const store = readFileSync('app/store/page.jsx', 'utf8');
t('store: still exactly one space background (no duplicate)',
  (store.match(/<StoreSpaceBackground \/>/g) || []).length === 1);
const hermes = readFileSync('app/hermes/page.jsx', 'utf8');
t('hermes: still exactly one space background (no duplicate)',
  (hermes.match(/<StoreSpaceBackground \/>/g) || []).length === 1);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
