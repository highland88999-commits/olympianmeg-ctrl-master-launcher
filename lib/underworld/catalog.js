// lib/underworld/catalog.js — pure catalog logic for the UNDERWORLD game-discovery module.
// No React, no DOM, no network: every export is headless-testable.
// Data lives in /data/underworld/<platform>.json (public dir), fetched per tab.

export const PAGE_SIZE = 24;

export const PLATFORMS = [
  {
    id: 'playstation',
    label: 'PlayStation',
    origin: 'PS Store',
    file: '/data/underworld/playstation.json',
    blurb: 'PS5 standouts, curated from the PlayStation Store.',
  },
  {
    id: 'xbox',
    label: 'Xbox',
    origin: 'Xbox Live',
    file: '/data/underworld/xbox.json',
    blurb: 'Xbox Series standouts, curated from the Microsoft Store.',
  },
  {
    id: 'switch',
    label: 'Nintendo Switch',
    origin: 'eShop',
    file: '/data/underworld/switch.json',
    blurb: 'Switch standouts, curated from the Nintendo eShop.',
  },
  {
    id: 'vr',
    label: 'VR',
    origin: 'SteamVR',
    file: '/data/underworld/vr.json',
    blurb: 'Virtual-reality standouts, curated from SteamVR.',
  },
];

export function getPlatform(id) {
  return PLATFORMS.find((p) => p.id === id) || null;
}

/**
 * Validate one raw catalog entry. Returns the cleaned entry or null when
 * the entry is unusable (missing title or a non-http(s) url).
 */
export function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim();
  const url = String(raw.url || '').trim();
  const img = String(raw.img || '').trim();
  const origin = String(raw.origin || '').trim();
  if (!title || !url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return { title, url, img, origin };
}

/**
 * Case-insensitive substring search across titles. Empty/blank query
 * returns every title. Never throws on odd input.
 */
export function searchTitles(titles, query) {
  const list = Array.isArray(titles) ? titles : [];
  const q = String(query == null ? '' : query).trim().toLowerCase();
  if (!q) return list.slice();
  return list.filter((t) => String(t && t.title || '').toLowerCase().includes(q));
}

/**
 * Slice one page of results. Page is 1-based. Returns
 * { items, page, perPage, total, totalPages, hasMore }.
 */
export function paginate(items, page = 1, perPage = PAGE_SIZE) {
  const list = Array.isArray(items) ? items : [];
  const size = Math.max(1, Math.floor(Number(perPage) || PAGE_SIZE));
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const start = (p - 1) * size;
  return {
    items: list.slice(start, start + size),
    page: p,
    perPage: size,
    total,
    totalPages,
    hasMore: start + size < total,
  };
}

/**
 * Two-letter monogram for the cover-art fallback tile.
 */
export function monogram(title) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
