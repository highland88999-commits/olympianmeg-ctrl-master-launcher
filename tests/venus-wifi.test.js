// tests/venus-wifi.test.js
// Headless tests for Venus WiFi ("Saved Spots") — the Artemis nav console
// plus the collective free-WiFi map (Merlin 2026-10-03 + 2026-10-15):
// pooled contributions, duplicate merge, checksummed offline snapshot,
// distance/bearing math, 12-month expiry.
// Run: node tests/venus-wifi.test.js (from the repo root). No browser,
// no network, no database.
import { readFileSync } from 'fs';
import { createHash } from 'node:crypto';
import {
  haversineKm,
  bearingDeg,
  compassPoint,
  formatDistance,
  isSpotLive,
  expiryCutoffIso,
  validateSpotInput,
  findMergeCandidate,
  publicSpot,
  withDistances,
  spotsWithinRadius,
  stableStringify,
  snapshotCanonicalString,
  buildSnapshot,
  snapshotIsStale,
  EXPIRY_MS,
  MERGE_RADIUS_M,
  SNAPSHOT_KEY,
} from '../lib/venus-wifi/spots.js';

const page = readFileSync('app/venus-wifi/page.jsx', 'utf8');
const spotsRoute = readFileSync('app/api/venus-wifi/spots/route.js', 'utf8');
const confirmRoute = readFileSync('app/api/venus-wifi/spots/[id]/confirm/route.js', 'utf8');
const snapshotRoute = readFileSync('app/api/venus-wifi/snapshot/route.js', 'utf8');
const serverLib = readFileSync('lib/venus-wifi/server.js', 'utf8');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const NOW = Date.parse('2026-10-15T12:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();

// ---------- console heritage (kept from the original module) ----------
t('renders the system core header', /SYSTEM_CORE_v3/.test(page));
t('has waypoint search and scan', /ENTER VECTOR/.test(page) && /Scan/.test(page));
t('has voice input', /Voice input/.test(page));
t('has GPS position lock', /Engage GPS \/ Position Lock/.test(page));
t('has waypoint vault with save', /WAYPOINT VAULT/.test(page) && /Waypoint name/.test(page));
t('supports route locking', /ROUTE LOCKED/.test(page));
t('tactical radar is a local canvas', /getContext\('2d'\)/.test(page) && /radar rings|sweep/.test(page));
t('waypoints persist locally', /venus-waypoints/.test(page));
t('position is watched live, not one-shot', /watchPosition/.test(page));

// ---------- collective map: page wiring ----------
t('page reads the offline snapshot key from the shared lib', /SNAPSHOT_KEY/.test(page) && SNAPSHOT_KEY === 'venus-wifi-snapshot-v1');
t('page fetches the snapshot endpoint', page.includes('/api/venus-wifi/snapshot'));
t('page fetches nearby spots endpoint', page.includes('/api/venus-wifi/spots?lat='));
t('page posts contributions to the spots endpoint', /fetch\('\/api\/venus-wifi\/spots', \{\s*method: 'POST'/.test(page));
t('page confirms via the confirm endpoint', page.includes('/confirm'));
t('download list call to action present', /Download the WiFi list|Download the latest WiFi list/.test(page));
t('download replaces only after checksum verification', /verifySnapshot/.test(page) && /crypto\.subtle/.test(page) && /snapshotCanonicalString/.test(page));
t('a failed checksum keeps the old list', /YOUR OLD LIST IS KEPT/.test(page));
t('monthly refresh prompt exists', /over a month old/.test(page) && /snapshotIsStale/.test(page));
t('contribute section present with free+open confirmation', /LOG FREE WIFI HERE/.test(page) && /free and needs no password/.test(page));
t('contribution explains location is taken only when logging', /only taken when you log a spot/.test(page));
t('location-declined state degrades honestly', /Location is off, so new spots can't be placed/.test(page));
t('still-here confirm button present', /Still here/.test(page));
t('proximity banner present', /FREE WIFI NEARBY/.test(page));
t('proximity honesty: alerts only while page is open', /while this page is open/.test(page));
t('guidance mode with big arrow + bearing text', /vw-arrow/.test(page) && /Bearing/.test(page));
t('guidance uses device orientation where available', /deviceorientation/.test(page) && /webkitCompassHeading/.test(page));
t('12-month drop-off explained on the page', /12 months drop off the map/.test(page));
t('offline viewing stated plainly', /works with no connection/.test(page));

// ---------- audit: no third-party maps, tiles, or tracking ----------
t('no leaflet or routing machine', !/leaflet|L\.Routing/i.test(page));
t('no OSM tiles or nominatim', !/openstreetmap|nominatim/i.test(page));
t('no external URLs in the page', !/https?:\/\//.test(page));
t('no tracking scripts', !/logBrainAction|track_ping|nexus_visitor_id/.test(page));
t('no central_telemetry', !/central_telemetry/.test(page));
t('no ipify', !/ipify/.test(page));

// ---------- API routes: conventions + gates ----------
t('spots route is force-dynamic', /force-dynamic/.test(spotsRoute) && /force-dynamic/.test(snapshotRoute));
t('spots GET treats missing coords as a 400, never as (0,0)', /latRaw === null/.test(spotsRoute) && /lngRaw === null/.test(spotsRoute));
t('spots POST requires a signed-in user', /requireUser/.test(spotsRoute));
t('spots POST merges duplicates instead of duplicating', /findMergeCandidate/.test(spotsRoute) && /merged: true/.test(spotsRoute));
t('confirm route requires a signed-in user', /requireUser/.test(confirmRoute));
t('confirm route refreshes last_confirmed and bumps confirmations', /last_confirmed/.test(confirmRoute) && /confirmations/.test(confirmRoute));
t('snapshot route hashes with sha256', /createHash\('sha256'\)/.test(snapshotRoute) && /snapshotCanonicalString/.test(snapshotRoute));
t('server lib reads with an explicit column list', /PUBLIC_SPOT_COLUMNS/.test(serverLib));
t('public column list never includes contributor_id', !/PUBLIC_SPOT_COLUMNS\s*=\s*'[^']*contributor_id/.test(serverLib) && !/select\('\*'\)/.test(serverLib));

// ---------- distance + bearing math ----------
t('haversine: 1 degree of longitude at the equator ~111.19 km',
  Math.abs(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111.195) < 0.01);
t('haversine: same point is zero', haversineKm({ lat: 53.5, lng: -113.5 }, { lat: 53.5, lng: -113.5 }) === 0);
t('haversine: Edmonton to Calgary ~281 km',
  Math.abs(haversineKm({ lat: 53.5461, lng: -113.4938 }, { lat: 51.0447, lng: -114.0719 }) - 281) < 4);
t('bearing: due north is 0', bearingDeg({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) === 0);
t('bearing: due east is 90', Math.abs(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 90) < 0.001);
t('bearing: due south is 180', Math.abs(bearingDeg({ lat: 1, lng: 0 }, { lat: 0, lng: 0 }) - 180) < 0.001);
t('compass points', compassPoint(0) === 'N' && compassPoint(90) === 'E' && compassPoint(225) === 'SW' && compassPoint(359) === 'N');
t('formatDistance: metres under 1 km', formatDistance(0.25) === '250 m');
t('formatDistance: kilometres above', formatDistance(1.26) === '1.3 km' && formatDistance(12.34) === '12.3 km');

// ---------- contribution validation ----------
t('validate: a good manual log passes', (() => {
  const r = validateSpotInput({ ssid: 'LibraryWiFi', lat: 53.5, lng: -113.5, openFree: true, note: 'lobby' });
  return r.ok && r.value.ssid === 'LibraryWiFi' && r.value.source === 'manual' && r.value.note === 'lobby';
})());
t('validate: the future auto logger uses the same door', (() => {
  const r = validateSpotInput({ ssid: 'Cafe', lat: 1, lng: 2, openFree: true, source: 'auto' });
  return r.ok && r.value.source === 'auto';
})());
t('validate: empty ssid rejected', !validateSpotInput({ ssid: '  ', lat: 0, lng: 0, openFree: true }).ok);
t('validate: non-free network rejected', !validateSpotInput({ ssid: 'Home', lat: 0, lng: 0, openFree: false }).ok);
t('validate: bad latitude rejected', !validateSpotInput({ ssid: 'X', lat: 91, lng: 0, openFree: true }).ok);
t('validate: bad longitude rejected', !validateSpotInput({ ssid: 'X', lat: 0, lng: -181, openFree: true }).ok);
t('validate: note is capped at 280 chars', (() => {
  const r = validateSpotInput({ ssid: 'X', lat: 0, lng: 0, openFree: true, note: 'a'.repeat(400) });
  return r.ok && r.value.note.length === 280;
})());

// ---------- duplicate merge ----------
const base = { lat: 53.5461, lng: -113.4938 };
t('merge radius is 75 m', MERGE_RADIUS_M === 75);
t('merge: same SSID ~55 m away merges', (() => {
  const rows = [{ id: 'a', ssid: 'LibraryWiFi', lat: base.lat + 0.0005, lng: base.lng }];
  return findMergeCandidate(rows, { ssid: 'LibraryWiFi', ...base })?.id === 'a';
})());
t('merge: SSID match is case-insensitive', (() => {
  const rows = [{ id: 'a', ssid: 'librarywifi', lat: base.lat, lng: base.lng }];
  return !!findMergeCandidate(rows, { ssid: 'LibraryWiFi', ...base });
})());
t('merge: same SSID ~220 m away does NOT merge', (() => {
  const rows = [{ id: 'a', ssid: 'LibraryWiFi', lat: base.lat + 0.002, lng: base.lng }];
  return findMergeCandidate(rows, { ssid: 'LibraryWiFi', ...base }) === null;
})());
t('merge: different SSID at the same spot does NOT merge', (() => {
  const rows = [{ id: 'a', ssid: 'OtherNet', lat: base.lat, lng: base.lng }];
  return findMergeCandidate(rows, { ssid: 'LibraryWiFi', ...base }) === null;
})());
t('merge: nearest candidate wins', (() => {
  const rows = [
    { id: 'far', ssid: 'Net', lat: base.lat + 0.0006, lng: base.lng },
    { id: 'near', ssid: 'Net', lat: base.lat + 0.0002, lng: base.lng },
  ];
  return findMergeCandidate(rows, { ssid: 'Net', ...base })?.id === 'near';
})());

// ---------- privacy: public shape ----------
t('publicSpot never exposes contributor_id', (() => {
  const p = publicSpot({
    id: 'x', ssid: 'Net', open_free: true, lat: 1, lng: 2, note: null,
    confirmations: 3, first_seen: iso(NOW), last_confirmed: iso(NOW),
    contributor_id: 'secret-user-id', source: 'manual',
  });
  return p && !('contributor_id' in p) && !('contributorId' in p) && p.confirmations === 3;
})());

// ---------- radius listing ----------
t('spotsWithinRadius filters and sorts nearest first', (() => {
  const spots = [
    { ssid: 'far', lat: base.lat + 0.03, lng: base.lng, lastConfirmed: iso(NOW) },
    { ssid: 'near', lat: base.lat + 0.001, lng: base.lng, lastConfirmed: iso(NOW) },
    { ssid: 'mid', lat: base.lat + 0.009, lng: base.lng, lastConfirmed: iso(NOW) },
  ];
  const out = spotsWithinRadius(spots, base, 2);
  return out.length === 2 && out[0].ssid === 'near' && out[1].ssid === 'mid' && out[0].distanceKm < out[1].distanceKm;
})());
t('withDistances without an origin yields null distances', (() => {
  const out = withDistances([{ ssid: 'x', lat: 0, lng: 0 }], null);
  return out.length === 1 && out[0].distanceKm === null;
})());

// ---------- expiry (12 months) ----------
t('expiry window is 12 months', EXPIRY_MS === 365 * 24 * 60 * 60 * 1000);
t('a freshly confirmed spot is live', isSpotLive({ lastConfirmed: iso(NOW) }, NOW));
t('a spot confirmed 13 months ago is expired', !isSpotLive({ lastConfirmed: iso(NOW - 13 * 30.44 * 86400000) }, NOW));
t('a spot confirmed 11 months ago is still live', isSpotLive({ lastConfirmed: iso(NOW - 11 * 30.44 * 86400000) }, NOW));
t('a spot with no confirmation date is not live', !isSpotLive({ ssid: 'x' }, NOW));
t('expiry cutoff is 12 months before now', expiryCutoffIso(NOW) === iso(NOW - EXPIRY_MS));

// ---------- snapshot integrity ----------
const dbRow = (over) => ({
  id: 'r1', ssid: 'LibraryWiFi', open_free: true, lat: 53.5, lng: -113.5, note: 'lobby',
  confirmations: 2, first_seen: iso(NOW - 86400000), last_confirmed: iso(NOW - 3600000),
  updated_at: iso(NOW - 3600000), contributor_id: 'hidden', ...over,
});
t('snapshot excludes expired spots', (() => {
  const snap = buildSnapshot([
    dbRow({}),
    dbRow({ id: 'r2', ssid: 'OldNet', last_confirmed: iso(NOW - 400 * 86400000), updated_at: iso(NOW - 400 * 86400000) }),
  ], NOW);
  return snap.spots.length === 1 && snap.spots[0].ssid === 'LibraryWiFi';
})());
t('snapshot version is the newest updated_at among live spots', (() => {
  const snap = buildSnapshot([
    dbRow({}),
    dbRow({ id: 'r2', ssid: 'CafeNet', updated_at: iso(NOW - 60000), last_confirmed: iso(NOW - 60000) }),
  ], NOW);
  return snap.version === iso(NOW - 60000);
})());
t('snapshot spots carry no ids or contributors', (() => {
  const snap = buildSnapshot([dbRow({})], NOW);
  const s = snap.spots[0];
  return !('id' in s) && !('contributor_id' in s) && s.ssid === 'LibraryWiFi' && typeof s.lat === 'number';
})());
t('stableStringify is key-order independent',
  stableStringify({ b: 1, a: { d: 4, c: 3 } }) === stableStringify({ a: { c: 3, d: 4 }, b: 1 }));
t('checksum over the canonical string is deterministic', (() => {
  const snap = buildSnapshot([dbRow({})], NOW);
  const c1 = sha256(snapshotCanonicalString(snap));
  const snap2 = buildSnapshot([dbRow({})], NOW + 999999); // later generation, same list
  const c2 = sha256(snapshotCanonicalString(snap2));
  return c1 === c2 && snap.version === snap2.version;
})());
t('checksum changes when the list changes', (() => {
  const a = buildSnapshot([dbRow({})], NOW);
  const b = buildSnapshot([dbRow({}), dbRow({ id: 'r2', ssid: 'CafeNet' })], NOW);
  return sha256(snapshotCanonicalString(a)) !== sha256(snapshotCanonicalString(b));
})());
t('checksum catches a tampered spot', (() => {
  const snap = buildSnapshot([dbRow({})], NOW);
  const good = sha256(snapshotCanonicalString(snap));
  const tampered = { version: snap.version, spots: [{ ...snap.spots[0], lat: 0 }] };
  return sha256(snapshotCanonicalString(tampered)) !== good;
})());
t('empty snapshot falls back to generatedAt as version', (() => {
  const snap = buildSnapshot([], NOW);
  return snap.spots.length === 0 && snap.version === snap.generatedAt;
})());
t('snapshotIsStale: fresh copy is not stale', !snapshotIsStale(iso(NOW), NOW));
t('snapshotIsStale: 31-day-old copy is stale', snapshotIsStale(iso(NOW - 31 * 86400000), NOW));
t('snapshotIsStale: missing copy is stale', snapshotIsStale(null, NOW));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
