// tests/boot-splash.test.mjs
// Boot splash (Merlin, 2026-11-19): the home page kept reloading itself
// on his phone and every reload showed a blank white page, then a blank
// black page — the initial HTML carries zero content until the JS bundle
// hydrates. The splash is server-rendered into the first HTML bytes and
// removes itself on hydration; the inline body background kills the
// white flash before the stylesheet arrives.
//
// Run: node --test tests/boot-splash.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function src(rel) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

describe('boot splash: a loading shell in the first HTML bytes', () => {
  it('BootSplash renders the shell with the wordmark and removes itself on hydration', () => {
    const f = src('components/BootSplash.jsx');
    assert.match(f, /id="olympus-boot"/);
    assert.match(f, /NEXUS VORTEX/);
    assert.match(f, /Loading Olympus/);
    assert.match(f, /role="status"/);
    assert.match(f, /useEffect\(\(\) => \{\s*setReady\(true\);/);
    assert.match(f, /if \(ready\) return null;/);
    // Pure inline styles + keyframes: looks right before globals.css loads.
    assert.match(f, /background: '#050505'/);
    assert.match(f, /@keyframes olympus-boot-spin/);
  });

  it('root layout mounts the splash first and inlines the dark body background', () => {
    const f = src('app/layout.jsx');
    assert.match(f, /import BootSplash from '@\/components\/BootSplash'/);
    assert.match(f, /<BootSplash \/>/);
    assert.match(f, /style=\{\{ backgroundColor: '#050505' \}\}/);
  });

  it('splash never blocks input: pointer-events none, and it is the only fixed overlay at that z-index', () => {
    const f = src('components/BootSplash.jsx');
    assert.match(f, /pointerEvents: 'none'/);
    assert.match(f, /zIndex: 99999/);
  });
});
