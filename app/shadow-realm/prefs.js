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
  trackKey: 'gridiron-oval',
  mode: 'race', // 'race' | 'roam'
  laps: 3,
  reducedMotion: false,
});

export function loadPrefs(storage, accountId) {
  const raw = storage.getItem(shadowKey(accountId));
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(storage, accountId, prefs) {
  const merged = { ...DEFAULT_PREFS, ...(prefs || {}) };
  storage.setItem(shadowKey(accountId), JSON.stringify(merged));
  return merged;
}
