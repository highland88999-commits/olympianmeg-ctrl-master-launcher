// lib/earth3/claims.js
// EARTH 3 — THE TILE-CLAIM REGISTRY (Merlin, 2026-11-14): the
// third Earth's land titles. Earth 3 is an ADDRESS SPACE, not a
// built world (lib/earth3/terrain.js): ten billion 28 m tiles on
// a 100,000 × 100,000 grid, tile 0 at the south-west corner,
// tile 9,999,999,999 at the north-east. The grid itself is
// deterministic code; only OWNERSHIP is state, so only ownership
// is stored — exactly Earth 2's split (supabase/earth2.sql):
// the earth3_tiles table holds the titles, earth3_ledger the
// diary. Until supabase/earth3.sql runs (Merlin's green light),
// claims live on the device (localStorage, the same local-preview
// pattern Earth 2 used before its tables landed) and the claim
// API answers setupRequired.
//
// MERLIN'S LAND LAW, carried over from Earth 2 (2026-10-22):
// "There should be more free tiles than owned tiles." The same
// interleave decides it here — ownable iff (index * 2) % 5 < 2 —
// exactly 40% ownable, 60% Free Commons, spread evenly so no
// region is all-owned or all-free. Free Commons are open land
// for everyone: never claimable, never sold, never rented.
//
// PRICING: Earth 3 claims are FREE while the world is under
// construction — a homestead claim, first come first served.
// Merlin has NOT ruled on Earth 2's final tile pricing, and no
// Earth 3 price has been set either, so no price is invented
// here: CLAIM_PRICE_GOLD is the one place that changes when he
// rules. While claims are free, one claim per user
// (MAX_CLAIMS_PER_USER) keeps a single account from fencing
// the map by script — a guard, not economics; raising it is
// his call.
//
// Pure and deterministic: no imports of three.js or the DOM in
// the law itself (storage is injected so tests can pass a fake).
// Ownership rows are earth3_tiles-shaped:
// { tile_id, owner_id, owner_email, price_gold, acquired_at }.

import { MAX_TILE_ID, tileToWorld } from './terrain.js';

// ── Tile ids ──────────────────────────────────────────────────
// E3-0000000001 … E3-10000000000: the E3- prefix plus the tile
// number (id + 1), zero-padded to ten digits so ids sort in
// grid order. The LAST tile reads eleven digits (10,000,000,000
// tiles take numbers 1…10,000,000,000) — the matcher below
// allows ten or eleven. Earth 2's ids are E2-0001 (four digits);
// Earth 3 needs ten because the grid holds ten billion tiles.
export const TILE_ID_PREFIX = 'E3-';

/** The stable claim id for a tile index ('E3-0000000001'…), or null. */
export function tileIdFor(index) {
  const i = Math.floor(Number(index));
  if (!Number.isFinite(i) || i < 0 || i > MAX_TILE_ID) return null;
  return `${TILE_ID_PREFIX}${String(i + 1).padStart(10, '0')}`;
}

/** The tile index behind a claim id, or null when it is not one. */
export function tileIndexFromId(id) {
  if (typeof id !== 'string') return null;
  const m = /^E3-(\d{10,11})$/.exec(id.trim().toUpperCase());
  if (!m) return null;
  const i = Number(m[1]) - 1;
  if (!Number.isFinite(i) || i < 0 || i > MAX_TILE_ID) return null;
  return i;
}

// ── The ownable interleave (Merlin's land law) ────────────────
// Exactly 2 of every 5 tiles in row-major order are ownable —
// (index * 2) % 5 < 2 — which lands ownable tiles at index % 5
// ∈ {0, 3}, evenly spread. Earth 2's rule, unchanged: the same
// split, the same arithmetic, so the two worlds agree.
export function isOwnableTileIndex(index) {
  const i = Math.floor(Number(index) || 0);
  return (i * 2) % 5 < 2;
}

/** True when this tile index can ever be claimed. */
export function isOwnableTileId(id) {
  const i = tileIndexFromId(id);
  return i !== null && isOwnableTileIndex(i);
}

// ── Pricing (one place — see the header note) ─────────────────
// Free while the world is under construction. When Merlin rules
// on Earth 3 pricing, this constant — and only this constant —
// changes, and the claim route charges it through the gold
// ledger the way Earth 2's buy route does.
export const CLAIM_PRICE_GOLD = 0;

// One homestead claim per user while claims are free (see the
// header note). A named constant so lifting it is one edit.
export const MAX_CLAIMS_PER_USER = 1;

// The device-local preview store (Earth 2's pattern): claims
// live here until the shared registry opens.
export const LOCAL_CLAIMS_KEY = 'olympus:earth3-claims:v1';

/**
 * Everything the page needs to show about a tile: its id, its
 * grid index, whether it can be claimed, its kind, its price,
 * and where its centre sits in the world (metres).
 */
export function tileInfo(tileId) {
  const index = tileIndexFromId(tileId);
  if (index === null) return null;
  const ownable = isOwnableTileIndex(index);
  return {
    id: tileIdFor(index),
    index,
    ownable,
    kind: ownable ? 'ownable' : 'commons',
    priceGold: ownable ? CLAIM_PRICE_GOLD : null,
    center: tileToWorld(index),
  };
}

/** The ownership row for a tile id, or null when it is unclaimed. */
export function ownerOf(rows, tileId) {
  const id = tileIdFor(tileIndexFromId(tileId));
  if (!id) return null;
  const list = Array.isArray(rows) ? rows : [];
  return list.find((r) => r && r.tile_id === id) || null;
}

/** Every tile id this user owns, in claim order. */
export function claimsForUser(rows, userId) {
  const mine = String(userId || '');
  if (!mine) return [];
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && String(r.owner_id) === mine)
    .map((r) => r.tile_id);
}

/**
 * The claim guard, at the lib level: returns a plain-English
 * refusal for a tile that can never be claimed, or null when
 * the claim may proceed. Free Commons are open land for
 * everyone — no claim, no sale, no rent, ever.
 */
export function claimRefusal(tileId, rows, user) {
  const info = tileInfo(tileId);
  if (!info) return 'Unknown tile.';
  if (!info.ownable || info.kind === 'commons') {
    return 'Free Commons tiles are open land for everyone — they can never be claimed, bought, sold, or rented.';
  }
  if (ownerOf(rows, info.id)) {
    return 'That tile already has an owner.';
  }
  if (!user || !user.id || !user.email) {
    return 'Sign in to claim a tile.';
  }
  if (claimsForUser(rows, user.id).length >= MAX_CLAIMS_PER_USER) {
    return 'You already hold a homestead claim on Earth 3 — one per explorer while claims are free.';
  }
  return null;
}

/**
 * Claim a tile: record the title in the ownership-row state
 * layer. Returns { ok, rows, row } with a NEW rows array
 * (input untouched), or { ok: false, error, rows } with the
 * original rows. First claim wins — a tile with an owner
 * refuses, whoever asks second.
 */
export function claimTile(rows, tileId, user, atMs) {
  const list = Array.isArray(rows) ? rows : [];
  const refusal = claimRefusal(tileId, list, user);
  if (refusal) return { ok: false, error: refusal, rows: list };
  const info = tileInfo(tileId);
  const row = {
    tile_id: info.id,
    owner_id: String(user.id),
    owner_email: String(user.email),
    price_gold: CLAIM_PRICE_GOLD,
    acquired_at: Number.isFinite(atMs)
      ? new Date(atMs).toISOString()
      : new Date().toISOString(),
  };
  return { ok: true, rows: [...list, row], row };
}

// ── Device-local persistence (the preview store) ──────────────
// Rows round-trip as plain JSON so a claim survives a reload
// exactly as the tests pin it. Storage is injected (a fake in
// tests, localStorage in the page) so this module never touches
// the DOM on import.

/** Encode ownership rows for storage. */
export function serializeClaims(rows) {
  return JSON.stringify(Array.isArray(rows) ? rows : []);
}

/** Decode stored rows; anything unreadable reads as no claims. */
export function parseClaims(text) {
  try {
    const rows = JSON.parse(String(text || ''));
    if (!Array.isArray(rows)) return [];
    return rows.filter(
      (r) => r && typeof r.tile_id === 'string' && typeof r.owner_id === 'string'
    );
  } catch {
    return [];
  }
}

/** Read the device-local claims (empty when there is no store). */
export function loadLocalClaims(storage) {
  const store = storage || (typeof globalThis !== 'undefined' ? globalThis.localStorage : null);
  if (!store) return [];
  try {
    return parseClaims(store.getItem(LOCAL_CLAIMS_KEY));
  } catch {
    return [];
  }
}

/** Write the device-local claims. No-op without a store. */
export function saveLocalClaims(storage, rows) {
  const store = storage || (typeof globalThis !== 'undefined' ? globalThis.localStorage : null);
  if (!store) return;
  try {
    store.setItem(LOCAL_CLAIMS_KEY, serializeClaims(rows));
  } catch {
    // A full or blocked store never breaks the claim itself.
  }
}
