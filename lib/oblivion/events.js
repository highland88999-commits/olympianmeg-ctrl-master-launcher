// lib/oblivion/events.js — server-only Oblivion event store
// (Merlin's canon, Nov 19 ~00:16).
//
// THE EVENT: one row per lever pull. armed_at_ms is the confirm
// instant, ends_at_ms is armed_at + 72 h (lib/earth/oblivion.js
// OBLIVION_WAIT_MS). While now < ends_at the event is ACTIVE:
// Earth is gone, the timer runs, travel to Earth is refused, the
// lever is locked. At now >= ends_at the event is COMPLETE: Earth
// is back, exactly as it was — nothing about Earth 1's world or any
// user's saved data ever changed, so there is nothing to restore;
// the row is only a clock. A second arm while one is active is
// refused (409, already-armed) — the timer never resets.
//
// THE DRAGON SHIELD: one row per user per guard dragon killed
// (stormwing / aureline). Idempotent: a re-kill of the same dragon
// by the same user inserts nothing (unique user_id + dragon, 23505
// → already). The tier is the distinct-dragon count (0..2).
//
// FAIL-CLOSED, LIKE PRESENCE: if the tables are missing (42P01 —
// the migration has not run yet), every helper reports
// not-configured instead of throwing, and the routes answer with
// honest 503s. The clients degrade: state reads as not-armed, the
// arm refuses without evacuating anyone, the shield reads as tier 0.
// Running the migration needs Merlin's green light (the Supabase
// SQL gate) — see supabase/earth-oblivion.sql (STAGED).

import { OBLIVION_WAIT_MS } from '../earth/oblivion.js';
import { dragonShieldTierFor, isDragonShieldDragon } from './state.js';

export const OBLIVION_EVENTS_TABLE = 'earth_oblivion_events';
export const DRAGON_SHIELD_KILLS_TABLE = 'j2_dragon_shield_kills';

/** True when a Supabase error means the table does not exist yet. */
export function isMissingTableError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return code === '42P01' || /relation .* does not exist/i.test(msg);
}

/**
 * The latest oblivion event, or null when none exists.
 * Returns { event } / { event: null } / { event: null, missing: true }.
 */
export async function getOblivionEvent(admin) {
  if (!admin) return { event: null, missing: true };
  try {
    const { data, error } = await admin
      .from(OBLIVION_EVENTS_TABLE)
      .select('id, armed_at_ms, ends_at_ms, armed_by, source, created_at')
      .order('armed_at_ms', { ascending: false })
      .limit(1);
    if (error) {
      if (isMissingTableError(error)) return { event: null, missing: true };
      throw error;
    }
    return { event: (Array.isArray(data) && data[0]) || null };
  } catch (err) {
    if (isMissingTableError(err)) return { event: null, missing: true };
    throw err;
  }
}

/**
 * Arm the oblivion event for a signed-in user. Returns:
 *   { ok: true, event } — freshly armed
 *   { ok: false, reason: 'already-armed', endsAt } — one is active
 *   { ok: false, reason: 'not-configured' } — the table is missing
 */
export async function armOblivionEvent(admin, userId, nowMs = Date.now()) {
  if (!admin) return { ok: false, reason: 'not-configured' };
  const current = await getOblivionEvent(admin);
  if (current.missing) return { ok: false, reason: 'not-configured' };
  const ev = current.event;
  if (ev && Number.isFinite(Number(ev.ends_at_ms)) && nowMs < Number(ev.ends_at_ms)) {
    return { ok: false, reason: 'already-armed', endsAt: Number(ev.ends_at_ms) };
  }
  const endsAt = nowMs + OBLIVION_WAIT_MS;
  try {
    const { data, error } = await admin
      .from(OBLIVION_EVENTS_TABLE)
      .insert({ armed_at_ms: nowMs, ends_at_ms: endsAt, armed_by: userId || null, source: 'jupiter-2' })
      .select('id, armed_at_ms, ends_at_ms, armed_by, source')
      .single();
    if (error) {
      if (isMissingTableError(error)) return { ok: false, reason: 'not-configured' };
      throw error;
    }
    return { ok: true, event: data };
  } catch (err) {
    if (isMissingTableError(err)) return { ok: false, reason: 'not-configured' };
    throw err;
  }
}

/**
 * Record one user's kill of one guard dragon. Idempotent per
 * user + dragon. Returns { ok, granted, tier, dragons } where
 * granted=false means this user already earned this dragon's
 * upgrade. { ok: false, reason: 'not-configured' } when the table
 * is missing; { ok: false, reason: 'bad-dragon' } for unknown keys.
 */
export async function recordDragonKill(admin, userId, dragon, nowMs = Date.now()) {
  if (!isDragonShieldDragon(dragon)) return { ok: false, reason: 'bad-dragon' };
  if (!admin || !userId) return { ok: false, reason: 'not-configured' };
  try {
    const { error } = await admin
      .from(DRAGON_SHIELD_KILLS_TABLE)
      .insert({ user_id: userId, dragon: String(dragon), killed_at_ms: nowMs });
    if (error && error.code !== '23505') {
      if (isMissingTableError(error)) return { ok: false, reason: 'not-configured' };
      throw error;
    }
    const granted = !error;
    const shield = await getDragonShield(admin, userId);
    return { ok: true, granted, tier: shield.tier, dragons: shield.dragons };
  } catch (err) {
    if (isMissingTableError(err)) return { ok: false, reason: 'not-configured' };
    throw err;
  }
}

/**
 * A user's dragon-shield standing: { tier, dragons }.
 * Missing table → tier 0 (degraded, not an error).
 */
export async function getDragonShield(admin, userId) {
  if (!admin || !userId) return { tier: 0, dragons: [], missing: true };
  try {
    const { data, error } = await admin
      .from(DRAGON_SHIELD_KILLS_TABLE)
      .select('dragon')
      .eq('user_id', userId);
    if (error) {
      if (isMissingTableError(error)) return { tier: 0, dragons: [], missing: true };
      throw error;
    }
    const dragons = (Array.isArray(data) ? data : []).map((r) => r.dragon).filter(isDragonShieldDragon);
    return { tier: dragonShieldTierFor(dragons), dragons: [...new Set(dragons)] };
  } catch (err) {
    if (isMissingTableError(err)) return { tier: 0, dragons: [], missing: true };
    throw err;
  }
}
