// lib/fullscreen-env.js — pure, headless-testable environment classification
// for ride fullscreen / focus mode. No DOM, no React; the hook in
// lib/use-fullscreen.js owns the DOM calls.
//
// Honest capability model (never fake fullscreen):
//   'native'      — Fullscreen API present (desktop Chrome/Safari, Android
//                   Chrome): requestFullscreen() on the game container works.
//   'focus-only'  — iOS Safari: NO element-fullscreen API exists (only
//                   <video> gets webkitEnterFullscreen). Honest best available
//                   is focus mode: hide page chrome + try orientation lock.
//   'unsupported' — neither available.

export function isIOSDevice(nav) {
  try {
    if (!nav) return false;
    const ua = nav.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua)) return true;
    // iPadOS in desktop mode reports MacIntel + touch points.
    return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
  } catch {
    return false;
  }
}

/**
 * Classify the environment — no DOM side effects, unit-testable.
 * Returns { mode: 'native' | 'focus-only' | 'unsupported', message }.
 */
export function classifyFullscreenEnv({ hasRequestFullscreen, isIOS }) {
  if (hasRequestFullscreen && !isIOS) {
    return { mode: 'native', message: '' };
  }
  if (isIOS) {
    return {
      mode: 'focus-only',
      message: 'iPhone Safari has no true fullscreen — hiding ride chrome instead.',
    };
  }
  return {
    mode: 'unsupported',
    message: 'Fullscreen is not available in this browser.',
  };
}
