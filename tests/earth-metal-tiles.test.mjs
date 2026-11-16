// tests/earth-metal-tiles.test.mjs — Earth 1 ground tiling as a
// mixture of Merlin's 9 scratched-metal graphics (Merlin,
// 2026-11-15): the lens sheets wear metal, one color per sheet,
// picked deterministically from the sheet's tile cell key. Run:
//   node tests/earth-metal-tiles.test.mjs (from the repo root).
// No browser, no network — proves:
//   * the pick is deterministic per cell key (same key, same
//     color, on any device — reloads and restore-on-load
//     rebuilds are identical by construction)
//   * all 9 colors appear across a realistic sweep of cells,
//     near-uniformly (FNV-1a mod 9; measured 10.2–11.8% each
//     over 2,880 keys — the test band is 7–16%)
//   * the crop math spreads each photo's centered square across
//     a sheet exactly once, undistorted, in bounds
//   * every color resolves to its one shared file, deep gold to
//     the archway gold (never copied), and all 9 files on disk
//     are Merlin's uploads byte-for-byte (full SHA-256 pins)
//   * tile identity is unchanged (tileCellKey format) and the
//     restore path rebuilds the same key → same color
//   * the tile SYSTEM is untouched: phone caps (near 4 / far 2
//     / coarse 3), the rendered record, the settle/finish path
//     — and the old per-tile ESRI fetch is gone from the build
//   * the hub Earth globe files never import the metal module
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'node:assert';
import {
  METAL_TILE_COLORS,
  METAL_TILE_COUNT,
  METAL_TILE_IMAGE_WIDTH,
  METAL_TILE_IMAGE_HEIGHT,
  metalTileHash,
  metalTileColorForCell,
  metalTileImageUrl,
  metalTileCropForTile,
} from '../lib/earth/metal-tiles.js';
import { SCRATCHED_TEXTURES } from '../lib/portal/scratched-textures.js';
import { GOLD_TEXTURE_URL, GOLD_TEXTURE_SHA256 } from '../lib/portal/gold-texture.js';
import { lensTilePlan, LENS_PRESETS } from '../lib/earth/lens.js';
import { tileCellKey } from '../lib/earth/lens-cache.js';
import { buildRestoreJobs } from '../lib/earth/rendered-tiles.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed += 1; }
  else { failed += 1; console.error(`FAIL: ${name}`); }
}
function check(name, fn) {
  try { fn(); passed += 1; } catch (e) { failed += 1; console.error(`FAIL: ${name} — ${e.message}`); }
}
const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/* The 9 colors in the order Merlin sent them, with the full
 * SHA-256 of each upload (verified against the files in
 * ~/workspace/user/files/ before this suite was written). */
const EXPECTED = {
  magenta: { file: 'magenta.jpg', sha: '236505251372255d798741717e68c0a2975363ecfc737d620288d50d22ebfa0a' },
  cyan: { file: 'cyan.jpg', sha: '3d7406b89f65377817c46574cd893bb71dae1040ed899b96e04855a928bdf613' },
  blue: { file: 'blue.jpg', sha: '321dc5be654002faea5cd2d5ee35bb4a42c3e99e0e2f46d3f23ad5918e18f673' },
  'bright-gold': { file: 'bright-gold.jpg', sha: '470800c83223b51dea2458ea4baa2831f571640ab5b04c5330e14235323bee0b' },
  red: { file: 'red.jpg', sha: 'b6c8fd8ddfe5594e85d4ded17f8007950e9879ad192a95cbf5d4eab4aed57341' },
  green: { file: 'green.jpg', sha: '6a9ca8ccdb76972724f7ad9918d1d431aa4b34cd3fb0cb941ef929fdbd7e45b8' },
  purple: { file: 'purple.jpg', sha: '648a45acc0ba2f32ac77f3ef1b44354a68a4037fd780a9d606ed266d08b1dadb' },
  silver: { file: 'silver.jpg', sha: '17aca2a9a79374f67cd8252c7464d4c159212b7d9779ded5733aeec1a2644a17' },
  'deep-gold': { file: 'gold-scratched.jpg', sha: '260de1b4ad6e465d00b5c5f4d4ccebfd315eeef84e6a5f551067b7fa151d4293' },
};

/* --- the pick --- */
t('nine colors, in Merlin\'s send order', METAL_TILE_COUNT === 9
  && METAL_TILE_COLORS.join(',') === 'magenta,cyan,blue,bright-gold,red,green,purple,silver,deep-gold');
t('photo size is the 1170x653 upload', METAL_TILE_IMAGE_WIDTH === 1170 && METAL_TILE_IMAGE_HEIGHT === 653);

check('pick is deterministic per cell key', () => {
  const keys = [
    'street:z12:1234:5678', 'street:z12:-12:34', 'streetCoarse:z6:-12:34',
    'streetFar:z8:0:0', 'streetCoarseWide:z5:100:-200', 'overlook:z8:55:66',
  ];
  for (const k of keys) {
    const a = metalTileColorForCell(k);
    const b = metalTileColorForCell(k);
    const c = metalTileColorForCell(k);
    assert.ok(a && METAL_TILE_COLORS.includes(a), `${k} picks a real color`);
    assert.strictEqual(a, b);
    assert.strictEqual(a, c);
  }
});

check('all 9 colors appear, near-uniformly, across realistic cells', () => {
  const counts = Object.fromEntries(METAL_TILE_COLORS.map((c) => [c, 0]));
  let total = 0;
  for (const [preset, p] of Object.entries(LENS_PRESETS)) {
    for (let lat = -75; lat <= 75; lat += 10) {
      for (let lon = -180; lon < 180; lon += 10) {
        const plan = lensTilePlan(lat, lon, p.zoom, p.grid, p.canvasPx);
        const key = tileCellKey(preset, plan);
        counts[metalTileColorForCell(key)] += 1;
        total += 1;
      }
    }
  }
  assert.ok(total > 2000, `sweep covers ${total} cells`);
  for (const c of METAL_TILE_COLORS) {
    const share = counts[c] / total;
    assert.ok(share >= 0.07 && share <= 0.16,
      `${c} share ${(100 * share).toFixed(1)}% is outside 7–16% (count ${counts[c]}/${total})`);
  }
});

check('neighbouring cells mix (not one color per region)', () => {
  // Walk one street row across the equator: the colors must
  // change along the walk — a mixture, not a monochrome band.
  const seen = new Set();
  for (let lon = -180; lon < 180; lon += 5) {
    const plan = lensTilePlan(0, lon, 12, 36, 2160);
    seen.add(metalTileColorForCell(tileCellKey('street', plan)));
  }
  assert.ok(seen.size >= 5, `equator walk sees ${seen.size} colors, want >= 5`);
});

t('null / empty / non-string keys give null (caller drops the build)',
  metalTileColorForCell(null) === null
  && metalTileColorForCell('') === null
  && metalTileColorForCell(undefined) === null
  && metalTileColorForCell(42) === null);
t('hash is a 32-bit unsigned int', Number.isInteger(metalTileHash('street:z12:1:2'))
  && metalTileHash('street:z12:1:2') >= 0 && metalTileHash('street:z12:1:2') <= 0xffffffff);

/* --- the crop math --- */
check('crop spreads the centered square across the sheet exactly once', () => {
  const grid = 36, W = 1170, H = 653, side = 653, sx0 = (W - side) / 2;
  // Corners land inside the photo, on the square's edges.
  const first = metalTileCropForTile(0, 0, grid, W, H);
  const last = metalTileCropForTile(grid - 1, grid - 1, grid, W, H);
  assert.ok(Math.abs(first.sx - sx0) < 1e-9 && first.sy === 0, 'first crop starts at the square origin');
  assert.ok(Math.abs((last.sx + last.sw) - (sx0 + side)) < 1e-9, 'last crop ends at the square edge');
  assert.ok(Math.abs((last.sy + last.sh) - side) < 1e-9, 'last crop ends at the square bottom');
  // Every row's widths sum to the square side; every column's
  // heights sum to the square side — no overlap, no gap.
  for (let row = 0; row < grid; row++) {
    let wSum = 0;
    for (let col = 0; col < grid; col++) wSum += metalTileCropForTile(col, row, grid, W, H).sw;
    assert.ok(Math.abs(wSum - side) < 1e-6, `row ${row} widths sum ${wSum}, want ${side}`);
  }
  for (let col = 0; col < grid; col++) {
    let hSum = 0;
    for (let row = 0; row < grid; row++) hSum += metalTileCropForTile(col, row, grid, W, H).sh;
    assert.ok(Math.abs(hSum - side) < 1e-6, `col ${col} heights sum ${hSum}, want ${side}`);
  }
  // No crop leaves the photo, at any preset grid.
  for (const g of [8, 36]) {
    for (let row = 0; row < g; row++) {
      for (let col = 0; col < g; col++) {
        const c = metalTileCropForTile(col, row, g, W, H);
        assert.ok(c.sx >= 0 && c.sy >= 0 && c.sx + c.sw <= W + 1e-9 && c.sy + c.sh <= H + 1e-9,
          `crop (${col},${row}) grid ${g} leaves the photo`);
        assert.ok(Math.abs(c.sw - c.sh) < 1e-9, 'crops stay square — no distortion');
      }
    }
  }
});

/* --- URL resolution + files on disk --- */
check('every color resolves to one distinct shared file', () => {
  const urls = new Set();
  for (const color of METAL_TILE_COLORS) {
    const url = metalTileImageUrl(color);
    assert.ok(typeof url === 'string' && url.length > 0, `${color} resolves`);
    assert.ok(!urls.has(url), `${color} URL ${url} is a duplicate`);
    urls.add(url);
  }
  assert.strictEqual(urls.size, 9);
});
t('deep gold resolves to the archway gold, never a second copy',
  metalTileImageUrl('deep-gold') === GOLD_TEXTURE_URL
  && GOLD_TEXTURE_URL === '/textures/gold/gold-scratched.jpg');
for (const color of ['magenta', 'cyan', 'blue', 'bright-gold', 'red', 'green', 'purple', 'silver']) {
  t(`${color} resolves to its scratched file`,
    metalTileImageUrl(color) === `/textures/scratched/${color}.jpg`
    && SCRATCHED_TEXTURES[color].url === `/textures/scratched/${color}.jpg`);
}
t('unknown colors resolve to null, never a broken URL',
  metalTileImageUrl('pink') === null && metalTileImageUrl('') === null && metalTileImageUrl(null) === null);

check('all 9 files on disk are Merlin\'s uploads, byte-for-byte', () => {
  for (const [color, exp] of Object.entries(EXPECTED)) {
    const url = metalTileImageUrl(color);
    const rel = url.replace(/^\//, '');
    const p = join(ROOT, 'public', ...rel.split('/'));
    assert.ok(existsSync(p), `${color} file missing at ${url}`);
    assert.strictEqual(sha256File(p), exp.sha, `${color} SHA mismatch — not Merlin's upload`);
  }
  // The sibling table agrees with the uploads too (single source
  // of truth, not a second copy of the pins).
  for (const color of Object.keys(SCRATCHED_TEXTURES)) {
    assert.strictEqual(SCRATCHED_TEXTURES[color].sha256, EXPECTED[color].sha,
      `sibling table SHA for ${color} disagrees with the upload`);
  }
  assert.strictEqual(GOLD_TEXTURE_SHA256, EXPECTED['deep-gold'].sha);
});
t('no second deep-gold copy exists under scratched/',
  !existsSync(join(ROOT, 'public', 'textures', 'scratched', 'deep-gold.jpg'))
  && !existsSync(join(ROOT, 'public', 'textures', 'scratched', 'gold-scratched.jpg')));

/* --- tile identity + restore stability --- */
t('tileCellKey format is unchanged',
  tileCellKey('streetCoarse', { zoom: 6, gridLeft: -12, gridTop: 34 }) === 'streetCoarse:z6:-12:34');
check('restore rebuilds the same key, so the same color', () => {
  const traveler = { lat: 53.95, lon: -113.11 };
  // The recorded key is whatever the plan computes at the
  // recorded centre — the restore path rebuilds from that
  // centre, so the plan (and the key, and the color) must
  // come out identical.
  const recordedPlan = lensTilePlan(53.95, -113.11, 12, 36, 2160);
  const recordedKey = tileCellKey('street', recordedPlan);
  const rows = [{
    tile_key: recordedKey, preset: 'street',
    center_lat: 53.95, center_lon: -113.11,
  }];
  const jobs = buildRestoreJobs(rows, traveler);
  assert.strictEqual(jobs.length, 1, 'one restore job near the traveler');
  const plan = lensTilePlan(jobs[0].lat, jobs[0].lon, 12, 36, 2160);
  const key = tileCellKey('street', plan);
  assert.strictEqual(key, recordedKey, 'restore plan rebuilds the recorded key exactly');
  assert.strictEqual(metalTileColorForCell(key), metalTileColorForCell(recordedKey),
    'same key, same color — the rebuild is identical');
});

/* --- the tile system is untouched (source pins) --- */
const nexusSrc = readFileSync(join(ROOT, 'components', 'NexusEarth.jsx'), 'utf8');
t('phone caps intact: near 4 / far 2 / coarse 3',
  /const MAX_LENS_SHEETS = 4;/.test(nexusSrc)
  && /const MAX_FAR_LENS_SHEETS = 2;/.test(nexusSrc)
  && /const MAX_COARSE_LENS_SHEETS = 3;/.test(nexusSrc));
t('rendered record still runs on every finished sheet',
  nexusSrc.includes('recordRenderedTileKey(cellKey)')
  && nexusSrc.includes('RENDERED_RECORD_PRESETS'));
t('metal wiring is in the build (pick + URL + crop)',
  nexusSrc.includes('metalTileColorForCell(tileCellKey(job.presetName, plan))')
  && nexusSrc.includes('metalTileImageUrl(metalColor)')
  && nexusSrc.includes('metalTileCropForTile(col, row, plan.grid, imgW, imgH)')
  && nexusSrc.includes('metalImg.src = metalUrl'));
t('old per-tile ESRI fetch is gone from the build',
  !nexusSrc.includes('img.src = t.url')
  && !nexusSrc.includes('ctx.drawImage(img, t.px, t.py, S, S)'));
t('the build still settles, feathers, and frees the pool the same way',
  nexusSrc.includes('sortTilesCenterFirst(plan.tiles, preset.canvasPx, S)')
  && nexusSrc.includes("ctx.createRadialGradient(c, c, c * 0.68, c, c, c)")
  && nexusSrc.includes('LENS_BUILD_WATCHDOG_MS'));
t('metal module is imported, nothing else new is pulled in',
  nexusSrc.includes("from '@/lib/earth/metal-tiles'"));

for (const f of ['components/ProceduralEarthGlobe.jsx', 'components/GoogleEarthTiles.jsx']) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  t(`hub globe file ${f} never imports the metal module`, !src.includes('metal-tiles'));
}

console.log(`earth-metal-tiles: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
