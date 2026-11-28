// lib/muse-connector/keys.js — the per-account connector key.
//
// KEY PLACEMENT DROPPED (Merlin, Nov 27 ~04:15): after seeing the
// whole picture, the key does not have to be put anywhere — Supabase
// is the gatekeeper. The key is NO LONGER ISSUED to the user and NO
// LONGER ACCEPTED as a credential on the connector route: no copy
// step, no paste step, no blind clipboard carry. The route
// authenticates the Supabase session instead
// (lib/muse-connector/session-auth.js). What the key still is, below,
// is the server-side record of the connection — the machinery is
// kept, the placement is gone.
//
// How the key works (handshake pattern, app/api/handshake/route.js):
//   - Root secret: ONE server-side env var, OLYMPUS_MUSE_CONNECTOR_SECRET.
//     It is never logged, never returned, never shown to any user.
//   - Per-account key: HMAC-SHA256(root secret, 'olympus-muse-connector:v1:'
//     + user id), hex. One key per account, derived — never stored.
//     The server re-derives it on every call and compares in constant
//     time, so a key is verified inside ONE process and never
//     hand-carried between steps.
//   - The registry stores only the key FINGERPRINT (SHA-256 of the key),
//     never the key itself. A fingerprint identifies the key in the
//     record without being able to stand in for it. The fingerprint
//     is written at connect time as the server-side record of the
//     connection; it is never returned in a response.
//   - The key itself is never returned, never shown, never logged,
//     never stored, and never placed anywhere by hand.
//   - Revocation does not need the root secret to rotate: the registry
//     row's revoked_at is the kill switch for that account's connection.
//
// Pure functions: the secret is always passed in, never read here, so
// tests can prove derivation and verification without any env.

import { createHash, createHmac, timingSafeEqual } from 'crypto';

export const CONNECTOR_KEY_VERSION = 'v1';
export const CONNECTOR_KEY_LABEL = 'olympus-muse-connector';

/** The HMAC input for one account's key. The version pins the scheme. */
export function connectorKeyMaterial(userId) {
  return `${CONNECTOR_KEY_LABEL}:${CONNECTOR_KEY_VERSION}:${String(userId || '')}`;
}

/**
 * Derive one account's connector key. Returns the 64-char hex key,
 * or '' when the secret or the user id is missing (never derive from
 * nothing — a missing secret must fail closed, not mint a key).
 */
export function deriveConnectorKey(secret, userId) {
  if (!secret || !userId) return '';
  return createHmac('sha256', String(secret))
    .update(connectorKeyMaterial(userId))
    .digest('hex');
}

/** SHA-256 fingerprint of a key — what the registry stores. Never the key. */
export function connectorKeyFingerprint(key) {
  if (!key) return '';
  return createHash('sha256').update(String(key)).digest('hex');
}

/** The 12-char display form of a fingerprint (same rule as ARES short ids). */
export function shortKeyFingerprint(fingerprint) {
  return String(fingerprint || '').slice(0, 12);
}

/**
 * Verify a presented key for an account. Constant-time compare, and
 * false on any shape problem (missing secret, missing user, wrong
 * length) rather than throwing — a verification failure is a plain
 * refusal, never an exception the caller must catch.
 */
export function verifyConnectorKey(secret, userId, presented) {
  try {
    if (!secret || !userId || !presented) return false;
    const expected = deriveConnectorKey(secret, userId);
    const a = Buffer.from(String(presented), 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
