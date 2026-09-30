// lib/native.js — Capacitor capability layer with graceful web fallbacks.
//
// Mobile App v2 (2026-09-30). Everything here is safe to import on the server
// and on plain web: every native call is lazy (dynamic import inside the
// function), guarded by isNative(), wrapped in try/catch, and degrades to a
// web API or a silent no-op. Nothing here ever throws to the caller.
//
// Conventions:
// - isNative()  -> true only inside the real Capacitor shell (iOS/Android).
// - tap()       -> subtle haptic for key taps; native impact, else vibrate, else none.
// - confirm()   -> medium confirmation haptic.
// - patternHaptic(pattern) -> the shared channel for every haptic in the
//   launcher: native vibrate (total on-time) in the shell, navigator.vibrate
//   pattern on web, 'none' when unsupported.
// - shareContent -> Capacitor Share -> navigator.share -> clipboard -> {ok:false}.
// - parseDeepLink / initDeepLinks -> appUrlOpen + cold-start launch URL routing
//   for OASIS ?code= room codes and any other in-app path. Pages keep their own
//   ?code= joiners (useOasisJoinLink); this layer only navigates the shell to
//   the right URL.
import { Capacitor } from '@capacitor/core';

/** True only when running inside the real Capacitor native shell. */
export function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// --- haptics ---------------------------------------------------------------

let _hapticsMod = null;

/** Lazily loaded @capacitor/haptics module, or null on web / on failure. */
async function nativeHaptics() {
  if (!isNative()) return null;
  if (!_hapticsMod) {
    try {
      _hapticsMod = await import('@capacitor/haptics');
    } catch {
      return null;
    }
  }
  return _hapticsMod && _hapticsMod.Haptics ? _hapticsMod.Haptics : null;
}

/**
 * Subtle tap feedback for key taps. Keep it light — this is confirmation,
 * not a buzz. Never throws.
 * @returns {Promise<'native'|'vibrate'|'none'>} which channel actually fired.
 */
export async function tap() {
  try {
    const H = await nativeHaptics();
    if (H) {
      const { ImpactStyle } = _hapticsMod;
      await H.impact({ style: ImpactStyle ? ImpactStyle.Light : 'LIGHT' });
      return 'native';
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(8);
      return 'vibrate';
    }
  } catch {
    // haptics must never break the launcher
  }
  return 'none';
}

/**
 * Medium confirmation haptic (e.g. successful join / purchase step).
 * Never throws.
 * @returns {Promise<'native'|'vibrate'|'none'>}
 */
export async function confirm() {
  try {
    const H = await nativeHaptics();
    if (H) {
      const { ImpactStyle } = _hapticsMod;
      await H.impact({ style: ImpactStyle ? ImpactStyle.Medium : 'MEDIUM' });
      return 'native';
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(20);
      return 'vibrate';
    }
  } catch {
    // haptics must never break the launcher
  }
  return 'none';
}

/**
 * Fire a vibration PATTERN — the single shared channel for every haptic in
 * the launcher (lib/fx.js routes all its buzzes through here).
 *
 * - Inside the Capacitor shell: native Haptics. Capacitor has no pattern API,
 *   so the pattern fires as one native vibrate for the total on-time. The
 *   weight of the effect survives; the rhythm degrades gracefully on web it
 *   is exact via navigator.vibrate(pattern).
 * - On web: navigator.vibrate(pattern), which supports full patterns.
 * - Neither: 'none'.
 *
 * Never throws.
 * @param {number|number[]} pattern
 * @returns {Promise<'native'|'vibrate'|'none'>} which channel actually fired.
 */
export async function patternHaptic(pattern) {
  try {
    const total = Array.isArray(pattern)
      ? pattern.reduce((a, b) => a + b, 0)
      : pattern;
    const H = await nativeHaptics();
    if (H && typeof H.vibrate === 'function') {
      await H.vibrate({ duration: Math.max(1, Math.min(10000, total || 0)) });
      return 'native';
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      return navigator.vibrate(pattern) ? 'vibrate' : 'none';
    }
  } catch {
    // haptics must never break the launcher
  }
  return 'none';
}

// --- share -----------------------------------------------------------------

/**
 * Share content. Native share sheet in the shell, Web Share API on mobile web,
 * clipboard as the last resort. Never throws.
 * @param {{title?: string, text?: string, url?: string, dialogTitle?: string}} opts
 * @returns {Promise<{ok: boolean, method: 'native'|'web'|'clipboard'|'none', error?: string}>}
 */
export async function shareContent({ title, text, url, dialogTitle } = {}) {
  try {
    if (isNative()) {
      try {
        const { Share } = await import('@capacitor/share');
        await Share.share({ title, text, url, dialogTitle });
        return { ok: true, method: 'native' };
      } catch (err) {
        return { ok: false, method: 'none', error: String((err && err.message) || err) };
      }
    }
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      const data = { title, text, url };
      if (typeof navigator.canShare === 'function' && !navigator.canShare(data)) {
        throw new Error('payload not shareable');
      }
      await navigator.share(data);
      return { ok: true, method: 'web' };
    }
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText([title, text, url].filter(Boolean).join('\n'));
      return { ok: true, method: 'clipboard' };
    }
  } catch (err) {
    return { ok: false, method: 'none', error: String((err && err.message) || err) };
  }
  return { ok: false, method: 'none' };
}

// --- deep links ------------------------------------------------------------

const APP_HOST = 'olympusverse.com';

/**
 * Pure parser: turn any incoming URL — custom scheme (nexusvortex://…),
 * universal/app link (https://olympusverse.com/…), or plain https — into an
 * in-app route. Returns null when the URL can't be understood.
 *
 * Shapes handled:
 *   nexusvortex://battleship?code=ABC123        -> { path: '/battleship', … }
 *   nexusvortex://olympusverse.com/chess?code=X -> { path: '/chess', … }
 *   https://olympusverse.com/nova?code=ABC123   -> { path: '/nova', … }
 *
 * @param {string} rawUrl
 * @returns {{path: string, search: string, code: string|null, raw: string}|null}
 */
export function parseDeepLink(rawUrl) {
  try {
    if (typeof rawUrl !== 'string' || !rawUrl) return null;
    const u = new URL(rawUrl);
    const host = (u.hostname || '').toLowerCase();
    const isHttp = u.protocol === 'http:' || u.protocol === 'https:';
    let path = u.pathname || '/';
    if (!isHttp && host && host !== APP_HOST && !host.includes('.')) {
      // Custom scheme puts the first path segment in the hostname:
      // nexusvortex://battleship?code=ABC123
      path = '/' + host + (u.pathname && u.pathname !== '/' ? u.pathname : '');
    }
    const search = u.search || '';
    let code = null;
    try {
      const c = u.searchParams.get('code');
      if (c && /^[A-Za-z0-9]{6}$/.test(c)) code = c.toUpperCase();
    } catch {
      // ignore malformed query strings
    }
    return { path, search, code, raw: rawUrl };
  } catch {
    return null;
  }
}

let _deepLinksStarted = false;

/**
 * Wire the native shell's deep-link events into the app.
 * - `appUrlOpen`: fired when the app is opened (or re-opened) via a URL.
 * - `getLaunchUrl()`: the URL that cold-started the app, if any.
 *
 * Routing: by default navigates the shell to path+search via
 * window.location.assign (the live-URL shell reloads the production page,
 * whose own ?code= joiner then consumes the code). Pass onRoute to use SPA
 * navigation instead (see components/NativeBridge.jsx).
 *
 * Safe to call on web / server: no-ops and returns a no-op cleanup.
 * Never throws.
 *
 * @param {{onRoute?: (parsed: {path: string, search: string, code: string|null, raw: string}) => void}} opts
 * @returns {Promise<() => void>} cleanup that removes the listener.
 */
export async function initDeepLinks({ onRoute } = {}) {
  const noop = () => {};
  if (_deepLinksStarted) return noop;
  if (typeof window === 'undefined' || !isNative()) return noop;
  _deepLinksStarted = true;
  let removeListener = noop;
  try {
    const { App } = await import('@capacitor/app');
    const go = (rawUrl) => {
      const parsed = parseDeepLink(rawUrl);
      if (!parsed) return;
      try {
        if (typeof onRoute === 'function') onRoute(parsed);
        else if (typeof window !== 'undefined') {
          window.location.assign(parsed.path + parsed.search);
        }
      } catch {
        // routing must never break the launcher
      }
    };
    try {
      const sub = await App.addListener('appUrlOpen', (data) => {
        if (data && data.url) go(data.url);
      });
      removeListener = () => {
        try {
          sub.remove();
        } catch {
          // ignore
        }
      };
    } catch {
      // listener registration failed; cold-start check below still runs
    }
    try {
      const launch = await App.getLaunchUrl();
      if (launch && launch.url) go(launch.url);
    } catch {
      // no launch URL — normal for a home-screen start
    }
  } catch {
    // native App plugin unavailable — stay silent
  }
  return () => {
    try {
      removeListener();
    } catch {
      // ignore
    }
    _deepLinksStarted = false;
  };
}
