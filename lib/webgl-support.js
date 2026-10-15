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
