// lib/radio/spotify-search.js
// Pure helpers for the radio's Spotify search + per-user search playlist.
// No browser, no network, no tokens — safe to unit-test headless.
//
// Security contract:
// - These helpers only SHAPE data. The actual Spotify calls happen in the
//   server route (app/api/spotify/search/route.js), which holds the access
//   token server-side. The browser never sees a refresh token.

export const SEARCH_LIMIT = 10;
export const MAX_QUERY_LENGTH = 100;

// Trim + cap a raw search query. Returns '' when there is nothing to search.
export function sanitizeQuery(q) {
  if (typeof q !== 'string') return '';
  return q.trim().slice(0, MAX_QUERY_LENGTH);
}

// Spotify Web API track object -> the slim shape the UI renders.
// Missing fields degrade to '' / null rather than throwing.
export function mapSearchItem(item) {
  if (!item || typeof item !== 'object') return null;
  const id = typeof item.id === 'string' ? item.id : '';
  if (!id) return null;
  const artists = Array.isArray(item.artists)
    ? item.artists.map((a) => (a && a.name ? a.name : '')).filter(Boolean)
    : [];
  const images = item.album && Array.isArray(item.album.images) ? item.album.images : [];
  return {
    id,
    title: typeof item.name === 'string' ? item.name : 'Unknown track',
    artist: artists.join(', '),
    albumArt: images.length ? images[0].url || null : null,
    uri: typeof item.uri === 'string' ? item.uri : '',
  };
}

// Map a raw Spotify search response ({ tracks: { items: [...] } }) to the
// slim UI shape. Drops unparseable entries.
export function mapSearchResponse(data) {
  const items = data?.tracks?.items;
  if (!Array.isArray(items)) return [];
  return items.map(mapSearchItem).filter(Boolean).slice(0, SEARCH_LIMIT);
}

// Dedupe a track list by track id (Spotify track id), keeping the first
// occurrence and preserving order. Used for optimistic playlist updates.
export function dedupeTracks(tracks) {
  if (!Array.isArray(tracks)) return [];
  const seen = new Set();
  const out = [];
  for (const t of tracks) {
    const id = t && t.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(t);
  }
  return out;
}

// Deep link to a single track in the Spotify app / web player.
// The honest fallback for Free accounts (in-app playback needs Premium).
export function trackOpenUrl(trackId) {
  return `https://open.spotify.com/track/${encodeURIComponent(trackId || '')}`;
}

// Validate a client-supplied track for playlist storage. Returns the cleaned
// record or null when the payload is unusable.
export function sanitizeStoredTrack(body) {
  if (!body || typeof body !== 'object') return null;
  const spotify_track_id = typeof body.spotify_track_id === 'string' ? body.spotify_track_id.trim() : '';
  if (!spotify_track_id || spotify_track_id.length > 64) return null;
  const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return {
    spotify_track_id,
    title: clean(body.title, 300) || 'Unknown track',
    artist: clean(body.artist, 300),
    album_art: clean(body.album_art, 500),
  };
}
