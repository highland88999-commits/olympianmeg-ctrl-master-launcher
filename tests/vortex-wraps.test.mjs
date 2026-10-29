// tests/vortex-wraps.test.mjs — the vortex skin picker rules.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pickVortexPair, pickVortexWraps, VORTEX_WRAP_FILES } from '../lib/vortex/wraps.js';
import { VORTEX_WRAP_COUNT } from '../lib/vortex/wraps-manifest.js';

const PUBLIC = new URL('../public/', import.meta.url).pathname;

describe('vortex wrap manifest', () => {
  it('holds the whole ecosystem image pool', () => {
    assert.ok(VORTEX_WRAP_COUNT > 500, `expected a big pool, got ${VORTEX_WRAP_COUNT}`);
    assert.equal(VORTEX_WRAP_FILES.length, VORTEX_WRAP_COUNT);
  });
  it('every entry is a loadable site path that exists on disk', () => {
    for (const f of VORTEX_WRAP_FILES) {
      assert.match(f, /^\//, `not a site path: ${f}`);
      assert.ok(existsSync(join(PUBLIC, f.slice(1))), `missing on disk: ${f}`);
    }
  });
});

describe('pickVortexPair', () => {
  it('outside and inside are always different files', () => {
    for (let i = 0; i < 200; i += 1) {
      const { outside, inside } = pickVortexPair(VORTEX_WRAP_FILES, null);
      assert.ok(outside && inside);
      assert.notEqual(outside, inside, 'rider and watchers must see different skins');
    }
  });
  it('never repeats either pick from the previous ride, back to back', () => {
    let prev = null;
    for (let i = 0; i < 200; i += 1) {
      const cur = pickVortexPair(VORTEX_WRAP_FILES, prev);
      assert.notEqual(cur.outside, cur.inside);
      if (prev) {
        for (const f of [cur.outside, cur.inside]) {
          assert.notEqual(f, prev.outside, `repeat of previous outside: ${f}`);
          assert.notEqual(f, prev.inside, `repeat of previous inside: ${f}`);
        }
      }
      prev = cur;
    }
  });
  it('accepts a null previous pair (first ride of a session)', () => {
    const cur = pickVortexPair(VORTEX_WRAP_FILES, null);
    assert.ok(cur.outside && cur.inside && cur.outside !== cur.inside);
  });
  it('degrades gracefully on a tiny pool instead of returning nulls', () => {
    const tiny = ['/a.webp', '/b.webp'];
    const cur = pickVortexPair(tiny, { outside: '/a.webp', inside: '/b.webp' });
    assert.ok(cur.outside && cur.inside);
    assert.notEqual(cur.outside, cur.inside);
  });
});

describe('pickVortexWraps', () => {
  it('draws from the real ecosystem pool', () => {
    const cur = pickVortexWraps(null);
    assert.ok(VORTEX_WRAP_FILES.includes(cur.outside));
    assert.ok(VORTEX_WRAP_FILES.includes(cur.inside));
    assert.notEqual(cur.outside, cur.inside);
  });
});
