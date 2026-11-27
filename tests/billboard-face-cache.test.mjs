// tests/billboard-face-cache.test.mjs
// Shared canvas-face texture cache (Merlin, Nov 26, 2026 — hub crash
// return path): the 249 per-panel 1264x700 canvas faces collapse to
// ONE texture per distinct paint, through a module-level refcounted
// cache (lib/billboard-face-cache.js, same pattern as the existing
// border-texture cache in components/GodTower.jsx).
// Run: node tests/billboard-face-cache.test.mjs (from the repo root).
// No browser, no network — asserts on the pure key + cache, on the
// real-module face enumeration, and on the wired source (same grep
// style as the hub suites).
//
// Rules under test:
// - Enumeration: executing the real modules over all 288 faces gives
//   249 canvas faces, 39 shared-stake faces, and exactly 6 distinct
//   paints — the cache size. (Board number, god name, level, and the
//   tracking URL itself are never painted, so they are not in the
//   key; the only split inside one paint is the starfield seed,
//   key.length, which divides the house paint into ad-1..ad-9 and
//   ad-10..ad-44.)
// - Measured memory: 249 canvases = 881.3 MB CPU + 1,175.0 MB GPU
//   (with mipmaps) = 2,056.3 MB worst case; 6 shared textures =
//   21.24 MB CPU + 28.31 MB GPU = 49.55 MB total.
// - Key design: two slots share a key iff they paint identically —
//   name case, tracking-URL value, and board number do not split;
//   kind, tagline, accent, tracking-URL presence, key length, and
//   image URL do.
// - Sharing: two acquires of one key call the factory once and
//   return the same texture instance; different keys do not share.
// - Lifecycle: a shared texture is NOT disposed while another panel
//   uses it; it is disposed exactly once when the last holder
//   releases. A null factory result (iOS canvas exhaustion) is not
//   cached — the next acquire retries.
// - The blank flag is false: the boards are back.
// - The round-1 deferral latch still gates video src assignment
//   (releasePanelVideoLoad, held until textures + first frame +
//   intro rotation ended).
// - GodTower wires the cache: the face effect acquires/releases
//   through it and never disposes a texture itself.
import { readFileSync } from 'node:fs';
import { BILLBOARDS_BLANK } from '../lib/billboards-blank.js';
import {
  billboardFaceCacheKey,
  createFaceTextureCache,
} from '../lib/billboard-face-cache.js';
import { panelsForTower, houseLevelSlot } from '../lib/tower-panels.js';
import { manifestToOverrides, applyOverridesToTowerPanels } from '../lib/billboards/overrides.js';
import { STAKE_SLOT } from '../lib/partners.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const godTower = readFileSync(new URL('../components/GodTower.jsx', import.meta.url), 'utf8');
const homeScene = readFileSync(new URL('../components/HomeScene.jsx', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../public/billboards/manifest.json', import.meta.url), 'utf8'));

// --- 1. enumeration against the real modules (GodTower + HomeScene shape) ---
const FACE_BYTES = 1264 * 700 * 4;
{
  const overrides = manifestToOverrides(manifest);
  const keyCounts = new Map();
  let total = 0, stakeFaces = 0, canvasFaces = 0;
  const perTowerCanvas = [];
  for (let ti = 0; ti < 24; ti++) {
    const panels = applyOverridesToTowerPanels(panelsForTower(ti), ti, overrides);
    let tc = 0;
    for (const level of ['top', 'middle', 'bottom']) {
      for (let pi = 0; pi < 4; pi++) {
        total++;
        const raw = level === 'middle' ? panels[pi] : houseLevelSlot(panels[pi]);
        // useRotatingEntry, index 0: the effective slot a panel paints.
        const entries = Array.isArray(raw.entries) ? raw.entries : null;
        const eff = entries && entries.length > 0
          ? {
              ...raw,
              name: entries[0].company,
              trackingUrl: entries[0].link,
              creativeType: entries[0].creativeType,
              creativeUrl: entries[0].creativeUrl,
              creatives: entries[0].creativeType === 'image' ? [{ imageUrl: entries[0].creativeUrl }] : [],
            }
          : raw;
        if (eff.key === STAKE_SLOT.key) { stakeFaces++; continue; }
        canvasFaces++; tc++;
        const key = billboardFaceCacheKey(eff);
        keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
      }
    }
    perTowerCanvas.push(tc);
  }
  t('enumeration covers all 288 faces', total === 288);
  t('enumeration finds 39 stake faces (shared adTex, no canvas)', stakeFaces === 39);
  t('enumeration finds 249 canvas faces', canvasFaces === 249);
  t('towers 0-10 paint 12 canvases each, towers 11-23 paint 9 each',
    perTowerCanvas.every((c, i) => c === (i < 11 ? 12 : 9)));
  t('distinct paints = 6: the cache size', keyCounts.size === 6);
  t('paint counts are exactly 104/78/39/26/1/1',
    JSON.stringify([...keyCounts.values()].sort((a, b) => a - b)) === JSON.stringify([1, 1, 26, 39, 78, 104]));
  // The only split inside one paint is the starfield seed (key
  // length): grouping keys by every field but the last must leave
  // exactly one pair — the house paint, ad-1..ad-9 vs ad-10..ad-44.
  const groups = new Map();
  for (const key of keyCounts.keys()) {
    const parts = JSON.parse(key);
    const stem = JSON.stringify(parts.slice(0, -1));
    groups.set(stem, (groups.get(stem) || 0) + 1);
  }
  t('exactly one paint splits on key length alone (house paint)',
    [...groups.values()].filter((n) => n === 2).length === 1
    && [...groups.values()].every((n) => n === 1 || n === 2));
  // Measured memory, before vs after (bytes, exact integers).
  // GPU total uses (FACE_BYTES * 4 * n) / 3, not n * (FACE_BYTES *
  // 4 / 3): the per-face mipmap total is fractional, so the
  // per-face product is float-inexact — the integer form is exact.
  const gpuTotal = (n) => (FACE_BYTES * 4 * n) / 3;
  const beforeTotal = canvasFaces * FACE_BYTES + gpuTotal(canvasFaces);
  const afterTotal = keyCounts.size * FACE_BYTES + gpuTotal(keyCounts.size);
  t('BEFORE: 249 canvases = 881260800 B CPU + 1175014400 B GPU = 2056275200 B total',
    canvasFaces * FACE_BYTES === 881260800
    && gpuTotal(canvasFaces) === 1175014400
    && beforeTotal === 2056275200);
  t('AFTER: 6 textures = 21235200 B CPU + 28313600 B GPU = 49548800 B total',
    keyCounts.size * FACE_BYTES === 21235200
    && gpuTotal(keyCounts.size) === 28313600
    && afterTotal === 49548800);
  t('cache saves 2006726400 B worst case (2056.3 MB -> 49.55 MB)',
    beforeTotal - afterTotal === 2006726400);
}

// --- 2. key design: shares iff the paint is identical ---
{
  const base = { key: 'ad-1', kind: 'override', name: 'Olympus', tagline: '', accent: '#ffd700', trackingUrl: 'https://olympusverse.com/request-billboard' };
  const k = (s) => billboardFaceCacheKey(s);
  t('key is null for a missing slot', billboardFaceCacheKey(null) === null);
  t('same paint, different board number (ad-1 vs ad-2) shares', k(base) === k({ ...base, key: 'ad-2' }));
  t('name case does not split (Olympus vs OLYMPUS)', k(base) === k({ ...base, name: 'OLYMPUS' }));
  t('tracking-URL value does not split (CTA only cares it exists)',
    k(base) === k({ ...base, trackingUrl: 'https://example.com/other' }));
  t('kind splits', k(base) !== k({ ...base, kind: 'partner' }));
  t('tagline splits', k(base) !== k({ ...base, tagline: '15% of online sale' }));
  t('accent splits', k(base) !== k({ ...base, accent: '#c2255c' }));
  t('tracking-URL presence splits', k(base) !== k({ ...base, trackingUrl: null }));
  t('key length splits (starfield seed: ad-1 vs ad-10)', k(base) !== k({ ...base, key: 'ad-10' }));
  t('image URL splits, and image vs paint do not share',
    k({ ...base, creatives: [{ imageUrl: '/billboards/muse-referral.webp' }] })
    !== k({ ...base, creatives: [{ imageUrl: '/billboards/other.webp' }] })
    && k({ ...base, creatives: [{ imageUrl: '/billboards/muse-referral.webp' }] }) !== k(base));
  t('same image URL shares',
    k({ ...base, creatives: [{ imageUrl: '/billboards/muse-referral.webp' }] })
    === k({ ...base, key: 'ad-99', creatives: [{ imageUrl: '/billboards/muse-referral.webp' }] }));
}

// --- 3. sharing: one factory call per distinct paint, same instance ---
function fakeTexture() {
  const tex = { disposed: false, disposeCount: 0, dispose() { this.disposed = true; this.disposeCount++; } };
  return tex;
}
{
  const cache = createFaceTextureCache();
  let factoryCalls = 0;
  const make = () => { factoryCalls++; return fakeTexture(); };
  const keyA = JSON.stringify(['paint', 'override', 'OLYMPUS', '', '#ffd700', 1, 4]);
  const keyB = JSON.stringify(['paint', 'override', 'MAD HATTER INDUSTRIES', '', '#ffd700', 1, 4]);
  const a1 = cache.acquire(keyA, make);
  const a2 = cache.acquire(keyA, make);
  t('two faces with the same paint share one texture instance', a1 !== null && a1 === a2);
  t('factory called once for two acquires of the same paint', factoryCalls === 1);
  t('refcount is 2 after two acquires', cache.refs(keyA) === 2);
  const b = cache.acquire(keyB, make);
  t('faces with different paints do not share', b !== null && b !== a1);
  t('factory called once per distinct paint', factoryCalls === 2);
  t('cache holds 2 textures', cache.size() === 2);
}

// --- 4. lifecycle: no dispose while another panel uses it ---
{
  const cache = createFaceTextureCache();
  const key = JSON.stringify(['paint', 'override', 'OLYMPUS', '', '#ffd700', 1, 4]);
  const tex = cache.acquire(key, fakeTexture);
  cache.acquire(key, fakeTexture);
  t('first release does not dispose while a panel still uses it',
    cache.release(key) === false && tex.disposed === false && cache.size() === 1);
  t('re-acquire after a release returns the same live texture',
    cache.acquire(key, fakeTexture) === tex && tex.disposed === false);
  cache.release(key);
  t('second release still does not dispose (one holder left)',
    tex.disposed === false);
  t('last release disposes exactly once',
    cache.release(key) === true && tex.disposed === true && tex.disposeCount === 1 && cache.size() === 0);
  t('releasing an unknown key is a no-op false', cache.release(key) === false);
  t('releasing a never-held key is a no-op false', cache.release('nope') === false);
}

// --- 5. iOS canvas exhaustion: a null texture is not cached ---
{
  const cache = createFaceTextureCache();
  let calls = 0;
  const key = JSON.stringify(['paint', 'override', 'OLYMPUS', '', '#ffd700', 1, 4]);
  t('null factory result returns null', cache.acquire(key, () => { calls++; return null; }) === null);
  t('null result is not cached: next acquire retries the factory',
    cache.acquire(key, () => { calls++; return null; }) === null && calls === 2 && cache.size() === 0);
  t('a later success after exhaustion caches normally',
    cache.acquire(key, fakeTexture) !== null && cache.size() === 1);
  t('bad key / bad factory return null without throwing',
    cache.acquire(null, fakeTexture) === null && cache.acquire(key, null) === null);
}

// --- 6. the blank flag is false: the boards are back ---
t('BILLBOARDS_BLANK is false', BILLBOARDS_BLANK === false);

// --- 7. round-1 deferral latch still gates video src assignment ---
t('releasePanelVideoLoad still exported', /export function releasePanelVideoLoad\(\)/.test(godTower));
t('hold latch still starts held', /let panelVideoLoadHeld = true;/.test(godTower));
t('still exactly one video.src assignment in GodTower',
  (godTower.match(/\.video\.src = /g) || []).length === 1);
t('queue runner still waits on the release before its first load',
  /await awaitPanelVideoLoadRelease\(\);/.test(godTower));
t('HomeScene still releases only on textures + first frame + rotation ended',
  /if \(textures && hubFirstFrame && appState !== 'hub_intro'\) \{\s*releasePanelVideoLoad\(\);/.test(homeScene));

// --- 8. GodTower wires the cache (no per-panel dispose anymore) ---
t('GodTower imports the face cache helpers',
  /import \{\s*billboardFaceCacheKey,\s*createFaceTextureCache,\s*\} from '@\/lib\/billboard-face-cache'/.test(godTower));
t('module-level faceTextureCache exists beside the border cache',
  /const faceTextureCache = createFaceTextureCache\(\);/.test(godTower));
{
  const eff = godTower.slice(godTower.indexOf('function usePanelFaceTexture'));
  const hookEnd = eff.indexOf('\n}\n');
  const hook = eff.slice(0, hookEnd);
  t('face effect acquires through the cache', hook.includes('faceTextureCache.acquire(cacheKey,'));
  t('face effect releases through the cache on cleanup', hook.includes('faceTextureCache.release(heldKey)'));
  t('face effect keys on the paint, not the board', hook.includes('billboardFaceCacheKey(slot)'));
  t('no per-panel owned.dispose() left in the face effect', !/owned\.dispose\(\)/.test(hook) && !/let owned/.test(hook));
  t('image fallback still paints the placeholder when the 2D context is null',
    /if \(!ctx\) \{\s*\/\/ iOS canvas exhaustion/.test(hook));
  t('stake still short-circuits to the shared stake texture',
    hook.includes("if (slot.key === STAKE_SLOT.key)"));
}

console.log(`billboard-face-cache: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
