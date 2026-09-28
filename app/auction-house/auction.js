// Auction House — pure logic: countdowns, bid increments, seeded demo
// activity, watchlist helpers. No network, no storage access here except
// through the guarded helpers at the bottom.

import { LOTS } from './lots.js';

// --- deterministic hash (stable seeded data, no Math.random in tests) -------

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 — small seeded PRNG
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- countdown ----------------------------------------------------------------

export function msUntilClose(lot, nowMs) {
  return Math.max(0, lot.endsInSec * 1000 - (nowMs - lot.openedAtMs));
}

export function formatCountdown(ms) {
  if (ms <= 0) return 'Closed';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  const clock = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return d > 0 ? `${d}d ${clock}` : clock;
}

export function lotStatus(lot, nowMs) {
  const ms = msUntilClose(lot, nowMs);
  if (ms <= 0) return 'closed';
  if (ms <= 60 * 60 * 1000) return 'ending-soon';
  return 'live';
}

// --- bid increments ------------------------------------------------------------

export function nextMinBid(current) {
  if (current < 100) return current + 10;
  if (current < 500) return current + 25;
  if (current < 1000) return current + 50;
  if (current < 5000) return current + 100;
  return current + 250;
}

// --- seeded demo bid history ----------------------------------------------------
// Deterministic per lot so the UI is stable and tests are repeatable.

const BIDDER_NAMES = [
  'Harborlight',
  'Vellum & Co.',
  'The Quiet Collector',
  'Northwatch',
  'Saltline',
  'Meridian House',
  'Candlekeep',
  'Driftwood',
];

export function seedBids(lot, count = 7) {
  const rand = seededRandom(hashString(lot.id));
  const bids = [];
  let price = lot.startBid;
  const now = Date.now();
  const spacing = Math.floor((6 * 3600 * 1000) / count); // ~51 min apart
  for (let i = 0; i < count; i++) {
    price = nextMinBid(price) + Math.floor(rand() * 3) * 10;
    bids.push({
      bidder: BIDDER_NAMES[Math.floor(rand() * BIDDER_NAMES.length)],
      amount: price,
      // newest last; jitter stays well under spacing so time order == bid order
      atMs: now - (count - i) * spacing - Math.floor(rand() * 60000),
    });
  }
  bids.sort((a, b) => a.atMs - b.atMs);
  return bids;
}

export function currentBid(lot) {
  const bids = seedBids(lot);
  return bids.length ? bids[bids.length - 1].amount : lot.startBid;
}

export function bidCount(lot) {
  return seedBids(lot).length;
}

// --- lot timing (openedAtMs anchored at module load on the client) ---------------

export function anchorLots(nowMs) {
  // Returns lots with openedAtMs set; pure given nowMs.
  return LOTS.map((l) => ({ ...l, openedAtMs: nowMs }));
}

// --- watchlist (pure list ops; storage guarded for SSR) --------------------------

export function toggleWatch(watchlist, lotId) {
  const set = new Set(watchlist);
  if (set.has(lotId)) set.delete(lotId);
  else set.add(lotId);
  return [...set];
}

export function isWatched(watchlist, lotId) {
  return watchlist.includes(lotId);
}

const WATCH_KEY = 'auction-house:watchlist:v1';

export function loadWatchlist() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(WATCH_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveWatchlist(list) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(WATCH_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable — watchlist just won't persist
  }
}

// --- procedural medallion palette (seeded per lot, no remote images) --------------

const PALETTES = [
  ['#f59e0b', '#78350f'],
  ['#38bdf8', '#0c4a6e'],
  ['#a78bfa', '#4c1d95'],
  ['#34d399', '#064e3b'],
  ['#fb7185', '#881337'],
  ['#facc15', '#713f12'],
];

export function medallionPalette(lotId) {
  return PALETTES[hashString(lotId) % PALETTES.length];
}
