// tests/store-space-bg.test.js — Headless tests for the Omega Store
// deep-space video background. Run: node tests/store-space-bg.test.js
// (from the repo root). No browser, no network — asserts on the shipped
// video/poster assets plus source-level checks on the store page and the
// shared background component.
import { readFileSync, statSync } from 'fs';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const bytes = (p) => readFileSync(new URL(p, import.meta.url));

const VIDEO = '../public/videos/store-space-background.mp4';
const POSTER = '../public/videos/store-space-background-poster.jpg';
const SIZE_BUDGET = 2.5 * 1024 * 1024; // ~2.5MB — phone-first

// --- video asset ---
{
  const v = bytes(VIDEO);
  t('space video exists and is non-empty', v.length > 0);
  t('space video under the 2.5MB phone budget', v.length <= SIZE_BUDGET);
  const moov = v.indexOf(Buffer.from('moov'));
  const mdat = v.indexOf(Buffer.from('mdat'));
  t('moov atom present (streamable)', moov > 0 && mdat > 0);
  t('moov before mdat (faststart — streams without full download)', moov > 0 && mdat > 0 && moov < mdat);
}

// --- poster fallback ---
{
  const p = bytes(POSTER);
  t('poster frame exists and is non-empty', p.length > 0);
  t('poster is a valid JPEG (SOI marker)', p[0] === 0xff && p[1] === 0xd8);
}

// --- store page wiring ---
{
  const page = src('../app/store/page.jsx');
  t('page imports the shared background component',
    page.includes("import StoreSpaceBackground from '@/components/store/StoreSpaceBackground'"));
  t('page renders the background', page.includes('<StoreSpaceBackground'));
  t('page root dropped the opaque backdrop (video shows through)',
    page.includes('relative min-h-dvh text-white')
    && !page.includes("className=\"min-h-dvh bg-[#06070d] text-white\"\n"));
  t('main content paints above the fixed background', page.includes('relative z-10'));
  t('header went translucent so space shows through', page.includes('bg-black/35'));

  // product-card echo
  t('cards are translucent dark (video ghosts behind)',
    page.includes('bg-black/45'));
  t('cards blur the video behind them', page.includes('backdrop-blur-md'));

  // legibility: cleanest-UI rule — names/prices stay crisp
  t('product name stays crisp white', page.includes('font-semibold text-white'));
  t('price stays high-contrast', page.includes('text-amber-300'));

  // checkout continuity: listing, success, and cancelled all live on /store
  t('checkout success state still handled',
    page.includes("params.get('checkout')") && page.includes("=== 'success'"));
  t('checkout cancelled state still handled',
    page.includes("=== 'cancelled'"));
  t('background comment documents the no-flash intent',
    page.includes('never reloads or flashes'));
}

// --- shared background component ---
{
  const bg = src('../components/store/StoreSpaceBackground.jsx');
  t('component exports the video path constant',
    bg.includes("STORE_SPACE_VIDEO = '/videos/store-space-background.mp4'"));
  t('component exports the poster path constant',
    bg.includes("STORE_SPACE_POSTER = '/videos/store-space-background-poster.jpg'"));
  t('background is fixed full-viewport behind everything',
    bg.includes('fixed inset-0 z-0'));
  t('video covers the viewport', bg.includes('object-cover'));
  t('video autoplays muted on loop', bg.includes('autoPlay') && bg.includes('muted') && bg.includes('loop'));
  t('video plays inline (no iOS fullscreen hijack)', bg.includes('playsInline'));
  t('poster shows while the video loads', bg.includes('poster={STORE_SPACE_POSTER}'));
  t('never intercepts taps', bg.includes('pointer-events-none'));
  t('hidden from assistive tech (decorative)', bg.includes('aria-hidden="true"'));
  t('reduced-motion path swaps video for the static poster',
    bg.includes('prefers-reduced-motion') && bg.includes('<img'));
  t('legibility veil keeps text crisp over bright patches',
    bg.includes('from-black/55'));
  t('no network calls of its own', !bg.includes('fetch('));
}

console.log(`\nstore-space-bg: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
