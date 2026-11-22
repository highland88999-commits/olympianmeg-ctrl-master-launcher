// tests/housing-adapters.test.mjs — Housing adapters against saved fixtures.
// Fixtures are trimmed slices of real response shapes (Redfin's documented
// sample; Overpass's documented element shape); tests never hit the network.
// Run: node --test tests/housing-adapters.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRedfinPayload, isRedfinConfigured } from '../lib/housing/adapters/redfin-listings.js';
import { parseOverpassPayload, buildOverpassQuery } from '../lib/housing/adapters/osm-stays.js';
import { normalizeListing } from '../lib/housing/adapters/common.js';
import { dedupeListings } from '../lib/housing/adapters/index.js';

const FIX = (name) => readFileSync(new URL(`./fixtures/housing/${name}`, import.meta.url), 'utf8');

function checkShape(listing, source, section) {
  assert.equal(listing.source, source);
  assert.equal(listing.section, section);
  assert.ok(listing.id, 'id');
  assert.ok(listing.title, 'title');
  assert.ok(listing.location && typeof listing.location === 'object', 'location object');
  assert.ok('city' in listing.location, 'location.city');
  // A listing either carries its source's own URL, or none at all — never
  // a constructed link to a site it did not come from.
  assert.ok(listing.url === null || /^https?:\/\//.test(listing.url), `url is the source's own link or null: ${listing.url}`);
}

test('redfin: parses the documented sample into sale + rental listings', () => {
  const listings = parseRedfinPayload(JSON.parse(FIX('redfin.json')));
  assert.equal(listings.length, 3);
  const sale = listings[0];
  checkShape(sale, 'redfin-listings', 'real-estate');
  assert.equal(sale.title, '1234 Oak Hill Dr, Austin, TX 78745');
  assert.equal(sale.price.min, 425000);
  assert.equal(sale.price.unit, 'total');
  assert.equal(sale.beds, 3);
  assert.equal(sale.baths, 2);
  assert.equal(sale.sqft, 1850);
  assert.equal(sale.url, 'https://www.redfin.com/TX/Austin/1234-Oak-Hill-Dr-78745/home/12345678');
  assert.equal(sale.location.city, '1234 Oak Hill Dr');
  assert.equal(sale.attribution.label, 'Listings by Redfin');
});

test('redfin: a For Rent status lands in rentals with a monthly price', () => {
  const listings = parseRedfinPayload(JSON.parse(FIX('redfin.json')));
  const rental = listings[1];
  checkShape(rental, 'redfin-listings', 'rentals');
  assert.equal(rental.price.min, 2400);
  assert.equal(rental.price.unit, 'monthly');
});

test('redfin: a listing with no URL renders with none, not a made-up one', () => {
  const listings = parseRedfinPayload(JSON.parse(FIX('redfin.json')));
  assert.equal(listings[2].url, null);
  checkShape(listings[2], 'redfin-listings', 'real-estate');
});

test('redfin: unconfigured without RAPIDAPI_KEY, configured with it', () => {
  assert.equal(isRedfinConfigured({}), false);
  assert.equal(isRedfinConfigured({ RAPIDAPI_KEY: '' }), false);
  assert.equal(isRedfinConfigured({ RAPIDAPI_KEY: 'test-key-not-real' }), true);
});

test('osm: parses nodes, ways and relations; skips unnamed and non-stays', () => {
  const listings = parseOverpassPayload(JSON.parse(FIX('overpass.json')));
  // hotel node + hostel way + motel node. The unnamed guest house and the
  // restaurant are not listings.
  assert.equal(listings.length, 3);
  const hotel = listings.find((l) => l.id === 'osm:node/101');
  checkShape(hotel, 'osm-stays', 'temporary');
  assert.equal(hotel.title, 'Redwater Inn');
  assert.equal(hotel.type, 'hotel');
  assert.equal(hotel.price, null); // OSM carries no prices
  assert.equal(hotel.url, 'https://example.com/redwater-inn');
  assert.equal(hotel.location.city, 'Redwater');
  assert.equal(hotel.location.lat, 53.9501);
  assert.equal(hotel.attribution.label, 'Places © OpenStreetMap contributors');
  const hostel = listings.find((l) => l.id === 'osm:way/202');
  checkShape(hostel, 'osm-stays', 'temporary');
  assert.equal(hostel.type, 'hostel');
  assert.equal(hostel.location.lat, 53.951); // way centre
  assert.equal(hostel.url, 'https://www.openstreetmap.org/way/202'); // no website mapped
  const motel = listings.find((l) => l.id === 'osm:node/505');
  assert.equal(motel.type, 'motel');
});

test('osm: query is a regex tourism match around the centre, capped at 50 km', () => {
  const q = buildOverpassQuery({ lat: 53.95, lon: -113.1, radiusKm: 25 });
  assert.match(q, /\["tourism"~"\^\(hotel\|hostel\|guest_house\|motel\)\$"/);
  assert.match(q, /around:25000,53\.95,-113\.1/);
  assert.match(q, /out center 200/);
  const capped = buildOverpassQuery({ lat: 53.95, lon: -113.1, radiusKm: 500 });
  assert.match(capped, /around:50000,/);
});

test('normalizeListing: derives a type from the listing words, never guesses a price', () => {
  const l = normalizeListing({
    id: 'x:1', source: 'osm-stays', section: 'temporary',
    title: 'Riverside Hostel', location: {},
  });
  assert.equal(l.type, 'hostel');
  assert.equal(l.price, null);
  assert.equal(l.url, null);
});

test('dedupeListings: same URL twice renders once', () => {
  const a = normalizeListing({ id: 'a', source: 'osm-stays', section: 'temporary', title: 'A', url: 'https://example.com/a' });
  const b = normalizeListing({ id: 'b', source: 'osm-stays', section: 'temporary', title: 'B', url: 'https://example.com/a' });
  assert.equal(dedupeListings([a, b]).length, 1);
});
