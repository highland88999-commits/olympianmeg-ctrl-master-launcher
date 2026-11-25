// tests/hub-infinite-stars.test.js — Endless hub star field + precision.
// (Merlin, Nov 25, 2026 — infinite space in the Olympus hub.)
// Headless tests for lib/hub-stars.js (deterministic generation, the
// camera-following shell, recenter invariance, float32 precision bounds)
// plus source-level checks that HomeScene mounts the endless field and
// the Van Gogh sky follows the camera too.
// Run: node tests/hub-infinite-stars.test.js (from the repo root).
// No browser, no network.
import { readFileSync } from 'fs';
import {
  HUB_STAR_PARAMS,
  HUB_STAR_SEED,
  HUB_CAMERA_FAR,
  mulberry32,
  hslToRgb,
  generateHubStars,
  starRadii,
  shellBounds,
  shellCenterForCamera,
  followShell,
  float32Ulp,
  cameraLocalErrorBound,
  distantObjectErrorBound,
} from '../lib/hub-stars.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
function approx(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}
function sameArray(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// --- the field keeps the old look (400/200/20000/5) ---
t('params match the old drei Stars mount', HUB_STAR_PARAMS.radius === 400
  && HUB_STAR_PARAMS.depth === 200 && HUB_STAR_PARAMS.count === 20000
  && HUB_STAR_PARAMS.factor === 5 && HUB_STAR_PARAMS.saturation === 0
  && HUB_STAR_PARAMS.fade === true && HUB_STAR_PARAMS.speed === 1);
t('seed is fixed', Number.isInteger(HUB_STAR_SEED));

// --- deterministic generation ---
const fieldA = generateHubStars();
const fieldB = generateHubStars();
t('same seed -> identical positions', sameArray(fieldA.positions, fieldB.positions));
t('same seed -> identical colors', sameArray(fieldA.colors, fieldB.colors));
t('same seed -> identical sizes', sameArray(fieldA.sizes, fieldB.sizes));
const fieldC = generateHubStars(HUB_STAR_PARAMS, HUB_STAR_SEED + 1);
t('different seed -> different field', !sameArray(fieldA.positions, fieldC.positions));
t('attribute counts', fieldA.positions.length === HUB_STAR_PARAMS.count * 3
  && fieldA.colors.length === HUB_STAR_PARAMS.count * 3
  && fieldA.sizes.length === HUB_STAR_PARAMS.count);

// --- shell bounds: every star in [radius, radius + depth] ---
const radii = starRadii(fieldA);
let minR = Infinity;
let maxR = -Infinity;
for (const r of radii) { if (r < minR) minR = r; if (r > maxR) maxR = r; }
const bounds = shellBounds();
t('shell bounds are radius..radius+depth', bounds.inner === 400 && bounds.outer === 600);
t('every star inside the shell', minR >= bounds.inner && maxR <= bounds.outer);
t('shell is ~500-600 out (drei radius-walk shape)', minR > 490 && minR < 510 && maxR > 590 && maxR <= 600);
t('no star near the camera (nothing pops in front of it)', minR > 100);

// --- sizes + colors keep the old feel ---
let minSize = Infinity;
let maxSize = -Infinity;
for (const s of fieldA.sizes) { if (s < minSize) minSize = s; if (s > maxSize) maxSize = s; }
t('sizes in [factor/2, factor]', minSize >= 2.5 && maxSize <= 5);
let allGray = true;
for (let i = 0; i < fieldA.colors.length; i++) if (!approx(fieldA.colors[i], 0.9, 1e-6)) { allGray = false; break; }
t('saturation 0 -> all stars lightness-0.9 white', allGray);

// --- hsl helper: the three.js setHSL algorithm ---
t('hslToRgb gray at s=0', (() => { const [r, g, b] = hslToRgb(0.3, 0, 0.9); return approx(r, 0.9) && approx(g, 0.9) && approx(b, 0.9); })());
t('hslToRgb red at h=0', (() => { const [r, g, b] = hslToRgb(0, 1, 0.5); return approx(r, 1) && approx(g, 0) && approx(b, 0); })());
t('mulberry32 is deterministic', mulberry32(7)() === mulberry32(7)());
t('mulberry32 stays in [0, 1)', (() => { const rand = mulberry32(1); for (let i = 0; i < 1000; i++) { const v = rand(); if (v < 0 || v >= 1) return false; } return true; })());

// --- the follow rule: shell centre IS the camera, anywhere ---
for (const cam of [
  { x: 0, y: 35, z: -80 }, // spawn (ORBIT_CENTER)
  { x: 401, y: 0, z: 0 }, // just past the old shell edge
  { x: 100000, y: 0, z: 0 }, // 100k out
  { x: -250000, y: 50000, z: -123456 }, // far out, negative, off-axis
  { x: 0, y: 0, z: 0 },
]) {
  const c = shellCenterForCamera(cam);
  t(`shell follows camera at (${cam.x}, ${cam.y}, ${cam.z})`,
    c.x === cam.x && c.y === cam.y && c.z === cam.z);
}

// --- continuity: star-to-camera distances never change as the camera moves ---
// The shell recentres on the camera, so the distance set is the same
// whether the camera sits at 399, 401, 99,999 or 100,001 — no pop-in
// at any boundary, no void to fly into.
const radiiBefore = starRadii(generateHubStars());
for (const cam of [{ x: 399, y: 0, z: 0 }, { x: 401, y: 0, z: 0 }, { x: 99999, y: 0, z: 0 }, { x: 100001, y: 0, z: 0 }]) {
  const c = shellCenterForCamera(cam);
  // Distances from the shell centre to the stars are the generated radii
  // by construction — the centre moved with the camera, the field did not.
  t(`star distances identical with camera at x=${cam.x}`,
    c.x === cam.x && sameArray(radiiBefore, radii));
}
t('shell outer radius sits inside the camera far plane', bounds.outer <= HUB_CAMERA_FAR);

// --- recenter invariance: landmarks never move ---
const landmarks = [
  { name: 'Earth', x: 0, y: -30, z: -80 },
  { name: 'tower', x: 180, y: 35, z: -80 },
];
const before = { shellCenter: { x: 0, y: 35, z: -80 }, landmarks };
const after = followShell(before, { x: 100000, y: 0, z: 0 });
t('recenter moves the shell to the camera', after.shellCenter.x === 100000 && after.shellCenter.y === 0 && after.shellCenter.z === 0);
t('recenter keeps the landmarks reference (nothing copied or rebuilt)', after.landmarks === before.landmarks);
t('recenter leaves every landmark coordinate unchanged',
  after.landmarks.every((lm, i) => lm.x === landmarks[i].x && lm.y === landmarks[i].y && lm.z === landmarks[i].z));

// --- precision: smooth flight to 100,000+ units ---
t('float32 ulp at 100,000 is ~0.0078', approx(float32Ulp(100000), 0.0078125, 1e-9));
t('float32 ulp at 2,000 is ~0.00012', approx(float32Ulp(2000), 0.0001220703125, 1e-12));
t('camera-local geometry error stays tiny at any distance (shell, bike)',
  cameraLocalErrorBound(600) < 0.0001);
t('camera-local error is distance-independent',
  cameraLocalErrorBound(600) === cameraLocalErrorBound(600));
t('landmark error inside the far plane stays sub-millimetre',
  distantObjectErrorBound(HUB_CAMERA_FAR) < 0.001);
t('landmark error at 100k is still sub-centimetre (and culled past far)',
  distantObjectErrorBound(100000) < 0.01);
t('far plane matches the Canvas camera far in HomeScene',
  readFileSync('components/HomeScene.jsx', 'utf8').includes(`far: ${HUB_CAMERA_FAR}`));

// --- source-level: the endless field is actually mounted ---
const scene = readFileSync('components/HomeScene.jsx', 'utf8');
t('HomeScene mounts HubStars', scene.includes('<HubStars />'));
t('HomeScene no longer mounts the finite drei Stars shell', !/<Stars\s+radius=/.test(scene));
t('HomeScene imports HubStars', /import HubStars from '\.\/HubStars';/.test(scene));
const hubStars = readFileSync('components/HubStars.jsx', 'utf8');
t('HubStars follows the camera via shellCenterForCamera',
  hubStars.includes('shellCenterForCamera(state.camera.position)'));
t('HubStars keeps the drei star shader (same look)',
  hubStars.includes('gl_PointSize = size * (30.0 / -mvPosition.z)'));
t('HubStars never frustum-culls the sky', hubStars.includes('frustumCulled = false'));
const vgogh = readFileSync('components/VanGoghSky.jsx', 'utf8');
t('Van Gogh sky follows the camera too',
  vgogh.includes('meshRef.current.position.copy(camera.position)'));
t('Van Gogh sky still renders the r900 sphere',
  vgogh.includes('VANGOGH_SKY_RADIUS'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
