// lib/housing/adapters/osm-stays.js — OpenStreetMap stays (live, keyless).
//
// Temporary section: real hotels, hostels, guest houses and motels near a
// place, from OpenStreetMap via the Overpass API — no key, no account, no
// payment. One call per search. OSM has no prices or availability, so
// these listings carry none: what you see is the place's real name, kind,
// address when mapped, and a link — the place's own website when mapped,
// otherwise its OpenStreetMap page. Never invented, never a booking link
// we do not have.
//
// Overpass usage policy asks for a contact User-Agent and fair use: one
// small query per search, radius capped at 50 km. The fetch budget is
// 60 s because Overpass queues hard (2 slots, ~25 s turnover) and the
// reply through this egress path lands around 30–40 s; a 25 s budget
// aborted requests that would have come back fine. The [timeout:25]
// inside the query is the server-side execution budget, not the wait
// for a slot.
// Docs: https://overpass-api.de/ and https://wiki.openstreetmap.org/wiki/Overpass_API

import { normalizeListing } from './common.js';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_UA = 'OmegaHousing/1.0 (olympusverse.com; contact: olympiannexus@gmail.com)';
const OVERPASS_TIMEOUT_MS = 60000;
const MAX_RADIUS_M = 50000;

export const OSM_ATTRIBUTION = {
  label: 'Places © OpenStreetMap contributors',
  url: 'https://www.openstreetmap.org/copyright',
};

const STAY_KINDS = ['hotel', 'hostel', 'guest_house', 'motel'];

function stayType(tourism) {
  if (tourism === 'hotel') return 'hotel';
  if (tourism === 'hostel') return 'hostel';
  if (tourism === 'guest_house') return 'guest-house';
  if (tourism === 'motel') return 'motel';
  return null;
}

function stayLabel(tourism) {
  if (tourism === 'hotel') return 'Hotel';
  if (tourism === 'hostel') return 'Hostel';
  if (tourism === 'guest_house') return 'Guest house';
  if (tourism === 'motel') return 'Motel';
  return 'Place to stay';
}

export function buildOverpassQuery({ lat, lon, radiusKm }) {
  const radiusM = Math.min(
    Math.max(Math.round((Number(radiusKm) || 25) * 1000), 1000),
    MAX_RADIUS_M,
  );
  const kinds = STAY_KINDS.join('|');
  // Nodes, ways and relations with a tourism stay tag around the centre.
  // `out center 200` keeps the answer small and gives ways a centre point.
  return `[out:json][timeout:25];(node["tourism"~"^(${kinds})$"](around:${radiusM},${lat},${lon});way["tourism"~"^(${kinds})$"](around:${radiusM},${lat},${lon});relation["tourism"~"^(${kinds})$"](around:${radiusM},${lat},${lon}););out center 200;`;
}

function addressFromTags(tags) {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ').trim() || null;
  return {
    street,
    city: tags['addr:city'] || null,
    region: tags['addr:state'] || tags['addr:province'] || null,
    country: tags['addr:country'] || null,
  };
}

export function parseOverpassPayload(payload) {
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const out = [];
  for (const el of elements) {
    const tags = el?.tags || {};
    const tourism = tags.tourism;
    if (!STAY_KINDS.includes(tourism)) continue;
    const name = typeof tags.name === 'string' ? tags.name.trim() : '';
    if (!name) continue; // unnamed mapped points are not listings
    const lat = Number.isFinite(el?.lat) ? el.lat
      : Number.isFinite(el?.center?.lat) ? el.center.lat : null;
    const lon = Number.isFinite(el?.lon) ? el.lon
      : Number.isFinite(el?.center?.lon) ? el.center.lon : null;
    const addr = addressFromTags(tags);
    const website = tags.website || tags['contact:website'] || null;
    const stars = tags.stars ? `${tags.stars}★ ` : '';
    const parts = [stars + stayLabel(tourism)];
    if (addr.street) parts.push(addr.street);
    out.push(normalizeListing({
      id: `osm:${el.type}/${el.id}`,
      source: 'osm-stays',
      section: 'temporary',
      title: name,
      price: null, // OSM carries no prices — shown as "price not listed"
      beds: null,
      baths: null,
      sqft: null,
      type: stayType(tourism),
      location: {
        city: addr.city,
        region: addr.region,
        country: addr.country,
        lat,
        lon,
      },
      // The place's own website when mapped, else its OpenStreetMap page.
      url: website || `https://www.openstreetmap.org/${el.type}/${el.id}`,
      description: parts.join(' · '),
      postedAt: null,
      attribution: OSM_ATTRIBUTION,
    }));
  }
  return out;
}

// Needs a centre: stays are "near a place" by definition. Without one
// there is nothing honest to return, so the adapter yields [] and the
// search route reports the source as live with 0 results.
export async function fetchListings({ lat, lon, radiusKm = 25 } = {}) {
  if (lat == null || lon == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
    return [];
  }
  const query = buildOverpassQuery({ lat: Number(lat), lon: Number(lon), radiusKm });
  // Overpass takes the query as a POST body (a GET with no query is a 400).
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'User-Agent': OVERPASS_UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from overpass-api.de`);
  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('Overpass returned a response that was not JSON');
  }
  return parseOverpassPayload(payload);
}
