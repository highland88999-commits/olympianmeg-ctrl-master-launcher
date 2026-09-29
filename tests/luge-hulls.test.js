// tests/luge-hulls.test.js — Headless checks for the luge sled hull wraps.
// Run: node tests/luge-hulls.test.js (from the repo root).
// No browser, no network — verifies the three recreated-from-description
// wraps exist, are valid WebP bytes, and meet a minimum dimension.
// Provenance for the recreations lives in the header comment of lib/luge_data.js.
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEX = join(root, 'public', 'textures', 'luge');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// Minimal WebP dimension probe (lossy VP8 + lossless VP8L). Returns
// { w, h } or null when the bytes are not a recognizable WebP.
function webpDims(buf) {
  if (buf.length < 32) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    // VP8 chunk data: 3-byte frame tag, 3-byte start code (9d 01 2a),
    // then 14-bit LE width and height.
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    const w = (buf[26] | (buf[27] << 8)) & 0x3fff;
    const h = (buf[28] | (buf[29] << 8)) & 0x3fff;
    return { w, h };
  }
  if (chunk === 'VP8L') {
    // Lossless: 0x2f signature byte, then packed 14-bit (width-1)/(height-1).
    if (buf[20] !== 0x2f) return null;
    const b1 = buf[21], b2 = buf[22], b3 = buf[23], b4 = buf[24];
    const w = 1 + (((b2 & 0x3f) << 8) | b1);
    const h = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
    return { w, h };
  }
  return null;
}

const RECREATED = ['hull-g2.webp', 'hull-p3.webp', 'hull-p11.webp'];
const MIN_DIM = 512;      // floor — must look like a real texture
const EXPECT_DIM = 1600;  // what the shipped wraps are

for (const name of RECREATED) {
  const p = join(TEX, name);
  t(`${name}: file exists`, existsSync(p));
  if (!existsSync(p)) continue;
  const buf = readFileSync(p);
  const size = statSync(p).size;
  t(`${name}: non-trivial size (>50KB, not a stub)`, size > 50 * 1024);
  const dims = webpDims(buf);
  t(`${name}: valid WebP image bytes (RIFF/WEBP + VP8 header)`, !!dims);
  if (dims) {
    t(`${name}: width ${dims.w} >= ${MIN_DIM}`, dims.w >= MIN_DIM);
    t(`${name}: height ${dims.h} >= ${MIN_DIM}`, dims.h >= MIN_DIM);
    t(`${name}: square, matches shipped 1600x1600 wraps`,
      dims.w === EXPECT_DIM && dims.h === EXPECT_DIM);
  }
}

// Honesty check: the sled picker data must still label these as
// recreations-from-description, never as OG/originals.
{
  const src = readFileSync(join(root, 'lib', 'luge_data.js'), 'utf8');
  t('luge_data.js keeps the recreations-from-description honesty label',
    /recreations-from-description, not OG assets/.test(src));
  for (const id of ['g2', 'p3', 'p11']) {
    t(`sled ${id} still wired to its hull webp`, src.includes(`hull-${id}.webp`));
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
