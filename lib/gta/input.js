// lib/gta/input.js — Unified keyboard + touch input for GTA gameplay.
// Keyboard: WASD/arrows move, Space jump/handbrake, Shift sprint, E enter/exit.
// Touch: left virtual joystick, right action buttons.

export function createInput() {
  const keys = {};
  const touch = {
    active: false,
    joyX: 0, joyY: 0, // -1..1
    jump: false, action: false, handbrake: false,
    camDX: 0, camDY: 0,
  };

  const state = {
    keys, touch,
    // Computed each frame
    moveX: 0, // -1 (left) .. 1 (right)
    moveY: 0, // -1 (back) .. 1 (forward)
    sprint: false,
    jump: false,
    action: false, // E / enter-exit
    handbrake: false,
  };

  function onKeyDown(e) {
    // Don't hijack typing in inputs
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    keys[e.code] = false;
  }

  // Call once per frame to compute derived state
  function update() {
    const k = keys;
    const t = touch;

    // Move axes from keyboard
    let mx = 0, my = 0;
    if (k['KeyA'] || k['ArrowLeft']) mx -= 1;
    if (k['KeyD'] || k['ArrowRight']) mx += 1;
    if (k['KeyW'] || k['ArrowUp']) my += 1;
    if (k['KeyS'] || k['ArrowDown']) my -= 1;

    // Touch joystick overrides/augments
    if (t.active) {
      mx += t.joyX;
      my += t.joyY;
    }

    // Clamp to unit circle
    const len = Math.sqrt(mx * mx + my * my);
    if (len > 1) { mx /= len; my /= len; }

    state.moveX = mx;
    state.moveY = my;
    state.sprint = !!(k['ShiftLeft'] || k['ShiftRight']);
    state.jump = !!(k['Space'] || t.jump);
    state.action = !!k['KeyE'] || t.action;
    state.handbrake = !!(k['Space'] || t.handbrake);

    // Clear one-shot touch buttons (they're edge-triggered)
    t.jump = false;
    t.action = false;

    return state;
  }

  function attach() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  function detach() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  }

  // Touch joystick setup — call with joystick element refs
  // Returns handlers for the joystick and buttons
  function bindTouch(joystickEl, onCamDrag) {
    let joyId = null;
    let joyStart = null;
    let camId = null;
    let camLast = null;

    const JOY_RADIUS = 50;

    function joyStartH(e) {
      const t = e.changedTouches[0];
      joyId = t.identifier;
      const r = joystickEl.getBoundingClientRect();
      joyStart = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      touch.active = true;
      e.preventDefault();
    }

    function joyMoveH(e) {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId && joyStart) {
          let dx = t.clientX - joyStart.x;
          let dy = t.clientY - joyStart.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > JOY_RADIUS) { dx = dx / len * JOY_RADIUS; dy = dy / len * JOY_RADIUS; }
          touch.joyX = dx / JOY_RADIUS;
          touch.joyY = -dy / JOY_RADIUS; // up = forward
          e.preventDefault();
        }
      }
    }

    function joyEndH(e) {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          joyId = null;
          touch.joyX = 0; touch.joyY = 0;
          touch.active = false;
        }
      }
    }

    // Camera drag on the right half (excluding buttons)
    function camStartH(e) {
      // Only if not on a button (buttons stopPropagation)
      const t = e.changedTouches[0];
      camId = t.identifier;
      camLast = { x: t.clientX, y: t.clientY };
    }

    function camMoveH(e) {
      for (const t of e.changedTouches) {
        if (t.identifier === camId && camLast) {
          touch.camDX = t.clientX - camLast.x;
          touch.camDY = t.clientY - camLast.y;
          camLast = { x: t.clientX, y: t.clientY };
          if (onCamDrag) onCamDrag(touch.camDX, touch.camDY);
          touch.camDX = 0; touch.camDY = 0;
        }
      }
    }

    function camEndH(e) {
      for (const t of e.changedTouches) {
        if (t.identifier === camId) { camId = null; camLast = null; }
      }
    }

    joystickEl.addEventListener('touchstart', joyStartH, { passive: false });
    window.addEventListener('touchmove', joyMoveH, { passive: false });
    window.addEventListener('touchend', joyEndH);
    window.addEventListener('touchcancel', joyEndH);

    return {
      camHandlers: {
        onTouchStart: camStartH,
        onTouchMove: camMoveH,
        onTouchEnd: camEndH,
      },
      cleanup() {
        joystickEl.removeEventListener('touchstart', joyStartH);
        window.removeEventListener('touchmove', joyMoveH);
        window.removeEventListener('touchend', joyEndH);
        window.removeEventListener('touchcancel', joyEndH);
      },
    };
  }

  return { state, update, attach, detach, bindTouch, keys, touch };
}
