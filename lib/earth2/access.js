// lib/earth2/access.js
// EARTH 2 ACCESS — the one definition (Merlin, 2026-10-31): Earth 2
// is UNLOCKED FOR ALL USERS — any signed-in account gets in. The
// owner and the proof-of-concept guest keep their parcel grants;
// everyone else enters as an explorer (read + unlock, and they may
// buy land, build on land they own, and claim the forge — the write
// routes verify this same access and enforce their own rights checks
// inside).
//
// History: Phase 2 began owner-locked (2026-10-21, the isolation
// law: owner-locked until Oblivion). The proof-of-concept order
// (2026-10-23) admitted exactly one named guest beside the owner —
// fishstart@hotmail.com, one granted parcel each. The 2026-10-31
// unlock superseded both: the guest email string still lives ONLY
// in this module (for the parcel grants and guest identity), and the
// owner email is never copied here (lib/owner.js isOwnerEmail).
//
// Every surface defers to hasEarth2Access /
// verifyEarth2AccessSession here: the hub portal gate, the chamber
// page gate, the model-urls door, the read-only state route, and
// the write routes (buy / forge / rent / builds / claims).
//
// The session verifier mirrors lib/owner.js's verifyOwnerSession:
// the comparison always happens server-side on a freshly validated
// session, never in the browser. (The chamber page's client-side
// check uses hasEarth2Access on the session email only to decide
// what to render; the API routes re-verify server-side regardless.)

import { isOwnerEmail } from '../owner.js';
import { getOblivionEndsAt, checkTeamMembership } from './release.js';

/** The one named proof-of-concept guest account. */
export const EARTH2_GUEST_EMAIL = 'fishstart@hotmail.com';

/** True when the email is the POC guest's (trim + case-insensitive,
 *  the house email rule). */
export function isEarth2GuestEmail(email) {
  return String(email || '').trim().toLowerCase() === EARTH2_GUEST_EMAIL;
}

/**
 * The Earth 2 access decision, pure (Merlin, 2026-10-31): Earth 2 is
 * now UNLOCKED FOR ALL USERS — any signed-in account gets in. The
 * owner and the POC guest keep their parcel grants and write access;
 * everyone else enters as an explorer (read + unlock, no parcel
 * writes until they buy). Null/undefined/empty (signed out, or the
 * session still resolving) are all "no access" — every surface stays
 * absent until the session actually proves whose it is.
 */
export function hasEarth2Access(email) {
  return !!String(email || '').trim();
}

// Validate a Supabase access token against the Auth API and report
// whether the session belongs to an account with Earth 2 access.
// (Merlin, 2026-10-31): Earth 2 is now open to ALL signed-in users —
// any validated session gets in. The Oblivion team-release check
// below is kept for the prize-settlement path, which stays gated.
// Returns { user } or { user: null }. Never throws for bad tokens.
export async function verifyEarth2AccessSession(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') return { user: null };
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return { user: null };
    const sb = createClient(url, key);
    const { data, error } = await sb.auth.getUser(accessToken);
    if (error || !data || !data.user) return { user: null };
    return { user: data.user };
  } catch {
    return { user: null };
  }
}

// ── The POC land grants (Merlin, 2026-10-23) ────────────────────
// Two of the 1,000 ownable parcels, granted directly (payment
// bypassed) as the proof of concept: one to the owner, one to the
// guest, with exactly ONE parcel between them — the gap parcel,
// which is NOT granted and stays in the first-round sale pool.
// The titles are written by supabase/earth2-poc-grants.sql (staged,
// Merlin's green light) into the same earth2_parcels table the buy
// route writes, so the land-sale counting sees them with no special
// case. The pick (pinned by tests/earth2.test.mjs): a north–south
// run in column 18 — E2-0619 / E2-0669 / E2-0719, all Onyx Meadows,
// temperate grassland, dry centres (2.9 m / 2.6 m / 3.1 m), no
// protected ground, 351 m from the Cinder Grove landing and 266 m
// from the museum grounds, so the two owners can actually visit
// each other: their parcels' centres are 56 m apart.
export const POC_OWNER_PARCEL_ID = 'E2-0619';
export const POC_GAP_PARCEL_ID = 'E2-0669';
export const POC_GUEST_PARCEL_ID = 'E2-0719';
