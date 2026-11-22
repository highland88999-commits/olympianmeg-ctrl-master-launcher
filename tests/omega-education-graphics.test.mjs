// tests/omega-education-graphics.test.mjs — Level art + background.
// Run: node --test tests/omega-education-graphics.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { LEVELS, levelImageSrc, BACKGROUND_IMAGE_SRC } from '../lib/education/levels.js';

const DIR = new URL('../public/images/education/', import.meta.url);

// Minimal WebP dimension reader (VP8X / VP8 / VP8L chunks).
function webpSize(buf) {
  assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF', 'not RIFF');
  assert.equal(buf.subarray(8, 12).toString('ascii'), 'WEBP', 'not WEBP');
  const chunk = buf.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X') {
    const w = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
    const h = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
    return { width: w, height: h };
  }
  if (chunk === 'VP8 ') {
    // Lossy VP8 stores the width/height directly (not minus one).
    const w = buf[26] | (buf[27] << 8);
    const h = buf[28] | (buf[29] << 8);
    return { width: w, height: h };
  }
  if (chunk === 'VP8L') {
    const w = ((buf[21] | (buf[22] << 8)) & 0x3fff) + 1;
    const h = (((buf[22] >> 6) | (buf[23] << 2) | ((buf[24] & 0x0f) << 10)) & 0x3fff) + 1;
    return { width: w, height: h };
  }
  throw new Error(`unknown WebP chunk ${chunk}`);
}

test('every level has its 900x600 WebP, and no orphan art', () => {
  for (const lvl of LEVELS) {
    const path = new URL(`../public/images/education/${lvl.id}.webp`, import.meta.url);
    assert.ok(existsSync(path), `missing art for level ${lvl.id}`);
    const size = webpSize(readFileSync(path));
    assert.deepEqual(size, { width: 900, height: 600 }, `${lvl.id} must be 900x600, got ${size.width}x${size.height}`);
    assert.ok(readFileSync(path).length > 10000, `${lvl.id} art suspiciously small`);
  }
  const files = readdirSync(DIR).filter((f) => f.endsWith('.webp')).sort();
  const expected = [...LEVELS.map((l) => `${l.id}.webp`), 'background.webp'].sort();
  assert.deepEqual(files, expected, 'no orphan art beyond the six levels + background');
});

test('background is a valid 1920x1080 WebP', () => {
  const path = new URL(`../public${BACKGROUND_IMAGE_SRC}`, import.meta.url);
  assert.ok(existsSync(path), 'missing background art');
  const size = webpSize(readFileSync(path));
  assert.deepEqual(size, { width: 1920, height: 1080 });
});

test('page maps exactly the six real levels; unmapped levels render no image', () => {
  const page = readFileSync(new URL('../app/education/page.jsx', import.meta.url), 'utf8');
  // The page only ever renders an <img> when levelImageSrc returns one.
  assert.ok(page.includes('levelImageSrc(lvl.id) ?'), 'level grid guards its image on levelImageSrc');
  assert.ok(page.includes('levelImageSrc(entry.level)'), 'result rows guard their thumb on levelImageSrc');
  assert.ok(page.includes('thumbSrc ?'), 'thumb renders only when mapped');
  for (const lvl of LEVELS) {
    assert.equal(levelImageSrc(lvl.id), `/images/education/${lvl.id}.webp`);
  }
  assert.equal(levelImageSrc('preschool-extra'), null);
});

test('background is fixed behind content, dimmed, with the dark page as fallback', () => {
  const page = readFileSync(new URL('../app/education/page.jsx', import.meta.url), 'utf8');
  assert.ok(page.includes("data-testid=\"education-background\""), 'background testid');
  assert.ok(page.includes("position: 'fixed'"), 'background is fixed');
  assert.ok(page.includes('opacity: 0.35'), 'background dimmed to 0.35');
  assert.ok(page.includes("zIndex: 1"), 'content wrap sits above the background');
  assert.ok(page.includes("background: INDIGO_BG"), 'dark page background stays as fallback');
  assert.ok(page.includes('alt=""'), 'art is decorative (empty alt)');
});
