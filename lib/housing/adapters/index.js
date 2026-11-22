// lib/housing/adapters/index.js — Fan-out over the live adapters.
//
// fetchAllLive({ location, lat, lon, radiusKm, limit, sources }) runs the
// requested live adapters in parallel. A dead source NEVER throws: it
// returns [] and its error is recorded in `statuses` so the API can
// report it honestly. No invented listings, no silent drops.
//
// Which adapters run depends on what the search has: OpenStreetMap stays
// need a centre (lat/lon); Redfin needs a place string. An adapter that
// cannot run for lack of input reports live with 0 results, not an error.

import { fetchListings as fetchOsmStays } from './osm-stays.js';
import { fetchListings as fetchRedfin, isRedfinConfigured, REDFIN_MISSING_KEY_GAP } from './redfin-listings.js';
import { liveSources } from '../sources.js';

// OpenStreetMap stays are always on (keyless). Redfin joins only when
// its server env var is set — read fresh on every call so a deploy that
// adds the key takes effect without a code change.
const BASE_ADAPTERS = {
  'osm-stays': fetchOsmStays,
};

export function getAdapters() {
  return {
    ...BASE_ADAPTERS,
    ...(isRedfinConfigured() ? { 'redfin-listings': fetchRedfin } : {}),
  };
}

export function liveAdapterIds() {
  return Object.keys(getAdapters());
}

// Last error per source id, for the sources status endpoint / debugging.
// Only the message is kept — never listing contents.
export const sourceErrors = new Map();

export async function fetchAllLive({
  location = '', lat = null, lon = null, radiusKm = 25, limit = 25, sources = null,
} = {}) {
  const adapters = getAdapters();
  const wanted = Array.isArray(sources) && sources.length > 0
    ? sources.filter((id) => adapters[id])
    : liveAdapterIds();
  const settled = await Promise.allSettled(
    wanted.map(async (id) => ({
      id,
      listings: await adapters[id]({
        location, lat, lon, radiusKm, limit,
      }),
    })),
  );
  const listings = [];
  const statuses = [];
  settled.forEach((r, i) => {
    const id = wanted[i];
    if (r.status === 'fulfilled') {
      sourceErrors.delete(id);
      listings.push(...r.value.listings);
      statuses.push({ id, status: 'live', count: r.value.listings.length });
    } else {
      const message = r.reason?.message || 'fetch failed';
      sourceErrors.set(id, message);
      statuses.push({ id, status: 'error', count: 0, error: message });
    }
  });
  // An explicit request for Redfin while its key is not set is a staged
  // source, not a silent drop and not an error: say so in the statuses.
  if (Array.isArray(sources) && sources.includes('redfin-listings') && !adapters['redfin-listings']) {
    statuses.push({
      id: 'redfin-listings', status: 'staged', count: 0, gap: REDFIN_MISSING_KEY_GAP,
    });
  }
  // Keep the requested-source order for stable reporting.
  statuses.sort((a, b) => {
    const order = Array.isArray(sources) && sources.length > 0 ? sources : liveAdapterIds();
    return order.indexOf(a.id) - order.indexOf(b.id);
  });
  return { listings, statuses };
}

// Dedupe by listing URL (fall back to id). First occurrence wins.
export function dedupeListings(listings) {
  const seen = new Set();
  const out = [];
  for (const listing of listings) {
    const key = (listing.url || listing.id || '').toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(listing);
  }
  return out;
}

export function liveSourceStatuses() {
  return liveSources().map((s) => ({
    id: s.id,
    status: sourceErrors.has(s.id) ? 'error' : 'live',
    ...(sourceErrors.has(s.id) ? { error: sourceErrors.get(s.id) } : {}),
  }));
}
