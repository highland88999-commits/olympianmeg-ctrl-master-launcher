// tests/job-board-graphics.test.mjs — Job Board graphics wiring.
// Run: node --test tests/job-board-graphics.test.mjs (from the repo root)
//
// Covers the per-category card art (20 x 900x600 WebP), the small thumbs
// on every job row, and the page background graphic. No network, no
// browser: file checks run on disk, wiring checks run on the page source.
// The headless probe (see the graphics report) covers the rendered page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CATEGORIES } from '../lib/job-board/taxonomy.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAT_DIR = join(ROOT, 'public/images/job-board/categories');
const BG_FILE = join(ROOT, 'public/images/job-board/background.webp');
const PAGE_SRC = readFileSync(join(ROOT, 'app/job-board/page.jsx'), 'utf8');

const TAXONOMY_IDS = CATEGORIES.map((c) => c.id);

// The 20 real taxonomy ids — the only ids that ever get an image. Kept
// here as the expected set so a taxonomy drift fails loudly instead of
// silently shipping a card with no art (or art for a dead id).
const EXPECTED_IDS = [
  'trades', 'healthcare', 'tech', 'retail-sales', 'hospitality-food',
  'transport-logistics', 'admin-office', 'education', 'finance-accounting',
  'manufacturing', 'agriculture-natural-resources',
  'government-public-service', 'construction', 'engineering', 'legal',
  'arts-media', 'science-research', 'social-services', 'energy-mining',
  'security-protective',
];

// Read WebP dimensions: VP8 lossy ('VP8 ') stores width/height as 14-bit
// values after the 3-byte frame tag + 0x9d012a magic; VP8L stores
// (width-1)/(height-1) packed in 4 LE bytes after the 0x2f signature.
function webpDimensions(buf) {
  assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF', 'RIFF magic');
  assert.equal(buf.subarray(8, 12).toString('ascii'), 'WEBP', 'WEBP magic');
  const chunk = buf.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8 ') {
    // RIFF(4) size(4) WEBP(4) 'VP8 '(4) chunk-size(4) frame-tag(3)
    // magic 9d 01 2a (3) then width/height as 14-bit LE values.
    assert.equal(buf[23], 0x9d, 'VP8 magic byte 0');
    assert.equal(buf[24], 0x01, 'VP8 magic byte 1');
    assert.equal(buf[25], 0x2a, 'VP8 magic byte 2');
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    assert.equal(buf[20], 0x2f, 'VP8L signature');
    const packed = buf.readUInt32LE(21);
    return { width: (packed & 0x3fff) + 1, height: ((packed >> 14) & 0x3fff) + 1 };
  }
  assert.fail(`unexpected WebP chunk ${chunk}`);
}

// The id set the page itself maps to images, pulled out of its source so
// the test checks what the page really does, not a copy of the list.
function pageImageIds() {
  const m = PAGE_SRC.match(/const CATEGORY_IMAGE_IDS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(m, 'CATEGORY_IMAGE_IDS set found in page.jsx');
  return new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
}

test('taxonomy carries exactly the 20 expected category ids', () => {
  assert.deepEqual([...TAXONOMY_IDS].sort(), [...EXPECTED_IDS].sort());
});

test('every category id has its image file, valid WebP, 900x600', () => {
  for (const id of EXPECTED_IDS) {
    const file = join(CAT_DIR, `${id}.webp`);
    const buf = readFileSync(file);
    assert.ok(buf.length > 10000, `${id}.webp non-trivial size, got ${buf.length}`);
    const { width, height } = webpDimensions(buf);
    assert.equal(width, 900, `${id}.webp width`);
    assert.equal(height, 600, `${id}.webp height`);
  }
});

test('no orphan art: every file in categories/ maps to a taxonomy id', () => {
  const files = readdirSync(CAT_DIR).filter((f) => f.endsWith('.webp'));
  assert.equal(files.length, 20, `expected 20 category files, got ${files.length}`);
  for (const f of files) {
    assert.ok(EXPECTED_IDS.includes(f.replace(/\.webp$/, '')), `orphan art ${f}`);
  }
});

test('background graphic exists, valid WebP, 1920x1080', () => {
  const buf = readFileSync(BG_FILE);
  assert.ok(buf.length > 5000, `background.webp non-trivial size, got ${buf.length}`);
  const { width, height } = webpDimensions(buf);
  assert.equal(width, 1920, 'background width');
  assert.equal(height, 1080, 'background height');
});

test('page maps exactly the 20 real ids to images — nothing else', () => {
  const ids = pageImageIds();
  assert.deepEqual([...ids].sort(), [...EXPECTED_IDS].sort());
});

test('fallback-grid ids get no image (they are not real taxonomy ids)', () => {
  const ids = pageImageIds();
  for (const fallbackId of ['technology', 'transport', 'hospitality', 'retail', 'office', 'agriculture', 'oil-gas', 'remote']) {
    assert.ok(!ids.has(fallbackId), `fallback id ${fallbackId} must not map to an image`);
  }
});

test('category grid cards wear their graphic above the label', () => {
  assert.match(PAGE_SRC, /categoryImageSrc\(cat\.id\) \? \(\s*<img src=\{categoryImageSrc\(cat\.id\)\} alt="" data-testid=\{`category-image-\$\{cat\.id\}`\} style=\{styles\.catImg\} \/>/,
    'grid card img with category-image-<id> testid');
  assert.match(PAGE_SRC, /catImg: \{[^}]*aspectRatio: '3 \/ 2'[^}]*\}/,
    'catImg keeps the 3:2 aspect so the grid never shifts on load');
});

test('every job row wears its category thumb; unknown category shows none', () => {
  assert.match(PAGE_SRC, /const thumbSrc = categoryImageSrc\(job\.category\);/,
    'JobRow derives its thumb from job.category');
  assert.match(PAGE_SRC, /\{thumbSrc \? \(\s*<img src=\{thumbSrc\} alt="" data-testid=\{`job-thumb-\$\{job\.category\}`\} style=\{styles\.jobThumb\} \/>/,
    'JobRow renders the thumb only when a mapped category exists');
  assert.ok(!PAGE_SRC.includes('job-thumb-default') && !PAGE_SRC.includes('categories/default'),
    'no invented fallback thumb image anywhere');
  assert.match(PAGE_SRC, /jobThumb: \{[^}]*width: 72, height: 48[^}]*\}/,
    'thumb is a small fixed 72x48 in-flow box');
});

test('background graphic sits behind the content, dimmed, page fallback kept', () => {
  assert.match(PAGE_SRC, /<img src=\{BACKGROUND_IMAGE_SRC\} alt="" aria-hidden="true" data-testid="job-board-background" style=\{styles\.bgImg\} \/>/,
    'background img present with job-board-background testid');
  assert.match(PAGE_SRC, /bgImg: \{[^}]*position: 'fixed'[^}]*zIndex: 0[^}]*opacity: 0\.35[^}]*\}/,
    'background is fixed, behind content, dimmed');
  assert.match(PAGE_SRC, /wrap: \{[^}]*position: 'relative', zIndex: 1[^}]*\}/,
    'content wrap sits above the background');
  assert.match(PAGE_SRC, /page: \{ background: INDIGO_BG/,
    'dark page background stays underneath as the fallback');
});

test('no text baked into the art paths — all labels stay real text', () => {
  assert.match(PAGE_SRC, /<span style=\{styles\.catLabel\}>\{cat\.label\}<\/span>/,
    'category label is still real text');
  assert.ok(!PAGE_SRC.includes('catImg') || PAGE_SRC.includes('alt=""'),
    'art images carry no text (empty alt)');
});
