// lib/housing/adapters/common.js — Shared helpers for housing adapters.
//
// Every adapter: 10 s timeout (25 s for Overpass, which answers slowly),
// never throws on a dead source (callers treat a throw as a source error
// and report it), the listing's own URL kept on every listing that has
// one. A listing with no URL from its source renders with no View link —
// never a constructed link to a site the listing did not come from.

import { parseLocationString as parseJobLocationString } from '../../job-board/adapters/common.js';
import { typeForKeywords } from '../taxonomy.js';

export const FETCH_TIMEOUT_MS = 10000;
export const USER_AGENT = 'OmegaHousing/1.0 (olympusverse.com)';

export async function fetchText(url, { headers = {}, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  }
  return res.text();
}

export async function fetchJson(url, opts) {
  const text = await fetchText(url, opts);
  return JSON.parse(text);
}

export function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text, max = 2000) {
  const t = (text || '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function emptyLocation() {
  return { city: null, region: null, country: null, lat: null, lon: null };
}

export function parseLocationString(raw, opts) {
  return parseJobLocationString(raw, opts);
}

// Normalised listing shape. `price.unit` is 'total' (a sale price),
// 'monthly' (rent) or 'nightly' (a stay). `url` is the source's own link
// for that listing, or null when the source gives none — the page then
// shows no View link rather than inventing one.
export function normalizeListing(partial) {
  const listing = {
    id: partial.id,
    source: partial.source,
    section: partial.section,
    title: (partial.title || 'Untitled listing').trim(),
    price: partial.price || null,
    beds: Number.isFinite(partial.beds) ? partial.beds : null,
    baths: Number.isFinite(partial.baths) ? partial.baths : null,
    sqft: Number.isFinite(partial.sqft) ? partial.sqft : null,
    type: partial.type || null,
    location: { ...emptyLocation(), ...(partial.location || {}) },
    url: partial.url || null,
    description: truncate(partial.description || '', 2000),
    postedAt: partial.postedAt || null,
    attribution: partial.attribution || null,
  };
  if (!listing.type) {
    listing.type = typeForKeywords(`${listing.title} ${listing.description}`);
  }
  return listing;
}

// Client-side keyword filter for adapters with no server-side search.
export function matchesQuery(listing, q) {
  if (!q) return true;
  const hay = `${listing.title} ${listing.description} ${listing.location?.city || ''} ${listing.location?.region || ''}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}
