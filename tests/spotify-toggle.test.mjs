// tests/spotify-toggle.test.mjs — Headless tests for the radio's Spotify
// source toggle ("Nexus Radio" <-> "My Spotify").
// Run: node --test tests/spotify-toggle.test.mjs (from the repo root).
// No browser, no network, no Supabase.
//
// Covers:
// - PKCE helpers: RFC 7636 test vector, base64url encoding, verifier charset
// - Authorize-URL construction (exact params Spotify requires)
// - Token-exchange / refresh form bodies (grant types, required fields)
// - Expiry logic with the safety skew
// - Source constants, labels, validation (station is never touched)
// - Honest-degradation copy is pinned (never claim fake playback)
// - supabase/spotify.sql ships the tokens + prefs tables with RLS and
//   owner-only access, and never grants clients token writes
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  SPOTIFY_ACCOUNTS_BASE,
  SPOTIFY_SCOPES,
  SCOPE_STRING,
  SOURCES,
  SOURCE_LABELS,
  isValidSource,
  LS_SOURCE,
  SS_VERIFIER,
  SS_STATE,
  SS_REDIRECT_URI,
  NON_PREMIUM_NOTICE,
  NO_CLIENT_ID_NOTICE,
  NO_DEVICE_NOTICE,
  MY_SPOTIFY_OPEN_URL,
  EXPIRY_SKEW_MS,
  randomString,
  base64UrlEncode,
  codeChallenge,
  redirectUriFor,
  buildAuthorizeUrl,
  buildExchangeBody,
  buildRefreshBody,
  isExpired,
} from '../lib/radio/spotify-auth.js';

import { STATION_TRACKS } from '../lib/radio/station.js';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ---------- PKCE ----------

test('codeChallenge matches the RFC 7636 Appendix B test vector', async () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
  assert.equal(await codeChallenge(verifier), expected);
});

test('base64UrlEncode is URL-safe with no padding', () => {
  // 0xFB 0xFF 0xFE -> standard base64 "+//+", url-safe "-__-"
  assert.equal(base64UrlEncode(new Uint8Array([0xfb, 0xff, 0xfe])), '-__-');
  assert.equal(base64UrlEncode(new Uint8Array([0x00])), 'AA');
  assert.ok(!/[+/=]/.test(base64UrlEncode(new Uint8Array([1, 2, 3, 4, 5, 250, 251]))));
});

test('randomString uses the PKCE-valid charset and requested length', () => {
  for (const len of [32, 64]) {
    const s = randomString(len);
    assert.equal(s.length, len);
    assert.match(s, /^[A-Za-z0-9]+$/);
  }
  assert.notEqual(randomString(64), randomString(64));
});

// ---------- authorize URL ----------

test('buildAuthorizeUrl carries every param Spotify requires', () => {
  const url = buildAuthorizeUrl({
    clientId: 'abc123',
    redirectUri: 'https://olympusverse.com/api/spotify/callback',
    state: 'state-xyz',
    challenge: 'challenge-xyz',
  });
  assert.ok(url.startsWith(`${SPOTIFY_ACCOUNTS_BASE}/authorize?`));
  const u = new URL(url);
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('client_id'), 'abc123');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://olympusverse.com/api/spotify/callback');
  assert.equal(u.searchParams.get('state'), 'state-xyz');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('code_challenge'), 'challenge-xyz');
  const scope = u.searchParams.get('scope');
  for (const s of ['streaming', 'user-read-private', 'user-top-read', 'user-library-read']) {
    assert.ok(scope.split(' ').includes(s), `scope missing ${s}`);
  }
});

test('redirectUriFor points at the callback route, no trailing slash', () => {
  assert.equal(
    redirectUriFor('https://olympusverse.com/'),
    'https://olympusverse.com/api/spotify/callback'
  );
  assert.equal(
    redirectUriFor('http://localhost:3000'),
    'http://localhost:3000/api/spotify/callback'
  );
});

// ---------- token endpoint bodies ----------

test('buildExchangeBody is a PKCE public-client exchange (no secret)', () => {
  const params = new URLSearchParams(buildExchangeBody({
    code: 'auth-code',
    verifier: 'verifier-abc',
    redirectUri: 'https://olympusverse.com/api/spotify/callback',
    clientId: 'abc123',
  }));
  assert.equal(params.get('grant_type'), 'authorization_code');
  assert.equal(params.get('code'), 'auth-code');
  assert.equal(params.get('code_verifier'), 'verifier-abc');
  assert.equal(params.get('redirect_uri'), 'https://olympusverse.com/api/spotify/callback');
  assert.equal(params.get('client_id'), 'abc123');
  assert.ok(!params.has('client_secret'), 'public client must never send a secret');
});

test('buildRefreshBody carries the refresh grant without a secret', () => {
  const params = new URLSearchParams(buildRefreshBody({
    refreshToken: 'refresh-abc',
    clientId: 'abc123',
  }));
  assert.equal(params.get('grant_type'), 'refresh_token');
  assert.equal(params.get('refresh_token'), 'refresh-abc');
  assert.equal(params.get('client_id'), 'abc123');
  assert.ok(!params.has('client_secret'));
});

// ---------- expiry ----------

test('isExpired honors the safety skew and bad input', () => {
  assert.ok(isExpired(new Date(Date.now() - 1000).toISOString()));
  assert.ok(isExpired(null));
  assert.ok(isExpired('not-a-date'));
  // Expires in 30s: inside the 60s skew -> treated as expired.
  assert.ok(isExpired(new Date(Date.now() + 30 * 1000).toISOString()));
  // Expires in 10 minutes: fine.
  assert.ok(!isExpired(new Date(Date.now() + 10 * 60 * 1000).toISOString()));
  assert.equal(EXPIRY_SKEW_MS, 60 * 1000);
});

// ---------- sources ----------

test('source constants: nexus default, my-spotify opt-in', () => {
  assert.equal(SOURCES.NEXUS, 'nexus');
  assert.equal(SOURCES.MY_SPOTIFY, 'my-spotify');
  assert.equal(SOURCE_LABELS[SOURCES.NEXUS], 'Nexus Radio');
  assert.equal(SOURCE_LABELS[SOURCES.MY_SPOTIFY], 'My Spotify');
  assert.ok(isValidSource('nexus'));
  assert.ok(isValidSource('my-spotify'));
  assert.ok(!isValidSource('vault'));
  assert.ok(!isValidSource(''));
  assert.ok(!isValidSource(null));
});

test('storage keys are namespaced', () => {
  assert.equal(LS_SOURCE, 'nexus.radio.source');
  assert.ok(SS_VERIFIER.startsWith('nexus.spotify.'));
  assert.ok(SS_STATE.startsWith('nexus.spotify.'));
  assert.ok(SS_REDIRECT_URI.startsWith('nexus.spotify.'));
});

test('scopes string matches the scope list', () => {
  assert.equal(SCOPE_STRING, SPOTIFY_SCOPES.join(' '));
  assert.ok(SPOTIFY_SCOPES.length >= 8);
});

// ---------- honest degradation copy (pinned) ----------

test('non-Premium notice never claims in-app playback works', () => {
  assert.equal(
    NON_PREMIUM_NOTICE,
    'Full in-app playback needs Spotify Premium — opening in Spotify instead.'
  );
  assert.ok(!/playing now/i.test(NON_PREMIUM_NOTICE));
});

test('degradation notices are plain English', () => {
  assert.ok(NO_CLIENT_ID_NOTICE.length > 20);
  assert.ok(NO_DEVICE_NOTICE.includes("Couldn't reach a Spotify player"));
});

test('the "Open in Spotify" deep link opens the user library', () => {
  assert.equal(MY_SPOTIFY_OPEN_URL, 'https://open.spotify.com/collection/tracks');
});

// ---------- station is untouched ----------

test('the station playlist is untouched by the toggle', () => {
  assert.equal(STATION_TRACKS.length, 10);
  assert.equal(STATION_TRACKS[0].uri, 'spotify:track:12ZkaSkfGUpfsKujyiq1YK');
  assert.equal(STATION_TRACKS[9].uri, 'spotify:track:3wLPRjw2XQpmowqXUXb3UF');
});

// ---------- SQL migration ----------

test('supabase/spotify.sql: tokens table, RLS, owner-read only', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/spotify.sql'), 'utf8');
  assert.ok(sql.includes('create table if not exists public.spotify_tokens'));
  assert.ok(sql.includes('user_id uuid primary key references auth.users (id) on delete cascade'));
  assert.ok(sql.includes('refresh_token text not null'));
  assert.ok(sql.includes('expires_at timestamptz not null'));
  assert.ok(sql.includes('alter table public.spotify_tokens enable row level security'));
  assert.ok(sql.includes('spotify_tokens_owner_read'));
  assert.ok(sql.includes('auth.uid() = user_id'));
  // No client write policies on the tokens table: writes are server-side only.
  const tokenSection = sql.slice(0, sql.indexOf('radio_source_prefs'));
  assert.ok(!/for insert|for update|for delete/i.test(
    tokenSection.slice(tokenSection.indexOf('enable row level security'))
  ), 'tokens table must have no client insert/update/delete policies');
});

test('supabase/spotify.sql: per-user source preference with owner write', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/spotify.sql'), 'utf8');
  assert.ok(sql.includes('create table if not exists public.radio_source_prefs'));
  assert.ok(sql.includes("check (source in ('nexus', 'my-spotify'))"));
  assert.ok(sql.includes('alter table public.radio_source_prefs enable row level security'));
  assert.ok(sql.includes('radio_source_prefs_owner_read'));
  assert.ok(sql.includes('radio_source_prefs_owner_write'));
  assert.ok(sql.includes('radio_source_prefs_owner_update'));
});
