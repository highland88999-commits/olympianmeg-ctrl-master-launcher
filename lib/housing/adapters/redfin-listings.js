// lib/housing/adapters/redfin-listings.js — Redfin listings via RapidAPI (keyed).
// Docs (third-party API page + walkthrough, verified Nov 21, 2026):
//   GET https://redfin-listings.p.rapidapi.com/api/redfin-listings/search?location=Austin TX
//   Headers: x-rapidapi-key, x-rapidapi-host: redfin-listings.p.rapidapi.com
// Response: { listings: [{ address, price, beds, baths, sqft, status, url }] }
//   url is the listing's own Redfin page — the View link.
//
// The key comes ONLY from the server env var RAPIDAPI_KEY — never
// hardcoded, never logged, never sent to the client. (Same key the Job
// Board's JSearch adapter uses.) No key → the adapter is not registered
// and the source stays staged with its gap. One call per search.
// Free tier exists on RapidAPI; the exact monthly limit is on the
// RapidAPI pricing page at subscribe time. Tests must stub fetch — no
// live RapidAPI call is ever made from a test, probe, or build step.

import { fetchJson, parseLocationString, normalizeListing } from './common.js';

export const REDFIN_MISSING_KEY_GAP = 'Redfin listings need a RapidAPI key on the server. Gap: RAPIDAPI_KEY env var (same key as JSearch). Free tier exists on RapidAPI — subscribe to the Redfin Listings API there.';

export const REDFIN_BUDGET_NOTE = 'Live on the RapidAPI free tier — check the remaining monthly allowance on the RapidAPI dashboard before heavy use.';

const API_BASE = 'https://redfin-listings.p.rapidapi.com/api/redfin-listings/search';
const API_HOST = 'redfin-listings.p.rapidapi.com';

export function isRedfinConfigured(env = process.env) {
  const key = typeof env?.RAPIDAPI_KEY === 'string' ? env.RAPIDAPI_KEY.trim() : '';
  return key.length > 0;
}

export function parseRedfinPayload(payload) {
  const listings = Array.isArray(payload?.listings) ? payload.listings : [];
  return listings.map((r) => {
    const loc = parseLocationString(r?.address || '', {});
    const price = typeof r?.price === 'number' ? r.price : null;
    const status = String(r?.status || '');
    // Redfin's feed is mostly for-sale; a listing that says rent in its
    // status is a rental, everything else is a sale. Never guessed by price.
    const isRental = /rent/i.test(status);
    return normalizeListing({
      id: `redfin:${r?.url || r?.address || ''}`,
      source: 'redfin-listings',
      section: isRental ? 'rentals' : 'real-estate',
      title: r?.address || 'Untitled listing',
      price: price == null ? null : { min: price, max: price, currency: 'USD', unit: isRental ? 'monthly' : 'total' },
      beds: typeof r?.beds === 'number' ? r.beds : null,
      baths: typeof r?.baths === 'number' ? r.baths : null,
      sqft: typeof r?.sqft === 'number' ? r.sqft : null,
      type: null, // derived from the address/title by normalizeListing
      location: loc,
      url: typeof r?.url === 'string' && /^https?:\/\//.test(r.url) ? r.url : null,
      description: status ? `Status: ${status}` : '',
      postedAt: null,
      attribution: { label: 'Listings by Redfin', url: 'https://www.redfin.com/' },
    });
  });
}

export async function fetchListings({ location = '', limit = 25 } = {}) {
  if (!isRedfinConfigured()) {
    throw new Error('RapidAPI key is not configured (RAPIDAPI_KEY)');
  }
  if (!location || typeof location !== 'string') {
    throw new Error('Redfin search needs a place (city or postal code)');
  }
  const perPage = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 50);
  const url = `${API_BASE}?location=${encodeURIComponent(location)}`;
  const payload = await fetchJson(url, {
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY.trim(),
      'x-rapidapi-host': API_HOST,
    },
  });
  return parseRedfinPayload(payload).slice(0, perPage);
}
