// tests/radio-menu.test.mjs
// Radio TRON: Legacy station (2026-10-06) + collaborate invite retirement +
// two-axis Hermes-style satellite menu (2026-09-29).
//
// Task 1 (2026-10-06): the station is Daft Punk's TRON: Legacy soundtrack.
//   "The Grid" opens the queue on EVERY open, then the album plays in order.
//   The old ENCOM first-load ritual is retired.
// Task 2 (2026-10-06): the collaborate invite is retired — the station is an
//   album, not a collaborative playlist. The card stays dormant.
// Task 3: SatelliteMenu is a two-axis slider inside the menu window —
//   categories scroll horizontally on a top rail, items scroll vertically
//   beneath, satellite programs slide open with Hermes motion language.
//
// Run: node --test tests/radio-menu.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  STATION,
  STATION_TRACKS,
  buildQueue,
  gridOpener,
  isValidTrackUri,
  sourceLabel,
} from '../lib/radio/station.js';

const menuSrc = readFileSync('components/SatelliteMenu.jsx', 'utf8');
const providerSrc = readFileSync('components/radio/RadioProvider.jsx', 'utf8');
const cardSrc = readFileSync('components/radio/CollabInviteCard.jsx', 'utf8');
// Static checks run against code, not comments.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Deterministic rng (mulberry32) for shuffle tests.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fake 22-track station with valid URIs (The Grid at album position 2).
const FAKE_STATION = Array.from({ length: 22 }, (_, i) => ({
  uri: `spotify:track:${String(i).padStart(22, 'B')}`,
  verified: true,
  title: i === 1 ? 'The Grid' : `Track ${i + 1}`,
  artist: 'Daft Punk',
  durationMs: 100000 + i,
  explicit: false,
  openUrl: `https://open.spotify.com/track/${String(i).padStart(22, 'B')}`,
}));

// --- Task 1: The Grid every-open opener --------------------------------------

test('1a. gridOpener finds The Grid when its URI is usable', () => {
  const grid = gridOpener(FAKE_STATION);
  assert.ok(grid);
  assert.equal(grid.title, 'The Grid');
  assert.ok(isValidTrackUri(grid.uri));
});

test('1b. gridOpener returns null (never a wrong track) when The Grid has no URI', () => {
  const noGrid = FAKE_STATION.map((t) => (t.title === 'The Grid' ? { ...t, uri: null } : t));
  assert.equal(gridOpener(noGrid), null);
});

test('1c. every queue build opens with The Grid — not just the first load', () => {
  for (const seed of [7, 42, 99]) {
    const q = buildQueue({ stationTracks: FAKE_STATION, shuffle: true, rng: seeded(seed) });
    assert.equal(q[0].title, 'The Grid', `seed ${seed}: The Grid opens`);
  }
  // No first-load-only builder remains.
  assert.ok(!codeOnly(providerSrc).includes('buildFirstLoadQueue'), 'provider has no first-load builder');
});

test('1d. the station plays in album order after The Grid (never shuffled)', () => {
  const q = buildQueue({ stationTracks: FAKE_STATION, shuffle: true, rng: seeded(7) });
  assert.equal(q[0].title, 'The Grid');
  assert.equal(q[1].title, 'Track 1'); // Overture slot
  assert.equal(q[2].title, 'Track 3');
  assert.equal(q[21].title, 'Track 22');
});

test('1e. building the queue never reorders the station source array', () => {
  const before = STATION_TRACKS.map((t) => t.title);
  buildQueue({ stationTracks: FAKE_STATION, shuffle: true, rng: seeded(42) });
  buildQueue({ shuffle: true, rng: seeded(42) });
  assert.deepEqual(STATION_TRACKS.map((t) => t.title), before);
});

test('1f. no duplicate URIs in the queue', () => {
  const q = buildQueue({ stationTracks: FAKE_STATION, shuffle: true, rng: seeded(11) });
  const uris = q.map((t) => t.uri);
  assert.equal(new Set(uris).size, uris.length, 'every URI appears once');
});

test('1g. tracks without URIs are skipped, never guessed', () => {
  const partial = FAKE_STATION.map((t, i) => (i > 5 ? { ...t, uri: null } : t));
  const q = buildQueue({ stationTracks: partial, shuffle: false });
  assert.ok(q.every((t) => isValidTrackUri(t.uri)));
  assert.equal(q[0].title, 'The Grid');
});

test('1h. contributions land in the encore block after the station', () => {
  const contrib = [{
    uri: 'spotify:track:7hqlHZIXhwAzpWQxm9KzBd',
    title: 'Derezzed',
    artist: 'Daft Punk',
    source: 'module',
    moduleId: 'test-module',
    moduleName: 'Test Module',
  }];
  const q = buildQueue({ stationTracks: FAKE_STATION, contributions: contrib, rng: seeded(5) });
  const tail = q[q.length - 1];
  assert.equal(tail.uri, contrib[0].uri);
  assert.equal(tail.source, 'module');
});

test('1i. station tracks are labeled honestly in the UI', () => {
  const q = buildQueue({ stationTracks: FAKE_STATION, shuffle: false });
  assert.equal(sourceLabel(q[0]), "From Merlin's TRON: Legacy station");
});

test('1j. the ENCOM first-load ritual is fully retired', () => {
  const code = codeOnly(providerSrc);
  assert.ok(!code.includes('ENCOM'), 'no ENCOM references in provider code');
  assert.ok(!code.includes('firstLoadDone'), 'no first-load flags in provider code');
  assert.ok(!code.includes('buildFirstLoadQueue'), 'no first-load builder in provider code');
});

// --- Task 2: collaborate invite retired -------------------------------------

test('2a. the invite is retired — never shown (station is an album, not a playlist)', () => {
  assert.ok(providerSrc.includes('showCollabInvite'), 'still exposed in context (dormant)');
  const code = codeOnly(providerSrc);
  assert.ok(code.includes('const showCollabInvite = false'), 'hard-off, not gated on first load');
});

test('2b. invite card still renders nothing when hidden', () => {
  assert.ok(cardSrc.includes('showCollabInvite'), 'visibility gate');
  assert.ok(cardSrc.includes('if (!showCollabInvite) return null'), 'renders nothing when hidden');
});

// --- Task 3: two-axis Hermes-style slider menu -------------------------------

test('2d. invite card is rendered inline in the radio library sheet', () => {
  const bar = readFileSync('components/radio/RadioBar.jsx', 'utf8');
  assert.ok(bar.includes("import CollabInviteCard from './CollabInviteCard'"), 'card imported');
  assert.ok(bar.includes('<CollabInviteCard />'), 'card rendered in the house-station sheet');
});

test('3a. categories ride a horizontal slider rail', () => {
  assert.ok(menuSrc.includes('role="tablist"'), 'rail is a tablist');
  assert.ok(menuSrc.includes('overflow-x-auto'), 'rail scrolls horizontally');
  assert.ok(menuSrc.includes('aria-selected'), 'active category announced');
});

test('3b. items scroll vertically beneath the rail, inside the menu window', () => {
  const code = codeOnly(menuSrc);
  assert.ok(code.includes('overflow-y-auto'), 'items region scrolls vertically');
  assert.ok(code.includes('flex-1'), 'items fill the window below the rail');
  assert.ok(!code.includes('fixed '), 'no full-screen takeover');
  assert.ok(!code.includes('drawer'), 'not a detached edge drawer');
});

test('3c. satellite programs slide with Hermes motion language', () => {
  assert.ok(menuSrc.includes('cubic-bezier(0.19, 1, 0.22, 1)'), 'Hermes expo-out curve');
  assert.ok(menuSrc.includes('max-height'), 'max-height slide pattern');
  assert.ok(menuSrc.includes('overflow-hidden'), 'panel clips during slide');
  assert.ok(menuSrc.includes('Deploy'), 'terse terminal toggle language');
  assert.ok(menuSrc.includes('aria-expanded'), 'toggle announces state');
  assert.ok(menuSrc.includes('motion-reduce:transition-none'), 'reduced-motion respected');
});

test('3d. launches still go through the single menu-to-satellite path', () => {
  assert.ok(menuSrc.includes('onLaunch(p.route, key, sat.pos)'), 'single launch path preserved');
  assert.ok(menuSrc.includes('satIndex, onLaunch'), 'onLaunch arrives via props');
  const calls = (menuSrc.match(/onLaunch\(p\.route/g) || []).length;
  assert.equal(calls, 1, 'exactly one launch call site');
});

test('3e. menu content intact: all god menus, BABEL floors, translations', () => {
  assert.ok(menuSrc.includes('GOD_MENUS'), 'god menu data used');
  assert.ok(menuSrc.includes('FLOORS'), 'BABEL floors listed');
  assert.ok(menuSrc.includes('t(`sat.'), 'translations preserved');
  assert.ok(menuSrc.includes('fx.menuOpen'), 'menu sounds preserved');
});
