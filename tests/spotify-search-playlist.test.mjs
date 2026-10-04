// tests/spotify-search-playlist.test.mjs — Headless tests for the radio's
// Spotify search + per-user "Your Search Playlist".
// Run: node --test tests/spotify-search-playlist.test.mjs (from the repo root).
// No browser, no network, no Supabase.
//
// Covers:
// - sanitizeQuery: trim, length cap, non-string input
// - mapSearchItem / mapSearchResponse: Spotify payloads -> slim UI shape,
//   missing fields degrade, unparseable entries dropped, result limit
// - dedupeTracks: dedupe by track id, order preserved
// - trackOpenUrl: honest Free-account deep link shape
// - sanitizeStoredTrack: playlist write validation (id required, caps)
// - supabase/migrations/20261004_spotify_search_playlist.sql: table shape,
//   unique(user_id, spotify_track_id), RLS enabled, three owner-only
//   policies, idempotent markers, never grants clients token writes
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  SEARCH_LIMIT,
  MAX_QUERY_LENGTH,
  sanitizeQuery,
  mapSearchItem,
  mapSearchResponse,
  dedupeTracks,
  trackOpenUrl,
  sanitizeStoredTrack,
} from '../lib/radio/spotify-search.js';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function fakeTrack(overrides = {}) {
  return {
    id: 'track1',
    name: 'Neon Skyline',
    uri: 'spotify:track:track1',
    artists: [{ name: 'Nova' }, { name: 'Reyes' }],
    album: { images: [{ url: 'https://img/art.jpg' }, { url: 'https://img/small.jpg' }] },
    ...overrides,
  };
}

// --- sanitizeQuery -----------------------------------------------------------

test('sanitizeQuery trims and caps length', () => {
  assert.equal(sanitizeQuery('  hello world  '), 'hello world');
  assert.equal(sanitizeQuery('x'.repeat(MAX_QUERY_LENGTH + 50)).length, MAX_QUERY_LENGTH);
});

test('sanitizeQuery returns empty for junk', () => {
  assert.equal(sanitizeQuery('   '), '');
  assert.equal(sanitizeQuery(''), '');
  assert.equal(sanitizeQuery(null), '');
  assert.equal(sanitizeQuery(undefined), '');
  assert.equal(sanitizeQuery(42), '');
});

// --- mapSearchItem -----------------------------------------------------------

test('mapSearchItem maps a full Spotify track payload', () => {
  const t = mapSearchItem(fakeTrack());
  assert.deepEqual(t, {
    id: 'track1',
    title: 'Neon Skyline',
    artist: 'Nova, Reyes',
    albumArt: 'https://img/art.jpg',
    uri: 'spotify:track:track1',
  });
});

test('mapSearchItem degrades on missing fields instead of throwing', () => {
  const t = mapSearchItem({ id: 'abc' });
  assert.equal(t.id, 'abc');
  assert.equal(t.title, 'Unknown track');
  assert.equal(t.artist, '');
  assert.equal(t.albumArt, null);
  assert.equal(t.uri, '');
});

test('mapSearchItem rejects junk', () => {
  assert.equal(mapSearchItem(null), null);
  assert.equal(mapSearchItem(undefined), null);
  assert.equal(mapSearchItem({}), null); // no id
  assert.equal(mapSearchItem({ id: 123 }), null); // id not a string
  assert.equal(mapSearchItem('nope'), null);
});

// --- mapSearchResponse -------------------------------------------------------

test('mapSearchResponse extracts items and drops junk entries', () => {
  const data = { tracks: { items: [fakeTrack(), null, { nope: true }, fakeTrack({ id: 't2' })] } };
  const out = mapSearchResponse(data);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'track1');
  assert.equal(out[1].id, 't2');
});

test('mapSearchResponse caps at SEARCH_LIMIT', () => {
  const items = Array.from({ length: SEARCH_LIMIT + 5 }, (_, i) => fakeTrack({ id: `t${i}` }));
  assert.equal(mapSearchResponse({ tracks: { items } }).length, SEARCH_LIMIT);
});

test('mapSearchResponse handles empty/missing shapes', () => {
  assert.deepEqual(mapSearchResponse(null), []);
  assert.deepEqual(mapSearchResponse({}), []);
  assert.deepEqual(mapSearchResponse({ tracks: {} }), []);
});

// --- dedupeTracks ------------------------------------------------------------

test('dedupeTracks removes repeats by id and keeps order', () => {
  const a = { id: 'a', title: 'A' };
  const b = { id: 'b', title: 'B' };
  const out = dedupeTracks([a, b, { id: 'a', title: 'A2' }, b, { id: 'c', title: 'C' }]);
  assert.deepEqual(out.map((t) => t.id), ['a', 'b', 'c']);
  assert.equal(out[0].title, 'A'); // first occurrence wins
});

test('dedupeTracks skips id-less entries', () => {
  assert.deepEqual(dedupeTracks([null, {}, { id: '' }, { id: 'x' }]), [{ id: 'x' }]);
  assert.deepEqual(dedupeTracks(null), []);
});

// --- trackOpenUrl ------------------------------------------------------------

test('trackOpenUrl builds the honest Free-account deep link', () => {
  assert.equal(trackOpenUrl('abc123'), 'https://open.spotify.com/track/abc123');
  assert.ok(trackOpenUrl('abc123').startsWith('https://open.spotify.com/track/'));
});

// --- sanitizeStoredTrack -----------------------------------------------------

test('sanitizeStoredTrack accepts a valid payload', () => {
  const t = sanitizeStoredTrack({
    spotify_track_id: '  track1 ',
    title: ' Neon Skyline ',
    artist: 'Nova',
    album_art: 'https://img/art.jpg',
  });
  assert.deepEqual(t, {
    spotify_track_id: 'track1',
    title: 'Neon Skyline',
    artist: 'Nova',
    album_art: 'https://img/art.jpg',
  });
});

test('sanitizeStoredTrack rejects missing/oversized ids', () => {
  assert.equal(sanitizeStoredTrack(null), null);
  assert.equal(sanitizeStoredTrack({}), null);
  assert.equal(sanitizeStoredTrack({ spotify_track_id: '   ' }), null);
  assert.equal(sanitizeStoredTrack({ spotify_track_id: 'x'.repeat(65) }), null);
});

test('sanitizeStoredTrack caps long strings and defaults the title', () => {
  const t = sanitizeStoredTrack({ spotify_track_id: 't1', title: 'x'.repeat(500) });
  assert.equal(t.title.length, 300);
  const t2 = sanitizeStoredTrack({ spotify_track_id: 't1' });
  assert.equal(t2.title, 'Unknown track');
  assert.equal(t2.artist, '');
  assert.equal(t2.album_art, '');
});

// --- SQL migration -----------------------------------------------------------

const SQL_PATH = 'supabase/migrations/20261004_spotify_search_playlist.sql';

test('migration file exists and is marked not-executed', () => {
  const sql = readFileSync(path.join(repoRoot, SQL_PATH), 'utf8');
  assert.ok(sql.includes('NOT EXECUTED'), 'migration must be marked not-executed');
});

test('migration: spotify_search_tracks table shape', () => {
  const sql = readFileSync(path.join(repoRoot, SQL_PATH), 'utf8');
  assert.ok(sql.includes('create table if not exists public.spotify_search_tracks'));
  for (const col of ['user_id uuid', 'spotify_track_id text', 'title text', 'artist text', 'album_art text', 'added_at timestamptz']) {
    assert.ok(sql.includes(col), `missing column: ${col}`);
  }
  assert.ok(sql.includes('references auth.users (id) on delete cascade'), 'user_id must cascade on user delete');
  assert.ok(sql.includes('unique (user_id, spotify_track_id)'), 'must dedupe per (user, track)');
});

test('migration: RLS enabled with three owner-only policies', () => {
  const sql = readFileSync(path.join(repoRoot, SQL_PATH), 'utf8');
  assert.ok(sql.includes('enable row level security'), 'RLS must be enabled');
  for (const op of ['for select', 'for insert', 'for delete']) {
    assert.ok(sql.includes(op), `missing policy for ${op}`);
  }
  const ownerChecks = (sql.match(/auth\.uid\(\) = user_id/g) || []).length;
  assert.ok(ownerChecks >= 3, 'every policy must be owner-only (auth.uid() = user_id)');
  assert.ok(!/for update/i.test(sql), 'no UPDATE policy — writes go through the service-role API');
});

test('migration: idempotent markers', () => {
  const sql = readFileSync(path.join(repoRoot, SQL_PATH), 'utf8');
  assert.ok(sql.includes('if not exists'), 'create must be if-not-exists');
  assert.ok(sql.includes('drop policy if exists'), 'policies must drop-if-exists before create');
});

test('migration: stores no tokens or credentials', () => {
  const sql = readFileSync(path.join(repoRoot, SQL_PATH), 'utf8');
  assert.ok(!/refresh_token|access_token|client_secret/i.test(sql), 'no token columns allowed');
});
