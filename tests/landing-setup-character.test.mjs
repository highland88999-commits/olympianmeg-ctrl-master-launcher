// tests/landing-setup-character.test.mjs
// Landing Setup step 1 — character selection fix (Merlin, 2026-11-18,
// from his phone video + screenshot):
//   1. SUPERSEDED Nov 27, 2026 (Merlin, Part 12 — unified button
//      style): the circles are TEXT ONLY now. The house TRON emblem
//      backdrops (one per orb, colour-matched) and the portrait/emoji
//      graphics inside the circles are GONE from the buttons — each
//      circle carries a short silver word (1ST/3RD, the character's
//      short name, GO) and the captions below them are unchanged.
//      The tests below pin the new design, not the old one.
//   2. The character picker sits IN FLOW directly under the
//      "PICK YOUR CHARACTER" heading — no absolute overlay floating
//      mid-panel.
//   3. The name ghost: the old name lingering over the new one on
//      change — the preview (img + name) remounts on character
//      change, so exactly one name is visible at a time. (The orb
//      itself no longer carries a portrait — its word remounts with
//      the character instead.)
//   4. The collapsed grid that caused the video's empty grid + the
//      moving gold bar: the ratio now lives on the BUTTON, so every
//      tile is a real square the portrait fills.
//
// Run: node --test tests/landing-setup-character.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function src(rel) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

// Part 12 (Merlin, Nov 27, 2026 — unified button style): the step-1
// circles are TEXT ONLY. No TRON emblem backdrops, no portrait or
// emoji graphics inside the circles — each circle carries a short
// silver word, and the captions below them are unchanged.
function landingSetupFrameBody(f) {
  const start = f.indexOf('function LandingSetupFrame');
  const end = f.indexOf('\nexport function FintracExplanationModal', start);
  return f.slice(start, end === -1 ? undefined : end);
}

describe('landing setup step 1: circles are text-only (Part 12)', () => {
  it('no TRON emblem backdrops or portrait graphics in the circles', () => {
    const f = src('components/FintracExplanation.jsx');
    const frame = landingSetupFrameBody(f);
    // Scoped to the frame body: the file's own Part 12 comment names
    // the removed pieces, so a whole-file includes() would trip on it.
    assert.equal(frame.includes('LIGHT_BACKDROPS'), false, 'emblem map is gone');
    assert.equal(frame.includes('LightBackdrop'), false, 'backdrop component is gone');
    for (const name of ['tron-reticle-light.webp', 'tron-time-dawn-light.webp', 'tron-ascend-green-light.webp']) {
      assert.equal(f.includes(name), false, `${name} must not be referenced in the circles`);
    }
    // No portrait image in the yellow orb, no camera/arrow emoji symbols.
    assert.equal(frame.includes('src={character.preview}'), false, 'orb portrait is gone');
    assert.equal(frame.includes('🎥'), false, 'camera emoji is gone from the circles');
    assert.equal(frame.includes('➡️'), false, 'arrow emoji is gone from the circles');
  });
  it('each circle carries a short silver word', () => {
    const f = src('components/FintracExplanation.jsx');
    // Red: 1ST/3RD perspective word; yellow: character short name;
    // green: GO. The words render inside the unified see-through buttons.
    assert.match(f, /characterShort/);
    assert.match(f, /perspective === '1st' \? '1ST' : '3RD'/);
    assert.match(f, />GO</);
    assert.match(f, /styles\.btn/);
  });
  it('the lights stay plain circles — no video wraps, no glowing orb visuals', () => {
    const f = src('components/FintracExplanation.jsx');
    // The looping nebula video (Part 10) lives in the modal shell
    // behind the card — never inside the step-1 circles.
    const frame = landingSetupFrameBody(f);
    assert.equal(frame.includes('<video'), false, 'no video inside the landing setup frame');
    assert.equal(frame.includes('LightBackdrop'), false, 'no emblem backdrop in the frame');
    assert.match(f, /LANDING_SETUP_BG_VIDEO/);
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
    const grid = f.indexOf('grid min-h-0 flex-1 auto-rows-max grid-cols-3');
    assert.ok(heading > 0 && grid > heading, 'heading must come before the grid');
    // The grid takes the remaining height and scrolls inside the panel.
    // auto-rows-max: each row takes the tile's max-content height —
    // the default auto tracks sized to the buttons' ~0 minimum
    // (overflow-hidden) and every tile overlapped the next.
    assert.match(f, /grid min-h-0 flex-1 auto-rows-max grid-cols-3 content-start gap-3 overflow-y-auto p-4/);
  });
});

describe('landing setup step 1: grid tiles are real squares', () => {
  it('the rows size to the tiles (auto-rows-max) and the ratio paints the button square', () => {
    const f = src('components/FintracExplanation.jsx');
    assert.match(f, /aspect-square overflow-hidden rounded-xl border-2 bg-zinc-900/);
    // The rows take the tile's max-content height — default auto
    // tracks sized to the buttons' ~0 minimum (overflow-hidden)
    // and every row overlapped the next by ~70 px.
    assert.match(f, /auto-rows-max grid-cols-3/);
    // The img fills the button from its own 1:1 ratio, not a
    // percentage of the track.
    assert.match(f, /className="w-full h-auto object-cover"/);
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
  it('the yellow-orb word remounts on character change (Part 12: no portrait in the orb)', () => {
    const f = src('components/FintracExplanation.jsx');
    // The orb carries the character's short name as text — it changes
    // with the character, and no portrait img can linger.
    assert.match(f, /characterShort/);
    assert.match(f, /character \? character\.name\.split\(' '\)\[0\]\.toUpperCase\(\) : 'PICK'/);
    assert.equal(f.includes('src={character.preview}'), false, 'no orb portrait to go stale');
  });
  it('exactly one name renders in the preview at a time', () => {
    const f = src('components/FintracExplanation.jsx');
    // A single preview name span — no second/old name element.
    const matches = f.match(/\{preview\.name\}/g) || [];
    assert.equal(matches.length, 2, 'preview.name appears once in the img alt and once in the span');
  });
});
