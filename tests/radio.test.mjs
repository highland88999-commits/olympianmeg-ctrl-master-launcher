// Tests for the Nexus universe radio.
// Pure logic: station data, true-shuffle queue building, module contributions,
// and the shared window-dock registry contract.
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
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- station data ----------

test('station points at Merlin\u2019s real playlist', () => {
  assert.equal(STATION.playlistId, '0zSejHQqxofrcKxS4HYbVU');
  assert.equal(STATION.playlistUri, 'spotify:playlist:0zSejHQqxofrcKxS4HYbVU');
  assert.equal(STATION.openUrl, 'https://open.spotify.com/playlist/0zSejHQqxofrcKxS4HYbVU');
  assert.match(STATION.name, /Cab Fare and Dynamite/);
});

test('station has exactly his 10 tracks, in his order', () => {
  assert.equal(STATION_TRACKS.length, 10);
  assert.equal(STATION_TRACKS[0].title, 'Next Episode - HEDEGAARD Instrumental Remix');
  assert.equal(STATION_TRACKS[0].artist, 'HEDEGAARD');
  assert.equal(STATION_TRACKS[9].title, 'Get Up (Rattle) [feat. Far East Movement] - Vocal Edit');
  for (const t of STATION_TRACKS) {
    assert.ok(isValidTrackUri(t.uri), `bad uri ${t.uri}`);
    assert.ok(t.title && t.artist);
    assert.ok(Number.isFinite(t.durationMs) && t.durationMs > 0);
    assert.equal(typeof t.explicit, 'boolean');
  }
  // The one explicit track is flagged honestly.
  const explicit = STATION_TRACKS.filter((t) => t.explicit);
  assert.equal(explicit.length, 1);
  assert.equal(explicit[0].title, 'Dysfunctional You');
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

// ---------- shuffle ----------

test('shuffleTracks returns a true permutation and never mutates input', () => {
  const before = STATION_TRACKS.map((t) => t.uri);
  const shuffled = shuffleTracks(STATION_TRACKS, seeded(42));
  assert.equal(shuffled.length, 10);
  assert.deepEqual(STATION_TRACKS.map((t) => t.uri), before); // untouched
  assert.deepEqual(shuffled.map((t) => t.uri).sort(), before.slice().sort()); // same set
  // A seeded shuffle is deterministic and actually reorders.
  const again = shuffleTracks(STATION_TRACKS, seeded(42));
  assert.deepEqual(shuffled.map((t) => t.uri), again.map((t) => t.uri));
  assert.notDeepEqual(shuffled.map((t) => t.uri), before);
});

// ---------- queue building ----------

test('buildQueue shuffles the queue itself by default (true shuffle)', () => {
  const q = buildQueue({ shuffle: true, rng: seeded(7) });
  assert.equal(q.length, 10);
  // Same tracks, genuinely reordered — not just a toggle flag.
  assert.notDeepEqual(q.map((t) => t.uri), STATION_TRACKS.map((t) => t.uri));
  assert.deepEqual(q.map((t) => t.uri).sort(), STATION_TRACKS.map((t) => t.uri).sort());
  // Merlin's tracks are all still there — none removed, none replaced.
  for (const t of q) assert.equal(t.source, 'station');
});

test('buildQueue with shuffle:false preserves his exact order', () => {
  const q = buildQueue({ shuffle: false });
  assert.deepEqual(q.map((t) => t.uri), STATION_TRACKS.map((t) => t.uri));
});

test('contributions form an encore block AFTER the station block', () => {
  const store = createContributionStore();
  const res = store.contribute('nova', 'NOVA', [
    { uri: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA', title: 'Nova Song', artist: 'Nova' },
    { uri: 'spotify:track:BBBBBBBBBBBBBBBBBBBBBB', title: 'Nova Song 2', artist: 'Nova' },
  ]);
  assert.equal(res.ok, true);
  const q = buildQueue({ shuffle: false, contributions: store.allTracks() });
  assert.equal(q.length, 12);
  assert.deepEqual(q.slice(0, 10).map((t) => t.uri), STATION_TRACKS.map((t) => t.uri));
  assert.equal(q[10].source, 'module');
  assert.equal(q[10].moduleName, 'NOVA');
  assert.equal(sourceLabel(q[10]), 'Contributed by NOVA');
  assert.equal(sourceLabel(q[0]), "From Merlin's station playlist");
});

test('shuffle shuffles each block within itself, station block stays first', () => {
  const store = createContributionStore();
  store.contribute('argo', 'ARGO', [
    { uri: 'spotify:track:CCCCCCCCCCCCCCCCCCCCCC', title: 'A', artist: 'A' },
    { uri: 'spotify:track:DDDDDDDDDDDDDDDDDDDDDD', title: 'B', artist: 'B' },
  ]);
  const q = buildQueue({ shuffle: true, contributions: store.allTracks(), rng: seeded(99) });
  assert.equal(q.length, 12);
  const stationUris = new Set(STATION_TRACKS.map((t) => t.uri));
  assert.ok(q.slice(0, 10).every((t) => stationUris.has(t.uri)), 'station block first');
  assert.ok(q.slice(10).every((t) => t.source === 'module'), 'encore block last');
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
  const q = buildQueue({ shuffle: true, vaultTracks: [], rng: seeded(11) });
  assert.equal(q.length, 10);
  assert.ok(q.every((t) => t.source === 'station'));
});

test('shuffle runs ACROSS station + vault as one pool', () => {
  const q = buildQueue({ shuffle: true, vaultTracks: FAKE_VAULT, rng: seeded(21) });
  assert.equal(q.length, 12);
  const uris = q.map((t) => t.uri);
  // Same full set: nothing lost, nothing invented.
  assert.deepEqual(uris.slice().sort(), [...STATION_TRACKS.map((t) => t.uri), ...FAKE_VAULT.map((t) => t.uri)].sort());
  // Truly interleaved: a vault track appears inside the station run (seeded, deterministic).
  const firstVaultAt = q.findIndex((t) => t.source === 'vault');
  assert.ok(firstVaultAt > 0 && firstVaultAt < 11, 'vault interleaved across the pool');
  assert.equal(sourceLabel(q[firstVaultAt]), 'From the Full Vault playlist');
  assert.equal(q[firstVaultAt].moduleName, 'Full Vault');
});

test('shuffle:false keeps station order, then vault order, then contributions', () => {
  const store = createContributionStore();
  store.contribute('nova', 'NOVA', [
    { uri: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA', title: 'N', artist: 'N' },
  ]);
  const q = buildQueue({ shuffle: false, vaultTracks: FAKE_VAULT, contributions: store.allTracks() });
  assert.deepEqual(q.slice(0, 10).map((t) => t.uri), STATION_TRACKS.map((t) => t.uri));
  assert.deepEqual(q.slice(10, 12).map((t) => t.uri), FAKE_VAULT.map((t) => t.uri));
  assert.equal(q[12].source, 'module');
  // Merlin's station order is byte-for-byte his curation even with a vault present.
  assert.equal(q[0].title, 'Next Episode - HEDEGAARD Instrumental Remix');
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
  const q = buildQueue({ shuffle: false });
  assert.equal(nextIndex(q, 9), 0);
  assert.equal(prevIndex(q, 0), 9);
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
