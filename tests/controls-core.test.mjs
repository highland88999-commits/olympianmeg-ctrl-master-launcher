// Universal Controls Core regression guard (Merlin, Nov 16 ~03:49).
//
// The confirmed universal controls, one shared implementation:
//   · joystick fixed bottom-left (never moves, never docked);
//   · right column top-to-bottom BACKPACK / JUMP / FIRE;
//   · ORBS counter orb beside the HP pill, top-left, opens the merchant;
//   · hint pill fades after 5 seconds;
//   · auto-center recenter (recenterLookOffset, 0.8) consumed, never
//     re-implemented; finger-follows drag-look from the shared helpers.
// Pure-lib tests drive lib/world/controls-core.js directly; source
// guards pin the React half and the three wired worlds (Mars 2,
// Earth 3, Earth 4). No per-world copies of the control layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CONTROLS_HINT_FADE_MS,
  CONTROLS_HINT_FADE_OUT_MS,
  hintVisibleAt,
  hintOpacityAt,
  RIGHT_COLUMN_SLOTS,
  dockOrbIdsFor,
  JOYSTICK_HOME,
  JOYSTICK_SIZE,
  ORB_SIZE,
  ORB_GAP,
  rightColumnHomeSlots,
  resolveControlsCore,
  visibleSlots,
  visibleDockOrbIds,
  dragLookStep,
  dampDragLook,
  DRAG_LOOK_PITCH_LIMIT,
  lookTurnForDrag,
  recenterLookOffset,
  LOOK_RECENTER_RATE,
} from '../lib/world/controls-core.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const coreJsx = read('../components/world/ControlsCore.jsx');
const mars2 = read('../app/mars-2/page.jsx');
const earth3 = read('../app/new-earth/page.jsx');
const earth4 = read('../app/earth-4/page.jsx');

// ── hint clock: 5 s, fade over the last 500 ms ──────────────────────

test('hint fades after 5 seconds (500 ms fade-out)', () => {
  assert.equal(CONTROLS_HINT_FADE_MS, 5000);
  assert.equal(CONTROLS_HINT_FADE_OUT_MS, 500);
  assert.equal(hintVisibleAt(0), true);
  assert.equal(hintVisibleAt(4499), true);
  assert.equal(hintVisibleAt(5000), false);
  assert.equal(hintVisibleAt(99999), false);
  assert.equal(hintOpacityAt(0), 1);
  assert.equal(hintOpacityAt(4499), 1);
  assert.equal(hintOpacityAt(5000), 0);
  const mid = hintOpacityAt(4750);
  assert.ok(mid > 0 && mid < 1, `mid-fade opacity ${mid} must be between 0 and 1`);
});

test('ControlsCore.jsx fades the hint on the same 5 s clock', () => {
  assert.match(coreJsx, /CONTROLS_HINT_FADE_MS/);
  assert.match(coreJsx, /CONTROLS_HINT_FADE_OUT_MS/);
  assert.match(coreJsx, /transition: 'opacity 500ms ease'/);
});

// ── right column: BACKPACK / JUMP / FIRE, top-to-bottom ─────────────

test('right column order is BACKPACK / JUMP / FIRE, never reordered', () => {
  assert.deepEqual(RIGHT_COLUMN_SLOTS, ['backpack', 'jump', 'fire']);
  assert.deepEqual(dockOrbIdsFor(), ['backpack', 'jump', 'fire']);
  assert.deepEqual(dockOrbIdsFor(['fire', 'jump']), ['fire', 'jump']);
});

test('right-column home slots stack FIRE on the floor, JUMP above, BACKPACK on top', () => {
  assert.equal(ORB_SIZE, 56);
  assert.equal(ORB_GAP, 10);
  const slots = rightColumnHomeSlots(14);
  assert.deepEqual(slots.fire, { right: 14, bottom: 14 });
  assert.deepEqual(slots.jump, { right: 14, bottom: 80 });
  assert.deepEqual(slots.backpack, { right: 14, bottom: 146 });
  // A world with a bottom-right button row parks the column above it.
  const raised = rightColumnHomeSlots(80);
  assert.deepEqual(raised.fire, { right: 14, bottom: 80 });
  assert.deepEqual(raised.jump, { right: 14, bottom: 146 });
  assert.deepEqual(raised.backpack, { right: 14, bottom: 212 });
});

test('joystick home is fixed bottom-left, 14 px off each edge', () => {
  assert.deepEqual(JOYSTICK_HOME, { left: 14, bottom: 14 });
  assert.equal(JOYSTICK_SIZE, 124);
});

// ── config: opt-in per slot, nothing invented ───────────────────────

test('resolveControlsCore requires a world slug and opts in per slot', () => {
  assert.throws(() => resolveControlsCore({}), /world is required/);
  assert.throws(() => resolveControlsCore({ world: '   ' }), /world is required/);
  const bare = resolveControlsCore({ world: 'mars-2' });
  assert.equal(bare.world, 'mars-2');
  assert.equal(bare.showJoystick, true);
  assert.equal(bare.showJump, false);
  assert.equal(bare.showFire, false);
  assert.equal(bare.showBackpack, false);
  assert.equal(bare.showHpOrbs, false);
  assert.equal(bare.showFullscreen, false);
  assert.equal(bare.showHint, false);
  assert.equal(bare.columnBottom, 14);
  assert.equal(bare.hint, null);
  assert.equal(bare.hp, null);
  assert.equal(bare.orbs, null);
  // Unknown keys are dropped, never trusted.
  assert.equal('evil' in resolveControlsCore({ world: 'mars-2', evil: 1 }), false);
});

test('resolveControlsCore keeps the world accent and the slots it opts into', () => {
  const cfg = resolveControlsCore({
    world: 'new-earth', accent: '#7ddf9a', showJump: true, showFullscreen: true,
    showHint: true, hint: 'Drag to look', columnBottom: 80, hp: 100, orbs: 3,
  });
  assert.equal(cfg.accent, '#7ddf9a');
  assert.equal(cfg.columnBottom, 80);
  assert.equal(cfg.hint, 'Drag to look');
  assert.equal(cfg.hp, 100);
  assert.equal(cfg.orbs, 3);
  assert.deepEqual(visibleSlots(cfg), ['jump']);
  assert.deepEqual(visibleDockOrbIds(cfg), ['jump']);
  const full = resolveControlsCore({
    world: 'jupiter-2', showBackpack: true, showJump: true, showFire: true,
  });
  assert.deepEqual(visibleSlots(full), ['backpack', 'jump', 'fire']);
});

// ── drag-look: finger-follows, shared helpers, never re-implemented ─

test('dragLookStep: drag right looks right, drag up looks up (shared full-swipe turn)', () => {
  const w = 390;
  const right = dragLookStep({ yaw: 0, pitch: 0 }, w, 0, w);
  assert.ok(Math.abs(right.yaw + Math.PI) < 1e-9, `full-width drag right turns -PI, got ${right.yaw}`);
  assert.equal(right.pitch, 0);
  const up = dragLookStep({ yaw: 0, pitch: 0 }, 0, -w, w);
  assert.ok(up.pitch > 0, 'drag up raises the pitch');
  assert.equal(up.yaw, 0);
  // No viewport, no turn — never NaN.
  assert.deepEqual(dragLookStep({ yaw: 1, pitch: 0.5 }, 100, 100, 0), { yaw: 1, pitch: 0.5 });
});

test('dragLookStep clamps pitch (walk 1.25, fly 1.5)', () => {
  assert.equal(DRAG_LOOK_PITCH_LIMIT, 1.25);
  const over = dragLookStep({ yaw: 0, pitch: 0 }, 0, -100000, 390);
  assert.equal(over.pitch, 1.25);
  const fly = dragLookStep({ yaw: 0, pitch: 0 }, 0, -100000, 390, 1.5);
  assert.equal(fly.pitch, 1.5);
});

test('dampDragLook eases toward the target (the shared 20/s finger tracking)', () => {
  const eased = dampDragLook({ yaw: 0, pitch: 0 }, { yaw: 1, pitch: 1 }, 0.05);
  assert.ok(eased.yaw > 0 && eased.yaw < 1);
  assert.ok(eased.pitch > 0 && eased.pitch < 1);
  assert.deepEqual(dampDragLook({ yaw: 1, pitch: 2 }, { yaw: 1, pitch: 2 }, 0), { yaw: 1, pitch: 2 });
});

test('recenter is consumed, not re-implemented: the shared 0.8 rate, dt=0 is identity', () => {
  assert.equal(LOOK_RECENTER_RATE, 0.8);
  assert.deepEqual(recenterLookOffset({ yaw: 1, pitch: 0.5 }, 0), { yaw: 1, pitch: 0.5 });
  const settled = recenterLookOffset({ yaw: 1, pitch: 0.5 }, 60);
  assert.ok(Math.abs(settled.yaw) < 1e-9 && Math.abs(settled.pitch) < 1e-9);
  // The core imports lookTurnForDrag from lib/planet-walker.js — one definition.
  assert.equal(lookTurnForDrag(390, 390), Math.PI);
});

// ── the React half composes the shared pieces, nothing bespoke ──────

test('ControlsCore.jsx composes WalkJoystick + OrbButton + useOrbDock (no bespoke stick, no raw buttons)', () => {
  assert.match(coreJsx, /import WalkJoystick from '@\/components\/world\/WalkJoystick'/);
  assert.match(coreJsx, /import OrbButton, \{ OrbLabel \} from '@\/components\/world\/OrbButton'/);
  assert.match(coreJsx, /import \{ useOrbDock \} from '@\/components\/world\/useOrbDock'/);
  assert.match(coreJsx, /resolveControlsCore/);
  assert.match(coreJsx, /rightColumnHomeSlots/);
  assert.match(coreJsx, /fn="jump"/);
  assert.match(coreJsx, /fn="fire"/);
  assert.match(coreJsx, /ariaLabel="Open backpack"/);
  assert.match(coreJsx, /Open merchant for upgrades/);
  assert.match(coreJsx, /position: 'absolute', right: 14, top: 14 \+ topOffsetPx, zIndex: 9/);
  // The offset defaults to 0, so every world without a header strip
  // still reads the orb at exactly 14 px down (Mars 2's compass
  // passes 54 to drop it below the strip).
  assert.match(coreJsx, /topOffsetPx = 0/);
  assert.doesNotMatch(coreJsx, /<button/);
  assert.doesNotMatch(coreJsx, /borderRadius: '50%'|border-radius: 50%/);
  // The overlay never eats canvas drags: pointer-events none on the
  // container, auto only on the controls themselves.
  assert.match(coreJsx, /pointerEvents: 'none'/);
  assert.match(coreJsx, /pointerEvents: 'auto'/);
});

test('ControlsCore.jsx never re-implements the dock, the joystick, or the recenter', () => {
  // Code lines only — the header comment names the shared pieces it consumes.
  const code = coreJsx.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(code, /localStorage/);
  assert.doesNotMatch(code, /recenterLookOffset|LOOK_RECENTER_RATE/);
  assert.doesNotMatch(code, /setPointerCapture/);
});

// ── wiring: Mars 2 / Earth 3 / Earth 4 consume the core ─────────────

test('Mars 2 consumes the core: joystick + JUMP, rover controls untouched', () => {
  assert.match(mars2, /import ControlsCore from "@\/components\/world\/ControlsCore"/);
  assert.match(mars2, /<ControlsCore/);
  assert.match(mars2, /world="mars-2"/);
  assert.match(mars2, /\(\) => \{ jumpRef\.current = true; \}/);
  assert.match(mars2, /summonRover/);
  assert.match(mars2, /dismountRover/);
  // The old standalone JUMP orb is gone (the core owns JUMP now).
  assert.doesNotMatch(mars2, /<OrbButton ariaLabel="Jump" size=\{76\}/);
});

test('Earth 3 consumes the core: no bespoke Joystick copy, JUMP from the core, fly/tour stay', () => {
  assert.match(earth3, /import ControlsCore from "@\/components\/world\/ControlsCore"/);
  assert.match(earth3, /<ControlsCore/);
  assert.match(earth3, /world="new-earth"/);
  assert.match(earth3, /columnBottom=\{80\}/);
  assert.doesNotMatch(earth3, /function Joystick\(/);
  assert.doesNotMatch(earth3, /ne-stick|ne-knob/);
  assert.doesNotMatch(earth3, /ariaLabel="Jump" onPointerDown=\{\(\) => worldRef\.current && worldRef\.current\.jump\(\)\}/);
  // World-specific controls stay: FLY, TOUR, ascend/descend, claim.
  assert.match(earth3, /toggleFly/);
  assert.match(earth3, /toggleTour/);
  assert.match(earth3, /claimCurrentTile/);
});

test('Earth 4 consumes the core: no bespoke Joystick copy, JUMP from the core, fly stays', () => {
  assert.match(earth4, /import ControlsCore from "@\/components\/world\/ControlsCore"/);
  assert.match(earth4, /<ControlsCore/);
  assert.match(earth4, /world="earth-4"/);
  assert.match(earth4, /columnBottom=\{80\}/);
  assert.doesNotMatch(earth4, /function Joystick\(/);
  assert.doesNotMatch(earth4, /e4-stick|e4-knob/);
  assert.doesNotMatch(earth4, /ariaLabel="Jump" onPointerDown=\{\(\) => worldRef\.current && worldRef\.current\.jump\(\)\}/);
  assert.match(earth4, /toggleFly/);
  assert.match(earth4, /goToMyLocation/);
  assert.match(earth4, /goHome/);
});
