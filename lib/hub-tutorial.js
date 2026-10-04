// lib/hub-tutorial.js — Hub tutorial rollout logic (Merlin 2026-10-03).
//
// Merlin's rule: for 30 days from launch the hub tutorial is STANDARD —
// every visitor sees it once (unless they skip it). After the cutoff, only
// NEW registrations see it. That bridges the gap between users who were
// already registered during the standard window and users who register
// after it: nobody who missed the window gets nagged, and every genuinely
// new user still gets oriented.
//
// "Registered" = the Supabase auth user's created_at, stashed in
// localStorage by the hub page whenever a session is present. When auth
// isn't available (guest mode), we fall back to a first-seen timestamp —
// a browser first seen on/after the cutoff counts as new.
//
// Skip and complete are the same thing: both persist hub_tutorial_seen,
// and the tutorial never shows again on that browser.

// 30 days from 2026-10-03. Named + dated so the rule is auditable.
export const HUB_TUTORIAL_STANDARD_UNTIL = '2026-11-03';

export const HUB_TUTORIAL_SEEN_KEY = 'hub_tutorial_seen';
export const HUB_TUTORIAL_FIRST_SEEN_KEY = 'hub_first_seen';
export const HUB_TUTORIAL_REGISTERED_KEY = 'hub_registered_at';

function storage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch { /* no storage — fall through */ }
  return null;
}

function safeGet(key) {
  const s = storage();
  if (!s) return null;
  try { return s.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
  const s = storage();
  if (!s) return;
  try { s.setItem(key, value); } catch { /* private mode etc. — stay quiet */ }
}

/**
 * Pure decision function — headless-testable.
 *
 * @param {object} args
 * @param {boolean} args.seen - already seen or skipped
 * @param {Date|string} args.now - "today"
 * @param {string|null} args.registeredAt - ISO registration timestamp, or null when unknown.
 *   Callers should resolve the guest fallback (resolveHubRegisteredAt) before
 *   calling; a null registeredAt after the cutoff means "age unknown" and
 *   stays hidden rather than nagging.
 * @returns {boolean} whether the tutorial should be shown
 */
export function shouldShowHubTutorial({ seen = false, now = new Date(), registeredAt = null } = {}) {
  if (seen) return false;
  const cutoff = new Date(HUB_TUTORIAL_STANDARD_UNTIL + 'T00:00:00Z');
  const t = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(t.getTime())) return false;
  // Standard window: everyone sees it once.
  if (t < cutoff) return true;
  // After the cutoff: only registrations on/after the cutoff.
  if (!registeredAt) return false;
  const r = new Date(registeredAt);
  if (Number.isNaN(r.getTime())) return false;
  return r >= cutoff;
}

/** True once the user has seen OR skipped the tutorial. */
export function isHubTutorialSeen() {
  return safeGet(HUB_TUTORIAL_SEEN_KEY) === '1';
}

/** Persist seen/skip. Skip sets the same flag as completing. */
export function markHubTutorialSeen() {
  safeSet(HUB_TUTORIAL_SEEN_KEY, '1');
}

/** Stash the Supabase auth user's created_at (authoritative registration date). */
export function stashHubRegisteredAt(iso) {
  if (iso) safeSet(HUB_TUTORIAL_REGISTERED_KEY, String(iso));
}

/**
 * Resolve the registration date for the rollout check: authoritative
 * stashed created_at first, otherwise the first-seen fallback (set once,
 * so a brand-new browser after the cutoff counts as a new registration).
 */
export function resolveHubRegisteredAt() {
  const reg = safeGet(HUB_TUTORIAL_REGISTERED_KEY);
  if (reg) return reg;
  let first = safeGet(HUB_TUTORIAL_FIRST_SEEN_KEY);
  if (!first) {
    first = new Date().toISOString();
    safeSet(HUB_TUTORIAL_FIRST_SEEN_KEY, first);
  }
  return first;
}
