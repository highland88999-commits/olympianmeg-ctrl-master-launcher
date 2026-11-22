// lib/education/search.js — Pure search over the Omega Education
// directory (plus any adapter entries folded in by the API route).
//
// Filters: keyword (name, programs, description, city), level, field,
// radius from a centre. K-12 schools match ANY field filter — they teach
// the full curriculum — so a field search never hides the local school.
// Online entries always pass a radius filter (they can be taken from
// anywhere). Entries without coords are kept, distance null.
// Sort: by distance when a centre is known, otherwise by name.

import { haversineKm } from './geo.js';
import { FIELD_IDS } from './fields.js';
import { LEVEL_IDS } from './levels.js';

export function normaliseQuery(q) {
  return String(q || '').trim().toLowerCase();
}

export function keywordMatches(entry, q) {
  const query = normaliseQuery(q);
  if (!query) return true;
  const hay = [
    entry.name,
    (entry.programs || []).join(' '),
    entry.description || '',
    entry.location?.city,
    entry.location?.region,
    entry.location?.country,
  ].join(' ').toLowerCase();
  return query.split(/\s+/).every((word) => word && hay.includes(word));
}

export function fieldMatches(entry, field) {
  if (!field) return true;
  if (!FIELD_IDS.has(field)) return true; // unknown field id: do not hide results
  if (entry.level === 'k12') return true; // full curriculum — matches any field
  return Array.isArray(entry.fields) && entry.fields.includes(field);
}

export function levelMatches(entry, level) {
  if (!level) return true;
  if (!LEVEL_IDS.has(level)) return true; // unknown level id: do not hide results
  return entry.level === level;
}

// Pure filter + annotate. Does not drop no-coord entries.
export function searchDirectory(entries, { q = '', level = '', field = '', centre = null, radiusKm = null } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const out = [];
  const radius = radiusKm == null || radiusKm === 'any' ? null : Number(radiusKm);
  const hasRadius = Number.isFinite(radius) && radius >= 0
    && centre && centre.lat != null && centre.lon != null;
  for (const entry of list) {
    if (!keywordMatches(entry, q)) continue;
    if (!levelMatches(entry, level)) continue;
    if (!fieldMatches(entry, field)) continue;
    let distanceKm = null;
    if (centre && centre.lat != null && centre.lon != null && entry.location) {
      distanceKm = haversineKm(centre, entry.location);
      if (distanceKm != null) distanceKm = Math.round(distanceKm * 10) / 10;
    }
    if (hasRadius) {
      if (entry.online) { out.push({ ...entry, distanceKm: 0 }); continue; }
      if (distanceKm != null && distanceKm > radius) continue;
    }
    out.push({ ...entry, distanceKm });
  }
  out.sort((a, b) => {
    if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
    if (a.distanceKm != null) return -1;
    if (b.distanceKm != null) return 1;
    return String(a.name).localeCompare(String(b.name));
  });
  return out;
}

export function dedupeEntries(entries) {
  const seen = new Set();
  const out = [];
  for (const e of entries || []) {
    // Key on name + URL: two different schools may legitimately share a
    // board homepage URL (several Alberta schools list their authority's
    // site), so URL alone must never collapse distinct schools. The same
    // institution arriving from two sources (directory + Scorecard) shares
    // both its name and its URL and is dropped as the repeat.
    const key = `${String(e.name || '').toLowerCase()}|${(e.url || '').toLowerCase().replace(/\/$/, '')}` || e.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
