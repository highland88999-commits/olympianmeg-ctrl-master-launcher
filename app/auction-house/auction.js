// Auction House — pure logic: categories, countdowns, bid increments,
// watchlist helpers. No network, no seeded demo data. Prices and minimum
// bids mirror the server rules in lib/auction/helpers.js; the server is the
// source of truth and its error messages are shown verbatim.

// --- deterministic hash (stable medallion fallback per listing) ---------------

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// --- categories (the forge's World Engine categories) ------------------------

export const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'world', label: 'Worlds' },
  { value: 'character', label: 'Characters' },
  { value: 'weapon', label: 'Weapons' },
  { value: 'vehicle', label: 'Vehicles' },
  { value: 'weather', label: 'Weather' },
  { value: 'object', label: 'Objects' },
];

export function categoryLabel(value) {
  const found = CATEGORIES.find((c) => c.value === String(value || '').toLowerCase());
  return found ? found.label : String(value || 'Item');
}

// --- money -------------------------------------------------------------------

/** Plain-English USD formatting for integer cents: 1250 -> "$12.50". */
export function formatUsdCents(cents) {
  const c = Math.round(Number(cents) || 0);
  return `$${(c / 100).toFixed(2)}`;
}

/** Parse a dollars string from a money input into whole cents. NaN if invalid. */
export function dollarsToCents(input) {
  const n = Number(String(input || '').trim().replace(/[$,]/g, ''));
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

// --- countdown ----------------------------------------------------------------

export function msUntilClose(listing, nowMs) {
  if (!listing || !listing.ends_at) return null;
  return Math.max(0, new Date(listing.ends_at).getTime() - nowMs);
}

export function formatCountdown(ms) {
  if (ms === null) return 'No end date';
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

export function lotStatus(listing, nowMs) {
  const ms = msUntilClose(listing, nowMs);
  if (ms === null) return 'live';
  if (ms <= 0) return 'closed';
  if (ms <= 60 * 60 * 1000) return 'ending-soon';
  return 'live';
}

// --- bid increments (mirrors the server: max($1, 5% of current)) --------------

export function minBidIncrementCents(currentBidCents) {
  const current = Math.max(0, Math.round(Number(currentBidCents) || 0));
  return Math.max(100, Math.ceil(current * 0.05));
}

/** Honest minimum next bid for a listing: the starting bid if no bids yet. */
export function minNextBidCents(listing) {
  const current = Math.round(Number(listing?.current_bid_cents) || 0);
  if (!current || current <= 0) {
    return Math.round(Number(listing?.starting_bid_cents) || 0);
  }
  return current + minBidIncrementCents(current);
}

export function acceptsBids(listing) {
  const lt = String(listing?.listing_type || '').toLowerCase();
  return lt === 'auction' || lt === 'both';
}

export function hasBuyNow(listing) {
  const lt = String(listing?.listing_type || '').toLowerCase();
  return (lt === 'fixed' || lt === 'both') && Math.round(Number(listing?.buy_now_price_cents) || 0) > 0;
}

export function listingTitle(listing) {
  return (listing?.title || listing?.display_name || 'Untitled creation').trim();
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

// --- procedural medallion palette (fallback when no 3D params or image) ---------

const PALETTES = [
  ['#f59e0b', '#78350f'],
  ['#38bdf8', '#0c4a6e'],
  ['#a78bfa', '#4c1d95'],
  ['#34d399', '#064e3b'],
  ['#fb7185', '#881337'],
  ['#facc15', '#713f12'],
];

export function medallionPalette(lotId) {
  return PALETTES[hashString(String(lotId)) % PALETTES.length];
}

// --- server error translation (plain English, no card-shaming) -----------------

/**
 * Map known server errors to the exact plain-English line the UI should show.
 * Unknown errors pass through verbatim.
 */
export function friendlyAuctionError(message) {
  const msg = String(message || '').trim();
  if (!msg) return 'Something went wrong. Please try again.';
  if (/extra verification/i.test(msg)) {
    return 'Your card needs extra verification — wallet payment works right now.';
  }
  if (/card could not be authorized/i.test(msg)) {
    return 'The card could not be authorized. Check the card or pay with your wallet instead.';
  }
  if (/card payments are not connected/i.test(msg)) {
    return 'Card payments are not connected yet — wallet payment works right now.';
  }
  if (/insufficient available balance/i.test(msg)) {
    return 'Your wallet does not have enough available balance for this.';
  }
  return msg;
}
