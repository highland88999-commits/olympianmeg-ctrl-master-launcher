// lib/radio/spotify-auth.js
// Spotify OAuth (Authorization Code + PKCE) helpers for the radio's
// "My Spotify" source. Pure functions only — safe to unit-test headless.
//
// Security contract:
// - The client secret NEVER exists: this is a public client using PKCE.
// - The code<->token exchange and every refresh happen in server API
//   routes (app/api/spotify/*). The browser never sees a refresh token;
//   it only ever holds short-lived access tokens for Spotify's own APIs.
// - The station (lib/radio/station.js) is untouched by everything here.

export const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';
export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// Scopes for the "My Spotify" source: read the account (to detect Premium),
// read the library/top tracks, and control playback on the in-app device.
export const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-top-read',
  'user-library-read',
  'playlist-read-private',
  'streaming',
];

export const SCOPE_STRING = SPOTIFY_SCOPES.join(' ');

// The two playback sources. 'nexus' is the house station (default).
export const SOURCES = Object.freeze({
  NEXUS: 'nexus',
  MY_SPOTIFY: 'my-spotify',
});

export const SOURCE_LABELS = Object.freeze({
  [SOURCES.NEXUS]: 'Nexus Radio',
  [SOURCES.MY_SPOTIFY]: 'My Spotify',
});

export function isValidSource(s) {
  return s === SOURCES.NEXUS || s === SOURCES.MY_SPOTIFY;
}

// Local storage keys.
export const LS_SOURCE = 'nexus.radio.source';

// sessionStorage keys for the in-flight OAuth round trip.
export const SS_VERIFIER = 'nexus.spotify.pkce.verifier';
export const SS_STATE = 'nexus.spotify.pkce.state';
export const SS_REDIRECT_URI = 'nexus.spotify.pkce.redirect_uri';

// Plain-English copy for honest degradation (exported so tests pin it).
export const NON_PREMIUM_NOTICE =
  'Full in-app playback needs Spotify Premium — opening in Spotify instead.';
export const NO_CLIENT_ID_NOTICE =
  'Spotify sign-in is not configured yet — the app owner still needs to add the Spotify client ID.';
export const NO_DEVICE_NOTICE =
  "Couldn't reach a Spotify player on this device. Open Spotify on this device, then try again.";

// --- PKCE -----------------------------------------------------------------

// Crypto-safe random string, [A-Za-z0-9] only (valid PKCE charset).
export function randomString(length = 64) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  const cryptoObj =
    (typeof window !== 'undefined' && window.crypto) ||
    (typeof globalThis !== 'undefined' && globalThis.crypto);
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('Secure random is unavailable in this environment.');
  }
  cryptoObj.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// Base64url-encode a byte array (no padding). Pure — headless-testable.
export function base64UrlEncode(bytes) {
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  // btoa exists in browsers and Node 16+.
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// S256 code challenge for a verifier. Async (WebCrypto); the pure
// base64UrlEncode above is what tests pin against the RFC 7636 vector.
export async function codeChallenge(verifier) {
  const cryptoObj =
    (typeof window !== 'undefined' && window.crypto) ||
    (typeof globalThis !== 'undefined' && globalThis.crypto);
  if (!cryptoObj?.subtle) throw new Error('WebCrypto is unavailable in this environment.');
  const digest = await cryptoObj.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

// --- URLs -----------------------------------------------------------------

// The redirect URI for the OAuth round trip, derived from the page origin.
// Registered redirect URIs (Merlin must add both in the Spotify dashboard):
//   https://olympusverse.com/api/spotify/callback
//   http://localhost:3000/api/spotify/callback
export function redirectUriFor(origin) {
  const clean = String(origin || '').replace(/\/+$/, '');
  return `${clean}/api/spotify/callback`;
}

export function buildAuthorizeUrl({ clientId, redirectUri, state, challenge }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPE_STRING,
    redirect_uri: redirectUri,
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  return `${SPOTIFY_ACCOUNTS_BASE}/authorize?${params.toString()}`;
}

// Form body for the server-side code exchange (grant_type=authorization_code).
// Built here so tests can pin the exact fields; the fetch itself lives in
// app/api/spotify/_server.js (server only).
export function buildExchangeBody({ code, verifier, redirectUri, clientId }) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  });
  return params.toString();
}

export function buildRefreshBody({ refreshToken, clientId }) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
  return params.toString();
}

// Expiry with a safety buffer: treat the token as expired this many ms
// before Spotify's expires_in elapses, so playback never starts on a
// token that dies mid-request.
export const EXPIRY_SKEW_MS = 60 * 1000;

export function isExpired(expiresAtIso, nowMs = Date.now()) {
  if (!expiresAtIso) return true;
  const t = Date.parse(expiresAtIso);
  if (!Number.isFinite(t)) return true;
  return t - EXPIRY_SKEW_MS <= nowMs;
}

// Deep link used by the honest-degradation notice: opens the user's own
// library in the Spotify app / web player.
export const MY_SPOTIFY_OPEN_URL = 'https://open.spotify.com/collection/tracks';
