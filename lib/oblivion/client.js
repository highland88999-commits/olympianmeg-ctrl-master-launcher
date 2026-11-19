// lib/oblivion/client.js — browser calls for the Oblivion cycle.
//
//   fetchOblivionState() — public GET, no sign-in needed (the wait
//     is public, like /api/earth2/release). Returns the state shape
//     or null when unreachable — callers treat null as "not armed".
//   armOblivion() — POST, signed-in only. Returns { ok, armed,
//     endsAt } or { ok: false, error, status }.
//   grantDragonKill(dragon) — POST, signed-in only. Returns
//     { ok, granted, tier, dragons } or { ok: false, error, status }.
//   fetchDragonShield() — GET, signed-in only. Returns
//     { ok, tier, charges, dragons } or { ok: false, ... }.
//
// Auth follows the /oblivion page pattern: the Bearer token comes
// from supabase.auth.getSession(). A missing session means the call
// needs sign-in (the server answers 401); the caller decides what
// to show. Nothing here throws on a network failure — every
// failure resolves to an { ok: false } shape.

import { supabase } from '../supabase';
import { cycleState, dragonShieldChargesFor, OBLIVION_WITNESS_KEY, OBLIVION_COLLAPSE_SEEN_KEY } from './state.js';

async function authHeaders() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data && data.session && data.session.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function readJson(res) {
  try { return await res.json(); } catch { return null; }
}

export async function fetchOblivionState() {
  try {
    const res = await fetch('/api/oblivion/state', { cache: 'no-store' });
    const data = await readJson(res);
    if (!data || data.ok !== true) return null;
    const now = Date.now();
    const c = cycleState({ armed: data.armed === true, endsAtMs: data.endsAt, nowMs: now });
    return {
      ok: true,
      armed: c.armed,
      active: c.active,
      complete: c.complete,
      endsAt: data.endsAt || null,
      remainingMs: c.remainingMs,
      serverNow: data.serverNow || now,
    };
  } catch {
    return null;
  }
}

export async function armOblivion() {
  try {
    const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
    const res = await fetch('/api/oblivion/arm', { method: 'POST', headers, body: JSON.stringify({}) });
    const data = await readJson(res);
    if (!res.ok || !data || data.ok !== true) {
      return { ok: false, status: res.status, error: (data && data.error) || 'Oblivion could not be armed.' };
    }
    return { ok: true, armed: true, endsAt: data.endsAt || null };
  } catch {
    return { ok: false, status: 0, error: 'Oblivion could not be armed.' };
  }
}

export async function grantDragonKill(dragon) {
  try {
    const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
    const res = await fetch('/api/oblivion/dragon-kill', {
      method: 'POST', headers, body: JSON.stringify({ dragon }),
    });
    const data = await readJson(res);
    if (!res.ok || !data || data.ok !== true) {
      return { ok: false, status: res.status, error: (data && data.error) || 'The shield upgrade could not be recorded.' };
    }
    return { ok: true, granted: data.granted === true, tier: data.tier || 0, dragons: data.dragons || [] };
  } catch {
    return { ok: false, status: 0, error: 'The shield upgrade could not be recorded.' };
  }
}

export async function fetchDragonShield() {
  try {
    const headers = { ...(await authHeaders()) };
    const res = await fetch('/api/oblivion/dragon-shield', { headers, cache: 'no-store' });
    const data = await readJson(res);
    if (!res.ok || !data || data.ok !== true) {
      return { ok: false, status: res.status, tier: 0, charges: 0, dragons: [] };
    }
    const tier = data.tier || 0;
    return { ok: true, tier, charges: dragonShieldChargesFor(tier), dragons: data.dragons || [] };
  } catch {
    return { ok: false, status: 0, tier: 0, charges: 0, dragons: [] };
  }
}

/** Mark this session as a witness: the hub plays the collapse on arrival. */
export function setWitnessFlag() {
  try { window.sessionStorage.setItem(OBLIVION_WITNESS_KEY, '1'); } catch { /* private mode */ }
}

/** True when this session carries the witness flag. */
export function hasWitnessFlag() {
  try { return window.sessionStorage.getItem(OBLIVION_WITNESS_KEY) === '1'; } catch { return false; }
}

/** Consume the witness flag (the hub calls this once it has shown the collapse). */
export function clearWitnessFlag() {
  try { window.sessionStorage.removeItem(OBLIVION_WITNESS_KEY); } catch { /* private mode */ }
}

/** True when this session has already seen the collapse cinematic. */
export function hasSeenCollapse() {
  try { return window.sessionStorage.getItem(OBLIVION_COLLAPSE_SEEN_KEY) === '1'; } catch { return false; }
}

/** Mark the collapse as seen for this session. */
export function markCollapseSeen() {
  try { window.sessionStorage.setItem(OBLIVION_COLLAPSE_SEEN_KEY, '1'); } catch { /* private mode */ }
}
