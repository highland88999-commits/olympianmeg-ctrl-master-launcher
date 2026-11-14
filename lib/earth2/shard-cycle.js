// lib/earth2/shard-cycle.js — the aether shard monthly cycle
// (Merlin, Nov 13): 53 shards a month, collected by walking
// through them (+1 aether each, server-side); on the 1st of each
// month Earth 2 collects whatever remains, pays it to the Olympus
// (house) wallet, and redistributes every shard to a new unique
// coordinate.
//
// Pure math + data — no THREE, no DOM, no network — so the scene,
// the collect route and the rollover route all read the same law
// (tests/earth2-shard-cycle.test.mjs). The ledger is the record:
// a shard's collection is its ledger row (reason
// 'earth2-shard:<month>:<key>', idempotency key the same — the
// key is globally unique, so a shard can only ever be credited
// once, worldwide); the rollover's payment is its ledger row
// (reason 'earth2-shard-rollover:<month>'); the new coordinates
// ride in that row's meta. No new tables.
import { stagedPlacements } from './staged-objects.js';
import { parcelWorldRect, WORLD_CELL_M } from './world.js';
import { isOwnableIndex } from './parcels.js';

/** The month's pool: exactly 53 shards, no more appear mid-month. */
export const SHARD_COUNT = 53;

/** Aether per shard — Merlin can change this one number. */
export const SHARD_VALUE_AETHER = 1;

/** Pickup radius: crossing within 2.5 m of a shard collects it. */
export const SHARD_PICKUP_RADIUS_M = 2.5;

/** The house wallet (Merlin's program account — the same wallet
 *  that receives the house share of Earth 2 rent). */
export const HOUSE_WALLET_EMAIL = 'olympiannexus@gmail.com';

/** The launch month: the staged placements ARE November's shards. */
export const SHARD_LAUNCH_MONTH = '2026-11';

/** 'YYYY-MM' (UTC) for a date. */
export function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

/** The month before a 'YYYY-MM' key. */
export function prevMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** The month after a 'YYYY-MM' key. */
export function nextMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 7);
}

/** The 53 staged shard keys, in staged order. */
export function shardKeys() {
  return stagedPlacements()
    .filter((p) => p.category === 'aether')
    .map((p) => p.key);
}

/** The staged (launch-month) position of every shard. */
export function launchPositions() {
  return stagedPlacements()
    .filter((p) => p.category === 'aether')
    .map((p) => {
      const parcel = { col: p.parcelIndex % 50, row: Math.floor(p.parcelIndex / 50) };
      const rect = parcelWorldRect(parcel);
      return {
        shardKey: p.key,
        parcelIndex: p.parcelIndex,
        x: rect.minX + p.jx * WORLD_CELL_M,
        z: rect.minZ + p.jz * WORLD_CELL_M,
      };
    });
}

// Deterministic RNG (mulberry32, same family as staged-objects.js).
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function freeParcelIndices() {
  const out = [];
  for (let i = 0; i < 2500; i++) {
    if (!isOwnableIndex(i)) out.push(i);
  }
  return out;
}

/** Positions for a month. The launch month returns the staged
 *  placements (already spread, verified). Every later month is
 *  derived from the month key: the free-parcel pool is shuffled by
 *  the month seed and the 53 shards take the first 53 parcels in
 *  shard-key order — unique by construction — with a jitter inside
 *  each parcel. A shard whose new parcel equals its previous
 *  month's parcel takes the next unused parcel instead, so every
 *  shard's new spot differs from its old one. Deterministic: the
 *  same month always gives the same coordinates for everyone. */
export function positionsForMonth(month) {
  if (month <= SHARD_LAUNCH_MONTH) return launchPositions();
  const keys = shardKeys();
  const prev = positionsForMonth(prevMonthKey(month));
  const prevByKey = new Map(prev.map((p) => [p.shardKey, p.parcelIndex]));
  const free = freeParcelIndices();
  const rng = mulberry32(hashStr(`earth2-shard-month:${month}`));
  // Month-seeded shuffle of the free pool (Fisher-Yates).
  const pool = [...free];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const used = new Set();
  const out = [];
  let cursor = 0;
  for (const key of keys) {
    // Take the next unused parcel; skip the shard's old parcel.
    let parcelIndex = null;
    while (cursor < pool.length) {
      const cand = pool[cursor++];
      if (used.has(cand)) continue;
      if (cand === prevByKey.get(key)) continue;
      parcelIndex = cand;
      break;
    }
    if (parcelIndex == null) throw new Error(`No free parcel left for shard ${key} in ${month}.`);
    used.add(parcelIndex);
    const parcel = { col: parcelIndex % 50, row: Math.floor(parcelIndex / 50) };
    const rect = parcelWorldRect(parcel);
    const jx = rng();
    const jz = rng();
    out.push({
      shardKey: key,
      parcelIndex,
      x: rect.minX + jx * WORLD_CELL_M,
      z: rect.minZ + jz * WORLD_CELL_M,
    });
  }
  return out;
}

/** The ledger reason for one shard's collection in a month. */
export function shardReason(month, shardKey) {
  return `earth2-shard:${month}:${shardKey}`;
}

/** The ledger idempotency key for one shard's collection — the
 *  same as the reason, and globally unique: a shard can only ever
 *  be credited once per month, worldwide. A second collector gets
 *  wasDuplicate and no credit. */
export function shardIdemKey(month, shardKey) {
  return shardReason(month, shardKey);
}

/** The ledger reason + idempotency key for a month's rollover
 *  payment to the house. Running the rollover twice returns
 *  wasDuplicate — the house is never paid twice for one month. */
export function rolloverReason(month) {
  return `earth2-shard-rollover:${month}`;
}

export function rolloverIdemKey(month) {
  return rolloverReason(month);
}

/** The rollover computation (pure): for the month that just ended,
 *  given the shard keys collected during it, how many remain, what
 *  the house is paid, and where every shard goes next month. The
 *  route runs this once per month and records the result in the
 *  rollover ledger row's meta (auditable). */
export function rolloverForMonth(month, collectedKeys) {
  const collected = new Set(collectedKeys || []);
  const remaining = SHARD_COUNT - collected.size;
  const next = nextMonthKey(month);
  return {
    month,
    nextMonth: next,
    collected: collected.size,
    remaining,
    paidAether: remaining * SHARD_VALUE_AETHER,
    positions: positionsForMonth(next),
  };
}

/** True when a walker's position collects a shard: within the
 *  pickup radius of its (x, z). */
export function withinPickupRadius(shard, x, z, radiusM = SHARD_PICKUP_RADIUS_M) {
  return Math.hypot(x - shard.x, z - shard.z) <= radiusM;
}
