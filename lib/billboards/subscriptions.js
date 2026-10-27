// lib/billboards/subscriptions.js — Pure subscription math for billboard
// ads: satellite mapping, the one-per-satellite ownership cap, renewal
// dates, and paused-entry filtering. Headless-testable: no browser, no
// network, no Supabase.
//
// OWNERSHIP CAP (Merlin, 2026-10-27): one billboard per satellite per
// advertiser. An advertiser may hold at most one billboard on each of
// the 11 satellites (at most 11 billboards total, never two on the same
// satellite). ANY holding counts: a solo billboard AND a rotating
// face-slot both count as holding that billboard. Active AND paused
// subscriptions count (a paused slot is still held — it can resume);
// only cancelled/ended ones free the satellite. Enforced at purchase
// time in the subscribe route; the message below is the plain wording
// the buyer sees. Merlin's own house/demo ads (manager-wired, not
// subscriptions) are exempt — the cap binds advertisers, not the owner.
//
// SATELLITE MAPPING: billboard numbers run 1–44 across the 11 god
// towers in GOD_MENUS order (lib/god-menus.js): tower 0 carries 1–4,
// tower 1 carries 5–8, …, tower 10 carries 41–44. The order below MUST
// match GOD_MENUS order; the test pins all 44 mappings.

import { GOD_MENUS } from '../god-menus.js';

export const SATELLITE_ORDER = GOD_MENUS.map((m) => m.god);

/** Satellite index (0–10) for a billboard number, or null when invalid. */
export function satelliteIndexForBillboard(n) {
  if (!Number.isInteger(n) || n < 1 || n > 44) return null;
  return Math.floor((n - 1) / 4);
}

/** God/satellite name for a billboard number, or null when invalid. */
export function satelliteNameForBillboard(n) {
  const idx = satelliteIndexForBillboard(n);
  if (idx === null) return null;
  return SATELLITE_ORDER[idx] || `Satellite ${idx + 1}`;
}

/**
 * Ownership-cap check. `subs` is the buyer's existing subscriptions:
 * [{ billboardNumber, status }]. Active and paused count; anything
 * else does not. Returns null when the purchase is allowed, or
 * { satelliteIndex, satelliteName, existingBillboard } when the buyer
 * already holds a billboard on the target's satellite.
 */
export function capCheck(subs, targetBillboard) {
  const targetSat = satelliteIndexForBillboard(targetBillboard);
  if (targetSat === null) return { invalid: true };
  for (const s of subs || []) {
    if (s?.status !== 'active' && s?.status !== 'paused') continue;
    const n = Number(s?.billboardNumber);
    if (satelliteIndexForBillboard(n) === targetSat) {
      return {
        satelliteIndex: targetSat,
        satelliteName: satelliteNameForBillboard(targetBillboard),
        existingBillboard: n,
      };
    }
  }
  return null;
}

/** Plain message for a blocked purchase. */
export function capMessage(violation) {
  if (!violation || violation.invalid) return 'Pick a billboard number from 1 to 44.';
  return `You already hold a billboard on the ${violation.satelliteName} satellite (billboard ${violation.existingBillboard}). One billboard per satellite per advertiser — pick a billboard on a different satellite.`;
}

/** Add one calendar month, clamping the day (Jan 31 → Feb 28). */
export function addOneMonth(date) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** True when an active subscription's period has ended (renewal due). */
export function renewalDue(sub, now = new Date()) {
  if (!sub || sub.status !== 'active') return false;
  const end = new Date(sub.periodEnd || sub.period_end);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() <= new Date(now).getTime();
}

/**
 * Drop paused entries from a billboard's entry list. `paused` is a Set
 * of "billboard|company|link" keys. Pure: returns a new array.
 */
export function dropPausedEntries(entries, billboardNumber, paused) {
  if (!paused || paused.size === 0) return entries;
  return (entries || []).filter((e) => {
    const key = `${billboardNumber}|${String(e?.company ?? '').trim()}|${String(e?.link ?? '').trim()}`;
    return !paused.has(key);
  });
}

/**
 * Drop paused entries from a manifest overrides Map (number → board).
 * Boards left with zero entries are dropped entirely, so a fully
 * paused billboard falls back to its base inventory slot.
 */
export function dropPausedOverrides(overridesMap, pausedTriples) {
  if (!overridesMap || overridesMap.size === 0) return overridesMap;
  if (!pausedTriples || pausedTriples.length === 0) return overridesMap;
  const paused = new Set(
    pausedTriples.map((p) => `${p.billboardNumber}|${String(p.company ?? '').trim()}|${String(p.link ?? '').trim()}`)
  );
  const out = new Map();
  for (const [number, board] of overridesMap) {
    const kept = dropPausedEntries(board.entries, number, paused);
    if (kept.length > 0) out.set(number, { ...board, entries: kept });
  }
  return out;
}
