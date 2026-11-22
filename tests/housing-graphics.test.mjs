// tests/housing-graphics.test.mjs — Housing graphics wiring.
// Run: node --test tests/housing-graphics.test.mjs (from the repo root)
//
// Covers the per-section and per-type card art (12 x 900x600 WebP),
// the small thumbs on every listing row, and the page background
// graphic. No network, no browser: file checks run on disk, wiring
// checks run on the page source. The headless probe (probe.mjs) covers
// the rendered page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SECTIONS, PROPERTY_TYPES } from '../lib/housing/taxonomy.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SECTION_DIR = join(ROOT, 'public/images/housing/sections');
const TYPE_DIR = join(ROOT, 'public/images/housing/types');
const BG_FILE = join(ROOT, 'public/images/housing/background.webp');
const PAGE_SRC = readFileSync(join(ROOT, 'app/housing/page.jsx'), 'utf8');

// The 3 real section ids and the 9 real property types with art — the
// only ids that ever get an image. 'other' has none on purpose: an
// unmapped type falls back to its section, and anything unmapped
// entirely renders no image.
const EXPECTED_SECTIONS = ['real-estate', 'rentals', 'temporary'];
const EXPECTED_TYPES = [
  'house', 'condo', 'townhouse', 'duplex', 'land',
  'hotel', 'hostel', 'guest-house', 'motel',
];

// Read WebP dimensions: VP8 lossy ('VP8 ') stores width/height as 14-bit
// values after the 3-byte frame tag + 0x9d012a magic; VP8L stores
// (width-1)/(height-1) packed in 4 LE bytes after the 0x2f signature.
function webpDimensions(buf) {
  assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF', 'RIFF magic');
  assert.equal(buf.subarray(8, 12).toString('ascii'), 'WEBP', 'WEBP magic');
  const chunk = buf.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8 ') {
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

function checkWebp(file, width, height) {
  const buf = readFileSync(file);
  assert.ok(buf.length > 1000, `${file} non-trivial size, got ${buf.length}`);
  const dims = webpDimensions(buf);
  assert.equal(dims.width, width, `${file} width`);
  assert.equal(dims.height, height, `${file} height`);
}

function pageSetIds(name) {
  const m = PAGE_SRC.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(m, `${name} set found in page.jsx`);
  return new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
}

test('taxonomy carries exactly the 3 sections and 10 types (9 with art + other)', () => {
  assert.deepEqual(SECTIONS.map((s) => s.id).sort(), [...EXPECTED_SECTIONS].sort());
  assert.deepEqual(PROPERTY_TYPES.map((t) => t.id).sort(), [...EXPECTED_TYPES, 'other'].sort());
});

test('every section id has its image file, valid WebP, 900x600', () => {
  for (const id of EXPECTED_SECTIONS) {
    checkWebp(join(SECTION_DIR, `${id}.webp`), 900, 600);
  }
});

test('every real type id has its image file, valid WebP, 900x600', () => {
  for (const id of EXPECTED_TYPES) {
    checkWebp(join(TYPE_DIR, `${id}.webp`), 900, 600);
  }
});

test('no orphan art: every file maps to a real section or type', () => {
  const sectionFiles = readdirSync(SECTION_DIR).filter((f) => f.endsWith('.webp'));
  assert.equal(sectionFiles.length, 3, `expected 3 section files, got ${sectionFiles.length}`);
  for (const f of sectionFiles) {
    assert.ok(EXPECTED_SECTIONS.includes(f.replace(/\.webp$/, '')), `orphan section art ${f}`);
  }
  const typeFiles = readdirSync(TYPE_DIR).filter((f) => f.endsWith('.webp'));
  assert.equal(typeFiles.length, 9, `expected 9 type files, got ${typeFiles.length}`);
  for (const f of typeFiles) {
    assert.ok(EXPECTED_TYPES.includes(f.replace(/\.webp$/, '')), `orphan type art ${f}`);
  }
});

test('background graphic exists, valid WebP, 1920x1080', () => {
  checkWebp(BG_FILE, 1920, 1080);
});

test('page maps exactly the real section + type ids to images — nothing else', () => {
  assert.deepEqual([...pageSetIds('SECTION_IMAGE_IDS')].sort(), [...EXPECTED_SECTIONS].sort());
  assert.deepEqual([...pageSetIds('TYPE_IMAGE_IDS')].sort(), [...EXPECTED_TYPES].sort());
  assert.ok(!pageSetIds('TYPE_IMAGE_IDS').has('other'), "'other' must not map to an image");
});

test('section tabs wear their graphic above the label', () => {
  assert.match(PAGE_SRC, /sectionImageSrc\(s\.id\) \? \(\s*<img src=\{sectionImageSrc\(s\.id\)\} alt="" data-testid=\{`section-image-\$\{s\.id\}`\} style=\{styles\.sectionImg\} \/>/,
    'tab img with section-image-<id> testid');
  assert.match(PAGE_SRC, /sectionImg: \{[^}]*aspectRatio: '3 \/ 2'[^}]*\}/,
    'sectionImg keeps the 3:2 aspect so the tabs never shift on load');
  assert.match(PAGE_SRC, /<span>\{s\.label\}<\/span>/,
    'section label is still real text');
});

test('every listing row wears its type thumb, falling back to its section; unmapped shows none', () => {
  assert.match(PAGE_SRC, /const thumbSrc = listingImageSrc\(listing\);/,
    'ListingRow derives its thumb from the listing');
  assert.match(PAGE_SRC, /if \(listing\.type && TYPE_IMAGE_IDS\.has\(listing\.type\)\) \{\s*return `\/images\/housing\/types\/\$\{listing\.type\}\.webp`;/,
    'thumb prefers the type graphic');
  assert.match(PAGE_SRC, /return sectionImageSrc\(listing\.section\);/,
    'thumb falls back to the section graphic');
  assert.match(PAGE_SRC, /\{thumbSrc \? \(\s*<img src=\{thumbSrc\} alt="" data-testid=\{`listing-thumb-\$\{listing\.id\}`\} style=\{styles\.listingThumb\} \/>/,
    'ListingRow renders the thumb only when a mapped graphic exists');
  assert.ok(!PAGE_SRC.includes('listing-thumb-default') && !PAGE_SRC.includes('types/default') && !PAGE_SRC.includes('sections/default'),
    'no invented fallback thumb image anywhere');
  assert.match(PAGE_SRC, /listingThumb: \{[^}]*width: 72, height: 48[^}]*\}/,
    'thumb is a small fixed 72x48 in-flow box');
});

test('background graphic sits behind the content, dimmed, page fallback kept', () => {
  assert.match(PAGE_SRC, /<img src=\{BACKGROUND_IMAGE_SRC\} alt="" aria-hidden="true" data-testid="housing-background" style=\{styles\.bgImg\} \/>/,
    'background img present with housing-background testid');
  assert.match(PAGE_SRC, /bgImg: \{[^}]*position: 'fixed'[^}]*zIndex: 0[^}]*opacity: 0\.35[^}]*\}/,
    'background is fixed, behind content, dimmed');
  assert.match(PAGE_SRC, /wrap: \{[^}]*position: 'relative', zIndex: 1[^}]*\}/,
    'content wrap sits above the background');
  assert.match(PAGE_SRC, /page: \{[^}]*background: '#0b0b12'/,
    'dark page background stays underneath as the fallback');
});

test('no text baked into the art paths — all labels stay real text', () => {
  assert.ok(PAGE_SRC.includes('alt=""'), 'art images carry no text (empty alt)');
});
