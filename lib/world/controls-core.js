// lib/world/controls-core.js — the UNIVERSAL CONTROLS CORE (Merlin,
// Nov 16 ~03:49). ONE shared implementation of the confirmed universal
// controls that every world consumes — no per-world copies of the
// control layer. Worlds keep their own content (vehicles, monsters,
// art); the controls come from the core.
//
// The confirmed layout (Merlin, Nov 16 ~03:39 + ~03:49):
//   · joystick FIXED bottom-left — works, never moves, never docked.
//   · right column, top-to-bottom: BACKPACK / JUMP / FIRE. FIRE =
//     ATTACK: fires the weapon in the user's backpack and wears a
//     reticle face. A world shows only the slots it actually has —
//     a world with no backpack shows no BACKPACK orb, a world with
//     no weapon shows no FIRE orb. Nothing is invented for a world.
//   · ORBS counter orb beside the HP pill, top-left; clicking it
//     opens the merchant for upgrades.
//   · control-instructions hint pill, fades after 5 seconds.
//   · auto-center recenter (recenterLookOffset, LOOK_RECENTER_RATE
//     0.8 in lib/planet-walker.js — PERFECT, do not touch it or its
//     wiring): consumed here, never re-implemented.
//   · finger-follows drag-look + joystick (drag right → look right,
//     push right → go right): the shared helpers from
//     lib/planet-walker.js, consumed here.
//   · the shared orb dock (lib/world/orb-dock.js): the right-column
//     orbs drag individually and persist per world.
//   · per-function button faces (components/world/OrbButton.jsx,
//     ORB_FUNCTIONS, TRON house style): JUMP wears tron-jump, FIRE
//     wears tron-reticle. BACKPACK and ORBS have no TRON face yet, so
//     they wear their text/icon children until one is drawn — the
//     circle stays a plain circle either way.
//
// This module is PURE (no DOM, no React, no THREE): layout
// constants, the hint clock, the per-world config, and the
// drag-look step. The React half is components/world/ControlsCore.jsx.
// Node tests drive this module directly (tests/controls-core.test.mjs).

import {
  lookTurnForDrag,
  dampLookAngle,
  recenterLookOffset,
  LOOK_RECENTER_RATE,
} from '../planet-walker.js';

// Re-exported, not re-implemented: the shared helpers the core
// consumes. Scenes and vehicles call these through the core's
// dragLookStep below (or directly, as the Moon / Earth-walk
// walker already does) — there is exactly one definition of
// each, in lib/planet-walker.js.
export { lookTurnForDrag, dampLookAngle, recenterLookOffset, LOOK_RECENTER_RATE };

/** The control-instructions hint pill fades after 5 seconds. */
export const CONTROLS_HINT_FADE_MS = 5000;
/** The fade itself: the last 500 ms of the 5 s window. */
export const CONTROLS_HINT_FADE_OUT_MS = 500;

/** True while the hint pill is still on screen (elapsed ms since mount). */
export function hintVisibleAt(elapsedMs, fadeMs = CONTROLS_HINT_FADE_MS) {
  return (elapsedMs || 0) < fadeMs;
}

/** Hint opacity 0..1: full until the fade-out window, then linear to 0. */
export function hintOpacityAt(elapsedMs, fadeMs = CONTROLS_HINT_FADE_MS) {
  const el = Math.max(elapsedMs || 0, 0);
  if (el < fadeMs - CONTROLS_HINT_FADE_OUT_MS) return 1;
  if (el >= fadeMs) return 0;
  return 1 - (el - (fadeMs - CONTROLS_HINT_FADE_OUT_MS)) / CONTROLS_HINT_FADE_OUT_MS;
}

/**
 * The right column, top-to-bottom — the confirmed order. A world
 * shows the slots it has; the order never changes.
 */
export const RIGHT_COLUMN_SLOTS = ['backpack', 'jump', 'fire'];

/** The orb ids the dock tracks for one world (same order as the column). */
export function dockOrbIdsFor(slots = RIGHT_COLUMN_SLOTS) {
  return slots.filter((s) => RIGHT_COLUMN_SLOTS.includes(s));
}

/** Joystick home: fixed bottom-left, 14 px off each edge (the Moon /
// Earth-walk / Earth 3 / Earth 4 home — the same spot everywhere).
// The component adds env(safe-area-inset-bottom) under it, so the
// stick clears the home indicator in fullscreen (the Earth 3 /
// Earth 4 bespoke sticks did the same). */
export const JOYSTICK_HOME = { left: 14, bottom: 14 };
/** Joystick size px (the shared WalkJoystick default is 120; the
// core uses 124, the Earth 3 / Earth 4 bespoke sticks' size, so the
// swap changes nothing under the finger). */
export const JOYSTICK_SIZE = 124;

/**
 * Right-column home slots, px from the stage's right/bottom edges
 * (56 px orbs, 10 px gaps — the Jupiter 2 JUMP/BOOST stack's
 * spacing). Bottom-anchored, so the column reads top-to-bottom
 * BACKPACK / JUMP / FIRE: FIRE sits on the floor, JUMP above it,
 * BACKPACK on top. A world whose stage already carries a
 * bottom-right button row (Earth 3's FLY/TOUR row, Earth 4's
 * FLY row) parks the column above it via `columnBottom`.
 */
export const ORB_SIZE = 56;
export const ORB_GAP = 10;
export function rightColumnHomeSlots(columnBottom = 14) {
  const step = ORB_SIZE + ORB_GAP;
  return {
    fire: { right: 14, bottom: columnBottom },
    jump: { right: 14, bottom: columnBottom + step },
    backpack: { right: 14, bottom: columnBottom + 2 * step },
  };
}

/** Default accent (the OrbButton default) when a world passes none. */
export const CONTROLS_DEFAULT_ACCENT = '#e8a35c';

/**
 * Resolve one world's core config: what the world passes in, what
 * the core owns. Unknown keys are dropped, never trusted; every
 * show-flag defaults to false except the joystick, which defaults
 * to on — a world opts IN to each slot it actually has, so a world
 * with no backpack, no weapon and no merchant shows a joystick and
 * a JUMP orb and nothing invented.
 *
 *   world (required): the dock key slug ('mars-2', 'new-earth',
 *     'earth-4', …) — one `olympus:<world>:orb-dock:v1` key.
 *   accent: the world's orb accent colour.
 *   showJoystick (default true), showJump, showFire, showBackpack,
 *     showHpOrbs, showFullscreen, showHint (each default false
 *     except the joystick).
 *   columnBottom: px offset of the right column's floor (default
 *     14; worlds with a bottom-right button row pass a higher floor).
 *   hint: the instruction text, or null for no hint pill.
 *   hp / orbs: numbers for the top-left pill, or null.
 */
export function resolveControlsCore(input = {}) {
  const world = typeof input.world === 'string' ? input.world.trim() : '';
  if (!world) throw new Error('controls-core: world is required (the orb-dock key slug)');
  const on = (v, dflt) => (v === undefined ? dflt : !!v);
  const columnBottom = Number.isFinite(input.columnBottom) && input.columnBottom >= 0
    ? Math.round(input.columnBottom)
    : 14;
  return {
    world,
    accent: typeof input.accent === 'string' && input.accent ? input.accent : CONTROLS_DEFAULT_ACCENT,
    showJoystick: on(input.showJoystick, true),
    showJump: on(input.showJump, false),
    showFire: on(input.showFire, false),
    showBackpack: on(input.showBackpack, false),
    showHpOrbs: on(input.showHpOrbs, false),
    showFullscreen: on(input.showFullscreen, false),
    showHint: on(input.showHint, false),
    columnBottom,
    hint: typeof input.hint === 'string' && input.hint ? input.hint : null,
    hp: Number.isFinite(input.hp) ? input.hp : null,
    orbs: Number.isFinite(input.orbs) ? input.orbs : null,
  };
}

/** The right-column slots this config actually shows, in column order. */
export function visibleSlots(config) {
  const out = [];
  if (config.showBackpack) out.push('backpack');
  if (config.showJump) out.push('jump');
  if (config.showFire) out.push('fire');
  return out;
}

/** The dock orb ids this config actually drags. */
export function visibleDockOrbIds(config) {
  return dockOrbIdsFor(visibleSlots(config));
}

// ── finger-follows drag-look (the shared step) ─────────────────────
// The scenes that still run bespoke drag-look (Earth 3 / Earth 4 /
// Mars 2: fixed rad/px sensitivities, 0.0048 walk / 0.0042 fly)
// keep their feel this round — swapping in the shared full-swipe
// turn (180° per viewport width) changes the look speed under the
// finger and needs Merlin's phone check before it lands. This step
// is the shared shape for the next pass, tested here, so the
// conversion is a one-line call per scene when he says go:
//
//   const look = dragLookStep({ yaw: S.yaw, pitch: S.pitch },
//                             dx, dy, canvas.clientWidth);
//   S.yaw = look.yaw; S.pitch = look.pitch;
//
// Drag right → look right (yaw decreases, the three.js convention
// the scenes already use); drag up → look up (pitch rises).
// The tap-vs-drag threshold and tap handling stay the scene's own
// (Earth 3's plaque tap, Earth 4's species tap), untouched.

/** Pitch clamp for walk-mode drag-look (rad); fly mode uses 1.5. */
export const DRAG_LOOK_PITCH_LIMIT = 1.25;

export function dragLookStep(state, dx, dy, viewportWidthPx, pitchLimit = DRAG_LOOK_PITCH_LIMIT) {
  const yaw = (state.yaw || 0) - lookTurnForDrag(dx || 0, viewportWidthPx);
  const pitchRaw = (state.pitch || 0) - lookTurnForDrag(dy || 0, viewportWidthPx);
  const lim = Math.abs(pitchLimit) || DRAG_LOOK_PITCH_LIMIT;
  const pitch = Math.max(-lim, Math.min(lim, pitchRaw));
  return { yaw, pitch };
}

/**
 * Damp a drag-look target toward the live angle (finger tracking):
 * the 20/s shared ease from lib/planet-walker.js, one call.
 */
export function dampDragLook(current, target, dt) {
  return {
    yaw: dampLookAngle(current.yaw || 0, target.yaw || 0, dt),
    pitch: dampLookAngle(current.pitch || 0, target.pitch || 0, dt),
  };
}
