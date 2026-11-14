// tests/earth3-claims.test.mjs
// EARTH 3 — THE TILE-CLAIM REGISTRY (Merlin, 2026-11-14): the
// pure law in lib/earth3/claims.js — tile ids, the ownable
// interleave, the claim guard, and the device-local store.
//
// Run: node --test tests/earth3-claims.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TILE_ID_PREFIX,
  CLAIM_PRICE_GOLD,
  MAX_CLAIMS_PER_USER,
  tileIdFor,
  tileIndexFromId,
  isOwnableTileIndex,
  tileInfo,
  ownerOf,
  claimsForUser,
  claimRefusal,
  claimTile,
  serializeClaims,
  parseClaims,
  loadLocalClaims,
  saveLocalClaims,
} from '../lib/earth3/claims.js';
import { MAX_TILE_ID } from '../lib/earth3/terrain.js';

const USER_A = { id: 'user-a', email: 'a@example.com' };
const USER_B = { id: 'user-b', email: 'b@example.com' };

// A tiny in-memory stand-in for localStorage.
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

describe('tile ids', () => {
  it('are E3- plus a ten-digit number, sorting in grid order', () => {
    assert.equal(TILE_ID_PREFIX, 'E3-');
    assert.equal(tileIdFor(0), 'E3-0000000001');
    assert.equal(tileIdFor(9999999999), 'E3-10000000000');
    assert.equal(tileIdFor(5000050000), 'E3-5000050001');
  });
  it('refuse out-of-range indices', () => {
    assert.equal(tileIdFor(-1), null);
    assert.equal(tileIdFor(MAX_TILE_ID + 1), null);
    assert.equal(tileIdFor('abc'), null);
  });
  it('round-trip: tileIndexFromId(tileIdFor(i)) === i', () => {
    for (const i of [0, 1, 99999, 100000, 123456789, 5000050000, 9999999998, 9999999999]) {
      assert.equal(tileIndexFromId(tileIdFor(i)), i, `round-trip failed for ${i}`);
    }
  });
  it('rejects ids that are not Earth 3 tiles', () => {
    assert.equal(tileIndexFromId('E2-0001'), null);
    assert.equal(tileIndexFromId('E3-123'), null);
    assert.equal(tileIndexFromId('E3-0000000000'), null);
    assert.equal(tileIndexFromId('E3-10000000001'), null);
    assert.equal(tileIndexFromId(null), null);
    assert.equal(tileIndexFromId(''), null);
  });
});

describe('the ownable interleave (Merlin\u2019s land law)', () => {
  it('makes exactly 40% ownable, 60% Free Commons, evenly spread', () => {
    // A full period of five tiles holds exactly two ownable ones.
    let ownable = 0;
    for (let i = 0; i < 1000; i++) if (isOwnableTileIndex(i)) ownable++;
    assert.equal(ownable, 400);
    // The pattern repeats identically in every block of five,
    // wherever the grid you look — no region is all-owned.
    for (let base = 0; base < 100000; base += 137) {
      let n = 0;
      for (let k = 0; k < 5; k++) if (isOwnableTileIndex(base + k)) n++;
      assert.equal(n, 2, `block at ${base} holds ${n} ownable`);
    }
  });
  it('matches Earth 2\u2019s rule: index % 5 in {0, 3}', () => {
    for (let i = 0; i < 50; i++) {
      assert.equal(isOwnableTileIndex(i), i % 5 === 0 || i % 5 === 3, `index ${i}`);
    }
  });
  it('the spawn tile at the world centre is ownable', () => {
    // The /new-earth showcase spawns the walker at (0, 24) —
    // tile 5,000,050,000 — so the first tile a visitor stands on
    // is one they can claim.
    const info = tileInfo(tileIdFor(5000050000));
    assert.equal(info.ownable, true);
    assert.equal(info.kind, 'ownable');
  });
});

describe('tile info', () => {
  it('carries kind, price and centre for ownable tiles', () => {
    const info = tileInfo(tileIdFor(0));
    assert.equal(info.id, 'E3-0000000001');
    assert.equal(info.index, 0);
    assert.equal(info.ownable, true);
    assert.equal(info.kind, 'ownable');
    assert.equal(info.priceGold, CLAIM_PRICE_GOLD);
    assert.equal(info.center.x, -1399986);
    assert.equal(info.center.z, -1399986);
  });
  it('carries no price for Free Commons', () => {
    // Index 1: (1*2)%5 = 2, not ownable.
    const info = tileInfo(tileIdFor(1));
    assert.equal(info.ownable, false);
    assert.equal(info.kind, 'commons');
    assert.equal(info.priceGold, null);
  });
  it('is null for an unknown tile', () => {
    assert.equal(tileInfo('E2-0001'), null);
    assert.equal(tileInfo('nonsense'), null);
  });
});

describe('claiming', () => {
  it('claims are free while the world is under construction', () => {
    assert.equal(CLAIM_PRICE_GOLD, 0);
  });
  it('claims an ownable, unclaimed tile and records the owner', () => {
    const input = [];
    const r = claimTile(input, tileIdFor(0), USER_A, 1792000000000);
    assert.equal(r.ok, true);
    // The input rows are untouched.
    assert.equal(input.length, 0);
    assert.equal(r.rows.length, 1);
    assert.equal(r.row.tile_id, 'E3-0000000001');
    assert.equal(r.row.owner_id, 'user-a');
    assert.equal(r.row.owner_email, 'a@example.com');
    assert.equal(r.row.price_gold, 0);
    assert.equal(r.row.acquired_at, new Date(1792000000000).toISOString());
    assert.equal(ownerOf(r.rows, tileIdFor(0)).owner_id, 'user-a');
  });
  it('refuses a second claim on the same tile — first claim wins', () => {
    const first = claimTile([], tileIdFor(0), USER_A, 1000);
    assert.equal(first.ok, true);
    const second = claimTile(first.rows, tileIdFor(0), USER_B, 2000);
    assert.equal(second.ok, false);
    assert.match(second.error, /already has an owner/);
    assert.equal(second.rows, first.rows);
    // Even the owner cannot claim their own tile twice.
    const again = claimTile(first.rows, tileIdFor(0), USER_A, 3000);
    assert.equal(again.ok, false);
  });
  it('refuses Free Commons outright', () => {
    const r = claimTile([], tileIdFor(1), USER_A, 1000);
    assert.equal(r.ok, false);
    assert.match(r.error, /Free Commons/);
  });
  it('refuses unknown tiles', () => {
    const r = claimTile([], 'E2-0001', USER_A, 1000);
    assert.equal(r.ok, false);
    assert.match(r.error, /Unknown tile/);
  });
  it('refuses a signed-out claim', () => {
    const r = claimTile([], tileIdFor(0), null, 1000);
    assert.equal(r.ok, false);
    assert.match(r.error, /Sign in/);
  });
  it('holds one claim per user while claims are free', () => {
    assert.equal(MAX_CLAIMS_PER_USER, 1);
    const first = claimTile([], tileIdFor(0), USER_A, 1000);
    assert.equal(first.ok, true);
    const second = claimTile(first.rows, tileIdFor(3), USER_A, 2000);
    assert.equal(second.ok, false);
    assert.match(second.error, /already hold/);
    // Another user is unaffected by the first user's cap.
    const other = claimTile(first.rows, tileIdFor(3), USER_B, 2000);
    assert.equal(other.ok, true);
  });
  it('claimsForUser lists only that user\u2019s tiles', () => {
    const a = claimTile([], tileIdFor(0), USER_A, 1000);
    const b = claimTile(a.rows, tileIdFor(3), USER_B, 2000);
    assert.deepEqual(claimsForUser(b.rows, 'user-a'), ['E3-0000000001']);
    assert.deepEqual(claimsForUser(b.rows, 'user-b'), ['E3-0000000004']);
    assert.deepEqual(claimsForUser(b.rows, 'nobody'), []);
  });
  it('claimRefusal is null when the claim may proceed', () => {
    assert.equal(claimRefusal(tileIdFor(0), [], USER_A), null);
  });
});

describe('device-local persistence (claim survives reload)', () => {
  it('serializes and parses rows exactly', () => {
    const r = claimTile([], tileIdFor(0), USER_A, 1000);
    const text = serializeClaims(r.rows);
    assert.deepEqual(parseClaims(text), r.rows);
  });
  it('reads unreadable storage as no claims', () => {
    assert.deepEqual(parseClaims('not json'), []);
    assert.deepEqual(parseClaims('{"x":1}'), []);
    assert.deepEqual(parseClaims(null), []);
  });
  it('round-trips through a store: save, reload, owner intact', () => {
    const store = fakeStorage();
    const r = claimTile([], tileIdFor(0), USER_A, 1000);
    saveLocalClaims(store, r.rows);
    const reloaded = loadLocalClaims(store);
    assert.equal(reloaded.length, 1);
    assert.equal(ownerOf(reloaded, tileIdFor(0)).owner_email, 'a@example.com');
    // A second claim against the reloaded rows still refuses.
    const again = claimTile(reloaded, tileIdFor(0), USER_B, 2000);
    assert.equal(again.ok, false);
  });
  it('reads empty when there is no store at all', () => {
    assert.deepEqual(loadLocalClaims(null), []);
  });
});
