// lib/radio/station.js
// Nexus universe radio — station definition + pure queue/contribution logic.
//
// Station: "TRON: Legacy" — Daft Punk's 2010 soundtrack (via the 2020
// "TRON: Legacy - The Complete Edition" reissue, Walt Disney Records).
// Swapped in 2026-10-06 at Merlin's direct order: "swap the playlist to tron
// legacy soundtrack please starting with the grid for every open".
//
// The 22 station tracks play in ALBUM ORDER with "The Grid" first on every
// open — it's a soundtrack, the order tells the story. Shuffle never touches
// the station block; it only affects the vault + contribution encore.
//
// Merlin's previous station is documented below for recovery:
//   "Cab Fare and Dynamite 🧨💥💖💯" (his own 10-track curation)
//   spotify:playlist:0zSejHQqxofrcKxS4HYbVU
//   https://open.spotify.com/playlist/0zSejHQqxofrcKxS4HYbVU
// NOTE: a spare empty playlist "Nexus Radio" (spotify:playlist:0bRXVmbguOuUTQUXVptXaz)
// exists from an earlier misstep — it is intentionally left alone.

export const STATION = {
  name: 'TRON: Legacy',
  shortName: 'Tron Legacy Radio',
  // Source album: "TRON: Legacy - The Complete Edition
  // (Original Motion Picture Soundtrack)" — Daft Punk, Walt Disney Records.
  // The 22 station tracks are the original 2010 album sequence (tracks 1-22).
  albumId: '3AMXFnwHWXCvNr5NCCpLZI',
  albumUri: 'spotify:album:3AMXFnwHWXCvNr5NCCpLZI',
  openUrl: 'https://open.spotify.com/album/3AMXFnwHWXCvNr5NCCpLZI',
  // Deep link that opens the album directly in the Spotify app.
  appUrl: 'spotify:album:3AMXFnwHWXCvNr5NCCpLZI',
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

// TRON: Legacy station tracks, in album order (tracks 1-22 of the Complete
// Edition = the original 2010 album sequence). All 22 track URIs verified
// 2026-10-07 via a live browser read of the track-title hrefs on Spotify's own
// album page (https://open.spotify.com/album/3AMXFnwHWXCvNr5NCCpLZI).
//
// URI verification status (honest):
// - verified: true  = href read directly from Spotify's own album page.
// - verified: false = sourced from a third party (see `uriSource`), NOT yet
//   confirmed on Spotify. Do not treat these as canonical.
// - uri: null        = no URI found yet. The track is listed for completeness
//   but buildQueue() skips it (with a console warning) until a URI lands.
//
// "The Grid" is verified — the every-open opener works.
export const STATION_TRACKS = [
  {
    uri: 'spotify:track:4uXQXq2AH6mAB8gvTzNUab',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'Overture',
    artist: 'Daft Punk',
    durationMs: 148000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/4uXQXq2AH6mAB8gvTzNUab',
  },
  {
    uri: 'spotify:track:2tRWMCijEFsGPDxBgHxHre',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'The Grid',
    artist: 'Daft Punk',
    durationMs: 96000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/2tRWMCijEFsGPDxBgHxHre',
  },
  {
    uri: 'spotify:track:3zL0LAsSh3dTO73dSOKWkr',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'The Son of Flynn',
    artist: 'Daft Punk',
    durationMs: 95000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/3zL0LAsSh3dTO73dSOKWkr',
  },
  {
    uri: 'spotify:track:6dooKqgWKBVwQLLarxJPDM',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'Recognizer',
    artist: 'Daft Punk',
    durationMs: 157000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/6dooKqgWKBVwQLLarxJPDM',
  },
  {
    uri: 'spotify:track:6NbukMzsdx888nymIiWKlV',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'Armory',
    artist: 'Daft Punk',
    durationMs: 122000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/6NbukMzsdx888nymIiWKlV',
  },
  {
    uri: 'spotify:track:4csD9dmdLHnarNyu1wG8Iv',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'Arena',
    artist: 'Daft Punk',
    durationMs: 93000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/4csD9dmdLHnarNyu1wG8Iv',
  },
  {
    uri: 'spotify:track:70RkgofUfQHLl2FT2Mx5zq',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'Rinzler',
    artist: 'Daft Punk',
    durationMs: 137000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/70RkgofUfQHLl2FT2Mx5zq',
  },
  {
    uri: 'spotify:track:1LaCW0R8Q7oIY3tKtDgZOw',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'The Game Has Changed',
    artist: 'Daft Punk',
    durationMs: 205000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/1LaCW0R8Q7oIY3tKtDgZOw',
  },
  {
    uri: 'spotify:track:1lQZ7fJRndezv3hnEtadcI',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'Outlands',
    artist: 'Daft Punk',
    durationMs: 162000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/1lQZ7fJRndezv3hnEtadcI',
  },
  {
    uri: 'spotify:track:6c9LokX8oCb3c3VT0Ok0ep',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'Adagio For TRON',
    artist: 'Daft Punk',
    durationMs: 251000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/6c9LokX8oCb3c3VT0Ok0ep',
  },
  {
    uri: 'spotify:track:7toH0mW6Noyt5B0nczGqj5',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'Nocturne',
    artist: 'Daft Punk',
    durationMs: 101000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/7toH0mW6Noyt5B0nczGqj5',
  },
  {
    uri: 'spotify:track:09TlxralXOGX35LUutvw7I',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'End of Line',
    artist: 'Daft Punk',
    durationMs: 156000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/09TlxralXOGX35LUutvw7I',
  },
  {
    uri: 'spotify:track:7hqlHZIXhwAzpWQxm9KzBd',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'Derezzed',
    artist: 'Daft Punk',
    durationMs: 104000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/7hqlHZIXhwAzpWQxm9KzBd',
  },
  {
    uri: 'spotify:track:5pPKx6IhpBIqdMGAC0RYn9',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'Fall',
    artist: 'Daft Punk',
    durationMs: 82000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/5pPKx6IhpBIqdMGAC0RYn9',
  },
  {
    uri: 'spotify:track:770xg19bhZii0ARFBn1qR5',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'Solar Sailer',
    artist: 'Daft Punk',
    durationMs: 162000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/770xg19bhZii0ARFBn1qR5',
  },
  {
    uri: 'spotify:track:6lEEO57pUsxL33F3tSNWV3',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'Rectifier',
    artist: 'Daft Punk',
    durationMs: 134000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/6lEEO57pUsxL33F3tSNWV3',
  },
  {
    uri: 'spotify:track:1OAEosQeqo1Q2RKkipkkiP',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'Disc Wars',
    artist: 'Daft Punk',
    durationMs: 251000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/1OAEosQeqo1Q2RKkipkkiP',
  },
  {
    uri: 'spotify:track:5yq0Wr88ARxysyYEEfVY2E',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'C.L.U.',
    artist: 'Daft Punk',
    durationMs: 279000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/5yq0Wr88ARxysyYEEfVY2E',
  },
  {
    uri: 'spotify:track:4Fm7MMYiSRriB4eTvulVKQ',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'Arrival',
    artist: 'Daft Punk',
    durationMs: 120000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/4Fm7MMYiSRriB4eTvulVKQ',
  },
  {
    uri: 'spotify:track:3szggCvjcOLWroR6DM9cJn',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'Flynn Lives',
    artist: 'Daft Punk',
    durationMs: 202000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/3szggCvjcOLWroR6DM9cJn',
  },
  {
    uri: 'spotify:track:69T9xcz6U8GFYmdPLkYn4J',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'TRON Legacy (End Titles)',
    artist: 'Daft Punk',
    durationMs: 197000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/69T9xcz6U8GFYmdPLkYn4J',
  },
  {
    uri: 'spotify:track:2URbRukS6KLiQOGAhGP40J',
    verified: true,
    uriSource: 'spotify-album-page',
    title: 'Finale',
    artist: 'Daft Punk',
    durationMs: 262000,
    explicit: false,
    openUrl: 'https://open.spotify.com/track/2URbRukS6KLiQOGAhGP40J',
  },
];

// The every-open opener: "The Grid" starts the station on EVERY open, not
// just the first load. Returns the track object or null if its URI isn't
// verified yet (the queue then opens with the first verified track instead
// and warns loudly — the opener is not faked).
export function gridOpener(stationTracks = STATION_TRACKS) {
  const grid = stationTracks.find((t) => t.title === 'The Grid' && t.uri && isValidTrackUri(t.uri));
  return grid || null;
}

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
// - "The Grid" opens the station on EVERY open (Merlin's order). If its URI
//   isn't verified yet, the queue opens with the first verified station track
//   and warns — the opener is never faked with a wrong track.
// - The rest of the station plays in ALBUM ORDER (never shuffled — it's a
//   soundtrack, the order tells the story).
// - Tracks without a usable Spotify URI are skipped (with a console warning),
//   never guessed.
// - The vault block follows the station (shuffled when shuffle is on).
// - Contributed tracks form the encore block afterwards (shuffled when on).
export function buildQueue({ stationTracks = STATION_TRACKS, vaultTracks = VAULT_TRACKS, contributions = [], shuffle = true, rng = Math.random } = {}) {
  const usable = stationTracks.filter((t) => t.uri && isValidTrackUri(t.uri));
  const skipped = stationTracks.length - usable.length;
  if (skipped > 0 && typeof console !== 'undefined' && typeof console.warn === 'function') {
    const names = stationTracks.filter((t) => !(t.uri && isValidTrackUri(t.uri))).map((t) => t.title);
    console.warn(`[radio] ${skipped} station track(s) skipped — no verified Spotify URI yet: ${names.join(', ')}`);
  }
  // The Grid first, then the rest in album order.
  const gridIdx = usable.findIndex((t) => t.title === 'The Grid');
  const ordered = gridIdx > 0
    ? [usable[gridIdx], ...usable.slice(0, gridIdx), ...usable.slice(gridIdx + 1)]
    : usable;
  const station = ordered.map((t) => ({ ...t, source: 'station', moduleId: null, moduleName: STATION.shortName }));
  const vault = vaultTracks.map((t) => ({ ...t, source: 'vault', moduleId: null, moduleName: VAULT.shortName }));
  const vaultBlock = shuffle ? shuffleTracks(vault, rng) : vault;
  const encore = contributions.map((t) => ({ ...t, source: t.source || 'module' }));
  const orderedEncore = shuffle ? shuffleTracks(encore, rng) : encore;
  return [...station, ...vaultBlock, ...orderedEncore];
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
  if (track.source === 'station') return "From Merlin's TRON: Legacy station";
  if (track.source === 'vault') return 'From the Full Vault playlist';
  return `Contributed by ${track.moduleName || 'a pocket universe'}`;
}
