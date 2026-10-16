// lib/scene-context-guard.js — WebGL context-loss protection for every
// 3D scene in the launcher (fleet rollout, 2026-10-15).
//
// Evidence: client_errors id 75 (Kombat, Merlin's own iPhone,
// 2026-10-14) and id 76 (mega-city, 2026-10-15) — the same failure
// class in different scenes. The homepage (HomeScene) and the Kombat
// fight engines were protected first; this module carries the Kombat
// pattern to every other scene:
//
//   1. watchContextLoss (lib/webgl-support.js) sits on the live canvas.
//      A transient loss (iOS memory pressure) heals in place — three.js
//      re-initializes its GL state on webglcontextrestored, so nothing
//      is shown to the visitor at all.
//   2. If the context stays gone past the grace window (the same
//      3.5 s the Kombat build uses), a recoverable "FEED LOST" state
//      replaces the dead canvas: a clear notice + a reload-the-scene
//      button. Never a silent black canvas.
//   3. Capable browsers see zero change: the watcher is passive until
//      a loss actually happens, and the overlay only exists after one.
//
// The guard is framework-free DOM on purpose — raw three.js engines,
// hand-rolled WebGL shader scenes and React effect canvases all wire
// it the same way: guardCanvasContext(canvas, { label }) right after
// the renderer/context exists, dispose() in the scene's teardown.
// React Three Fiber scenes use components/SceneContextGuard.jsx,
// which wraps this same guard.
//
// Callers that run their own render loop should also gate their
// update/render step on guard.isLost() so a scene never plays out
// blind while its context is gone (the Kombat freeze law); the loop
// itself keeps scheduling so a restore resumes exactly where it froze.

import { watchContextLoss } from './webgl-support.js';

// How long a loss may last before it stops being "transient" and the
// recoverable state is surfaced. Matches the Kombat build (3.5 s).
export const CONTEXT_LOSS_GRACE_MS = 3500;

function buildOverlay(label, actionLabel, onReload) {
  const el = document.createElement('div');
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-label', `${label} feed lost`);
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99990',
    'background:rgba(5,5,5,0.93)',
    'display:flex', 'flex-direction:column', 'align-items:center',
    'justify-content:center', 'gap:14px', 'padding:24px',
    'text-align:center', 'color:#fff',
    "font-family:system-ui,-apple-system,'Segoe UI',sans-serif",
  ].join(';');

  const kicker = document.createElement('div');
  kicker.textContent = 'NEXUS VORTEX';
  kicker.style.cssText =
    'font-size:11px;letter-spacing:0.35em;color:#9ca3af;font-weight:600;';
  el.appendChild(kicker);

  const heading = document.createElement('div');
  heading.textContent = `${label} FEED LOST`;
  heading.style.cssText =
    'font-size:24px;font-weight:900;letter-spacing:0.12em;color:#f87171;';
  el.appendChild(heading);

  const note = document.createElement('p');
  note.textContent =
    'The 3D feed dropped on this device and has not come back. ' +
    'Reload the scene to pick it up again — nothing else on this page is affected.';
  note.style.cssText =
    'max-width:26rem;font-size:14px;line-height:1.55;color:#d1d5db;margin:0;';
  el.appendChild(note);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = actionLabel;
  button.style.cssText = [
    'margin-top:6px', 'padding:10px 22px', 'cursor:pointer',
    'background:transparent', 'color:#fff',
    'border:1px solid rgba(255,255,255,0.4)', 'border-radius:6px',
    'font-size:13px', 'font-weight:700', 'letter-spacing:0.2em',
  ].join(';');
  button.addEventListener('click', () => {
    try {
      if (typeof onReload === 'function') onReload();
      else window.location.reload();
    } catch {
      try { window.location.reload(); } catch { /* nowhere left to go */ }
    }
  });
  el.appendChild(button);
  return el;
}

// Watch one live canvas for context loss. Options:
//   label       — scene name for the fallback ("MEGA CITY FEED LOST").
//   actionLabel — reload button text (default "RELOAD SCENE").
//   graceMs     — unrecovered-loss window before the fallback shows.
//   onLost/onRestored — scene hooks (freeze/resume belong here).
//   onReload    — custom reload (default: full page reload).
//   overlayParent — element the fallback attaches to (default body).
// Returns { dispose, isLost, showFallback }. Safe on any canvas-like
// object and safe to call where document is unavailable (SSR): it
// simply never shows an overlay there.
//
// showFallback() exists for hand-rolled WebGL scenes (the shader
// toys): three.js re-initializes its own GL state when a context is
// restored, but a raw program/buffer set does NOT heal — those scenes
// pass onRestored: () => guard.showFallback() so a "restored" context
// still lands on the recoverable state instead of a black canvas.
export function guardCanvasContext(canvas, opts = {}) {
  const noop = { dispose() {}, isLost: () => false, showFallback() {} };
  if (!canvas || typeof canvas.addEventListener !== 'function') return noop;

  const graceMs =
    typeof opts.graceMs === 'number' ? opts.graceMs : CONTEXT_LOSS_GRACE_MS;
  const label = opts.label || '3D';
  const actionLabel = opts.actionLabel || 'RELOAD SCENE';

  let lost = false;
  let disposed = false;
  let timer = null;
  let overlay = null;

  const hideOverlay = () => {
    if (overlay) {
      try { overlay.remove(); } catch { /* already gone */ }
      overlay = null;
    }
  };
  const showOverlay = (force = false) => {
    if (disposed || overlay) return;
    if (!force && !lost) return;
    if (typeof document === 'undefined' || !document.body) return;
    try {
      overlay = buildOverlay(label, actionLabel, opts.onReload);
      (opts.overlayParent || document.body).appendChild(overlay);
    } catch {
      overlay = null; /* a scene that cannot show the fallback still heals on restore */
    }
  };

  const unwatch = watchContextLoss(canvas, {
    onLost: () => {
      lost = true;
      try { opts.onLost && opts.onLost(); } catch { /* hooks stay out of the engine */ }
      if (timer) clearTimeout(timer);
      timer = setTimeout(showOverlay, graceMs);
    },
    onRestored: () => {
      lost = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      hideOverlay();
      try { opts.onRestored && opts.onRestored(); } catch { /* as above */ }
    },
  });

  return {
    isLost: () => lost,
    showFallback: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      showOverlay(true);
    },
    dispose: () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      hideOverlay();
      unwatch();
    },
  };
}
