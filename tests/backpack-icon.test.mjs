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
//     `olympus:backpack-icon:v1`) for floating mounts — and the
//     HOME pair (`backpack_icon_v2` / `olympus:backpack-icon:v2`)
//     for docked mounts, so a pre-home parked spot never wins
//     over the home slot.
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
  BACKPACK_ICON_STORAGE_KEY_V2,
  BACKPACK_ICON_UI_STATE_KEY,
  BACKPACK_ICON_UI_STATE_KEY_V2,
  backpackIconKeys,
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

  it('the persistence keys are the documented ones, v1 and the home v2 pair', () => {
    assert.equal(BACKPACK_ICON_UI_STATE_KEY, 'backpack_icon');
    assert.equal(BACKPACK_ICON_STORAGE_KEY, 'olympus:backpack-icon:v1');
    assert.equal(BACKPACK_ICON_UI_STATE_KEY_V2, 'backpack_icon_v2');
    assert.equal(BACKPACK_ICON_STORAGE_KEY_V2, 'olympus:backpack-icon:v2');
    assert.deepEqual(backpackIconKeys(true), { storage: 'olympus:backpack-icon:v2', uiState: 'backpack_icon_v2' });
    assert.deepEqual(backpackIconKeys(false), { storage: 'olympus:backpack-icon:v1', uiState: 'backpack_icon' });
  });

  it('a docked mount with no v2 spot renders in flow at home, never at the old spot', () => {
    // The component resolves docked mounts with NO fallback: null
    // fractions mean "home slot", so a pre-home parked spot (v1 or
    // a v1 server value) is never picked up by a docked mount.
    assert.deepEqual(resolveBackpackIconPosition({ local: null }), null);
    assert.match(hud, /position: \(dragPx \|\| iconPx\) \? 'fixed' : \(docked \? 'relative' : 'fixed'\)/);
    assert.match(hud, /: docked\n\s+\? \{\}\n\s+: \{ left: 16, bottom: 16 \}/);
  });
});

describe('component wiring (code inspection, like the Concourse tests)', () => {
  it('preserves the BackpackHud API exactly: default export, same props plus docked', () => {
    assert.match(hud, /export default function BackpackHud\(\{ realm, realmLabel, combatApplies = false, displayNote = null, docked = false \}\)/);
  });

  it('renders a 56px circle with a count badge inside it — fixed when floating, in flow when docked at home', () => {
    assert.match(hud, /position: \(dragPx \|\| iconPx\) \? 'fixed' : \(docked \? 'relative' : 'fixed'\)/);
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

  it('persists localStorage instantly + /api/ui-state debounced, server wins on login — via the mount\'s key pair', () => {
    assert.match(hud, /localStorage\.setItem\(iconKeys\.storage/);
    assert.match(hud, /localStorage\.getItem\(iconKeys\.storage/);
    assert.match(hud, /fetch\('\/api\/ui-state', \{\n\s+method: 'POST'/);
    assert.match(hud, /\[iconKeys\.uiState\]: frac/);
    assert.match(hud, /data\.preferences\[iconKeys\.uiState\]/);
    assert.match(hud, /signed out: localStorage only/);
  });

  it('a docked drag starts from the on-screen home box, never jumps to a corner', () => {
    assert.match(hud, /getBoundingClientRect\(\)/);
    assert.match(hud, /docked icon at home starts from its on-screen box/);
  });

  it('the icon engine documents both key pairs and the route accepting them', () => {
    assert.match(iconLib, /BACKPACK_ICON_UI_STATE_KEY_V2 = 'backpack_icon_v2'/);
    assert.match(iconLib, /BACKPACK_ICON_STORAGE_KEY_V2 = 'olympus:backpack-icon:v2'/);
    assert.match(iconLib, /route accepts the `backpack_icon`\n\/\/ key \(and the v2 pair below\)/);
  });
});
