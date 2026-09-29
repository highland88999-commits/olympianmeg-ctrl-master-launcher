// lib/prime-state.js — Prime's per-user persisted state.
//
// Account-mapped experience: viewport, pinned favorites, and recent
// destinations are stored per account when the launcher has one, and fall
// back to local device state when not signed in. The storage key is shaped
// so it maps cleanly onto a real account later:
//   prime:v1:account:<id>   — signed-in account
//   prime:v1:device         — no account available
//
// Local-first by design: everything lives in localStorage, nothing is sent
// anywhere, and there is no auth system to build here. Pure functions over
// an injected storage shim so the whole thing is headless-testable.
//
// Scoping rules (standing, from Merlin):
//   - Personal state (viewport, pins, recents, preferences): PER-ACCOUNT,
//     never leaked across accounts.
//   - Leaderboards and anything leaderboard-like: UNIVERSAL/global across all
//     users, NEVER per-account. Prime ships no leaderboard; this rule is
//     recorded here so a future one is never scoped per-user by accident.
// Encoded as data (not just a comment) so the rule is checkable at runtime
// and in tests.
export const PRIME_SCOPING = Object.freeze({
  personal: 'per-account',
  leaderboards: 'universal',
});

export const PRIME_STATE_VERSION = 1;
export const MAX_RECENTS = 8;
export const MAX_PINS = 40;

export function stateKey(accountId) {
  if (accountId && String(accountId).trim()) {
    return `prime:v${PRIME_STATE_VERSION}:account:${String(accountId).trim()}`;
  }
  return `prime:v${PRIME_STATE_VERSION}:device`;
}

// accountIdFromWindow: reads the launcher's existing identity surface
// (localStorage 'nexus_user' — the callsign the hub persists on sign-in).
// Safe to call during render only in effects; kept DOM-free for tests by
// accepting an optional localStorage-like.
export function accountIdFromWindow(storage) {
  try {
    const get =
      storage && typeof storage.getItem === 'function'
        ? storage.getItem.bind(storage)
        : typeof window !== 'undefined' && window.localStorage
          ? window.localStorage.getItem.bind(window.localStorage)
          : null;
    if (!get) return null;
    const id = get('nexus_user');
    return id && String(id).trim() ? String(id).trim() : null;
  } catch {
    return null;
  }
}

// resolveAccountId: the launcher's signed-in account identity, most stable
// first. The launcher's account surface is:
//   1. Supabase session (session.user.id) — stable across sessions/logins.
//   2. localStorage 'nexus_user' callsign — the hub's own sign-in surface.
//   3. null — device fallback key via stateKey(null).
// Never throws. `supabaseClient` and `storage` are injected so the whole
// thing stays headless-testable. Never builds a new auth system here.
export async function resolveAccountId(supabaseClient, storage) {
  try {
    if (supabaseClient && supabaseClient.auth && typeof supabaseClient.auth.getSession === 'function') {
      const { data } = await supabaseClient.auth.getSession();
      const uid = data && data.session && data.session.user && data.session.user.id;
      if (uid && String(uid).trim()) return `supabase:${String(uid).trim()}`;
    }
  } catch {
    // Offline or unconfigured: fall through to the callsign.
  }
  const callsign = accountIdFromWindow(storage);
  if (callsign) return `callsign:${callsign.toUpperCase()}`;
  return null;
}

// Account-scoped change subscription: notify `onChange` with the new
// account id whenever the account identity may have changed (sign-in,
// sign-out, account switch in another tab). Returns an unsubscribe function.
// This is what keeps one account's map state from ever leaking into
// another's: the page re-loads state under the new key on every change.
export function subscribeAccountChanges(supabaseClient, onChange) {
  const cleanups = [];
  try {
    if (supabaseClient && supabaseClient.auth && typeof supabaseClient.auth.onAuthStateChange === 'function') {
      const { data } = supabaseClient.auth.onAuthStateChange(() => {
        try {
          const storage =
            typeof window !== 'undefined' ? window.localStorage : null;
          resolveAccountId(supabaseClient, storage).then(onChange).catch(() => {});
        } catch {
          /* noop */
        }
      });
      if (data && data.subscription) cleanups.push(() => data.subscription.unsubscribe());
    }
  } catch {
    /* noop */
  }
  try {
    if (typeof window !== 'undefined') {
      const onStorage = (e) => {
        if (e && e.key === 'nexus_user') {
          const storage = window.localStorage;
          resolveAccountId(supabaseClient, storage).then(onChange).catch(() => {});
        }
      };
      window.addEventListener('storage', onStorage);
      cleanups.push(() => window.removeEventListener('storage', onStorage));
    }
  } catch {
    /* noop */
  }
  return () => {
    for (const c of cleanups) {
      try { c(); } catch { /* noop */ }
    }
  };
}

export function emptyState() {
  return {
    v: PRIME_STATE_VERSION,
    camera: null, // { x, y, zoom }
    pins: [], // satellite keys, in pin order
    recents: [], // satellite keys, most recent first
  };
}

function sanitizeCamera(c) {
  if (!c || typeof c !== 'object') return null;
  const x = Number(c.x);
  const y = Number(c.y);
  const zoom = Number(c.zoom);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) return null;
  if (zoom <= 0 || zoom > 10) return null;
  return { x, y, zoom };
}

function sanitizeList(arr, max) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const k of arr) {
    if (typeof k === 'string' && k && !out.includes(k)) out.push(k);
    if (out.length >= max) break;
  }
  return out;
}

export function sanitizeState(raw) {
  if (!raw || typeof raw !== 'object') return emptyState();
  return {
    v: PRIME_STATE_VERSION,
    camera: sanitizeCamera(raw.camera),
    pins: sanitizeList(raw.pins, MAX_PINS),
    recents: sanitizeList(raw.recents, MAX_RECENTS),
  };
}

// Load persisted state for an account (or device fallback). Never throws.
export function loadState(storage, accountId) {
  const empty = emptyState();
  if (!storage || typeof storage.getItem !== 'function') return empty;
  try {
    const raw = storage.getItem(stateKey(accountId));
    if (!raw) return empty;
    return sanitizeState(JSON.parse(raw));
  } catch {
    return empty;
  }
}

// Save persisted state. Never throws; returns true on success.
export function saveState(storage, accountId, state) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(stateKey(accountId), JSON.stringify(sanitizeState(state)));
    return true;
  } catch {
    return false;
  }
}

// Pin a satellite key (toggle). Returns a new state object.
export function togglePin(state, key) {
  const s = sanitizeState(state);
  const pins = s.pins.includes(key)
    ? s.pins.filter((k) => k !== key)
    : [key, ...s.pins].slice(0, MAX_PINS);
  return { ...s, pins };
}

// Record a visited destination: bumps it to the front of recents.
export function recordVisit(state, key) {
  const s = sanitizeState(state);
  if (!key) return s;
  const recents = [key, ...s.recents.filter((k) => k !== key)].slice(0, MAX_RECENTS);
  return { ...s, recents };
}

// Merge a camera snapshot into state.
export function withCamera(state, camera) {
  const s = sanitizeState(state);
  const c = sanitizeCamera(camera);
  return { ...s, camera: c };
}
