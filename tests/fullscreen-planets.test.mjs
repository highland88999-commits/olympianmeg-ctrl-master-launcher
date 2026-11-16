// tests/fullscreen-planets.test.mjs — fullscreen on Jupiter 2,
// Earth 3 and Earth 4 (Merlin, Nov 16 ~00:02: "full screen like
// we have for earth 2"). The mechanism is Earth 2's: the world
// stage becomes a fixed inset-0 overlay that takes over the whole
// screen when you enter it, with an exit back to the menu — the
// same shape on all three pages, not three different fullscreens.
// Static source analysis (same pattern as
// tests/program-menu-fullscreen.test.mjs).
// Run: node --test tests/fullscreen-planets.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');

const j2 = readFileSync(join(repo, 'app', 'jupiter-2', 'page.jsx'), 'utf8');
const e3 = readFileSync(join(repo, 'app', 'new-earth', 'page.jsx'), 'utf8');
const e4 = readFileSync(join(repo, 'app', 'earth-4', 'page.jsx'), 'utf8');
const e2 = readFileSync(join(repo, 'app', 'earth-2', 'page.jsx'), 'utf8');

describe('the fullscreen mechanism is Earth 2’s, on all three pages', () => {
  it('Earth 2’s reference: the world mounts in a fixed inset-0 overlay on entry', () => {
    assert.ok(e2.includes('fixed inset-0'), 'Earth 2 mounts its world fixed inset-0');
    assert.ok(e2.includes('z-[90]') || e2.includes('z-[80]'), 'Earth 2’s overlay sits above the menu');
  });
  it('all three pages hold a fullscreen state and a fixed inset-0 stage', () => {
    for (const [name, src] of [['jupiter-2', j2], ['earth-3', e3], ['earth-4', e4]]) {
      assert.ok(src.includes('useState(false)') || src.includes('fullscreen'), `${name}: a fullscreen state`);
      assert.ok(src.includes('position: "fixed", inset: 0') || src.includes("position: 'fixed', inset: 0"), `${name}: the stage goes fixed inset-0`);
      assert.ok(src.includes('zIndex: 80'), `${name}: the fullscreen stage sits at z-80`);
      assert.ok(src.includes('100dvh'), `${name}: the fullscreen stage is a full viewport tall`);
    }
  });
  it('all three pages box the stage by default — no first-paint layout regression', () => {
    for (const [name, src] of [['jupiter-2', j2], ['earth-3', e3], ['earth-4', e4]]) {
      // The fixed style is conditional on the fullscreen state, so
      // the boxed layout is what first paints.
      assert.ok(src.includes('fullscreen ?'), `${name}: the fixed style is conditional, not the default`);
    }
    assert.ok(j2.includes('min(62dvh, 560px)'), 'jupiter-2 keeps its boxed height by default');
    assert.ok(e3.includes('min(64dvh, 600px)'), 'earth-3 keeps its boxed height by default');
    assert.ok(e4.includes('min(64dvh, 600px)'), 'earth-4 keeps its boxed height by default');
  });
  it('every page offers an enter button and an in-stage exit button', () => {
    // Orb law (Merlin, Nov 16): the FULLSCREEN / EXIT FULLSCREEN pills
    // are plain circle orbs now — the visible text is FULL / EXIT and
    // the full wording lives in the aria-label.
    for (const [name, src] of [['jupiter-2', j2], ['earth-3', e3], ['earth-4', e4]]) {
      assert.ok(src.includes('Enter fullscreen'), `${name}: an enter control`);
      assert.ok(src.includes('Exit fullscreen'), `${name}: an exit control inside the stage`);
      assert.ok(src.includes('OrbButton'), `${name}: the fullscreen control is an orb`);
    }
  });
  it('Escape exits fullscreen on every page', () => {
    for (const [name, src] of [['jupiter-2', j2], ['earth-3', e3], ['earth-4', e4]]) {
      assert.ok(src.includes('"Escape"') || src.includes("'Escape'"), `${name}: Escape is handled`);
      assert.ok(src.includes('setFullscreen(false)'), `${name}: Escape drops back to the boxed stage`);
    }
  });
  it('Earth 3 and Earth 4 re-measure their scene after the stage changes size', () => {
    // The R3F canvas on Jupiter 2 resizes itself to its parent;
    // the Earth 3 / Earth 4 scenes expose resize() and must be
    // told the stage moved.
    for (const [name, src] of [['earth-3', e3], ['earth-4', e4]]) {
      assert.ok(src.includes('worldRef.current.resize()'), `${name}: resize() is called on the world`);
      assert.ok(src.includes('requestAnimationFrame'), `${name}: resize runs on the next frame, after layout`);
    }
  });
});
