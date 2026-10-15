// lib/webgl-support.js — Pre-flight WebGL capability probe for the 3D hub.
//
// three.js (r164) throws "Error creating WebGL context." synchronously when
// a visitor's browser cannot create a WebGL context (crawlers, scanners,
// GPU-blocklisted or very old browsers). Before this probe existed, that
// throw escaped the R3F Canvas mount and hit the app's global error
// boundary, which replaces the ENTIRE homepage — DOM UI included — with
// the error screen (client_errors class B: 47 rows since 2026-10-01, the
// site's #1 client error; investigation 2026-10-14).
//
// probeWebGL() asks the browser for a throwaway context the same way the
// renderer will, then immediately releases it via WEBGL_lose_context so
// the probe never counts against the browser's live-context limit. The
// verdict is memoized: capability does not change mid-session (a live
// context LOSS later is a different event, handled on the canvas itself).

let cachedVerdict = null;

export function probeWebGL(doc) {
  if (cachedVerdict !== null) return cachedVerdict;
  let ok = false;
  try {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (d) {
      const canvas = d.createElement('canvas');
      let gl = null;
      try {
        gl = canvas.getContext('webgl2');
      } catch {
        gl = null;
      }
      if (!gl) {
        try {
          gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        } catch {
          gl = null;
        }
      }
      if (gl) {
        ok = true;
        try {
          const lose = gl.getExtension && gl.getExtension('WEBGL_lose_context');
          if (lose) lose.loseContext();
        } catch {
          /* releasing the probe context is best-effort */
        }
      }
    }
  } catch {
    ok = false;
  }
  cachedVerdict = ok;
  return ok;
}

// Test hook: forget the memoized verdict so a fresh probe can run.
export function resetWebGLProbeCache() {
  cachedVerdict = null;
}

// Watch a LIVE canvas for WebGL context loss / restore (Kombat,
// 2026-10-14 — client_errors id 75: Merlin's own iPhone dropped the
// Kombat context mid-session; the probe above only covers CREATION
// failure). The lost handler calls preventDefault(), which is what
// allows the browser to fire webglcontextrestored later; three.js
// (r164) re-initializes its GL state on restore, so a transient loss
// (iOS memory pressure) can heal in place. Callers decide how long
// to wait before surfacing a recoverable failure to the player.
// Returns an unwatch function; safe on any canvas-like object.
export function watchContextLoss(canvas, handlers = {}) {
  if (!canvas || typeof canvas.addEventListener !== 'function') return () => {};
  let lost = false;
  const onLost = (event) => {
    try { event.preventDefault(); } catch { /* older engines */ }
    if (!lost) {
      lost = true;
      try { handlers.onLost && handlers.onLost(); } catch { /* handler errors stay out of the engine */ }
    }
  };
  const onRestored = () => {
    if (lost) {
      lost = false;
      try { handlers.onRestored && handlers.onRestored(); } catch { /* as above */ }
    }
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  return () => {
    if (typeof canvas.removeEventListener === 'function') {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    }
  };
}
