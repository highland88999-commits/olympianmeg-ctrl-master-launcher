// lib/venus-wifi/spots.js
// Pure shared logic for the Venus WiFi collective free-WiFi map.
// No imports, no I/O — safe in the browser, in API routes, and in tests.
//
// The map's rules (Merlin, 2026-10-03 + 2026-10-15):
//  * Every user can log a free, open network: its name (SSID) + the GPS
//    coordinates of the connection. Contributions pool into ONE map.
//  * A spot is trustworthy while the community keeps confirming it; a
//    spot nobody has confirmed for 12 months is treated as gone.
//  * Duplicates merge: same network name within ~75 m is the same spot —
//    logging it again bumps its confirmations instead of adding a twin.
//  * The whole list is downloadable as a checksummed snapshot so viewing
//    and navigating to a spot never need a connection.

export const EARTH_RADIUS_KM = 6371;
export const DEFAULT_RADIUS_KM = 5;
export const MERGE_RADIUS_M = 75;
export const EXPIRY_MS = 365 * 24 * 60 * 60 * 1000; // 12 months
export const SNAPSHOT_KEY = 'venus-wifi-snapshot-v1';
export const SNAPSHOT_REFRESH_MS = 30 * 24 * 60 * 60 * 1000; // monthly

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance between two {lat, lng} points, in kilometres. */
export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Initial bearing from a to b, in degrees clockwise from north (0–360). */
export function bearingDeg(a, b) {
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compassPoint(deg) {
  return COMPASS_POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** Human distance: metres under 1 km, kilometres (1 decimal) above. */
export function formatDistance(km) {
  if (!Number.isFinite(km)) return '—';
  if (km < 1) return `${Math.max(0, Math.round(km * 1000))} m`;
  return `${km.toFixed(1)} km`;
}

/** A spot is live while its last confirmation is younger than 12 months. */
export function isSpotLive(spot, now = Date.now()) {
  const last = new Date(spot?.lastConfirmed ?? spot?.last_confirmed ?? 0).getTime();
  if (!Number.isFinite(last) || last <= 0) return false;
  return now - last < EXPIRY_MS;
}

/** The cutoff instant: confirmations older than this are expired. */
export function expiryCutoffIso(now = Date.now()) {
  return new Date(now - EXPIRY_MS).toISOString();
}

/**
 * Validate a contribution body. Returns { ok: true, value } or
 * { ok: false, error } with plain-English copy safe to show the user.
 * source: 'manual' (v1 one-tap log) or 'auto' (future native logger,
 * same endpoint by design).
 */
export function validateSpotInput(body) {
  const b = body && typeof body === 'object' ? body : {};
  const ssid = String(b.ssid ?? '').trim();
  if (!ssid) return { ok: false, error: 'Name the network first.' };
  if (ssid.length > 64) return { ok: false, error: 'That network name is too long.' };
  if (b.openFree !== true && b.open_free !== true) {
    return {
      ok: false,
      error: 'Only log networks that are free and need no password — that is what this map is for.',
    };
  }
  const lat = Number(b.lat);
  const lng = Number(b.lng ?? b.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, error: 'That latitude does not look right.' };
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { ok: false, error: 'That longitude does not look right.' };
  }
  const note = String(b.note ?? '').trim().slice(0, 280);
  const source = b.source === 'auto' ? 'auto' : 'manual';
  return { ok: true, value: { ssid, lat, lng, note: note || null, openFree: true, source } };
}

/**
 * Find the row a new contribution should merge into: same SSID
 * (case-insensitive) and within MERGE_RADIUS_M. Nearest wins.
 * Rows and value use { ssid, lat, lng } shape. Returns the row or null.
 */
export function findMergeCandidate(rows, value, mergeRadiusM = MERGE_RADIUS_M) {
  const target = String(value.ssid).trim().toLowerCase();
  let best = null;
  let bestKm = Infinity;
  for (const row of rows || []) {
    if (String(row.ssid || '').trim().toLowerCase() !== target) continue;
    const km = haversineKm(
      { lat: Number(row.lat), lng: Number(row.lng) },
      { lat: value.lat, lng: value.lng }
    );
    if (km * 1000 <= mergeRadiusM && km < bestKm) {
      best = row;
      bestKm = km;
    }
  }
  return best;
}

/**
 * The ONLY shape the public ever sees. contributor_id is never on it —
 * contributions are published anonymously (network name + location only).
 */
export function publicSpot(row) {
  if (!row) return null;
  return {
    id: row.id,
    ssid: row.ssid,
    lat: Number(row.lat),
    lng: Number(row.lng),
    note: row.note || null,
    confirmations: row.confirmations ?? 1,
    firstSeen: row.first_seen || row.firstSeen || null,
    lastConfirmed: row.last_confirmed || row.lastConfirmed || null,
  };
}

/** Spots with a live distance from origin, nearest first. */
export function withDistances(spots, origin) {
  if (!origin) return (spots || []).map((s) => ({ ...s, distanceKm: null, bearing: null }));
  return (spots || [])
    .map((s) => {
      const distanceKm = haversineKm(origin, s);
      return { ...s, distanceKm, bearing: bearingDeg(origin, s) };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Spots within radiusKm of origin, nearest first, distances attached. */
export function spotsWithinRadius(spots, origin, radiusKm = DEFAULT_RADIUS_KM) {
  return withDistances(spots, origin).filter(
    (s) => s.distanceKm != null && s.distanceKm <= radiusKm
  );
}

// --- Offline snapshot -------------------------------------------------
// A snapshot is { version, generatedAt, checksum, spots } where spots use
// the light shape { ssid, lat, lng, note, lastConfirmed }. The checksum is
// sha256 over the canonical string of { version, spots } — generatedAt is
// deliberately excluded so identical lists hash identically no matter
// when they were generated. A download REPLACES the stored copy only
// after its checksum verifies: a bad download never wipes a good list.

export function snapshotSpot(row) {
  const p = publicSpot(row);
  return {
    ssid: p.ssid,
    lat: p.lat,
    lng: p.lng,
    note: p.note,
    lastConfirmed: p.lastConfirmed,
  };
}

/** Deterministic JSON: object keys sorted at every depth. */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/** The exact string a snapshot's checksum is computed over. */
export function snapshotCanonicalString({ version, spots }) {
  return stableStringify({ version, spots });
}

/**
 * Build a snapshot from DB rows (server side): expired spots excluded,
 * version = the newest updated_at among included spots (stable across
 * regenerations of identical data), falling back to generatedAt when
 * the list is empty. `checksum` is filled in by the caller (needs a
 * hash implementation — node:crypto on the server, SubtleCrypto in the
 * browser, both over snapshotCanonicalString).
 */
export function buildSnapshot(rows, now = Date.now()) {
  const generatedAt = new Date(now).toISOString();
  const live = (rows || []).filter((r) => isSpotLive(r, now));
  const spots = live
    .map(snapshotSpot)
    .sort((a, b) => String(a.ssid).localeCompare(String(b.ssid)) || a.lat - b.lat || a.lng - b.lng);
  let version = null;
  for (const r of live) {
    const u = r.updated_at || r.updatedAt || r.last_confirmed || r.lastConfirmed || null;
    if (u && (!version || String(u) > version)) version = String(u);
  }
  return { version: version || generatedAt, generatedAt, spots };
}

/** True when a stored snapshot is older than the monthly refresh window. */
export function snapshotIsStale(savedAt, now = Date.now()) {
  const t = new Date(savedAt || 0).getTime();
  if (!Number.isFinite(t) || t <= 0) return true;
  return now - t >= SNAPSHOT_REFRESH_MS;
}
