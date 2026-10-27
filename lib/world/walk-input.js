// lib/world/walk-input.js — DOM input bindings for lib/world/walk-controls.js.
//
// Vanilla JS (no framework): keyboard state + drag-look. The React joystick
// lives in components/world/WalkJoystick.jsx. All helpers are attach/detach
// pairs so worlds can clean up on unmount.

/**
 * Keyboard movement state. Returns { state, attach(), detach() }.
 * state: { fwd, strafe, sprint, jump } — jump is true for exactly one
 * keydown (edge-triggered); the caller must clear it after consuming
 * (consumeJump() does that).
 */
export function createKeyInput() {
  const keys = new Set();
  const state = { fwd: 0, strafe: 0, sprint: false, jump: false };

  function recompute() {
    const f = (keys.has('keyw') || keys.has('arrowup') ? 1 : 0)
            - (keys.has('keys') || keys.has('arrowdown') ? 1 : 0);
    const s = (keys.has('keyd') || keys.has('arrowright') ? 1 : 0)
            - (keys.has('keya') || keys.has('arrowleft') ? 1 : 0);
    state.fwd = f;
    state.strafe = s;
    state.sprint = keys.has('shiftleft') || keys.has('shiftright');
  }

  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (k === ' ') {
      if (!e.repeat) state.jump = true;
      e.preventDefault();
      return;
    }
    const code = e.code.toLowerCase();
    if (['keyw','keya','keys','keyd','arrowup','arrowdown','arrowleft','arrowright','shiftleft','shiftright'].includes(code)) {
      keys.add(code);
      recompute();
      if (code.startsWith('arrow')) e.preventDefault();
    }
  }
  function onKeyUp(e) {
    keys.delete(e.code.toLowerCase());
    recompute();
  }
  function onBlur() { keys.clear(); recompute(); state.jump = false; }

  return {
    state,
    consumeJump() { const j = state.jump; state.jump = false; return j; },
    attach() {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
    },
    detach() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      keys.clear();
    },
  };
}

/**
 * Drag-to-look on a canvas/element. Mouse drag on desktop, single-finger
 * drag on touch (the joystick handles movement separately).
 * onLook(dx, dy) receives pixel deltas. Returns detach().
 *
 * A quick tap (small movement, short time) is NOT treated as a look drag:
 * onTap(x, y) fires instead so worlds keep tap-to-interact.
 */
export function attachDragLook(el, { onLook, onTap, sens = 1 } = {}) {
  if (!el) return () => {};
  let pid = null, lx = 0, ly = 0, dx0 = 0, dy0 = 0, t0 = 0, moved = 0;
  // Tap rule (Earth 2 v3, 2026-10-24): a tap lifts within 500 ms and
  // within 10 px of where it landed, judged by ENDPOINT displacement
  // — a jittery finger that never leaves the spot still counts.
  // The old 300 ms window silently dropped slow one-handed taps
  // (e.g. while holding a controller), reclassifying them as
  // drag-look so strikes never fired and nothing said why.
  const TAP_MS = 500, TAP_PX = 10;

  function down(e) {
    if (pid !== null) return;
    pid = e.pointerId;
    lx = dx0 = e.clientX; ly = dy0 = e.clientY;
    t0 = performance.now(); moved = 0;
    try { el.setPointerCapture(e.pointerId); } catch {}
  }
  function move(e) {
    if (e.pointerId !== pid) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (onLook && moved > 2) onLook(dx * sens, dy * sens);
  }
  function up(e) {
    if (e.pointerId !== pid) return;
    pid = null;
    const dt = performance.now() - t0;
    const dist = Math.hypot(e.clientX - dx0, e.clientY - dy0);
    if (onTap && dt < TAP_MS && dist < TAP_PX) onTap(e.clientX, e.clientY);
  }
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
}
