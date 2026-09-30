// tests/bike-wraps.test.mjs — TRON bike brand livery wraps.
//
// Verifies: the three Nexus Vortex wrap textures exist as valid PNGs, and
// both bike geometry files wire them into their hull materials.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const TEX = join(ROOT, 'public/textures/nova/TronBikes');

function isPng(buf) {
  return buf.length > 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

describe('bike brand wraps', () => {
  for (const bike of ['wisp', 'comet', 'atlas']) {
    it(`${bike}-wrap.png exists and is a valid PNG`, () => {
      const p = join(TEX, `${bike}-wrap.png`);
      assert.ok(existsSync(p), `missing ${p}`);
      const buf = readFileSync(p);
      assert.ok(isPng(buf), `${bike}-wrap.png is not a PNG`);
      assert.ok(buf.length > 20_000, `${bike}-wrap.png suspiciously small`);
    });
  }

  it('TronBikes.jsx wires all three wraps into hull Paint', () => {
    const src = readFileSync(join(ROOT, 'components/nova/TronBikes.jsx'), 'utf8');
    for (const bike of ['wisp', 'comet', 'atlas']) {
      assert.match(src, new RegExp(`${bike}: '/textures/nova/TronBikes/${bike}-wrap\\.png'`),
        `WRAPS missing ${bike}`);
    }
    assert.ok(src.includes('useWrapTexture'), 'missing useWrapTexture hook');
    assert.ok(src.includes('<Paint wrap={wrap}'), 'hull Paint not receiving wrap');
    // no bare <Paint /> left on wrapped hulls
    const bare = (src.match(/<Paint \/>/g) || []).length;
    assert.equal(bare, 0, `found ${bare} unwrapped <Paint /> hulls`);
  });

  it('VehicleArchetypes.jsx wraps its wisp/comet bike hulls', () => {
    const src = readFileSync(join(ROOT, 'components/argo/VehicleArchetypes.jsx'), 'utf8');
    assert.ok(src.includes('wisp-wrap.png'), 'argo missing wisp wrap');
    assert.ok(src.includes('comet-wrap.png'), 'argo missing comet wrap');
    assert.ok(src.includes('useWrapTexture'), 'argo missing useWrapTexture hook');
  });
});
