// lib/user-content/station-seed.js
//
// Seed pool entries from the Nexus universe radio station.
//
// READ-ONLY import: this module reads STATION + STATION_TRACKS from
// lib/radio/station and registers them in the pool. It never modifies the
// radio files, never reorders or removes Merlin's tracks, and never touches
// his curation.
//
// What gets seeded:
// - one `audio` item per station track (Spotify URI as remoteUrl, NO blob —
//   the audio lives on Spotify; the pool entry is a pointer)
// - one `playlist` item for the station itself
//
// Seeded items carry originProgram 'radio', have syncState 'synced' (their
// content is available remotely at the Spotify URI — nothing to upload),
// and dedupe by deterministic id, so seeding is safe to call repeatedly:
// the second call adds nothing.

import { STATION, STATION_TRACKS } from '../radio/station.js';
import { addItem } from './pool.js';

export const SEED_ORIGIN = 'radio';

function trackId(uri) {
  return 'station:track:' + String(uri || '').trim();
}

function stationId() {
  return 'station:playlist:' + String((STATION && STATION.playlistId) || 'main').trim();
}

function trackItem(t) {
  const uri = typeof t.uri === 'string' ? t.uri.trim() : '';
  const title = typeof t.title === 'string' ? t.title.trim() : 'Untitled';
  const artist = typeof t.artist === 'string' ? t.artist.trim() : '';
  return {
    id: trackId(uri),
    type: 'audio',
    title: artist ? `${title} — ${artist}` : title,
    originProgram: SEED_ORIGIN,
    remoteUrl: uri,
    createdAt: '2026-09-29T00:00:00.000Z',
    syncState: 'synced',
  };
}

function playlistItem() {
  return {
    id: stationId(),
    type: 'playlist',
    title: (STATION && STATION.name) || 'Nexus universe radio',
    originProgram: SEED_ORIGIN,
    remoteUrl: (STATION && STATION.playlistUri) || null,
    createdAt: '2026-09-29T00:00:00.000Z',
    syncState: 'synced',
  };
}

// seedStationInto(registry) -> { added, skipped }.
// Registers all station tracks + the station playlist. Dedupe by id:
// items already present are skipped. Never throws.
export function seedStationInto(registry) {
  const result = { added: 0, skipped: 0 };
  try {
    if (!registry || !(registry.items instanceof Map)) return result;
    const tracks = Array.isArray(STATION_TRACKS) ? STATION_TRACKS : [];
    const candidates = tracks.map(trackItem);
    candidates.push(playlistItem());
    for (const raw of candidates) {
      if (registry.items.has(raw.id)) {
        result.skipped += 1;
        continue;
      }
      const r = addItem(registry, raw);
      if (r.ok) result.added += 1;
      else result.skipped += 1;
    }
  } catch {
    /* return partial counts */
  }
  return result;
}
