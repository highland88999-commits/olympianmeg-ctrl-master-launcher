// tests/landing-setup-character.test.mjs
// Landing Setup step 1 — character selection fix (Merlin, 2026-11-18,
// from his phone video + screenshot):
//   1. Graphic backdrops behind each symbol inside its circle — a
//      house TRON emblem per orb, colour-matched (red reticle, gold
//      dawn, green ascend); the portrait/icon stays on top.
//   2. The character picker sits IN FLOW directly under the
//      "PICK YOUR CHARACTER" heading — no absolute overlay floating
//      mid-panel.
//   3. The name ghost: the old name/portrait lingering over the new
//      one on change — the preview and the orb portrait remount on
//      character change, so exactly one name is visible at a time.
//   4. The collapsed grid that caused the video's empty grid + the
//      moving gold bar: the ratio now lives on the BUTTON, so every
//      tile is a real square the portrait fills.
//
// Run: node --test tests/landing-setup-character.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

function src(rel) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

describe('landing setup step 1: graphic backdrops behind the orb symbols', () => {
  it('one house TRON emblem per orb, colour-matched', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /red: '\/images\/shadow-realm\/ui\/tron-reticle-light\.webp'/);
    assert.match(f, /gold: '\/images\/shadow-realm\/ui\/tron-time-dawn-light\.webp'/);
    assert.match(f, /green: '\/images\/shadow-realm\/ui\/tron-ascend-green-light\.webp'/);
    // All three emblem files exist on disk.
    for (const name of ['tron-reticle-light.webp', 'tron-time-dawn-light.webp', 'tron-ascend-green-light.webp']) {
      assert.equal(
        existsSync(new URL(`../public/images/shadow-realm/ui/${name}`, import.meta.url)),
        true,
        `${name} must exist in public/images/shadow-realm/ui/`
      );
    }
  });
  it('the emblem rides mix-blend-screen over the flat disc (black drops out, neon shows)', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /function LightBackdrop/);
    assert.match(f, /absolute inset-0 h-full w-full object-cover mix-blend-screen/);
    // Decoration only: the button's aria-label carries the meaning.
    assert.match(f, /aria-hidden="true"/);
  });
  it('each light renders its backdrop, and its symbol sits above it', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /<LightBackdrop src=\{LIGHT_BACKDROPS\.red\} \/>/);
    assert.match(f, /<LightBackdrop src=\{LIGHT_BACKDROPS\.gold\} \/>/);
    assert.match(f, /<LightBackdrop src=\{LIGHT_BACKDROPS\.green\} \/>/);
    // Symbols are relative z-10 so they paint over the emblem.
    assert.match(f, /className="relative z-10 text-2xl leading-none">🎥/);
    assert.match(f, /className="relative z-10 text-2xl leading-none">➡️/);
    assert.match(f, /className="relative z-10 h-\[78%\] w-\[78%\] rounded-full object-cover"/);
  });
  it('the lights stay plain circles — no video wraps, no glowing orb visuals', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.equal(f.includes('<video'), false, 'no video inside the landing setup frame');
    // The portrait is inset so the gold ring frames it instead of
    // the portrait hiding the backdrop outright.
    assert.match(f, /h-\[78%\] w-\[78%\] rounded-full object-cover/);
  });
});

describe('landing setup step 1: picker sits in flow under its heading', () => {
  it('the picker panel is not an absolute overlay (other steps keep their own backdrops)', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.equal(f.includes('absolute inset-0 z-20'), false);
    // The picker dialog class carries no absolute positioning at all.
    assert.match(f, /aria-label="Pick your character"\s+className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-3xl bg-zinc-950"/);
  });
  it('pickerOpen returns the picker panel in flow, replacing the orb stack', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /if \(pickerOpen\) \{/);
    assert.match(f, /className="flex h-full min-h-0 flex-col"/);
  });
  it('the panel stays solid so no text bleeds through from behind', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /rounded-3xl bg-zinc-950"/);
    assert.equal(f.includes('bg-zinc-950/95'), false);
  });
  it('heading, preview, then grid — in that order, top-anchored', () => {
    const f = src('components/FintracExplanation.jsx');
    const heading = f.indexOf('Pick your character');
    const grid = f.indexOf('grid min-h-0 flex-1 grid-cols-3');
    assert.ok(heading > 0 && grid > heading, 'heading must come before the grid');
    // The grid takes the remaining height and scrolls inside the panel.
    assert.match(f, /grid min-h-0 flex-1 grid-cols-3 content-start gap-3 overflow-y-auto p-4/);
  });
});

describe('landing setup step 1: grid tiles are real squares', () => {
  it('the ratio lives on the button, so the track sizes to a square', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /aspect-square overflow-hidden rounded-xl border-2 bg-zinc-900/);
    // The img fills the button instead of carrying the ratio itself.
    assert.match(f, /className="h-full w-full object-cover"/);
    // A tile with no preview file still reads as a dark square.
    assert.match(f, /rounded-xl border-2 bg-zinc-900/);
  });
});

describe('landing setup step 1: the name ghost cannot persist', () => {
  it('preview img and name remount on character change (distinct keys — no React duplicate-key warning)', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /<img\s+key=\{`preview-img-\$\{preview\.id\}`\}/);
    assert.match(f, /<span key=\{`preview-name-\$\{preview\.id\}`\} className="mt-2 text-sm font-black text-zinc-100">\{preview\.name\}<\/span>/);
  });
  it('the yellow-orb portrait remounts on character change', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /<img\s+key=\{character\.id\}/);
  });
  it('exactly one name renders in the preview at a time', () => {
    const f = src('components/FintracExplanation.jsx');
    // A single preview name span — no second/old name element.
    const matches = f.match(/\{preview\.name\}/g) || [];
    assert.equal(matches.length, 2, 'preview.name appears once in the img alt and once in the span');
  });
});
