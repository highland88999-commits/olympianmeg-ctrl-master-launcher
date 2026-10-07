// Tests for the Nexus universe radio.
// Pure logic: station data, The Grid every-open opener, album-order queue
// building, module contributions, and the shared window-dock registry contract.
// Run: node --test tests/radio.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STATION,
  STATION_TRACKS,
  VAULT,
  VAULT_TRACKS,
  buildQueue,
  createContributionStore,
  gridOpener,
  isValidModuleId,
  isValidTrackUri,
  nextIndex,
  prevIndex,
  shuffleTracks,
  sourceLabel,
  vaultReady,
} from '../lib/radio/station.js';

import {
  registerDockEntry,
  unregisterDockEntry,
  updateDockEntry,
  getDockEntries,
  getDockEntry,
  subscribeDock,
  __clearDockRegistry,
} from '../lib/window-dock/registry.js';

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

// Fake 22-track station in album order (The Grid is track 2, like the real
// album) with valid URIs, so queue-logic tests don't depend on real URI
// verification status.
const FAKE_STATION = Array.from({ length: 22 }, (_, i) => ({
  uri: `spotify:track:${String(i).padStart(22, 'A')}`,
  verified: true,
  title: i === 1 ? 'The Grid' : `Track ${i + 1}`,
  artist: 'Daft Punk',
  durationMs: 100000 + i,
  explicit: false,
  openUrl: `https://open.spotify.com/track/${String(i).padStart(22, 'A')}`,
}));

// ---------- station data ----------

test('station points at the TRON: Legacy album', () => {
  assert.equal(STATION.albumId, '3AMXFnwHWXCvNr5NCCpLZI');
  assert.equal(STATION.albumUri, 'spotify:album:3AMXFnwHWXCvNr5NCCpLZI');
  assert.equal(STATION.openUrl, 'https://open.spotify.com/album/3AMXFnwHWXCvNr5NCCpLZI');
  assert.match(STATION.name, /TRON: Legacy/);
});

test('station has the 22-track album sequence, in album order', () => {
  assert.equal(STATION_TRACKS.length, 22);
  const titles = STATION_TRACKS.map((t) => t.title);
  assert.deepEqual(titles, [
    'Overture', 'The Grid', 'The Son of Flynn', 'Recognizer', 'Armory',
    'Arena', 'Rinzler', 'The Game Has Changed', 'Outlands', 'Adagio For TRON',
    'Nocturne', 'End of Line', 'Derezzed', 'Fall', 'Solar Sailer',
    'Rectifier', 'Disc Wars', 'C.L.U.', 'Arrival', 'Flynn Lives',
    'TRON Legacy (End Titles)', 'Finale',
  ]);
  for (const t of STATION_TRACKS) {
    assert.equal(t.artist, 'Daft Punk');
    assert.ok(Number.isFinite(t.durationMs) && t.durationMs > 0);
    assert.equal(t.explicit, false);
    // URIs are honest: present ones must be valid; missing ones are null
    // (never guessed) until verified against Spotify's catalog.
    if (t.uri !== null) assert.ok(isValidTrackUri(t.uri), `bad uri ${t.uri}`);
  }
});

test('track URI validation rejects junk', () => {
  assert.equal(isValidTrackUri('spotify:track:12ZkaSkfGUpfsKujyiq1YK'), true);
  assert.equal(isValidTrackUri('spotify:track:short'), false);
  assert.equal(isValidTrackUri('spotify:album:abc'), false);
  assert.equal(isValidTrackUri('https://open.spotify.com/track/12ZkaSkfGUpfsKujyiq1YK'), false);
  assert.equal(isValidTrackUri(null), false);
  assert.equal(isValidModuleId('nova'), true);
  assert.equal(isValidModuleId('my-pocket-universe-2'), true);
  assert.equal(isValidModuleId('UPPER'), false);
  assert.equal(isValidModuleId(''), false);
});

// ---------- The Grid opener ----------

test('gridOpener returns The Grid when its URI is usable', () => {
  const grid = gridOpener(FAKE_STATION);
  assert.ok(grid);
  assert.equal(grid.title, 'The Grid');
  assert.ok(isValidTrackUri(grid.uri));
});

test('gridOpener returns null when The Grid has no usable URI (never faked)', () => {
  const noGrid = FAKE_STATION.map((t) => (t.title === 'The Grid' ? { ...t, uri: null } : t));
  assert.equal(gridOpener(noGrid), null);
  assert.equal(gridOpener([]), null);
});

// ---------- shuffle ----------

test('shuffleTracks returns a true permutation and never mutates input', () => {
  const before = FAKE_STATION.map((t) => t.uri);
  const shuffled = shuffleTracks(FAKE_STATION, seeded(42));
  assert.equal(shuffled.length, 22);
  assert.deepEqual(FAKE_STATION.map((t) => t.uri), before); // untouched
  assert.deepEqual(shuffled.map((t) => t.uri).sort(), before.slice().sort()); // same set
  const again = shuffleTracks(FAKE_STATION, seeded(42));
  assert.deepEqual(shuffled.map((t) => t.uri), again.map((t) => t.uri));
  assert.notDeepEqual(shuffled.map((t) => t.uri), before);
});

// ---------- queue building ----------

test('The Grid opens the queue on EVERY build, then album order (never shuffled)', () => {
  const q = buildQueue({ stationTracks: FAKE_STATION, shuffle: true, rng: seeded(7) });
  assert.equal(q.length, 22);
  assert.equal(q[0].title, 'The Grid');
  // Rest in album order: Overture, The Son of Flynn (Track 3), ...
  assert.equal(q[1].title, 'Track 1'); // Overture's fake title
  assert.equal(q[2].title, 'Track 3');
  assert.equal(q[21].title, 'Track 22');
  for (const t of q) assert.equal(t.source, 'station');
  // Even with shuffle on, the station block order is deterministic.
  const q2 = buildQueue({ stationTracks: FAKE_STATION, shuffle: true, rng: seeded(99) });
  assert.deepEqual(q.map((t) => t.uri), q2.map((t) => t.uri));
});

test('tracks without usable URIs are skipped, never guessed', () => {
  const partial = FAKE_STATION.map((t, i) => (i % 2 === 0 ? { ...t, uri: null } : t));
  const q = buildQueue({ stationTracks: partial, shuffle: false });
  assert.equal(q.length, 11);
  assert.ok(q.every((t) => isValidTrackUri(t.uri)));
  // The Grid (index 1, kept) still opens.
  assert.equal(q[0].title, 'The Grid');
});

test('contributions form an encore block AFTER the station block', () => {
  const store = createContributionStore();
  const res = store.contribute('nova', 'NOVA', [
    { uri: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA', title: 'Nova Song', artist: 'Nova' },
    { uri: 'spotify:track:BBBBBBBBBBBBBBBBBBBBBB', title: 'Nova Song 2', artist: 'Nova' },
  ]);
  assert.equal(res.ok, true);
  const q = buildQueue({ stationTracks: FAKE_STATION, shuffle: false, contributions: store.allTracks() });
  assert.equal(q.length, 24);
  assert.equal(q[0].title, 'The Grid');
  assert.equal(q[22].source, 'module');
  assert.equal(q[22].moduleName, 'NOVA');
  assert.equal(sourceLabel(q[22]), 'Contributed by NOVA');
  assert.equal(sourceLabel(q[0]), "From Merlin's TRON: Legacy station");
});

test('vault block follows the station; encore stays last', () => {
  const store = createContributionStore();
  store.contribute('argo', 'ARGO', [
    { uri: 'spotify:track:CCCCCCCCCCCCCCCCCCCCCC', title: 'A', artist: 'A' },
  ]);
  const q = buildQueue({
    stationTracks: FAKE_STATION,
    shuffle: false,
    vaultTracks: FAKE_VAULT,
    contributions: store.allTracks(),
  });
  assert.equal(q.length, 25);
  assert.ok(q.slice(0, 22).every((t) => t.source === 'station'), 'station block first');
  assert.ok(q.slice(22, 24).every((t) => t.source === 'vault'), 'vault block second');
  assert.equal(q[24].source, 'module', 'encore last');
});

// ---------- Full Vault (second playlist) ----------

const FAKE_VAULT = [
  { uri: 'spotify:track:EEEEEEEEEEEEEEEEEEEEEE', title: 'Vault One', artist: 'Vault', durationMs: 200000, explicit: false, openUrl: 'https://open.spotify.com/track/EEEEEEEEEEEEEEEEEEEEEE' },
  { uri: 'spotify:track:FFFFFFFFFFFFFFFFFFFFFF', title: 'Vault Two', artist: 'Vault', durationMs: 210000, explicit: false, openUrl: 'https://open.spotify.com/track/FFFFFFFFFFFFFFFFFFFFFF' },
];

test('vault is pending until its URI arrives — never faked', () => {
  assert.equal(VAULT.status, 'pending');
  assert.equal(VAULT.playlistId, null);
  assert.equal(VAULT.playlistUri, null);
  assert.deepEqual(VAULT_TRACKS, []);
  assert.equal(vaultReady(), false);
  assert.match(VAULT.name, /Full Vault/);
});

test('empty vault degrades to the station alone', () => {
  const q = buildQueue({ stationTracks: FAKE_STATION, shuffle: true, vaultTracks: [], rng: seeded(11) });
  assert.equal(q.length, 22);
  assert.ok(q.every((t) => t.source === 'station'));
  assert.equal(q[0].title, 'The Grid');
});

test('shuffle:true shuffles vault and encore, never the station block', () => {
  const q = buildQueue({ stationTracks: FAKE_STATION, shuffle: true, vaultTracks: FAKE_VAULT, rng: seeded(21) });
  assert.equal(q.length, 24);
  // Station block: Grid first, album order, untouched by shuffle.
  assert.equal(q[0].title, 'The Grid');
  assert.deepEqual(q.slice(0, 22).map((t) => t.uri), [
    FAKE_STATION[1].uri, ...FAKE_STATION.slice(0, 1).map((t) => t.uri), ...FAKE_STATION.slice(2).map((t) => t.uri),
  ]);
  assert.ok(q.slice(22).every((t) => t.source === 'vault'));
});

// ---------- contribution store ----------

test('contribution store validates and dedups', () => {
  const store = createContributionStore();
  assert.deepEqual(store.contribute('Bad_ID', 'X', [{ uri: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA' }]), { ok: false, error: 'invalid-module-id' });
  assert.deepEqual(store.contribute('nova', '', [{ uri: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA' }]).ok, false);
  assert.deepEqual(store.contribute('nova', 'NOVA', []), { ok: false, error: 'empty-tracks' });
  assert.deepEqual(store.contribute('nova', 'NOVA', [{ uri: 'not-a-uri' }]), { ok: false, error: 'no-valid-tracks' });

  const ok = store.contribute('nova', 'NOVA', [
    { uri: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA', title: 'One', artist: 'One' },
    { uri: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA', title: 'One dup', artist: 'One' },
    { uri: 'junk', title: 'Junk', artist: 'Junk' },
  ]);
  assert.deepEqual(ok, { ok: true, count: 1 });
  assert.equal(store.allTracks().length, 1);
  assert.deepEqual(store.list(), [{ moduleId: 'nova', moduleName: 'NOVA', trackCount: 1 }]);

  assert.equal(store.removeContribution('nova'), true);
  assert.equal(store.removeContribution('nova'), false);
  assert.equal(store.allTracks().length, 0);
});

// ---------- index helpers ----------

test('nextIndex/prevIndex wrap around the queue', () => {
  const q = buildQueue({ stationTracks: FAKE_STATION, shuffle: false });
  assert.equal(nextIndex(q, 21), 0);
  assert.equal(prevIndex(q, 0), 21);
  assert.equal(nextIndex(q, 3), 4);
  assert.equal(nextIndex([], 0), -1);
});

// ---------- window-dock registry ----------

test('dock registry: register, update, restore, unregister', () => {
  __clearDockRegistry();
  const events = [];
  const unsub = subscribeDock((snap) => events.push(snap));

  let restored = false;
  assert.deepEqual(registerDockEntry({ id: '', onRestore: () => {} }), { ok: false, error: 'invalid-id' });
  assert.deepEqual(registerDockEntry({ id: 'x' }), { ok: false, error: 'missing-onRestore' });

  assert.deepEqual(registerDockEntry({
    id: 'nexus-radio', title: 'Radio', module: 'launcher', minimized: true,
    onRestore: () => { restored = true; },
  }), { ok: true });

  const entry = getDockEntry('nexus-radio');
  assert.equal(entry.title, 'Radio');
  assert.equal(entry.minimized, true);

  assert.equal(updateDockEntry('nexus-radio', { minimized: false, title: 'Radio — Song' }), true);
  assert.equal(getDockEntry('nexus-radio').minimized, false);
  assert.equal(updateDockEntry('nope', { minimized: true }), false);

  getDockEntry('nexus-radio').onRestore();
  assert.equal(restored, true);

  assert.equal(events.length >= 2, true); // register + update (restore/unregister emit separately)
  assert.equal(unregisterDockEntry('nexus-radio'), true);
  assert.equal(getDockEntry('nexus-radio'), null);
  assert.deepEqual(getDockEntries(), []);
  unsub();
  __clearDockRegistry();
});

test('dock registry snapshots are copies', () => {
  __clearDockRegistry();
  registerDockEntry({ id: 'a', onRestore: () => {} });
  const snap = getDockEntries();
  snap[0].title = 'MUTATED';
  assert.notEqual(getDockEntry('a').title, 'MUTATED');
  __clearDockRegistry();
});
