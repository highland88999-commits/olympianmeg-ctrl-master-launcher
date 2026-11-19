// Hub planet wraps (Merlin, Nov 18, 2026 — "Invent planet wraps for
// them"): every god planet wears its own invented procedural surface,
// unique per god, in its god colour. No banner art, no generic
// library texture — the 14 banner-less nether planets used to fall
// back to flat colour and read as flat discs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GOD_MENUS } from '../lib/god-menus.js';
import { GOD_BANDS, GOD_HEX } from '../lib/god-orbits.js';
import {
  generateWrapPixels,
  godPlanetWrap,
  godPlanetPalette,
  hexToRgb,
  wrapFamilyForIndex,
  HUB_WRAP_FAMILIES,
  HUB_WRAP_SIZE,
} from '../lib/hub-planet-wraps.js';

const orbitRingsSrc = readFileSync('components/GodOrbitRings.jsx', 'utf8');
const godOrbitsSrc = readFileSync('lib/god-orbits.js', 'utf8');

function hashBytes(buf) {
  let h = 0;
  for (let i = 0; i < buf.length; i += 97) h = (h * 31 + buf[i]) >>> 0;
  return h;
}

function hueOf(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  if (max === min) return 0;
  const d = max - min;
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return h;
}

function hueDiff(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

function meanRgb(px) {
  let r = 0;
  let g = 0;
  let b = 0;
  const n = px.width * px.height;
  for (let i = 0; i < px.color.length; i += 4) {
    r += px.color[i];
    g += px.color[i + 1];
    b += px.color[i + 2];
  }
  return [r / n, g / n, b / n];
}

test('24 planets, 24 distinct wraps — one invented surface per god', () => {
  assert.equal(GOD_MENUS.length, 24);
  assert.equal(GOD_BANDS.length, 24);
  const hashes = new Set();
  for (let i = 0; i < 24; i++) {
    const px = generateWrapPixels(GOD_MENUS[i].god, GOD_BANDS[i].color, i);
    const h = hashBytes(px.color);
    assert.ok(!hashes.has(h), `${GOD_MENUS[i].god} duplicates another wrap`);
    hashes.add(h);
  }
  assert.equal(hashes.size, 24);
});

test('deterministic: same god paints the same wrap every time (and the cache shares it)', () => {
  const a = generateWrapPixels('KUR', '#fb923c', 21);
  const b = generateWrapPixels('KUR', '#fb923c', 21);
  assert.deepEqual(a.color, b.color);
  assert.deepEqual(a.bump, b.bump);
  const w1 = godPlanetWrap('KUR', '#fb923c', 21);
  const w2 = godPlanetWrap('KUR', '#fb923c', 21);
  assert.equal(w1, w2);
  assert.equal(w1.map.image.width, HUB_WRAP_SIZE.w);
  assert.equal(w1.map.image.height, HUB_WRAP_SIZE.h);
});

test('every wrap reads in its god colour', () => {
  for (let i = 0; i < 24; i++) {
    const px = generateWrapPixels(GOD_MENUS[i].god, GOD_BANDS[i].color, i);
    const [r, g, b] = meanRgb(px);
    const [br, bg, bb] = hexToRgb(GOD_BANDS[i].color);
    const dh = hueDiff(hueOf(r, g, b), hueOf(br, bg, bb));
    assert.ok(dh < 0.09, `${GOD_MENUS[i].god} hue drift ${dh.toFixed(3)} (mean ${[r | 0, g | 0, b | 0]} vs band ${GOD_BANDS[i].color})`);
  }
});

test('no visible sphere seam: the U edge blends like any other column pair', () => {
  for (let i = 0; i < 24; i++) {
    const px = generateWrapPixels(GOD_MENUS[i].god, GOD_BANDS[i].color, i);
    const { width: W, height: H } = px;
    let seam = 0;
    let glob = 0;
    for (let y = 0; y < H; y++) {
      for (let c = 0; c < 3; c++) seam += Math.abs(px.color[(y * W) * 4 + c] - px.color[(y * W + W - 1) * 4 + c]);
    }
    seam /= H * 3;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W - 1; x++) {
        for (let c = 0; c < 3; c++) glob += Math.abs(px.color[(y * W + x) * 4 + c] - px.color[(y * W + x + 1) * 4 + c]);
      }
    }
    glob /= H * (W - 1) * 3;
    const ratio = seam / Math.max(0.01, glob);
    assert.ok(ratio < 2.5, `${GOD_MENUS[i].god} seam ratio ${ratio.toFixed(2)} (seam ${seam.toFixed(1)} vs typical ${glob.toFixed(1)})`);
  }
});

test('12 pattern families cycle by index: neighbours never share a look, each family used twice', () => {
  assert.equal(HUB_WRAP_FAMILIES.length, 12);
  const counts = {};
  for (let i = 0; i < 24; i++) {
    const f = wrapFamilyForIndex(i);
    counts[f] = (counts[f] || 0) + 1;
    assert.notEqual(f, wrapFamilyForIndex(i + 1), `gods ${i} and ${i + 1} share family ${f}`);
  }
  for (const f of HUB_WRAP_FAMILIES) assert.equal(counts[f], 2, `family ${f} used ${counts[f] || 0}x`);
});

test('bump maps carry real relief — no flat surface', () => {
  for (let i = 0; i < 24; i++) {
    const px = generateWrapPixels(GOD_MENUS[i].god, GOD_BANDS[i].color, i);
    let mean = 0;
    for (let k = 0; k < px.bump.length; k++) mean += px.bump[k];
    mean /= px.bump.length;
    let variance = 0;
    for (let k = 0; k < px.bump.length; k++) variance += (px.bump[k] - mean) ** 2;
    const std = Math.sqrt(variance / px.bump.length);
    assert.ok(std > 10, `${GOD_MENUS[i].god} bump stddev ${std.toFixed(1)} — surface reads flat`);
  }
});

test('rings match their planet: band colour is the god colour, the wrap is built from it', () => {
  for (let i = 0; i < 24; i++) {
    assert.equal(GOD_BANDS[i].color, GOD_HEX[GOD_MENUS[i].accent], `${GOD_MENUS[i].god} band colour`);
    assert.deepEqual(godPlanetPalette(GOD_BANDS[i].color).base, hexToRgb(GOD_BANDS[i].color));
  }
  // Both rings wear band.color in the component source.
  assert.match(orbitRingsSrc, /torusGeometry args=\{\[R, 0\.28, 8, 160\]\}[\s\S]*?meshBasicMaterial color=\{band\.color\}/);
  assert.match(orbitRingsSrc, /torusGeometry args=\{\[SAT_RADIUS \+ 2\.48, 0\.42, 8, 64\]\}[\s\S]*?meshBasicMaterial color=\{band\.color\}/);
});

test('the hull wears the invented wrap — sphere, map + bump, no banner or library texture', () => {
  assert.match(orbitRingsSrc, /godPlanetWrap\(band\.god, band\.color, index\)/);
  assert.match(orbitRingsSrc, /<sphereGeometry args=\{\[SAT_RADIUS, 32, 24\]\} \/>/);
  assert.match(orbitRingsSrc, /map: wrap\.map,/);
  assert.match(orbitRingsSrc, /bumpMap: wrap\.bumpMap,/);
  assert.ok(!orbitRingsSrc.includes('useBannerTexture'), 'banner loader still present');
  assert.ok(!orbitRingsSrc.includes('/textures/menus'), 'banner path still referenced');
  assert.ok(!orbitRingsSrc.includes('/textures/scratched'), 'scratched library referenced');
  assert.ok(!orbitRingsSrc.includes('band.texture'), 'band.texture still read');
});

test('GOD_BANDS carries no texture field any more', () => {
  for (const band of GOD_BANDS) assert.ok(!('texture' in band), `${band.god} still carries texture`);
  assert.ok(!godOrbitsSrc.includes('texture: menu.texture'), 'god-orbits still maps menu.texture onto bands');
});
