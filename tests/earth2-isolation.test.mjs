// tests/earth2-isolation.test.mjs
// EARTH 2 ISOLATION — "lock and key" (Merlin, 2026-10-22):
// "No characters for earth 2 should appear anywhere in the multiverse
// except in earth 2 file which is behind lock and key to my account
// until oblivion day."
//
// Pins:
// - the Bay mounts ONLY inside the owner-gated chamber page
// - no '/models/earth2' public path survives anywhere outside
//   lib/earth2 (the manifest/resolver) — the models move to the
//   private earth2-models bucket behind owner-signed URLs
// - no Earth 2 model key is referenced by kombat / planets / earth /
//   hub code (Kombat's own Oct-14 dinosaur fighters are separate
//   embodiments in the fighter-models bucket and never carried these
//   keys)
// - the model-urls route refuses non-owners (owner session check,
//   404, manifest allowlist, signed URLs only — never public URLs)
// - the resolver: relative keys, signed URL wins, public fallback
//   exists behind EARTH2_PUBLIC_FALLBACK (true until the bucket
//   migration is verified; the migration flips it and deletes the
//   public files)
//
// Run: node --test tests/earth2-isolation.test.mjs   (from repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

import {
  EARTH2_MODEL_BUCKET,
  EARTH2_PUBLIC_FALLBACK,
  EARTH2_SIGNED_URL_TTL_SECONDS,
  earth2ModelKey,
  earth2ModelKeys,
  earth2ModelUrl,
  earth2PlacedModels,
  fetchEarth2ModelUrls,
  isEarth2ModelKey,
} from '../lib/earth2/models.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

// The chamber's territory: the page, its API, its scene, its lib.
// Earth 2 things may exist ONLY inside these prefixes (and tests).
const TERRITORY = ['app/earth-2/', 'app/api/earth2/', 'components/earth2/', 'lib/earth2/'];
const inTerritory = (rel) => TERRITORY.some((t) => rel.startsWith(t));

function sourceFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|jsx|ts|tsx)$/.test(name)) out.push(p);
    }
  };
  walk(join(repo, dir));
  return out.map((p) => relative(repo, p).split(sep).join('/'));
}

const ALL_SOURCES = ['app', 'components', 'lib', 'hooks', 'store']
  .flatMap((d) => sourceFiles(d));

describe('the lock — bucket, keys, resolver', () => {
  it('the vault is the private earth2-models bucket with 1-hour URLs', () => {
    assert.equal(EARTH2_MODEL_BUCKET, 'earth2-models');
    assert.equal(EARTH2_SIGNED_URL_TTL_SECONDS, 3600);
  });

  it('EARTH2_PUBLIC_FALLBACK is OFF — the bucket migration is verified (56/56 objects uploaded 2026-10-22, stranger route 404 + unsigned object denied; models live only behind signed URLs)', () => {
    assert.equal(typeof EARTH2_PUBLIC_FALLBACK, 'boolean');
    assert.equal(EARTH2_PUBLIC_FALLBACK, false);
  });

  it('every placed model is addressed by its relative key (<slug>.glb)', () => {
    const placed = earth2PlacedModels();
    assert.ok(placed.length >= 34, 'the foundry roster is placed');
    for (const m of placed) {
      assert.equal(earth2ModelKey(m), `${m.slug}.glb`, m.slug);
      assert.ok(isEarth2ModelKey(earth2ModelKey(m)), m.slug);
    }
    const keys = earth2ModelKeys();
    assert.equal(new Set(keys).size, keys.length, 'keys are unique');
    assert.equal(earth2ModelKey(null), null);
    assert.equal(earth2ModelKey({ file: null }), null);
    assert.equal(isEarth2ModelKey('not-a-model.glb'), false);
    assert.equal(isEarth2ModelKey('../tyrannosaurus-rex.glb'), false);
    assert.equal(isEarth2ModelKey(''), false);
  });

  it('earth2ModelUrl prefers the signed URL; with the fallback OFF there is no public path', () => {
    const entry = earth2PlacedModels()[0];
    const key = earth2ModelKey(entry);
    const signed = { [key]: 'https://signed.example/abc?token=x' };
    assert.equal(earth2ModelUrl(entry, signed), signed[key]);
    assert.equal(earth2ModelUrl(entry, null), null, 'no signed URL, no load — the public copies are retired');
    assert.equal(earth2ModelUrl(entry, {}), null);
    assert.equal(earth2ModelUrl({ file: null, slug: 'ghost' }, signed), null);
  });

  it('fetchEarth2ModelUrls asks the gated route with the session, never leaks on failure', async () => {
    const calls = [];
    const okFetch = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ ok: true, urls: { 'tyrannosaurus-rex.glb': 'https://signed/1' } }) };
    };
    const urls = await fetchEarth2ModelUrls({ token: 'tok123', fetchImpl: okFetch });
    assert.deepEqual(urls, { 'tyrannosaurus-rex.glb': 'https://signed/1' });
    assert.equal(calls[0].url, '/api/earth2/model-urls');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer tok123');
    const sentKeys = JSON.parse(calls[0].init.body).keys;
    assert.deepEqual(sentKeys, earth2ModelKeys(), 'asks for exactly the manifest keys');

    const denied = async () => ({ ok: false, json: async () => ({}) });
    assert.equal(await fetchEarth2ModelUrls({ token: 'tok123', fetchImpl: denied }), null);
    assert.equal(await fetchEarth2ModelUrls({ token: '', fetchImpl: okFetch }), null);
    const boom = async () => { throw new Error('network'); };
    assert.equal(await fetchEarth2ModelUrls({ token: 'tok123', fetchImpl: boom }), null);
  });
});

describe('the model-urls route — Earth 2 access or nothing', () => {
  const src = read('app/api/earth2/model-urls/route.js');

  it('verifies an Earth 2 access session server-side and 404s everyone else', () => {
    assert.ok(src.includes('verifyEarth2AccessSession'), 'access session check (owner or POC guest)');
    assert.ok(src.includes("from '@/lib/earth2/access'"), 'the access law is the one source of truth');
    assert.ok(src.includes('status: 404'), 'accounts without access get a 404');
  });

  it('signs only manifest keys, from the private bucket, for one hour', () => {
    assert.ok(src.includes('isEarth2ModelKey'), 'request keys filtered by the manifest allowlist');
    assert.ok(src.includes('earth2ModelKeys'), 'default set derives from the manifest');
    assert.ok(src.includes('EARTH2_MODEL_BUCKET'), 'bucket comes from the manifest module');
    assert.ok(src.includes('createSignedUrls'), 'signed URLs, minted server-side');
    assert.ok(src.includes('EARTH2_SIGNED_URL_TTL_SECONDS'), 'the 1-hour TTL');
    assert.ok(src.includes('getServiceClient'), 'service role does the signing');
  });

  it('never hands out a public URL or the service key', () => {
    assert.ok(!src.includes('getPublicUrl'), 'no public URLs');
    assert.ok(!src.includes('SUPABASE_SERVICE_ROLE_KEY'), 'no raw key handling in the route');
  });

  it('is wrapped in the house guards', () => {
    assert.ok(src.includes('apiGuard'), 'apiGuard');
    assert.ok(src.includes('noCache'), 'noCache');
    assert.ok(src.includes("dynamic = 'force-dynamic'"), 'never statically cached');
  });
});

describe('the bucket SQL — staged, private, not run', () => {
  const sql = read('supabase/earth2-models-bucket.sql');
  it('creates earth2-models as a private bucket and says NOT RUN', () => {
    assert.ok(sql.includes('NOT RUN'), 'marked not run — SQL needs the green light');
    assert.ok(sql.includes("'earth2-models', 'earth2-models', false"), 'private (public = false)');
    assert.ok(!/values \('earth2-models', 'earth2-models', true\)/.test(sql), 'never public');
  });
});

describe('isolation — the multiverse stays clean', () => {
  it('the Bay is mounted only by the chamber page', () => {
    const importers = ALL_SOURCES.filter((rel) =>
      read(rel).includes('earth2/DinosaurBay') && rel !== 'components/earth2/DinosaurBay.jsx'
    );
    assert.ok(importers.includes('app/earth-2/page.jsx'), 'the chamber page mounts the Bay');
    // Nothing OUTSIDE the chamber territory may reference it (earth2's
    // own lib files cross-referencing the Bay in comments is fine).
    assert.deepEqual(importers.filter((rel) => !inTerritory(rel)), []);
  });

  it("no '/models/earth2' public path survives outside lib/earth2", () => {
    const offenders = ALL_SOURCES.filter(
      (rel) => !rel.startsWith('lib/earth2/') && read(rel).includes('/models/earth2')
    );
    assert.deepEqual(offenders, []);
  });

  it('no Earth 2 model key is referenced outside the chamber territory', () => {
    const keys = earth2ModelKeys();
    assert.ok(keys.length >= 34);
    // Whole-key match: the key must not be preceded by a word char
    // or '-' — Earth 1's own 'e001-rocky-outcrop.glb' (earth-models
    // bucket, a different file) is a substring lookalike, not a
    // reference to the Earth 2 'rocky-outcrop.glb'.
    const keyHit = (src, key) => {
      let i = src.indexOf(key);
      while (i !== -1) {
        const before = i === 0 ? '' : src[i - 1];
        if (!/[A-Za-z0-9_-]/.test(before)) return true;
        i = src.indexOf(key, i + 1);
      }
      return false;
    };
    const offenders = [];
    for (const rel of ALL_SOURCES) {
      if (inTerritory(rel)) continue;
      const src = read(rel);
      for (const key of keys) {
        if (keyHit(src, key)) offenders.push(`${rel} → ${key}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('the Bay loads through the resolver, never a raw manifest path', () => {
    const bay = read('components/earth2/DinosaurBay.jsx');
    assert.ok(bay.includes('fetchEarth2ModelUrls'), 'Bay fetches signed URLs once');
    assert.ok(bay.includes('earth2ModelUrl'), 'Bay resolves every load');
    assert.ok(!bay.includes('loadAsync(entry.file)'), 'no direct public-path loads remain');
    assert.ok(!bay.includes('/models/earth2'), 'no hard-coded public path');
  });
});

describe('the proof-of-concept guest — one name, one home (2026-10-23)', () => {
  it("the guest email appears ONLY in lib/earth2/access.js across the app sources", () => {
    const hits = ALL_SOURCES.filter((rel) => read(rel).includes('fishstart@hotmail.com'));
    assert.deepEqual(hits, ['lib/earth2/access.js'],
      'every surface defers to the access module; no gate copies the guest email');
  });

  it('the guest opens no write surface: buy, forge, rent and builds stay owner-only', () => {
    for (const route of [
      'app/api/earth2/buy/route.js',
      'app/api/earth2/forge/route.js',
      'app/api/earth2/rent/route.js',
      'app/api/earth2/builds/route.js',
      'app/api/earth2/builds/claims/route.js',
    ]) {
      const src = read(route);
      assert.ok(src.includes('verifyOwnerSession'), `${route} still verifies the owner`);
      assert.ok(!src.includes('verifyEarth2AccessSession'), `${route} does not admit the guest`);
    }
  });
});
