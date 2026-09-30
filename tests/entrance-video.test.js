// tests/entrance-video.test.js — Merlin's entrance video wiring:
// (1) behind the auth text in components/Auth.jsx (his one house ad slot),
// (2) as a normal-clarity background video behind the 3D home scene in
// app/page.jsx. Universal policy (Merlin 2026-09-30): video brightness is
// normal and clear everywhere — no dimming filters, only light veils.
// Run: node tests/entrance-video.test.js (from the repo root). No browser, no network.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const authSrc = readFileSync(join(root, 'components/Auth.jsx'), 'utf8');
const homeSrc = readFileSync(join(root, 'app/page.jsx'), 'utf8');
// Phase 2b (2026-09-30): the home 3D Canvas was code-split out of app/page.jsx
// into components/HomeScene.jsx. Canvas assertions read the scene file.
const sceneSrc = readFileSync(join(root, 'components/HomeScene.jsx'), 'utf8');
const videoPath = join(root, 'public/media/entrance.mp4');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- the video file itself -------------------------------------------------
t('public/media/entrance.mp4 exists', existsSync(videoPath));
t('video file is non-trivial (>1MB)', existsSync(videoPath) && statSync(videoPath).size > 1_000_000);

// --- Auth.jsx: video behind the auth text ----------------------------------
t('Auth renders a <video> for the entrance file', authSrc.includes('<video') && authSrc.includes('src="/media/entrance.mp4"'));
t('Auth video autoplays', /<video[\s\S]*?autoPlay/.test(authSrc));
t('Auth video loops', /<video[\s\S]*?loop/.test(authSrc));
t('Auth video is muted', /<video[\s\S]*?muted/.test(authSrc));
t('Auth video is playsinline (iOS)', /<video[\s\S]*?playsInline/.test(authSrc));
t('Auth video has an honest missing-file fallback (no fake video)', authSrc.includes('onError') && authSrc.includes('setVideoOk(false)'));
t('Auth keeps a light veil (not a dim overlay) so the video stays clear', authSrc.includes('bg-black/30') && !authSrc.includes('bg-black/55'));
t('Auth video sits behind the auth card (background layer, card is relative)', authSrc.includes('aria-hidden="true"'));

// --- app/page.jsx: normal-clarity background video behind the home scene --
t('home renders the background video layer at normal brightness', homeSrc.includes('src="/media/entrance.mp4"') && homeSrc.includes('normal brightness'));
t('home video loops muted playsinline autoplay', /<video[\s\S]*?src="\/media\/entrance\.mp4"[\s\S]*?autoPlay[\s\S]*?loop[\s\S]*?muted[\s\S]*?playsInline/.test(homeSrc));
t('home video is NOT dimmed (no brightness-cut filter)', !homeSrc.includes('brightness(0.30)'));
t('home video is NOT desaturated', !homeSrc.includes('saturate(0.55)'));
t('home video keeps only a light veil (no dark overlay)', homeSrc.includes('bg-black/20') && !homeSrc.includes('bg-black/50'));
t('home video never double-plays under the Auth overlay', homeSrc.includes('(user || cloudOffline) && bgVideoOk'));
t('home video has an honest missing-file fallback', homeSrc.includes('setBgVideoOk(false)'));
t('home Canvas is transparent so the video shows through behind the scene', sceneSrc.includes('gl={{ alpha: true }}'));
t('home keeps the opaque #050505 backdrop when the video is missing', sceneSrc.includes("{!bgVideoOk && <color attach=\"background\" args={['#050505']} />}"));
t('background video layer is pointer-events-none (never blocks the scene)', homeSrc.includes('absolute inset-0 overflow-hidden pointer-events-none'));

console.log(`\nentrance-video: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
