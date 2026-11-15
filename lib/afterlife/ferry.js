// lib/afterlife/ferry.js
// THE FERRY (Merlin, Nov 15 ~02:15, green-lit purposes list,
// tranche 1: the design spine).
//
// Rivers block except on the bridge today (every realm's world.js:
// stepBlockedByRiver — the river band z ±18, the stone bridge
// |x| <= 9). Pay the ferry fare (1 gold, APPROVED as the starting
// point) and Charon carries you across at any point — or, from the
// Styx passage (/styx), straight to any realm you have visited.
//
// The fare is spent server-side (gold ledger, debitGold) — the
// client never sends amounts. The crossing itself is pure geometry:
// same x, the opposite bank. Pure functions only; the visited list
// lives in lib/afterlife/souls.js (device-local — no visited-realms
// record exists anywhere in code; portal progress tracks counts
// only).

import { portalRealmByKey } from '../portal/realms.js';

// 1 gold a crossing (Merlin's approved starting point).
export const FERRY_FARE_GOLD = 1;
// How close to the river band the ferry can be called from.
export const FERRY_BOARD_DIST_M = 30;
// How far past the bank the ferry sets you down.
export const FERRY_LANDING_CLEAR_M = 2;

/** Is (x, z) close enough to the river band to call Charon? */
export function nearRiver(x, z, river, dist = FERRY_BOARD_DIST_M) {
  if (!river || typeof x !== 'number' || typeof z !== 'number') return false;
  const zMin = river.zMin - dist;
  const zMax = river.zMax + dist;
  return z >= zMin && z <= zMax;
}

/**
 * The landing on the opposite bank: same x, 2 m past the far bank
 * line. South of the river (z > zMax) lands north, and the reverse.
 * The landing never falls inside the band itself.
 */
export function ferryLanding(river, x, z) {
  if (!river || typeof x !== 'number' || typeof z !== 'number') return null;
  const south = z >= (river.zMin + river.zMax) / 2;
  return {
    x,
    z: south
      ? river.zMin - FERRY_LANDING_CLEAR_M
      : river.zMax + FERRY_LANDING_CLEAR_M,
  };
}

/** Can this gold balance pay the fare? */
export function canAffordFerry(goldBalance) {
  const n = Math.floor(Number(goldBalance));
  return Number.isFinite(n) && n >= FERRY_FARE_GOLD;
}

/**
 * Fast-travel destinations from a visited list: every visited
 * realm except the one you are already in, in visited order.
 * Unknown keys are dropped (the list is sanitized on read, but the
 * defence stays here too — a stale key must never become a button).
 */
export function ferryDestinations(visited, currentRealmKey) {
  const out = [];
  for (const k of Array.isArray(visited) ? visited : []) {
    if (k === currentRealmKey) continue;
    const realm = portalRealmByKey(k);
    if (!realm) continue;
    if (out.some((r) => r.key === realm.key)) continue;
    out.push(realm);
  }
  return out;
}

/** Plain-English fare line for the HUD ("1 gold a crossing"). */
export function ferryFareText() {
  return `${FERRY_FARE_GOLD} gold a crossing`;
}
