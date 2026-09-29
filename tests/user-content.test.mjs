// tests/user-content.test.mjs
// Headless tests for the universal user-content pool ("cross-pollination").
// Run: node --test tests/user-content.test.mjs (from the repo root).
// No browser, no network — pure logic in lib/user-content/* plus
// source-level checks (vault exclusion, no vault imports).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import {
  CONTENT_TYPES,
  PROGRAM_ACCEPTS,
  EXCLUDED_ORIGINS,
  acceptsType,
  isContentType,
  isExcludedOrigin,
} from '../lib/user-content/types.js';
import {
  SYNC_STATES,
  createRegistry,
  validateItem,
  addItem,
  removeItem,
  getItem,
  listByType,
  listForProgram,
  listAll,
  countItems,
  savePool,
  loadPool,
} from '../lib/user-content/pool.js';
import { seedStationInto } from '../lib/user-content/station-seed.js';
import { STATION, STATION_TRACKS } from '../lib/radio/station.js';
import {
  POOL_DB,
  POOL_STORE,
  StoreUnavailableError,
  saveBlob,
  loadBlob,
} from '../lib/user-content/store-idb.js';
import {
  isConfigured,
  uploadBlob,
  getDownloadUrl,
  defaultPath,
} from '../lib/user-content/firebase.js';
import { syncItem, describeSyncState } from '../lib/user-content/sync.js';
import {
  profilePoolId,
  profileBlobId,
  profileKindToPoolType,
} from '../lib/user-content/bridges.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const UC_LIB = join(HERE, '..', 'lib', 'user-content');

function validItem(overrides = {}) {
  return {
    id: 'it-' + Math.random().toString(36).slice(2),
    type: 'image',
    title: 'Test upload',
    originProgram: 'profile',
    blobRef: 'blob-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------- types ----
describe('types: content types and program accept-declarations', () => {
  it('declares exactly image, video, audio, playlist', () => {
    assert.deepEqual([...CONTENT_TYPES], ['image', 'video', 'audio', 'playlist']);
  });

  it('program accept-declarations match the spec', () => {
    assert.deepEqual([...PROGRAM_ACCEPTS.profile], ['image', 'video']);
    assert.deepEqual([...PROGRAM_ACCEPTS.persephone], ['audio', 'video']);
    assert.deepEqual([...PROGRAM_ACCEPTS.redwater], ['video']);
    assert.deepEqual([...PROGRAM_ACCEPTS.radio], ['audio', 'playlist']);
  });

  it('acceptsType / isContentType helpers', () => {
    assert.equal(acceptsType('profile', 'image'), true);
    assert.equal(acceptsType('profile', 'audio'), false);
    assert.equal(acceptsType('redwater', 'video'), true);
    assert.equal(acceptsType('redwater', 'image'), false);
    assert.equal(acceptsType('nope', 'video'), false);
    assert.equal(isContentType('audio'), true);
    assert.equal(isContentType('gif'), false);
  });

  it('vault exclusion is encoded in types', () => {
    assert.ok(EXCLUDED_ORIGINS.includes('vault'), 'EXCLUDED_ORIGINS names the vault');
    assert.equal(isExcludedOrigin('vault'), true);
    assert.equal(isExcludedOrigin('Vault'), true); // case-insensitive
    assert.equal(isExcludedOrigin('profile'), false);
    assert.equal(isExcludedOrigin(null), false);
  });
});

// ------------------------------------------------------------- registry ----
describe('pool: validation never throws on bad input', () => {
  it('rejects non-objects, bad types, missing origin, sourceless items', () => {
    for (const bad of [null, undefined, 42, 'x', []]) {
      assert.equal(validateItem(bad).ok, false, `validateItem(${JSON.stringify(bad)})`);
      assert.equal(addItem(createRegistry(), bad).ok, false);
    }
    assert.equal(validateItem(validItem({ type: 'gif' })).ok, false);
    assert.match(validateItem(validItem({ type: 'gif' })).error, /bad-type/);
    assert.equal(validateItem(validItem({ originProgram: '' })).ok, false);
    assert.equal(validateItem(validItem({ blobRef: undefined, remoteUrl: undefined })).ok, false);
    assert.match(
      validateItem(validItem({ blobRef: undefined, remoteUrl: undefined })).error,
      /no-source/
    );
  });

  it('normalizes: trims, defaults title/syncState/createdAt, auto-id', () => {
    const r = validateItem({ type: 'AUDIO', originProgram: ' radio ', remoteUrl: 'spotify:track:x' });
    assert.equal(r.ok, true);
    assert.equal(r.item.type, 'audio');
    assert.equal(r.item.originProgram, 'radio');
    assert.equal(r.item.title, '');
    assert.equal(r.item.syncState, 'local-only');
    assert.ok(typeof r.item.id === 'string' && r.item.id.length > 0);
    assert.ok(r.item.createdAt);
  });

  it('addItem never throws on a broken registry', () => {
    assert.equal(addItem(null, validItem()).ok, false);
    assert.equal(addItem({}, validItem()).ok, false);
    assert.equal(addItem({ items: [] }, validItem()).ok, false);
  });
});

describe('pool: add / dedupe / remove / get', () => {
  it('adds and retrieves an item (copy, not reference)', () => {
    const reg = createRegistry();
    const r = addItem(reg, validItem({ id: 'a1' }));
    assert.equal(r.ok, true);
    assert.equal(r.item.id, 'a1');
    const got = getItem(reg, 'a1');
    assert.equal(got.title, 'Test upload');
    got.title = 'mutated';
    assert.equal(getItem(reg, 'a1').title, 'Test upload');
  });

  it('dedupes by id: second add of the same id fails', () => {
    const reg = createRegistry();
    assert.equal(addItem(reg, validItem({ id: 'dup' })).ok, true);
    const again = addItem(reg, validItem({ id: 'dup' }));
    assert.equal(again.ok, false);
    assert.match(again.error, /duplicate-id/);
    assert.equal(countItems(reg), 1);
  });

  it('removeItem reports removed; getItem returns null for missing ids', () => {
    const reg = createRegistry();
    addItem(reg, validItem({ id: 'r1' }));
    assert.deepEqual(removeItem(reg, 'r1'), { ok: true, removed: true });
    assert.deepEqual(removeItem(reg, 'r1'), { ok: true, removed: false });
    assert.equal(getItem(reg, 'r1'), null);
    assert.equal(getItem(reg, '  '), null);
    assert.equal(removeItem(reg, '').ok, false);
  });

  it('listAll returns newest-first copies', () => {
    const reg = createRegistry();
    addItem(reg, validItem({ id: 'old', createdAt: '2020-01-01T00:00:00.000Z' }));
    addItem(reg, validItem({ id: 'new', createdAt: '2026-01-01T00:00:00.000Z' }));
    const all = listAll(reg);
    assert.deepEqual(all.map((i) => i.id), ['new', 'old']);
  });
});

describe('pool: listByType and listForProgram filtering', () => {
  function mixed() {
    const reg = createRegistry();
    addItem(reg, validItem({ id: 'img', type: 'image' }));
    addItem(reg, validItem({ id: 'vid', type: 'video' }));
    addItem(reg, validItem({ id: 'aud', type: 'audio', blobRef: undefined, remoteUrl: 'spotify:track:1' }));
    addItem(reg, validItem({ id: 'pls', type: 'playlist', blobRef: undefined, remoteUrl: 'spotify:playlist:1' }));
    return reg;
  }

  it('listByType filters by type; unknown type -> []', () => {
    const reg = mixed();
    assert.deepEqual(listByType(reg, 'image').map((i) => i.id), ['img']);
    assert.deepEqual(listByType(reg, 'audio').map((i) => i.id), ['aud']);
    assert.deepEqual(listByType(reg, 'gif'), []);
  });

  it('listForProgram returns only accepted types', () => {
    const reg = mixed();
    assert.deepEqual(listForProgram(reg, 'profile').map((i) => i.id).sort(), ['img', 'vid']);
    assert.deepEqual(listForProgram(reg, 'persephone').map((i) => i.id).sort(), ['aud', 'vid']);
    assert.deepEqual(listForProgram(reg, 'redwater').map((i) => i.id), ['vid']);
    assert.deepEqual(listForProgram(reg, 'radio').map((i) => i.id).sort(), ['aud', 'pls']);
    assert.deepEqual(listForProgram(reg, 'no-such-program'), []);
    assert.deepEqual(listForProgram(reg, null), []);
  });
});

// ------------------------------------------------------ vault exclusion ----
describe('vault exclusion (hard rule)', () => {
  it('addItem rejects vault-origin items with error vault-excluded', () => {
    const reg = createRegistry();
    const r = addItem(reg, validItem({ id: 'v1', originProgram: 'vault' }));
    assert.equal(r.ok, false);
    assert.match(r.error, /vault-excluded/);
    assert.equal(countItems(reg), 0);
  });

  it('rejection is case-insensitive and applies via validateItem too', () => {
    assert.equal(validateItem(validItem({ originProgram: 'Vault' })).ok, false);
    assert.match(validateItem(validItem({ originProgram: ' VAULT ' })).error, /vault-excluded/);
    // a legit program still passes
    assert.equal(validateItem(validItem({ originProgram: 'profile' })).ok, true);
  });

  it('no user-content lib file reads, writes, imports, or references vault code paths', () => {
    const files = readdirSync(UC_LIB).filter((f) => f.endsWith('.js'));
    assert.ok(files.length >= 6, 'expected the user-content lib modules');
    for (const f of files) {
      const src = readFileSync(join(UC_LIB, f), 'utf8');
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      assert.ok(!/babel\/vault/.test(code), `${f} references a vault code path`);
      assert.ok(!/from\s+['"][^'"]*vault/.test(code), `${f} imports a vault module`);
      assert.ok(!/require\(\s*['"][^'"]*vault/.test(code), `${f} requires a vault module`);
    }
  });
});

// ----------------------------------------------------------- persistence ---
describe('pool: localStorage persistence is defensive', () => {
  function fakeStorage() {
    const data = {};
    return {
      getItem: (k) => (k in data ? data[k] : null),
      setItem: (k, v) => { data[k] = String(v); },
      removeItem: (k) => { delete data[k]; },
      _data: data,
    };
  }

  it('round-trips items; revalidates on load', () => {
    const store = fakeStorage();
    const reg = createRegistry();
    addItem(reg, validItem({ id: 'p1' }));
    assert.equal(savePool(reg, store), true);
    const loaded = loadPool(store);
    assert.equal(countItems(loaded), 1);
    assert.equal(getItem(loaded, 'p1').title, 'Test upload');
  });

  it('corrupt JSON loads as an empty registry, never throws', () => {
    const store = fakeStorage();
    store.setItem('nexus-user-content-pool-v1', '{not json');
    assert.equal(countItems(loadPool(store)), 0);
  });

  it('invalid persisted items are dropped on load', () => {
    const store = fakeStorage();
    store.setItem(
      'nexus-user-content-pool-v1',
      JSON.stringify({ version: 1, items: [validItem({ id: 'good' }), { id: 'bad', type: 'gif' }] })
    );
    const loaded = loadPool(store);
    assert.equal(countItems(loaded), 1);
    assert.ok(getItem(loaded, 'good'));
  });

  it('no storage at all -> empty registry, savePool false', () => {
    assert.equal(countItems(loadPool(null)), 0);
    assert.equal(savePool(createRegistry(), null), false);
  });
});

// -------------------------------------------------------- station seeding --
describe('station seeding (read-only import of radio)', () => {
  it('seeds one audio item per track plus one playlist item', () => {
    const reg = createRegistry();
    const r = seedStationInto(reg);
    assert.equal(r.added, STATION_TRACKS.length + 1);
    assert.equal(r.skipped, 0);
    assert.equal(listByType(reg, 'audio').length, STATION_TRACKS.length);
    assert.equal(listByType(reg, 'playlist').length, 1);
  });

  it('is idempotent: second seed adds nothing (dedupe by id)', () => {
    const reg = createRegistry();
    seedStationInto(reg);
    const r2 = seedStationInto(reg);
    assert.equal(r2.added, 0);
    assert.equal(r2.skipped, STATION_TRACKS.length + 1);
    assert.equal(countItems(reg), STATION_TRACKS.length + 1);
  });

  it('audio items carry Spotify URIs, no blobs; playlist points at the station', () => {
    const reg = createRegistry();
    seedStationInto(reg);
    for (const a of listByType(reg, 'audio')) {
      assert.ok(a.remoteUrl.startsWith('spotify:track:'), a.remoteUrl);
      assert.equal(a.blobRef, undefined);
      assert.equal(a.originProgram, 'radio');
      assert.equal(a.syncState, 'synced'); // available remotely; nothing to upload
      assert.ok(a.title.length > 0);
    }
    const [pl] = listByType(reg, 'playlist');
    assert.ok(pl.id.startsWith('station:playlist:'));
    assert.equal(pl.remoteUrl, STATION.playlistUri);
    assert.ok(pl.title.includes('Cab Fare') || pl.title.length > 0);
  });

  it('station tracks never mutate the radio source order', () => {
    const before = STATION_TRACKS.map((t) => t.uri).join('|');
    seedStationInto(createRegistry());
    assert.equal(STATION_TRACKS.map((t) => t.uri).join('|'), before);
  });

  it('seeded items are visible to programs that accept audio/playlist', () => {
    const reg = createRegistry();
    seedStationInto(reg);
    const forRadio = listForProgram(reg, 'radio');
    assert.equal(forRadio.length, STATION_TRACKS.length + 1);
    // profile accepts image+video only: station audio must NOT leak in
    assert.equal(listForProgram(reg, 'profile').length, 0);
  });

  it('seeded audio ids are deterministic', () => {
    const a = createRegistry();
    const b = createRegistry();
    seedStationInto(a);
    seedStationInto(b);
    assert.deepEqual(
      listByType(a, 'audio').map((i) => i.id).sort(),
      listByType(b, 'audio').map((i) => i.id).sort()
    );
  });
});

// --------------------------------------------------------------- store-idb --
describe('store-idb: defensive without IndexedDB', () => {
  it('declares the nexus-user-content DB and items store', () => {
    assert.equal(POOL_DB, 'nexus-user-content');
    assert.equal(POOL_STORE, 'items');
  });

  it('rejects honestly when IndexedDB is unavailable (node), never throws sync', async () => {
    assert.equal(typeof indexedDB, 'undefined');
    await assert.rejects(saveBlob(new Blob(['x'])), (e) => {
      assert.ok(e instanceof StoreUnavailableError);
      assert.match(e.reason, /indexeddb-unavailable/);
      return true;
    });
    await assert.rejects(loadBlob('whatever'), /indexeddb-unavailable/);
  });
});

// ---------------------------------------------------------------- firebase --
const FIREBASE_KEYS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

async function withEnv(vars, fn) {
  const saved = {};
  for (const k of FIREBASE_KEYS) saved[k] = process.env[k];
  try {
    for (const k of FIREBASE_KEYS) delete process.env[k];
    Object.assign(process.env, vars);
    return await fn();
  } finally {
    for (const k of FIREBASE_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

describe('firebase: honest unconfigured behavior', () => {
  it('reports unconfigured when env vars are absent', () => {
    withEnv({}, () => {
      assert.equal(isConfigured(), false);
    });
  });

  it('uploadBlob reports unconfigured and never attempts fetch', async () => {
    await withEnv({}, async () => {
      let called = false;
      const realFetch = globalThis.fetch;
      globalThis.fetch = async () => { called = true; throw new Error('must not fetch'); };
      try {
        const r = await uploadBlob('pool/x', new Blob(['x']), { idToken: 'tok' });
        assert.deepEqual(r, { ok: false, error: 'unconfigured' });
        assert.equal(called, false, 'fetch must not be attempted when unconfigured');
      } finally {
        globalThis.fetch = realFetch;
      }
    });
  });

  it('getDownloadUrl returns null when unconfigured — never a fake URL', () => {
    withEnv({}, () => {
      assert.equal(getDownloadUrl('pool/x', 'tok'), null);
    });
  });

  it('isConfigured true only when ALL env vars are present', () => {
    withEnv(
      {
        NEXT_PUBLIC_FIREBASE_API_KEY: 'k',
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'd',
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'p',
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'b',
        NEXT_PUBLIC_FIREBASE_APP_ID: 'a',
      },
      () => assert.equal(isConfigured(), true)
    );
    withEnv({ NEXT_PUBLIC_FIREBASE_API_KEY: 'k' }, () => assert.equal(isConfigured(), false));
  });

  it('configured but no id token -> no-auth-token, no fetch attempted', async () => {
    await withEnv(
      {
        NEXT_PUBLIC_FIREBASE_API_KEY: 'k',
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'd',
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'p',
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'bkt',
        NEXT_PUBLIC_FIREBASE_APP_ID: 'a',
      },
      async () => {
        let called = false;
        const realFetch = globalThis.fetch;
        globalThis.fetch = async () => { called = true; throw new Error('must not fetch'); };
        try {
          const r = await uploadBlob('pool/x', new Blob(['x']), {});
          assert.deepEqual(r, { ok: false, error: 'no-auth-token' });
          assert.equal(called, false);
          const url = getDownloadUrl('pool/x', 'tok123');
          assert.ok(url.includes('firebasestorage.googleapis.com'));
          assert.ok(url.includes(encodeURIComponent('bkt')));
          assert.ok(url.includes('alt=media'));
          assert.ok(url.includes('token=tok123'));
        } finally {
          globalThis.fetch = realFetch;
        }
      }
    );
  });

  it('defaultPath namespaces pool item ids', () => {
    assert.equal(defaultPath('abc'), 'pool/abc');
  });
});

// -------------------------------------------------------------------- sync --
describe('sync: honest sync states', () => {
  function fakeDeps(overrides = {}) {
    return {
      loadBlob: async () => new Blob(['bytes'], { type: 'image/png' }),
      upload: async () => ({ ok: true, downloadToken: 'dtok' }),
      getUrl: (path, tok) => `https://cdn.example/${path}?token=${tok}`,
      persist: () => {},
      ...overrides,
    };
  }

  function registryWithLocal() {
    const reg = createRegistry();
    addItem(reg, validItem({ id: 's1', type: 'image', blobRef: 'blob-s1' }));
    return reg;
  }

  it('successful upload marks synced and records remoteUrl', async () => {
    const reg = registryWithLocal();
    let persisted = 0;
    const r = await syncItem(reg, 's1', fakeDeps({ persist: () => { persisted += 1; } }));
    assert.equal(r.ok, true);
    assert.equal(r.state, 'synced');
    assert.ok(r.item.remoteUrl.includes('cdn.example/pool/s1'));
    assert.equal(getItem(reg, 's1').syncState, 'synced');
    assert.equal(persisted, 1);
  });

  it('unconfigured upload marks unconfigured (never faked)', async () => {
    const reg = registryWithLocal();
    const r = await syncItem(reg, 's1', fakeDeps({ upload: async () => ({ ok: false, error: 'unconfigured' }) }));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'unconfigured');
    assert.equal(r.state, 'unconfigured');
    assert.equal(getItem(reg, 's1').syncState, 'unconfigured');
    assert.equal(getItem(reg, 's1').remoteUrl, undefined);
  });

  it('failed upload marks sync-failed and keeps the local item', async () => {
    const reg = registryWithLocal();
    const r = await syncItem(reg, 's1', fakeDeps({ upload: async () => ({ ok: false, error: 'upload-failed:500' }) }));
    assert.equal(r.ok, false);
    assert.equal(r.state, 'sync-failed');
    assert.equal(getItem(reg, 's1').syncState, 'sync-failed');
    assert.equal(getItem(reg, 's1').blobRef, 'blob-s1');
  });

  it('remote-only items (no blob) are skipped as already available', async () => {
    const reg = createRegistry();
    addItem(reg, validItem({ id: 'ro', type: 'audio', blobRef: undefined, remoteUrl: 'spotify:track:x', syncState: 'local-only' }));
    let uploadCalls = 0;
    const r = await syncItem(reg, 'ro', fakeDeps({ upload: async () => { uploadCalls += 1; return { ok: true }; } }));
    assert.equal(r.ok, true);
    assert.equal(r.skipped, 'remote-only');
    assert.equal(r.state, 'synced');
    assert.equal(uploadCalls, 0);
  });

  it('missing item -> not-found; missing blob -> blob-missing', async () => {
    const reg = registryWithLocal();
    const nf = await syncItem(reg, 'nope', fakeDeps());
    assert.equal(nf.ok, false);
    assert.equal(nf.error, 'not-found');
    const mb = await syncItem(reg, 's1', fakeDeps({ loadBlob: async () => null }));
    assert.equal(mb.ok, false);
    assert.equal(mb.error, 'blob-missing');
  });

  it('syncItem never throws on bad input', async () => {
    const r = await syncItem(null, 'x', null);
    assert.equal(r.ok, false);
  });

  it('describeSyncState speaks plain English', () => {
    assert.equal(describeSyncState('synced'), 'Available');
    assert.equal(describeSyncState('local-only'), 'On this device only');
    assert.equal(describeSyncState('unconfigured'), 'Cloud not connected — on this device only');
    assert.ok(describeSyncState('sync-failed').includes('failed'));
  });
});

// ----------------------------------------------------------------- bridges --
describe('bridges: profile registration helpers are deterministic', () => {
  it('pool/blob ids derive deterministically from the media id', () => {
    assert.equal(profilePoolId('abc'), 'profile-media:abc');
    assert.equal(profileBlobId('abc'), 'poolblob:abc');
    assert.equal(profileKindToPoolType('video'), 'video');
    assert.equal(profileKindToPoolType('photo'), 'image');
    assert.equal(profileKindToPoolType('weird'), 'image');
  });
});
