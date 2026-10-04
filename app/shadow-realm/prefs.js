// app/shadow-realm/prefs.js — rider preferences, account-scoped.
//
// Mirrors the launcher's standing pattern (lib/prime-state.js):
//   shadow:v1:account:<id>  — signed-in account (from localStorage 'nexus_user')
//   shadow:v1:device        — no account available
//
// Local-first: everything lives in localStorage, nothing is sent anywhere.
// Pure functions over an injected storage shim so the whole thing is
// headless-testable. Scoping rule (Merlin, standing):
//   - rider prefs: PER-ACCOUNT, never leaked across accounts.
//   - anything leaderboard-like: UNIVERSAL, never per-account.

export const SHADOW_STATE_VERSION = 1;

export const SHADOW_SCOPING = Object.freeze({
  riderPrefs: 'per-account',
  leaderboards: 'universal',
});

export function shadowKey(accountId) {
  if (accountId && String(accountId).trim()) {
    return `shadow:v${SHADOW_STATE_VERSION}:account:${String(accountId).trim()}`;
  }
  return `shadow:v${SHADOW_STATE_VERSION}:device`;
}

// accountIdFromWindow: reads the launcher's existing identity surface
// (localStorage 'nexus_user'). DOM-guarded; returns '' headless.
export function accountIdFromWindow() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return '';
    return String(window.localStorage.getItem('nexus_user') || '').trim();
  } catch {
    return '';
  }
}

export const DEFAULT_PREFS = Object.freeze({
  vehicleKey: 'comet',
  schemeKey: 'grid-blue',
  skinKey: 'skin-bike-neon-cyber',
  trackKey: 'gridiron-oval',
  mode: 'race', // 'race' | 'roam'
  laps: 3,
  aiCount: 0, // VS AI rivals: 0 | 1 | 3 | 7 (race mode only)
  reducedMotion: false,
});

// Valid lap counts (Merlin 2026-10-03: the 1-lap option is gone).
export const VALID_LAPS = Object.freeze([3, 5, 8]);

/** Coerce any stored laps value to a valid option (default 3). */
export function sanitizeLaps(laps) {
  return VALID_LAPS.includes(laps) ? laps : 3;
}

export function loadPrefs(storage, accountId) {
  const raw = storage.getItem(shadowKey(accountId));
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_PREFS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    // Migrate stale 1-lap saves (option removed 2026-10-03).
    merged.laps = sanitizeLaps(merged.laps);
    return merged;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(storage, accountId, prefs) {
  const merged = { ...DEFAULT_PREFS, ...(prefs || {}) };
  storage.setItem(shadowKey(accountId), JSON.stringify(merged));
  return merged;
}

// ---------------------------------------------------------------------------
// HOW TO RIDE tutorial (Merlin 2026-10-03): shown once on first visit to the
// Shadow Realm menu, skippable with one tap, reopenable via the "?" button.
// Device-scoped (not per-account): it's about the rider's hands, not their
// login. Pure over injected storage so it's headless-testable.
// ---------------------------------------------------------------------------
/** localStorage key: the HOW TO RIDE tutorial has been seen/dismissed. */
export const TUTORIAL_SEEN_KEY = 'nexus_shadow_tutorial_seen';

/** True once the rider has seen or skipped the tutorial. */
export function hasSeenTutorial(storage) {
  try {
    return !!storage && storage.getItem(TUTORIAL_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the seen/skipped state. Private-mode failures are swallowed: the
 * tutorial simply shows again next visit — harmless, never blocking. */
export function markTutorialSeen(storage) {
  try {
    if (storage) storage.setItem(TUTORIAL_SEEN_KEY, '1');
  } catch {
    /* private mode etc: show again next visit */
  }
}
