// OASIS share — universal copy/share room-code logic.
// Grown from the chess HUD pattern: copy the code, share the deep link,
// graceful fallbacks everywhere. Pure helpers stay headless-testable;
// browser access is guarded so modules stay SSR-safe.

/** Deep link into a game that auto-attempts the join: /<game>?code=XXXXXX */
export function buildJoinUrl(origin, gameSlug, code) {
  const cleanOrigin = String(origin || '').replace(/\/+$/, '');
  const cleanCode = String(code || '').trim().toUpperCase();
  return `${cleanOrigin}/${gameSlug}?code=${encodeURIComponent(cleanCode)}`;
}

/** Pull a room code out of a URL query string (?code=XXXXXX). */
export function codeFromSearch(search) {
  try {
    const params = new URLSearchParams(search || '');
    const code = (params.get('code') || '').trim().toUpperCase();
    return code || null;
  } catch {
    return null;
  }
}

/** True in a real browser with a DOM. */
export function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Copy text to the clipboard. Uses the async Clipboard API when available,
 * falls back to a hidden textarea + execCommand for older browsers.
 * Resolves true on success, false when nothing worked.
 */
export async function copyTextToClipboard(text) {
  if (!isBrowser()) return false;
  const value = String(text ?? '');
  try {
    if (navigator.clipboard && window.isSecureContext !== false) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    throw new Error('clipboard unavailable');
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Share a room invite. On mobile this opens the native share sheet;
 * on desktop (or when sharing is unavailable) the join link is copied
 * and the caller is told so it can show feedback.
 *
 * Returns 'shared' | 'copied' | 'failed'.
 */
export async function shareRoomInvite({ gameSlug, code, title, text }) {
  if (!isBrowser()) return 'failed';
  const url = buildJoinUrl(window.location.origin, gameSlug, code);
  const shareText = text || `Join my game! Code: ${code}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: title || 'Join my game', text: shareText, url });
      return 'shared';
    }
    throw new Error('share unavailable');
  } catch (err) {
    // User cancelling the sheet is not an error — treat as a no-op share.
    if (err && err.name === 'AbortError') return 'shared';
    const copied = await copyTextToClipboard(url);
    return copied ? 'copied' : 'failed';
  }
}
