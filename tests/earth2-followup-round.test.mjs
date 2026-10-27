// tests/earth2-followup-round.test.mjs — Earth 2 follow-up round
// (Merlin, 2026-10-26): whole-orb toggle, header dead-space
// minimize, backpack home next to the orb cluster, and the
// finish-accurate preview above the build categories. Pages are
// not rendered in tests (the house's known gate gap), so the
// wiring is pinned by source + pure-function checks, so a future
// edit cannot silently unwire a toggle, a home, or a preview.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shiftHue } from '../lib/building/piece-render.js';
import {
  backpackIconKeys,
  backpackIconPxToFrac,
  backpackIconFracToPx,
  BACKPACK_ICON_SIZE,
  BACKPACK_ICON_UI_STATE_KEY,
  BACKPACK_ICON_UI_STATE_KEY_V2,
} from '../lib/backpack/icon.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const e2 = () => read('components/earth2/Earth2World.jsx');
const hud = () => read('components/backpack/BackpackHud.jsx');

// ── 1. Whole-orb toggle ──────────────────────────────────────
test('E2Panel: a still press anywhere on the minimized orb expands it', () => {
  const src = e2();
  // The drag's pointer-up toggles when nothing moved — the face
  // itself is the target, not just the ＋ badge.
  assert.ok(src.includes('if (collapsed) onToggle();'), 'still press on orb toggles');
  // A real drag never toggles: the moved branch records the drag
  // end and returns before any toggle.
  assert.ok(src.includes('dragEndRef.current = Date.now();'), 'drag end recorded');
  // The badge keeps its own tap (pointerdown stands down over
  // buttons), so it can never double-toggle with the face.
  assert.ok(src.includes("e.target.closest('button, a, input, select, textarea, label')"), 'buttons keep own taps');
});

// ── 2. Header dead-space minimize ────────────────────────────
test('E2Panel: dead space on an expanded header minimizes; buttons and title do not', () => {
  const src = e2();
  assert.ok(src.includes('onClick={onHeaderClick}'), 'header row carries the click handler');
  assert.ok(src.includes('data-e2-panel-title'), 'title block is marked');
  assert.ok(src.includes("if (e.target.closest('[data-e2-panel-title]')) return;"), 'title text excluded');
  assert.ok(src.includes('if (Date.now() - dragEndRef.current < 150) return;'), 'post-drag click swallowed');
  assert.ok(src.includes('onToggle();'), 'dead space toggles');
});

test('Backpack dialog: dead-space header click closes it (opt-in, title/button excluded)', () => {
  const src = hud();
  assert.ok(src.includes('headerDeadSpaceMinimize'), 'opt-in prop exists');
  assert.ok(src.includes('data-backpack-title'), 'dialog title marked');
  assert.ok(src.includes("if (e.target.closest('[data-backpack-title]')) return;"), 'dialog title excluded');
});

// ── 3. Backpack home ─────────────────────────────────────────
test('Backpack home keys: homed mounts read v2, plain mounts read v1', () => {
  assert.deepEqual(backpackIconKeys(false), { storage: 'olympus:backpack-icon:v1', uiState: BACKPACK_ICON_UI_STATE_KEY });
  assert.deepEqual(backpackIconKeys(true), { storage: 'olympus:backpack-icon:v2', uiState: BACKPACK_ICON_UI_STATE_KEY_V2 });
});

test('Backpack home slot: (78, 10) px sits right of the top-left orb on a phone', () => {
  const vw = 390;
  const vh = 844;
  const home = backpackIconPxToFrac({ x: 78, y: 10 }, vw, vh, BACKPACK_ICON_SIZE);
  assert.ok(home.x >= 0 && home.x <= 1 && home.y >= 0 && home.y <= 1, 'fractions in range');
  const back = backpackIconFracToPx(home, vw, vh, BACKPACK_ICON_SIZE);
  assert.ok(Math.abs(back.x - 78) < 1 && Math.abs(back.y - 10) < 1, 'round-trips to the home pixels');
  // The top-left orb spans x 10–66 (56 px wide); 78 leaves a 12 px gap.
  assert.ok(back.x >= 66 + 8, 'clear of the orb, not on top of it');
});

test('Earth 2: exactly one backpack mount, homed, at top level — not inside CONTROLS', () => {
  const src = e2();
  const instances = src.match(/<BackpackHud/g) || [];
  assert.equal(instances.length, 1, 'one BackpackHud instance on Earth 2');
  assert.ok(src.includes('homeFractions={e2BackpackHome}'), 'home passed');
  assert.ok(src.includes('headerDeadSpaceMinimize'), 'dialog dead-space passed');
  assert.ok(!src.includes('your pack follows you here'), 'old in-panel row removed');
  // The homed mount reads the v2 pair, so the pre-home parked
  // spot (bottom-centre in his video) can never pull it back.
  const h = hud();
  assert.ok(h.includes('backpackIconKeys(docked || homeFractions != null)'), 'homed mounts read v2');
  assert.ok(h.includes('fallback: homeFractions'), 'home is the fallback until dragged');
});

test('BackpackHud: non-homed mounts are untouched (v1, bottom-left default)', () => {
  const h = hud();
  assert.ok(h.includes('backpackIconKeys(docked || homeFractions != null)'), 'keys derive from props');
  assert.ok(h.includes('defaultBackpackIconFractions(window.innerWidth, window.innerHeight, BACKPACK_ICON_SIZE)'), 'plain fallback kept');
});

// ── 4. Finish-accurate preview ────────────────────────────────
test('shiftHue: the placed piece colour — no shift returns the finish, a shift moves it', () => {
  assert.equal(shiftHue(0x9a6b41, 0), 0x9a6b41, 'timber unshifted');
  assert.equal(shiftHue(0x9a6b41, null), 0x9a6b41, 'natural tint unshifted');
  assert.notEqual(shiftHue(0x9a6b41, 180), 0x9a6b41, '180° shift moves timber');
  assert.equal(shiftHue(0x808080, 90), 0x808080, 'achromatic grey has no hue to shift');
  assert.equal(shiftHue(0x23232b, 0), 0x23232b, 'obsidian unshifted');
});

test('Earth 2 build panel: preview sits above the categories and wears the finish', () => {
  const src = e2();
  const previewAt = src.indexOf('Piece preview — just above the object category');
  const catsAt = src.indexOf('PIECE_CATEGORIES.map((cat)');
  const gridAt = src.indexOf('grid grid-cols-2 gap-1.5');
  assert.ok(previewAt > 0, 'preview block exists');
  assert.ok(previewAt < catsAt, 'preview above the category chips');
  assert.ok(catsAt < gridAt, 'categories above the item grid');
  // The silhouette wears the finish colour, hue-shifted by tint —
  // the same shiftHue the placed piece wears — not emerald, not text.
  assert.ok(src.includes("import { buildPieceGroup, buildGhostGroup, setGhostValidity, shiftHue } from '@/lib/building/piece-render'"), 'shiftHue imported');
  assert.ok(src.includes('shiftHue(selFinishDef.tint, selTint'), 'preview colour derives from finish + tint');
  assert.ok(src.includes('fill={previewFillCss}'), 'silhouette filled with the finish colour');
  assert.ok(src.includes('stroke={previewFillCss}'), 'silhouette stroked with the finish colour');
  // The old text-only preview below the grid is gone.
  assert.ok(!src.includes('fill-emerald-400/30 stroke-emerald-200'), 'old emerald-only footprint removed');
});
