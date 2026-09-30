// lib/radio/playback-state.js — session-persistent playback context.
//
// Why this exists: the Nexus radio lives in the root layout and survives
// client-side navigation into every pocket universe — the music never blinks.
// But some paths are unavoidably full-page reloads (the Spotify OAuth
// round-trip, returning from an external site). Without this, a reload
// rebuilds the station queue from scratch and the listener loses their
// place. This module remembers the queue order, the track index, and whether
// playback was active, in sessionStorage (tab-scoped: a fresh tab starts
// fresh, a reload resumes).
//
// Honesty rules (hard):
// - Restore NEVER autoplays. The embed loads the restored track paused and
//   the bar shows real state; one tap resumes. Autoplay-with-sound after a
//   reload would be blocked by the browser anyway, and starting audio the
//   user didn't freshly start breaks trust.
// - Pure functions with injected storage: fully headless-testable, no DOM.

export const SS_PLAYBACK = 'nexus.radio.sessionPlayback';

// Keep only the fields the bar and the embed need. Plain data in/out so a
// JSON round-trip is lossless.
function slimTrack(t) {
  if (!t || typeof t.uri !== 'string' || !t.uri) return null;
  return {
    uri: t.uri,
    title: typeof t.title === 'string' ? t.title : '',
    artist: typeof t.artist === 'string' ? t.artist : '',
    source: typeof t.source === 'string' ? t.source : 'station',
    moduleId: t.moduleId ?? null,
    moduleName: typeof t.moduleName === 'string' ? t.moduleName : null,
    explicit: t.explicit === true,
  };
}

export function savePlaybackState(storage, { queue, index, wasPlaying }) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    const tracks = (Array.isArray(queue) ? queue : []).map(slimTrack).filter(Boolean);
    if (!tracks.length) return false;
    const safeIndex = Math.min(Math.max(Number(index) | 0, 0), tracks.length - 1);
    storage.setItem(
      SS_PLAYBACK,
      JSON.stringify({
        tracks,
        index: safeIndex,
        wasPlaying: wasPlaying === true,
        at: Date.now(),
      })
    );
    return true;
  } catch {
    return false; // private mode, quota, whatever — the station plays on
  }
}

export function loadPlaybackState(storage) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return null;
    const raw = storage.getItem(SS_PLAYBACK);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.tracks)) return null;
    const tracks = data.tracks.map(slimTrack).filter(Boolean);
    if (!tracks.length) return null;
    const index = Math.min(Math.max(Number(data.index) | 0, 0), tracks.length - 1);
    return { tracks, index, wasPlaying: data.wasPlaying === true };
  } catch {
    return null; // corrupt JSON or unreadable storage: start clean
  }
}

export function clearPlaybackState(storage) {
  try {
    if (storage && typeof storage.removeItem === 'function') storage.removeItem(SS_PLAYBACK);
  } catch {
    // ignore
  }
}
