// tests/business-services-graphics.test.mjs — Omega Business Services graphics wiring.
// Run: node --test tests/business-services-graphics.test.mjs (from the repo root)
//
// Covers the per-category card art (7 x 900x600 WebP), the small thumbs
// on every resource row, and the page background graphic. No network, no
// browser: file checks run on disk, wiring checks run on the page source.
// The headless probe (see the four-program integration pass) covers the
// rendered page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CATEGORIES } from '../lib/business-services/resources.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMG_DIR = join(ROOT, 'public/images/business-services');
const BG_FILE = join(IMG_DIR, 'background.webp');
const PAGE_SRC = readFileSync(join(ROOT, 'app/business-services/page.jsx'), 'utf8');

const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

// The 7 real category ids — the only ids that ever get an image. Kept
// here as the expected set so a category drift fails loudly instead of
// silently shipping a card with no art (or art for a dead id).
const EXPECTED_IDS = [
  'grants', 'loans', 'mentorship', 'registration', 'taxes', 'hiring', 'exporting',
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

test('resources.js carries exactly the 7 expected category ids', () => {
  assert.deepEqual([...CATEGORY_IDS].sort(), [...EXPECTED_IDS].sort());
});

test('every category id has its image file, valid WebP, 900x600', () => {
  for (const id of EXPECTED_IDS) {
    const file = join(IMG_DIR, `${id}.webp`);
    const buf = readFileSync(file);
    assert.ok(buf.length > 10000, `${id}.webp non-trivial size, got ${buf.length}`);
    const { width, height } = webpDimensions(buf);
    assert.equal(width, 900, `${id}.webp width`);
    assert.equal(height, 600, `${id}.webp height`);
  }
});

test('no orphan art: every category file in the dir maps to a real id', () => {
  const files = readdirSync(IMG_DIR).filter((f) => f.endsWith('.webp') && f !== 'background.webp');
  assert.equal(files.length, 7, `expected 7 category files, got ${files.length}`);
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

test('page maps exactly the 7 real ids to images — nothing else', () => {
  const ids = pageImageIds();
  assert.deepEqual([...ids].sort(), [...EXPECTED_IDS].sort());
});

test('unmapped ids get no image (null / unknown categories render none)', () => {
  const ids = pageImageIds();
  for (const badId of ['other', 'unknown', 'general', 'misc']) {
    assert.ok(!ids.has(badId), `unmapped id ${badId} must not map to an image`);
  }
  assert.match(
    PAGE_SRC,
    /function categoryImageSrc\(id\) \{\s*if \(!id \|\| typeof id !== 'string'\) return null;/,
    'categoryImageSrc returns null for missing / non-string ids',
  );
});

test('every resource row wears its category thumb; unknown category shows none', () => {
  assert.match(PAGE_SRC, /const thumbSrc = categoryImageSrc\(r\.category\);/,
    'ResourceCard derives its thumb from r.category');
  assert.match(PAGE_SRC, /\{thumbSrc \? \(\s*<img src=\{thumbSrc\} alt="" data-testid=\{`resource-thumb-\$\{r\.category\}`\} style=\{styles\.resourceThumb\} \/>/,
    'ResourceCard renders the thumb only when a mapped category exists');
  assert.ok(!PAGE_SRC.includes('resource-thumb-default') && !PAGE_SRC.includes('business-services/default'),
    'no invented fallback thumb image anywhere');
  assert.match(PAGE_SRC, /resourceThumb: \{[^}]*width: 72, height: 48[^}]*\}/,
    'thumb is a small fixed 72x48 in-flow box');
});

test('background graphic sits behind the content, dimmed, page fallback kept', () => {
  assert.match(PAGE_SRC, /<img src=\{BACKGROUND_IMAGE_SRC\} alt="" aria-hidden="true" data-testid="business-services-background" style=\{styles\.bgImg\} \/>/,
    'background img present with business-services-background testid');
  assert.match(PAGE_SRC, /bgImg: \{[^}]*position: 'fixed'[^}]*zIndex: 0[^}]*opacity: 0\.35[^}]*\}/,
    'background is fixed, behind content, dimmed');
  assert.match(PAGE_SRC, /wrap: \{[^}]*position: 'relative', zIndex: 1[^}]*\}/,
    'content wrap sits above the background');
  assert.match(PAGE_SRC, /page: \{ background: INDIGO_BG/,
    'dark page background stays underneath as the fallback');
});

test('no text baked into the art — all labels stay real text', () => {
  assert.match(PAGE_SRC, /<h3 style=\{styles\.resourceTitle\}>\{r\.name\}<\/h3>/,
    'resource name is still real text');
  assert.ok(PAGE_SRC.includes('alt=""'),
    'art images carry no text (empty alt)');
});
