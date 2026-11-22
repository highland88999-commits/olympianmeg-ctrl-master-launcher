// lib/housing/sources.js — Source registry for Omega Housing.
//
// status 'live' = a working adapter exists and was verified returning real
// listings during the build (see STATE.md for the verification log).
// status 'staged' = shown on the board with an outbound link; `gap` states
// exactly what is missing before it can go live. Nothing here is invented:
// a staged source never returns listings it does not have.
//
// Research (Nov 21, 2026): there is no free self-serve listing feed for
// homes for sale or rentals in Canada or the US. Zillow's public API was
// retired in 2021 (410 Gone); CREA's DDF feed for REALTOR.ca is a paid,
// permission-based feed for members; Booking.com / Expedia hotel APIs need
// partner contracts; Amadeus shut its free self-service portal on
// July 17, 2026. What IS live at launch is OpenStreetMap stays — real
// hotels, hostels and guest houses, keyless, no prices. The keyed adapters
// (Redfin via RapidAPI) are built and flip live the moment their key is
// set on the server.

export const SOURCE_REGISTRY = [
  // --- Live: temporary stays, keyless ---
  {
    id: 'osm-stays',
    name: 'OpenStreetMap Stays',
    kind: 'temporary',
    status: 'live',
    url: 'https://www.openstreetmap.org/',
    notes: 'Real hotels, hostels, guest houses and motels near a place, from OpenStreetMap — no key, no account. OSM carries no prices or availability, so stays show no price; the link is the place\u2019s own website when mapped, otherwise its OpenStreetMap page. The map answers slowly (up to about a minute per search).',
  },
  // --- Staged: adapter built, key needed ---
  {
    id: 'redfin-listings',
    name: 'Redfin (via RapidAPI)',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.redfin.com/',
    // Adapter lives in lib/housing/adapters/redfin-listings.js and reads
    // its key from the server env var RAPIDAPI_KEY (the same key the Job
    // Board's JSearch adapter uses). getSourceRegistry() below flips this
    // entry to live (with the budget note) when the key is set.
    gap: 'Redfin listings need a RapidAPI key on the server. Gap: RAPIDAPI_KEY env var (same key as JSearch). Free tier exists on RapidAPI — subscribe to the Redfin Listings API there.',
  },
  // --- Staged: no adapter, key or signup needed ---
  {
    id: 'realty-data',
    name: 'RealtyData',
    kind: 'commercial',
    status: 'staged',
    url: 'https://realtydataapi.com/',
    gap: 'Free signup mints a key in seconds (3,000 free credits, no card; 2 credits per listing returned) — key not on the server yet. Gap: REALTYDATA_API_KEY env var. PLUS a real limit: RealtyData\u2019s documented search and detail responses carry no per-listing page URL, so its listings would have no View link until that is checked — do not wire it until a listing URL is confirmed.',
  },
  {
    id: 'openweb-ninja',
    name: 'OpenWeb Ninja Real Estate Data',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.openwebninja.com/api/real-time-real-estate-data',
    gap: 'Zillow + Redfin search (sale and rent, US + Canada). Free tier: 100 requests/month, hard limit, no card — subscribe on RapidAPI or the OpenWeb Ninja portal. Gap: RapidAPI subscription, then an adapter (endpoint host not yet verified from the docs).',
  },
  {
    id: 'realtor-ca',
    name: 'REALTOR.ca (CREA DDF)',
    kind: 'federal',
    status: 'staged',
    url: 'https://www.realtor.ca/',
    gap: 'Canada\u2019s national MLS feed (DDF) is permission-based, not self-serve: a data access agreement with CREA as a Technology Provider, a REALTOR opt-in, $1,500 CAD onboarding plus $25/month per feed. No free tier, no sandbox. Gap: CREA agreement + fees.',
  },
  {
    id: 'zillow',
    name: 'Zillow',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.zillow.com/',
    gap: 'DEAD END — do not present as live. Public API (ZWSID) retired September 30, 2021; old endpoints return 410 Gone. The replacement, Bridge Interactive, is invite-only and each MLS must approve access. Gap: none available — Zillow cannot feed the board without a Bridge partnership.',
  },
  {
    id: 'realtor-com',
    name: 'Realtor.com',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.realtor.com/',
    gap: 'No public read API. Gap: Realtor.com partnership.',
  },
  {
    id: 'trulia',
    name: 'Trulia',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.trulia.com/',
    gap: 'No public read API. Third-party RapidAPI feeds exist but are unverified. Gap: Trulia partnership or a verified feed.',
  },
  {
    id: 'zumper',
    name: 'Zumper',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.zumper.com/',
    gap: 'No public API. A third-party RapidAPI feed covers US + Canada rentals, unverified. Gap: Zumper partnership or a verified feed.',
  },
  {
    id: 'rent-com',
    name: 'Rent.com',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.rent.com/',
    gap: 'No public API. A third-party RapidAPI feed exists, unverified. Gap: Rent.com partnership or a verified feed.',
  },
  {
    id: 'kijiji',
    name: 'Kijiji Housing',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.kijiji.ca/b-real-estate/',
    gap: 'No public API. Old RSS search feed no longer works (verified Nov 21: rss-srp URLs return 403). Terms of Use ban robots, spiders and scrapers without express written permission, so no scraping. Gap: express written permission from Kijiji Canada Ltd. or a licensed feed.',
  },
  {
    id: 'rentals-ca',
    name: 'Rentals.ca',
    kind: 'commercial',
    status: 'staged',
    url: 'https://rentals.ca/',
    gap: 'No public API verified. Gap: Rentals.ca partnership or a verified public feed.',
  },
  {
    id: 'craigslist',
    name: 'Craigslist Housing',
    kind: 'commercial',
    status: 'staged',
    url: 'https://www.craigslist.org/',
    gap: 'No API. An RSS search feed exists, but Craigslist\u2019s Terms of Use restrict automated use, so it is not wired. Gap: permission or a licensed feed.',
  },
  // --- Staged: temporary stays, partner-only ---
  {
    id: 'booking-com',
    name: 'Booking.com',
    kind: 'temporary',
    status: 'staged',
    url: 'https://www.booking.com/',
    gap: 'Demand API is open only to approved Managed Affiliate Partners — signed contract, then a key from Partner Centre. A normal affiliate signup does not count. Gap: Managed Affiliate Partner contract.',
  },
  {
    id: 'expedia-rapid',
    name: 'Expedia Rapid',
    kind: 'temporary',
    status: 'staged',
    url: 'https://developer.expedia.com/',
    gap: 'Partner application, build, certification, then terms — no free tier, no self-serve key. Gap: Expedia partner approval + certification.',
  },
  {
    id: 'amadeus',
    name: 'Amadeus Hotels',
    kind: 'temporary',
    status: 'staged',
    url: 'https://developers.amadeus.com/',
    gap: 'DEAD END for self-serve — do not present as live. The free self-service portal (including Hotel Search) was decommissioned July 17, 2026; enterprise APIs continue under contract only. Gap: none available without an enterprise contract.',
  },
  {
    id: 'hostelworld',
    name: 'Hostelworld',
    kind: 'temporary',
    status: 'staged',
    url: 'https://www.hostelworld.com/',
    gap: 'No public search API — affiliate links only, no live availability or prices as data. Gap: Hostelworld affiliate setup, and it still would not feed live stays.',
  },
  {
    id: 'serpapi-hotels',
    name: 'SerpApi Google Hotels',
    kind: 'temporary',
    status: 'staged',
    url: 'https://serpapi.com/',
    gap: 'Free signup: 250 searches a month, then paid from $25 per 1,000 searches. Reads Google Hotels results pages, not a partner feed. Gap: SERPAPI_API_KEY env var (free signup).',
  },
  {
    id: 'airbnb',
    name: 'Airbnb',
    kind: 'temporary',
    status: 'staged',
    url: 'https://www.airbnb.ca/',
    gap: 'No public API for searching stays. Gap: Airbnb partnership.',
  },
  // --- Staged: market data, not listings ---
  {
    id: 'cmhc',
    name: 'CMHC Housing Data',
    kind: 'government',
    status: 'staged',
    url: 'https://www.cmhc-schl.gc.ca/',
    gap: 'Publishes rental-market aggregates (average rents, vacancy rates), not individual listings — useful as market context, not as a listing source. Gap: none — it cannot feed listings by design.',
  },
];

import { isRedfinConfigured, REDFIN_BUDGET_NOTE, REDFIN_MISSING_KEY_GAP } from './adapters/redfin-listings.js';

// The registry as written is the static base. getSourceRegistry() applies
// the env-dependent override: Redfin is live (with its note) when its
// server key is set, and staged with the keys gap when not. The sources
// API route returns getSourceRegistry(), never the static list, so the
// board never presents a keyed source as live before its key exists.
export function getSourceRegistry(env = process.env) {
  const redfinOn = isRedfinConfigured(env);
  return SOURCE_REGISTRY.map((s) => {
    if (s.id === 'redfin-listings') {
      if (redfinOn) {
        const { gap: _gap, ...rest } = s;
        return { ...rest, status: 'live', notes: REDFIN_BUDGET_NOTE };
      }
      return { ...s, status: 'staged', gap: REDFIN_MISSING_KEY_GAP };
    }
    return { ...s };
  });
}

export function sourceById(id) {
  return SOURCE_REGISTRY.find((s) => s.id === id) || null;
}

export function liveSources(env = process.env) {
  return getSourceRegistry(env).filter((s) => s.status === 'live');
}

export function stagedSources(env = process.env) {
  return getSourceRegistry(env).filter((s) => s.status === 'staged');
}
