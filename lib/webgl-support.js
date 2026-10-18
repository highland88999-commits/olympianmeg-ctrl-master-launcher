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
  cachedDiagnosis = null;
}

let cachedDiagnosis = null;

/**
 * Diagnose WHY WebGL is unavailable. Returns an object with:
 * - ok: boolean (same as probeWebGL)
 * - reason: machine-readable failure code
 * - detail: human-readable explanation
 * - ios: whether this looks like iOS Safari
 * - suggestion: specific recovery step for this failure
 */
export function diagnoseWebGL() {
  if (cachedDiagnosis !== null) return cachedDiagnosis;
  const result = { ok: false, reason: 'unknown', detail: '', ios: false, suggestion: '' };
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !/Windows/.test(ua);
    result.ios = isIOS;
    const d = typeof document !== 'undefined' ? document : null;
    if (!d) {
      result.reason = 'no-document';
      result.detail = 'No document object (SSR or worker)';
      result.suggestion = 'This is a server-side render — 3D requires a browser.';
    } else {
      const canvas = d.createElement('canvas');
      let gl2 = null, gl1 = null;
      let err2 = null, err1 = null;
      try { gl2 = canvas.getContext('webgl2'); } catch (e) { err2 = String(e && e.message || e); }
      if (!gl2) {
        try { gl1 = canvas.getContext('webgl') || canvas.getContext('experimental-webgl'); }
        catch (e) { err1 = String(e && e.message || e); }
      }
      const gl = gl2 || gl1;
      if (gl) {
        result.ok = true;
        result.reason = 'ok';
        result.detail = gl2 ? 'WebGL2 available' : 'WebGL1 available (WebGL2 unavailable)';
        try {
          const lose = gl.getExtension && gl.getExtension('WEBGL_lose_context');
          if (lose) lose.loseContext();
        } catch { /* best-effort */ }
      } else {
        // Both failed — figure out why
        if (isIOS) {
          result.reason = 'ios-gpu-unavailable';
          result.detail = 'iOS Safari could not create a WebGL context (webgl2: ' +
            (err2 || 'null') + ', webgl1: ' + (err1 || 'null') + ')';
          result.suggestion = 'Force-quit Safari (swipe up from app switcher), reopen, and try again. ' +
            'If that fails, restart your iPhone. Check Settings > Safari > Advanced > WebGL is enabled.';
        } else {
          result.reason = 'context-creation-failed';
          result.detail = 'Browser could not create WebGL context (webgl2: ' +
            (err2 || 'null') + ', webgl1: ' + (err1 || 'null') + ')';
          result.suggestion = 'Enable hardware acceleration in your browser settings and restart the browser.';
        }
      }
    }
  } catch (e) {
    result.reason = 'probe-threw';
    result.detail = 'Probe threw: ' + String(e && e.message || e);
    result.suggestion = 'Try a different browser.';
  }
  cachedDiagnosis = result;
  cachedVerdict = result.ok;
  return result;
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
