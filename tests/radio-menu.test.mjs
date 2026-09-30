// tests/radio-menu.test.mjs
// Radio onboarding (ENCOM first-load) + collaborate invite + two-axis
// Hermes-style satellite menu (2026-09-29).
//
// Task 1: a user's first load opens with ENCOM Part I → ENCOM Part II, then
//   a shuffled queue. Later loads shuffle normally.
// Task 2: one dismissible inline invite to collaborate on the station
//   playlist — shown on the first-load session, never nagging.
// Task 3: SatelliteMenu is a two-axis slider inside the menu window —
//   categories scroll horizontally on a top rail, items scroll vertically
//   beneath, satellite programs slide open with Hermes motion language.
//
// Run: node --test tests/radio-menu.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ENCOM_OPENER,
  STATION,
  STATION_TRACKS,
  buildFirstLoadQueue,
  buildQueue,
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
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Task 1: ENCOM first-load -----------------------------------------------

test('1a. opener is ENCOM Part I then ENCOM Part II, in that order', () => {
  assert.equal(ENCOM_OPENER.length, 2);
  assert.equal(ENCOM_OPENER[0].title, 'Encom Part I');
  assert.equal(ENCOM_OPENER[0].artist, 'Daft Punk');
  assert.equal(ENCOM_OPENER[1].title, 'Encom Part II');
  assert.equal(ENCOM_OPENER[1].artist, 'Daft Punk');
});

test('1b. opener URIs are well-formed Spotify track URIs', () => {
  for (const t of ENCOM_OPENER) {
    assert.ok(isValidTrackUri(t.uri), `${t.title} URI is valid`);
  }
});

test('1c. first-load queue opens with ENCOM I then ENCOM II', () => {
  const q = buildFirstLoadQueue({ rng: seeded(7) });
  assert.equal(q[0].title, 'Encom Part I');
  assert.equal(q[0].uri, ENCOM_OPENER[0].uri);
  assert.equal(q[1].title, 'Encom Part II');
  assert.equal(q[1].uri, ENCOM_OPENER[1].uri);
});

test('1d. first-load queue keeps every station track after the opener', () => {
  const q = buildFirstLoadQueue({ rng: seeded(7) });
  const stationUris = new Set(STATION_TRACKS.map((t) => t.uri));
  const rest = q.slice(2).filter((t) => t.source === 'station');
  assert.equal(rest.length, STATION_TRACKS.length);
  for (const u of stationUris) {
    assert.ok(rest.some((t) => t.uri === u), `station track ${u} present after opener`);
  }
});

test('1e. building the queue never reorders Merlin\'s station source array', () => {
  const before = STATION_TRACKS.map((t) => t.uri);
  buildFirstLoadQueue({ rng: seeded(42) });
  buildQueue({ shuffle: true, rng: seeded(42) });
  assert.deepEqual(STATION_TRACKS.map((t) => t.uri), before);
});

test('1f. no duplicate URIs in the first-load queue', () => {
  const q = buildFirstLoadQueue({ rng: seeded(11) });
  const uris = q.map((t) => t.uri);
  assert.equal(new Set(uris).size, uris.length, 'every URI appears once');
});

test('1g. the pool behind the opener is shuffled, not canonical order', () => {
  const q = buildFirstLoadQueue({ rng: seeded(99) });
  const poolUris = q.slice(2, 2 + STATION_TRACKS.length).map((t) => t.uri);
  assert.notDeepEqual(poolUris, STATION_TRACKS.map((t) => t.uri));
});

test('1h. contributions land in the encore block after the pool', () => {
  const contrib = [{
    uri: 'spotify:track:7hqlHZIXhwAzpWQxm9KzBd',
    title: 'Derezzed',
    artist: 'Daft Punk',
    source: 'module',
    moduleId: 'test-module',
    moduleName: 'Test Module',
  }];
  const q = buildFirstLoadQueue({ contributions: contrib, rng: seeded(5) });
  const tail = q[q.length - 1];
  assert.equal(tail.uri, contrib[0].uri);
  assert.equal(tail.source, 'module');
});

test('1i. opener tracks are labeled honestly in the UI', () => {
  const q = buildFirstLoadQueue({ rng: seeded(1) });
  assert.equal(sourceLabel(q[0]), "Merlin's first-load opener");
  assert.equal(sourceLabel(q[2]), "From Merlin's station playlist");
});

test('1j. provider gates the ritual per-user via localStorage flags', () => {
  assert.ok(providerSrc.includes("nexus.radio.firstLoadDone"), 'device flag key present');
  assert.ok(providerSrc.includes('buildFirstLoadQueue'), 'first-load builder wired in');
  assert.ok(providerSrc.includes('isFirstLoad'), 'first-load state exposed');
  assert.ok(providerSrc.includes('LS_FIRST_LOAD}.${uid}'), 'per-user flag for shared devices');
});

// --- Task 2: collaborate invite ---------------------------------------------

test('2a. invite card renders only on the first-load session and dismisses', () => {
  assert.ok(cardSrc.includes('showCollabInvite'), 'visibility gate');
  assert.ok(cardSrc.includes('if (!showCollabInvite) return null'), 'renders nothing when hidden');
  assert.ok(cardSrc.includes('dismissCollabInvite'), 'dismiss wired');
  assert.ok(cardSrc.includes('aria-label="Dismiss the collaborate invitation"'), 'accessible dismiss');
});

test('2b. invite points at the real station playlist, claims nothing else', () => {
  const code = codeOnly(cardSrc);
  assert.ok(code.includes('STATION.openUrl'), 'links the actual playlist');
  assert.ok(code.includes('Merlin'), 'Merlin approves collaborators in Spotify');
  assert.ok(!code.includes('invite-collaborators'), 'does not pretend the app grants access');
});

test('2c. provider shows the invite once and never nags after dismissal', () => {
  assert.ok(providerSrc.includes('showCollabInvite'), 'exposed in context');
  assert.ok(providerSrc.includes('dismissCollabInvite'), 'dismiss exposed in context');
  assert.ok(providerSrc.includes('nexus.radio.collabDismissed'), 'dismissal persisted');
  assert.ok(providerSrc.includes('isFirstLoad && !collabDismissed'), 'shown only during first-load session');
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
