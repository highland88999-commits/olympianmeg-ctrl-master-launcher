// lib/radio/station.js
// Nexus universe radio — station definition + pure queue/contribution logic.
// The station playlist is Merlin's own curation on Spotify. This module NEVER
// reorders or removes his tracks; shuffle only affects playback order.
//
// Station: "Cab Fare and Dynamite 🧨💥💖💯"
// https://open.spotify.com/playlist/0zSejHQqxofrcKxS4HYbVU
// NOTE: a spare empty playlist "Nexus Radio" (spotify:playlist:0bRXVmbguOuUTQUXVptXaz)
// exists from an earlier misstep — it is intentionally left alone.

export const STATION = {
  name: 'Cab Fare and Dynamite 🧨💥💖💯',
  shortName: 'Cab Fare Radio',
  playlistId: '0zSejHQqxofrcKxS4HYbVU',
  playlistUri: 'spotify:playlist:0zSejHQqxofrcKxS4HYbVU',
  openUrl: 'https://open.spotify.com/playlist/0zSejHQqxofrcKxS4HYbVU',
  // Deep link that opens the playlist directly in the Spotify app.
  appUrl: 'spotify:playlist:0zSejHQqxofrcKxS4HYbVU',
};

// Companion playlist — "Cab Fare and Dynamite: Full Vault".
// Being built: matched tracks from Merlin's Apple Music + YouTube Music
// libraries. Its URI lands here when it's created; until then the vault is
// PENDING and the radio treats it as such (the UI says so honestly — the
// vault is never faked with placeholder tracks).
export const VAULT = {
  name: 'Cab Fare and Dynamite: Full Vault',
  shortName: 'Full Vault',
  playlistId: null,
  playlistUri: null,
  openUrl: null,
  appUrl: null,
  status: 'pending', // 'pending' | 'live'
};

// Vault tracks, in the vault playlist's order once its URI arrives.
// Empty until then — never seed with guesses.
export const VAULT_TRACKS = [];

export function vaultReady() {
  return VAULT.status === 'live' && VAULT_TRACKS.length > 0;
}

// Merlin's 10 station tracks, in his order. Fetched from his Spotify 2026-09-29.
// Never mutate this array's order — playback order is derived via shuffleTracks().
export const STATION_TRACKS = [
  {
    uri: 'spotify:track:12ZkaSkfGUpfsKujyiq1YK',
    title: 'Next Episode - HEDEGAARD Instrumental Remix',
    artist: 'HEDEGAARD',
    durationMs: 250690,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/12ZkaSkfGUpfsKujyiq1YK',
  },
  {
    uri: 'spotify:track:7xOB82ELg70RoIM3mMTkt4',
    title: 'A Symptom Of Being Human',
    artist: 'Shinedown',
    durationMs: 248454,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/7xOB82ELg70RoIM3mMTkt4',
  },
  {
    uri: 'spotify:track:6Sg9qZjk3mEfK0oMu5XgR4',
    title: 'Dysfunctional You',
    artist: 'Shinedown',
    durationMs: 217857,
    explicit: true,
    openUrl: 'https://open.spotify.com/track/6Sg9qZjk3mEfK0oMu5XgR4',
  },
  {
    uri: 'spotify:track:7mGjaKYVo3dDs5B5wO0jB3',
    title: 'Let It Rock',
    artist: 'Kevin Rudolf',
    durationMs: 181186,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/7mGjaKYVo3dDs5B5wO0jB3',
  },
  {
    uri: 'spotify:track:7Akwsos3EeWahHZX9vfQq9',
    title: "Hits 2000'",
    artist: 'Trinix Remix, Trinix',
    durationMs: 163965,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/7Akwsos3EeWahHZX9vfQq9',
  },
  {
    uri: 'spotify:track:42YrtW7V1OyF3BXi0ftYQj',
    title: 'Good People',
    artist: 'Mumford & Sons, Pharrell Williams',
    durationMs: 186125,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/42YrtW7V1OyF3BXi0ftYQj',
  },
  {
    uri: 'spotify:track:4u4VElxO7JM4IR4jR4TL1s',
    title: 'Arrival to Earth',
    artist: 'Steve Jablonsky',
    durationMs: 326773,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/4u4VElxO7JM4IR4jR4TL1s',
  },
  {
    uri: 'spotify:track:04x42RDl6ez6dDF38A05Af',
    title: 'Bangarang',
    artist: "Grab 'n' Dash",
    durationMs: 215000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/04x42RDl6ez6dDF38A05Af',
  },
  {
    uri: 'spotify:track:2h444Cn1pbZjKPD4jbjY3E',
    title: "Stronger (Grey's Anatomy Version)",
    artist: 'Thunderstorm Artis',
    durationMs: 179000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/2h444Cn1pbZjKPD4jbjY3E',
  },
  {
    uri: 'spotify:track:3wLPRjw2XQpmowqXUXb3UF',
    title: 'Get Up (Rattle) [feat. Far East Movement] - Vocal Edit',
    artist: 'Bingo Players, Far East Movement',
    durationMs: 166932,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/3wLPRjw2XQpmowqXUXb3UF',
  },
];

const TRACK_URI_RE = /^spotify:track:[A-Za-z0-9]{10,}$/;
const MODULE_ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

export function isValidTrackUri(uri) {
  return typeof uri === 'string' && TRACK_URI_RE.test(uri);
}

export function isValidModuleId(id) {
  return typeof id === 'string' && MODULE_ID_RE.test(id);
}

// Fisher–Yates. Returns a NEW array; never mutates the input.
// Pass a seeded rng for deterministic tests.
export function shuffleTracks(tracks, rng = Math.random) {
  const arr = tracks.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Contribution store: pocket universes push curated track URIs here.
// Station tracks always play first (in their own block); contributed tracks
// form an "encore" block afterwards, attributed to the contributing module.
// Community editing of the actual Spotify playlist happens through Spotify's
// own invite-collaborators — this store only affects in-app playback order.
export function createContributionStore() {
  const modules = new Map(); // moduleId -> { moduleId, moduleName, tracks: [] }

  function contribute(moduleId, moduleName, tracks) {
    if (!isValidModuleId(moduleId)) {
      return { ok: false, error: 'invalid-module-id' };
    }
    if (typeof moduleName !== 'string' || !moduleName.trim()) {
      return { ok: false, error: 'invalid-module-name' };
    }
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return { ok: false, error: 'empty-tracks' };
    }
    const clean = [];
    const seen = new Set();
    for (const t of tracks) {
      if (!t || !isValidTrackUri(t.uri)) continue;
      if (seen.has(t.uri)) continue;
      seen.add(t.uri);
      clean.push({
        uri: t.uri,
        title: typeof t.title === 'string' && t.title.trim() ? t.title.trim() : 'Untitled track',
        artist: typeof t.artist === 'string' && t.artist.trim() ? t.artist.trim() : 'Unknown artist',
        durationMs: Number.isFinite(t.durationMs) ? t.durationMs : 0,
        explicit: t.explicit === true,
        openUrl: typeof t.openUrl === 'string' ? t.openUrl : `https://open.spotify.com/track/${t.uri.split(':')[2]}`,
      });
    }
    if (clean.length === 0) return { ok: false, error: 'no-valid-tracks' };
    modules.set(moduleId, { moduleId, moduleName: moduleName.trim(), tracks: clean });
    return { ok: true, count: clean.length };
  }

  function removeContribution(moduleId) {
    return modules.delete(moduleId);
  }

  function list() {
    return Array.from(modules.values()).map((m) => ({
      moduleId: m.moduleId,
      moduleName: m.moduleName,
      trackCount: m.tracks.length,
    }));
  }

  function allTracks() {
    const out = [];
    for (const m of modules.values()) {
      for (const t of m.tracks) {
        out.push({ ...t, source: 'module', moduleId: m.moduleId, moduleName: m.moduleName });
      }
    }
    return out;
  }

  function clear() {
    modules.clear();
  }

  return { contribute, removeContribution, list, allTracks, clear };
}

// Build the playback queue.
// - The LIBRARY POOL is the station tracks + the vault tracks shuffled
//   TOGETHER (true shuffle across both playlists). Station tracks always
//   come from Merlin's untouched order; vault tracks from the vault order.
// - Contributed tracks form the encore block after the library pool.
// - Merlin's station curation is never reordered at the source, never mixed
//   into by contributions, never removed.
export function buildQueue({ shuffle = true, stationTracks = STATION_TRACKS, vaultTracks = VAULT_TRACKS, contributions = [], rng = Math.random } = {}) {
  const station = stationTracks.map((t) => ({ ...t, source: 'station', moduleId: null, moduleName: STATION.shortName }));
  const vault = vaultTracks.map((t) => ({ ...t, source: 'vault', moduleId: null, moduleName: VAULT.shortName }));
  const pool = shuffle ? shuffleTracks([...station, ...vault], rng) : [...station, ...vault];
  const encore = contributions.map((t) => ({ ...t, source: t.source || 'module' }));
  const orderedEncore = shuffle ? shuffleTracks(encore, rng) : encore;
  return [...pool, ...orderedEncore];
}

export function nextIndex(queue, index) {
  if (!queue.length) return -1;
  return (index + 1) % queue.length;
}

export function prevIndex(queue, index) {
  if (!queue.length) return -1;
  return (index - 1 + queue.length) % queue.length;
}

// Plain-English label for where a track came from.
export function sourceLabel(track) {
  if (!track) return '';
  if (track.source === 'station') return "From Merlin's station playlist";
  if (track.source === 'vault') return 'From the Full Vault playlist';
  return `Contributed by ${track.moduleName || 'a pocket universe'}`;
}
