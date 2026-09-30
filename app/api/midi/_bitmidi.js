// BitMidi search integration for the Maestro universal library.
//
// bitmidi.com exposes a public, CORS-enabled JSON API (see their open-source
// router-api.js): GET https://bitmidi.com/api/midi/search?q=<query>&pageSize=<n>
// Each result carries id/name/slug/downloadUrl — the file itself lives at
// https://bitmidi.com/uploads/<id>.mid and flows through the existing
// /api/midi/ingest pipeline (validate, fingerprint, dedupe, store, play).
//
// We never bulk-mirror their catalog (113k+ files). Search is on demand:
// one polite API call per user search, one file download per user tap.
//
// Policy review (2026-09-30): bitmidi.com/robots.txt disallows /uploads/ for
// crawlers — this is not a crawler (one search + one fetch per explicit user
// action, the same API and file URLs their own frontend uses). The collection
// is volunteer-curated transcriptions (origin: a public Reddit archive); files
// enter the universal library only when a user explicitly adds one, with
// BitMidi attribution in the UI.

export const BITMIDI_ORIGIN = 'https://bitmidi.com';
const SEARCH_TIMEOUT_MS = 15000;

export function bitmidiSearchUrl(q, pageSize = 12) {
  const params = new URLSearchParams({
    q: String(q || '').slice(0, 120),
    pageSize: String(Math.min(Math.max(pageSize | 0, 1), 25)),
  });
  return `${BITMIDI_ORIGIN}/api/midi/search?${params.toString()}`;
}

// Normalize one API payload into UI-ready rows. Pure — unit tested.
export function normalizeBitmidiResults(json) {
  const results = json && json.result && json.result.results;
  if (!Array.isArray(results)) return [];
  return results
    .filter((r) => r && r.id && r.name)
    .map((r) => ({
      key: `bitmidi-${r.id}`,
      name: String(r.name),
      plays: Number(r.plays) || 0,
      pageUrl: `${BITMIDI_ORIGIN}${r.url || `/${r.slug}`}`,
      downloadUrl: `${BITMIDI_ORIGIN}${r.downloadUrl || `/uploads/${r.id}.mid`}`,
    }));
}

export async function searchBitmidi(q, pageSize = 12) {
  const query = String(q || '').trim();
  if (!query) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
  try {
    const r = await fetch(bitmidiSearchUrl(query, pageSize), {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Maestro/1.0 (universal MIDI library)' },
    });
    if (!r.ok) throw new Error(`BitMidi search failed (${r.status})`);
    return normalizeBitmidiResults(await r.json());
  } finally {
    clearTimeout(timer);
  }
}
