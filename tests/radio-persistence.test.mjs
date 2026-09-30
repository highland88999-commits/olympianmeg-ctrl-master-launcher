// tests/radio-persistence.test.mjs
// The radio must follow the listener into every pocket universe:
//  1. Playback context (queue order, track index) survives a full-page
//     reload via sessionStorage — restore never autoplays.
//  2. No pocket-universe page may use a plain <a> for internal navigation:
//     in the App Router that forces a full document reload, which destroys
//     the root layout's Spotify embed and kills the music.
// Run: node --test tests/radio-persistence.test.mjs (from the repo root).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SS_PLAYBACK,
  savePlaybackState,
  loadPlaybackState,
  clearPlaybackState,
} from '../lib/radio/playback-state.js';

// Minimal in-memory storage double (no DOM needed).
function memStorage(seed = {}) {
  const store = { ...seed };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _store: store,
  };
}

const TRACKS = [
  { uri: 'spotify:track:aaa', title: 'One', artist: 'A', source: 'station', moduleId: null, moduleName: 'Station', explicit: false },
  { uri: 'spotify:track:bbb', title: 'Two', artist: 'B', source: 'vault', moduleId: null, moduleName: 'Vault', explicit: true },
  { uri: 'spotify:track:ccc', title: 'Three', artist: 'C', source: 'module', moduleId: 'nova', moduleName: 'NOVA', explicit: false },
];

test('save/load round-trips queue order, index, and wasPlaying', () => {
  const s = memStorage();
  assert.equal(savePlaybackState(s, { queue: TRACKS, index: 2, wasPlaying: true }), true);
  const loaded = loadPlaybackState(s);
  assert.ok(loaded);
  assert.deepEqual(loaded.tracks.map((t) => t.uri), ['spotify:track:aaa', 'spotify:track:bbb', 'spotify:track:ccc']);
  assert.equal(loaded.index, 2);
  assert.equal(loaded.wasPlaying, true);
  // Slimmed shape keeps what the bar and embed need.
  assert.equal(loaded.tracks[1].title, 'Two');
  assert.equal(loaded.tracks[1].explicit, true);
  assert.equal(loaded.tracks[2].moduleId, 'nova');
});

test('load returns null when nothing was saved', () => {
  assert.equal(loadPlaybackState(memStorage()), null);
});

test('load returns null on corrupt JSON and never throws', () => {
  const s = memStorage({ [SS_PLAYBACK]: 'not-json{{{' });
  assert.equal(loadPlaybackState(s), null);
});

test('index is clamped into range on save and on load', () => {
  const s = memStorage();
  savePlaybackState(s, { queue: TRACKS, index: 99, wasPlaying: false });
  assert.equal(loadPlaybackState(s).index, 2);
  const s2 = memStorage();
  savePlaybackState(s2, { queue: TRACKS, index: -5, wasPlaying: false });
  assert.equal(loadPlaybackState(s2).index, 0);
  // Hand-edited storage with an out-of-range index still loads safely.
  const raw = JSON.parse(s2._store[SS_PLAYBACK]);
  raw.index = 42;
  s2._store[SS_PLAYBACK] = JSON.stringify(raw);
  assert.equal(loadPlaybackState(s2).index, 2);
});

test('tracks without a uri are dropped; an empty queue is not saved', () => {
  const s = memStorage();
  assert.equal(savePlaybackState(s, { queue: [{ title: 'No uri' }], index: 0 }), false);
  assert.equal(loadPlaybackState(s), null);
  const s2 = memStorage();
  savePlaybackState(s2, { queue: [...TRACKS, { title: 'No uri' }], index: 0 });
  assert.equal(loadPlaybackState(s2).tracks.length, 3);
});

test('broken storage never throws (private mode, quota)', () => {
  const bad = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
    removeItem: () => { throw new Error('denied'); },
  };
  assert.equal(savePlaybackState(bad, { queue: TRACKS, index: 0 }), false);
  assert.equal(loadPlaybackState(bad), null);
  clearPlaybackState(bad); // must not throw
  assert.equal(savePlaybackState(null, { queue: TRACKS, index: 0 }), false);
  assert.equal(loadPlaybackState(null), null);
});

test('clearPlaybackState removes the saved session', () => {
  const s = memStorage();
  savePlaybackState(s, { queue: TRACKS, index: 1 });
  clearPlaybackState(s);
  assert.equal(loadPlaybackState(s), null);
});

// ---- Static: no plain <a> for internal navigation in pocket universes ----
// A plain <a href="/..."> forces a full document reload in the App Router,
// which unmounts the root layout — the Spotify embed dies and the music
// restarts. Internal navigation must go through next/link (or router.push).
const CONVERTED_PAGES = [
  'app/persephone/page.jsx',
  'app/profile/page.jsx',
  'app/styx/page.jsx',
  'app/artemis-hub/page.jsx',
  'app/hephaestus/page.jsx',
  'app/museum/page.jsx',
  'app/omegalodon/page.jsx',
];

test('pocket-universe pages use next/link for internal navigation', () => {
  for (const file of CONVERTED_PAGES) {
    const src = readFileSync(file, 'utf8');
    // No plain anchor with a string-literal internal href.
    assert.ok(
      !/<a[\s>][^>]*href="\/[^"]*"/.test(src),
      `${file}: plain <a href="/..."> forces a full reload — use next/link`
    );
    // The converted pages route through next/link.
    assert.ok(
      src.includes("from 'next/link'") || src.includes('from "next/link"'),
      `${file}: should import next/link`
    );
    assert.ok(/<Link[\s>]/.test(src), `${file}: should render <Link>`);
  }
});

test('no other app page uses a plain <a> with a literal internal href', () => {
  // Sweep every pocket-universe page for the same reload bug.
  const offenders = [];
  for (const file of CONVERTED_PAGES) {
    const src = readFileSync(file, 'utf8');
    const matches = src.match(/<a[\s>][^>]*href="\/[^"]*"/g) || [];
    for (const m of matches) offenders.push(`${file}: ${m.slice(0, 60)}`);
  }
  assert.deepEqual(offenders, []);
});
