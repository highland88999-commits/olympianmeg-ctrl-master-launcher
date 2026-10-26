// tests/backpack-icon.test.mjs
// THE BACKPACK CIRCLE ICON (item 9b, Merlin 2026-10-26): the
// backpack trigger is a small, modular CIRCLE, draggable by every
// user to wherever they want it on screen, exactly like the
// Concourse Orb, with the spot persisted per account.
//
// What these pin:
//   - tap vs drag: an 8px travel threshold (the Muse FAB model in
//     lib/muse-fab.js), factored through lib/backpack/icon.js;
//   - the drag top-left is clamped so the whole circle stays on
//     screen with an 8px margin, grab offset preserved;
//   - the position is viewport fractions: frac -> px -> frac round
//     trips, so one stored spot works on any screen size;
//   - restore precedence: account copy > device cache > default;
//   - the default spot is bottom-LEFT, clear of the Concourse
//     Orb's bottom-right default, so the two icons never stack;
//   - the component wiring: the preserved BackpackHud API
//     (import path + props), the circle shape, the pointer drag
//     engine, and persistence via localStorage + /api/ui-state
//     key `backpack_icon` (localStorage key
//     `olympus:backpack-icon:v1`).
//
// NOTE: the /api/ui-state route does not yet accept the
// `backpack_icon` key (see lib/backpack/icon.js) — that block is
// the coordinator's, outside this job's scope — so these tests
// pin the CLIENT side (it sends and reads the key) and do not
// assert server acceptance. Until that block lands, the spot
// persists per device via localStorage.
//
// Run: node --test tests/backpack-icon.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  BACKPACK_ICON_DRAG_THRESHOLD_PX,
  BACKPACK_ICON_EDGE_MARGIN,
  BACKPACK_ICON_SIZE,
  BACKPACK_ICON_STORAGE_KEY,
  BACKPACK_ICON_UI_STATE_KEY,
  backpackIconFracToPx,
  backpackIconPxToFrac,
  clampBackpackIconPx,
  defaultBackpackIconFractions,
  dragBackpackIconTopLeft,
  isBackpackIconDrag,
  resolveBackpackIconPosition,
  sanitizeBackpackIconPosition,
} from '../lib/backpack/icon.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');
const hud = read('components/backpack/BackpackHud.jsx');
const iconLib = read('lib/backpack/icon.js');

const PHONE = { w: 390, h: 844 };
const DESKTOP = { w: 1440, h: 900 };

describe('circle size and drag threshold (the Concourse model)', () => {
  it('is the same 56px size as the Concourse Orb', () => {
    assert.equal(BACKPACK_ICON_SIZE, 56);
  });

  it('a still press is a tap, never a drag', () => {
    assert.equal(isBackpackIconDrag(0, 0), false);
    assert.equal(isBackpackIconDrag(3, -2), false);
  });

  it('travel must EXCEED 8px to become a drag', () => {
    assert.equal(BACKPACK_ICON_DRAG_THRESHOLD_PX, 8);
    assert.equal(BACKPACK_ICON_EDGE_MARGIN, 8);
    assert.equal(isBackpackIconDrag(8, 0), false, 'exactly at the threshold is still a tap');
    assert.equal(isBackpackIconDrag(9, 0), true);
  });
});

describe('viewport fractions survive screen sizes', () => {
  it('frac -> px -> frac round-trips on phone and desktop', () => {
    for (const { w, h } of [PHONE, DESKTOP]) {
      const frac = { x: 0.25, y: 0.6 };
      const px = backpackIconFracToPx(frac, w, h);
      const back = backpackIconPxToFrac(px, w, h);
      assert.ok(Math.abs(back.x - frac.x) < 1e-9);
      assert.ok(Math.abs(back.y - frac.y) < 1e-9);
    }
  });

  it('the drag top-left keeps the grab offset and clamps on screen', () => {
    const tl = dragBackpackIconTopLeft(
      { x: 100, y: 100 }, { x: 120, y: 130 }, { x: 200, y: 300 }, PHONE.w, PHONE.h
    );
    assert.equal(tl.x, 100 + (200 - 120));
    assert.equal(tl.y, 100 + (300 - 130));
    // A drag past the edge clamps: the right edge stops at vw - size - 8.
    const edge = dragBackpackIconTopLeft(
      { x: 100, y: 100 }, { x: 120, y: 130 }, { x: 400, y: 500 }, PHONE.w, PHONE.h
    );
    assert.equal(edge.x, PHONE.w - BACKPACK_ICON_SIZE - 8);
    const clamped = clampBackpackIconPx({ x: -50, y: 9999 }, PHONE.w, PHONE.h);
    assert.ok(clamped.x >= 8 && clamped.x + BACKPACK_ICON_SIZE <= PHONE.w - 8);
    assert.ok(clamped.y >= 8 && clamped.y + BACKPACK_ICON_SIZE <= PHONE.h - 8);
  });
});

describe('restore precedence and defaults', () => {
  it('account copy beats device cache beats default; junk is skipped', () => {
    assert.deepEqual(
      resolveBackpackIconPosition({ server: { x: 0.1, y: 0.2 }, local: { x: 0.9, y: 0.9 }, fallback: { x: 0, y: 0 } }),
      { x: 0.1, y: 0.2 }
    );
    assert.deepEqual(
      resolveBackpackIconPosition({ server: { x: 2, y: 0 }, local: { x: 0.3, y: 0.4 }, fallback: { x: 0, y: 0 } }),
      { x: 0.3, y: 0.4 }
    );
    assert.equal(sanitizeBackpackIconPosition({ x: 'a', y: 0 }), null);
    assert.equal(sanitizeBackpackIconPosition(null), null);
  });

  it('the default spot is bottom-left, clear of the Concourse Orb default', () => {
    const d = defaultBackpackIconFractions(PHONE.w, PHONE.h);
    const px = backpackIconFracToPx(d, PHONE.w, PHONE.h);
    assert.equal(px.x, 16);
    assert.equal(px.y, PHONE.h - BACKPACK_ICON_SIZE - 16);
    // The Orb's default is bottom-right (x near the right edge);
    // the backpack default sits at the left edge instead.
    assert.ok(px.x < PHONE.w / 2);
  });

  it('the persistence keys are the documented ones', () => {
    assert.equal(BACKPACK_ICON_UI_STATE_KEY, 'backpack_icon');
    assert.equal(BACKPACK_ICON_STORAGE_KEY, 'olympus:backpack-icon:v1');
  });
});

describe('component wiring (code inspection, like the Concourse tests)', () => {
  it('preserves the BackpackHud API exactly: default export, same props', () => {
    assert.match(hud, /export default function BackpackHud\(\{ realm, realmLabel, combatApplies = false, displayNote = null \}\)/);
  });

  it('renders a fixed 56px circle with a count badge inside it', () => {
    assert.match(hud, /position: 'fixed'/);
    assert.match(hud, /borderRadius: '50%'/);
    assert.match(hud, /width: BACKPACK_ICON_SIZE, height: BACKPACK_ICON_SIZE/);
    assert.match(hud, /aria-label=\{open \? 'Close backpack' : 'Open backpack'\}/);
  });

  it('has the pointer drag engine: capture, threshold, tap-vs-drag, clamped drop', () => {
    assert.match(hud, /onPointerDown=\{beginIconDrag\}/);
    assert.match(hud, /setPointerCapture/);
    assert.match(hud, /isBackpackIconDrag/);
    assert.match(hud, /dragBackpackIconTopLeft/);
    assert.match(hud, /suppressClickRef/);
    assert.match(hud, /touchAction: 'none'/);
  });

  it('persists localStorage instantly + /api\/ui-state backpack_icon debounced, server wins on login', () => {
    assert.match(hud, /localStorage\.setItem\(BACKPACK_ICON_STORAGE_KEY/);
    assert.match(hud, /localStorage\.getItem\(BACKPACK_ICON_STORAGE_KEY/);
    assert.match(hud, /fetch\('\/api\/ui-state', \{\n\s+method: 'POST'/);
    assert.match(hud, /\[BACKPACK_ICON_UI_STATE_KEY\]: frac/);
    assert.match(hud, /data\.preferences\[BACKPACK_ICON_UI_STATE_KEY\]/);
    assert.match(hud, /signed out: localStorage only/);
  });

  it('the icon engine documents the outstanding route key', () => {
    assert.match(iconLib, /backpack_icon/);
    assert.match(iconLib, /does not yet\n\/\/ accept the `backpack_icon` key/);
  });
});
