// lib/afterlife/souls.js
// SOULS — the underworld currency (Merlin, Nov 15 ~02:15, green-lit
// purposes list, tranche 1: the design spine).
//
// The dead drift, their sojourn ends, they fade. Nether realms are
// where you EARN souls (guide a fading soul to its rest); higher
// realms are where you spend and bless them. The Lake of Fire is the
// refinery (soul -> aether); the ferry is the fast crossing.
//
// SOUL STORAGE — resolved honestly: Dutchman souls are DEVICE-LOCAL
// only (the Flying Dutchman's ghost-voyage backpack, localStorage
// key 'ghost-voyage-backpack-v1' — no server copy exists). A forge
// cannot consume server-side souls it cannot see, so tranche 1 adds
// a server-side soul ledger (supabase/souls.sql — STAGED, not run)
// as the source of truth for forgeable souls, and the device-local
// Dutchman count reconciles INTO it. Reconciliation is idempotent
// per device + nonce: a lost response retries with the same nonce
// and the server returns the original row instead of crediting
// twice; the local count is only reduced after a confirmed (or
// confirmed-duplicate) success. Mega souls are NOT reconciled in
// tranche 1 — plain souls only; the Dutchman's premium stays local.
//
// Pure functions first; localStorage helpers are try/catch-guarded
// so node tests can import this module with no DOM at all.

import { PORTAL_REALMS, portalRealmByKey } from '../portal/realms.js';

// ── The ledger's reasons (server-side, supabase/souls.sql) ─────────
export const SOUL_REASON_FORGE = 'forge:cast';
export const SOUL_REASON_GUIDE = 'guide:rest';
export const SOUL_REASON_RECONCILE = 'souls:reconcile';

// The Dutchman's durable store — the key lives in
// app/flying-dutchman/voyage-backpack.js; repeated here (not imported)
// because lib/ must not import from app/.
export const DUTCHMAN_BACKPACK_KEY = 'ghost-voyage-backpack-v1';

// ── Nonces ─────────────────────────────────────────────────────────
/** One fresh idempotency nonce per attempt (a UUID when available). */
export function newNonce() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through to the Math.random shape */ }
  return `n-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

// ── Device-local Dutchman souls (the reconcile source) ────────────

/** Read the device-local Dutchman soul count (0 when absent/corrupt). */
export function readLocalDutchmanSouls() {
  try {
    if (typeof localStorage === 'undefined') return 0;
    const raw = localStorage.getItem(DUTCHMAN_BACKPACK_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const n = Math.floor(Number(parsed && parsed.souls));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Reduce the device-local Dutchman soul count by `amount` (never
 * below zero, never touches megaSouls / items / skins / ships).
 * Returns the new local count. Call ONLY after the server confirms
 * the reconcile (or confirms it as a duplicate).
 */
export function reduceLocalDutchmanSouls(amount) {
  const take = Math.floor(Number(amount));
  if (!(take > 0)) return readLocalDutchmanSouls();
  try {
    if (typeof localStorage === 'undefined') return 0;
    const raw = localStorage.getItem(DUTCHMAN_BACKPACK_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return 0;
    const have = Math.floor(Number(parsed.souls));
    const next = Math.max(0, (Number.isFinite(have) ? have : 0) - take);
    localStorage.setItem(DUTCHMAN_BACKPACK_KEY, JSON.stringify({ ...parsed, souls: next }));
    return next;
  } catch {
    return readLocalDutchmanSouls();
  }
}

// ── Pending reconcile (survives a lost response) ───────────────────
// Stored BEFORE the POST goes out: { nonce, deviceId, amount }.
// A retry resends the same nonce + amount, so the server answers
// was_duplicate instead of crediting twice.
export const SOUL_RECONCILE_PENDING_KEY = 'olympus:soul-reconcile:v1';

export function readPendingReconcile() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SOUL_RECONCILE_PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return null;
    const amount = Math.floor(Number(p.amount));
    if (!(amount > 0) || typeof p.nonce !== 'string' || !p.nonce || typeof p.deviceId !== 'string' || !p.deviceId) return null;
    return { nonce: p.nonce, deviceId: p.deviceId, amount };
  } catch {
    return null;
  }
}

export function writePendingReconcile(pending) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(SOUL_RECONCILE_PENDING_KEY, JSON.stringify(pending));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingReconcile() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(SOUL_RECONCILE_PENDING_KEY);
  } catch { /* storage unavailable — the pending row just stays */ }
}

/** A stable per-device id (for reconcile idempotency keys). */
export function deviceId() {
  try {
    if (typeof localStorage === 'undefined') return 'unknown-device';
    const KEY = 'olympus:soul-device:v1';
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `d-${newNonce()}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'unknown-device';
  }
}

// ── Visited realms (the ferry's fast-travel list) ──────────────────
// No visited-realms record exists anywhere in code (portal progress
// tracks COUNTS only), so tranche 1 keeps a device-local list:
// realm keys, most recent first, capped at 24. Recorded on realm
// page mount. A later tranche can mirror it to the account the way
// portal-progress does — the /api/ui-state whitelist has no key for
// it today, so no mirror is attempted here.
export const VISITED_REALMS_KEY = 'olympus:visited-realms:v1';
// 25 since Nov 16, 2026 (was 24): the Land of the Dead is the 25th
// portal realm — the cap is the registry size, so it moves with it.
export const MAX_VISITED_REALMS = 25;

/** The visited realm keys, most recent first (empty when none). */
export function readVisitedRealms() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(VISITED_REALMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out = [];
    for (const k of parsed) {
      if (typeof k !== 'string') continue;
      if (!portalRealmByKey(k)) continue; // unknown keys are dropped
      if (!out.includes(k)) out.push(k);
    }
    return out.slice(0, MAX_VISITED_REALMS);
  } catch {
    return [];
  }
}

/** Record a realm visit (most recent first). Returns the new list. */
export function recordRealmVisit(realmKey) {
  if (typeof realmKey !== 'string' || !portalRealmByKey(realmKey)) return readVisitedRealms();
  const next = [realmKey, ...readVisitedRealms().filter((k) => k !== realmKey)].slice(0, MAX_VISITED_REALMS);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(VISITED_REALMS_KEY, JSON.stringify(next));
  } catch { /* storage unavailable — the visit just won't persist */ }
  return next;
}

/** The realm records for a visited list (label + route), in order. */
export function visitedRealmRecords(visited) {
  const out = [];
  for (const k of Array.isArray(visited) ? visited : []) {
    const realm = portalRealmByKey(k);
    if (realm) out.push(realm);
  }
  return out;
}

// ── Rebirth point (the Wheel of Rebirth, device-local first) ───────
// Mirrors the portal-progress pattern: the device copy is the live
// one; the server mirror (soul_balances.respawn_realm) is best-effort
// and never blocks the ride.
export const REBIRTH_POINT_KEY = 'olympus:rebirth-point:v1';

/** The attuned rebirth realm key, or null. */
export function readRebirthPoint() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(REBIRTH_POINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.realm !== 'string' || !portalRealmByKey(parsed.realm)) return null;
    return { realm: parsed.realm, attunedAt: typeof parsed.attunedAt === 'number' ? parsed.attunedAt : null };
  } catch {
    return null;
  }
}

export function writeRebirthPoint(realmKey) {
  if (typeof realmKey !== 'string' || !portalRealmByKey(realmKey)) return false;
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(REBIRTH_POINT_KEY, JSON.stringify({ realm: realmKey, attunedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

// ── API helper (client pages) ──────────────────────────────────────
// Gets the caller's Supabase token the same way portal-progress does
// (dynamic import so this module stays importable in plain node).
export async function soulsApi(path, { method = 'GET', body = null } = {}) {
  let token = null;
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token || null;
  } catch { token = null; }
  const res = await fetch(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}
