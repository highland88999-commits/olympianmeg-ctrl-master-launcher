// components/radio/RadioProvider.jsx
// Nexus universe radio — global playback state for the launcher shell.
// Mounted once in app/layout.jsx so the station persists across pocket universes.
//
// Honesty rules (hard):
// - `playing` is ONLY ever set from real Spotify Embed API `playback_update`
//   events. Nothing here ever shows a playing state that isn't real.
// - Without the listener's Spotify Premium, the official embed plays 30-second
//   previews. The UI says so plainly and always offers the deep link that
//   opens the playlist in the Spotify app.
// - No Apple Music integration exists here; don't add one.

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  STATION,
  STATION_TRACKS,
  VAULT_TRACKS,
  buildQueue,
  createContributionStore,
  nextIndex,
  prevIndex,
  shuffleTracks,
} from '@/lib/radio/station';
import { registerDockEntry, unregisterDockEntry, updateDockEntry } from '@/lib/window-dock/registry';
import { supabase } from '@/lib/supabase';
import {
  SOURCES,
  SOURCE_LABELS,
  isValidSource,
  LS_SOURCE,
  SS_VERIFIER,
  SS_STATE,
  SS_REDIRECT_URI,
  buildAuthorizeUrl,
  codeChallenge,
  randomString,
  redirectUriFor,
} from '@/lib/radio/spotify-auth';
import { loadPlaybackState, savePlaybackState } from '@/lib/radio/playback-state';
import { resolveUiSettings, readUiSettingsCache, UI_SETTINGS_EVENT } from '@/lib/ui-settings';
import { setFxEnabled } from '@/lib/fx';

const RadioContext = createContext(null);

// Shared across the whole app: any pocket universe can contribute.
// Import { radioContributions } from '@/lib/radio/contributions' ... (see below)
const contributionStore = createContributionStore();
export { contributionStore as radioContributions };

const LS_SHUFFLE = 'nexus.radio.shuffle';
const LS_MINIMIZED = 'nexus.radio.minimized';
// The collaborate invite is shown until dismissed, then never again.
// (Retired with the ENCOM first-load ritual — the station is now an album,
// not a collaborative playlist. Kept as a no-op so the card stays dormant.)

function readLS(key, fallback) {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function readSourceLS() {
  try {
    const v = window.localStorage.getItem(LS_SOURCE);
    return isValidSource(v) ? v : SOURCES.NEXUS;
  } catch {
    return SOURCES.NEXUS;
  }
}

// The app user's Supabase access token for our own API routes.
async function getBearer() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

// Inlined by Next.js at build time (public client id — no secret involved).
const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || '';

export function RadioProvider({ children }) {
  // Shuffle is the station's default mode.
  const [shuffle, setShuffle] = useState(() => (typeof window === 'undefined' ? true : readLS(LS_SHUFFLE, true)));
  const [minimized, setMinimized] = useState(() => (typeof window === 'undefined' ? false : readLS(LS_MINIMIZED, false)));
  const [expanded, setExpanded] = useState(false);
  // Initial queue: resume the tab's session first (an unavoidable full-page
  // reload — Spotify OAuth round-trip, external return — lands back on the
  // same track instead of rebuilding the station from scratch). Otherwise
  // the first-load ritual, otherwise a fresh shuffle. Restore never
  // autoplays: the embed loads the track paused and the bar stays honest.
  const [initialPlayback] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const restored = loadPlaybackState(window.sessionStorage);
      if (restored) return restored;
    } catch {}
    return null;
  });
  // Initial queue: resume the tab's session first (an unavoidable full-page
  // reload — Spotify OAuth round-trip, external return — lands back on the
  // same track instead of rebuilding the station from scratch). Otherwise a
  // fresh queue: "The Grid" opens on EVERY open, then the album in order.
  // Restore never autoplays: the embed loads the track paused and the bar
  // stays honest.
  const [queue, setQueue] = useState(() => {
    if (typeof window === 'undefined') return buildQueue({ shuffle: true });
    if (initialPlayback) return initialPlayback.tracks;
    return buildQueue({ shuffle: true });
  });
  const [index, setIndex] = useState(() => (initialPlayback ? initialPlayback.index : 0));
  const [playing, setPlaying] = useState(false); // real state, from Spotify events only
  // Master sound (Concourse Settings → Sound): default ON. When off,
  // the radio pauses and stays paused, and hub fx go silent.
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState(null);
  const [contribVersion, setContribVersion] = useState(0); // bump to rebuild queue

  // --- Playback source: "nexus" (house station, default) <-> "my-spotify" ---
  // Per-user: Supabase is the source of truth when signed in; localStorage
  // is the offline fallback and syncs up when online.
  const [source, setSourceState] = useState(() => (typeof window === 'undefined' ? SOURCES.NEXUS : readSourceLS()));
  const sourceRef = useRef(source);
  sourceRef.current = source;

  // --- Spotify connection state ("My Spotify" source) ---
  // status: 'unknown' | 'connected' | 'disconnected'
  const [spotify, setSpotify] = useState({
    status: 'unknown',
    displayName: '',
    product: 'unknown',
    premium: false,
    connecting: false,
    error: null,
    revoked: false,
  });

  useEffect(() => {
    try { window.localStorage.setItem(LS_SOURCE, source); } catch {}
  }, [source]);

  // Server (Supabase) is the source of truth for the preference; fall back
  // to localStorage when offline or signed out.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bearer = await getBearer();
      if (!bearer || cancelled) return;
      try {
        const res = await fetch('/api/spotify/prefs', {
          headers: { Authorization: `Bearer ${bearer}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (isValidSource(data?.source) && !cancelled) setSourceState(data.source);
      } catch {
        // Offline — the localStorage fallback already holds our choice.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setSource = useCallback((next) => {
    if (!isValidSource(next) || sourceRef.current === next) return;
    // Never let two sources play over each other: leaving the house station
    // pauses its embed (honest — it resumes only when the user presses play).
    if (next === SOURCES.MY_SPOTIFY) {
      const ctl = controllerRef.current;
      try { if (ctl && typeof ctl.pause === 'function') ctl.pause(); } catch {}
    }
    setSourceState(next);
    // Fire-and-forget sync to the per-user preference.
    (async () => {
      const bearer = await getBearer();
      if (!bearer) return;
      try {
        await fetch('/api/spotify/prefs', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: next }),
        });
      } catch {}
    })();
  }, []);

  const controllerRef = useRef(null);
  const indexRef = useRef(0);
  const queueRef = useRef(queue);
  const wasPlayingRef = useRef(false);
  const shuffleRef = useRef(shuffle);

  indexRef.current = index;
  queueRef.current = queue;
  shuffleRef.current = shuffle;

  useEffect(() => {
    try { window.localStorage.setItem(LS_SHUFFLE, shuffle ? '1' : '0'); } catch {}
  }, [shuffle]);
  useEffect(() => {
    try { window.localStorage.setItem(LS_MINIMIZED, minimized ? '1' : '0'); } catch {}
  }, [minimized]);

  // Remember this tab's playback context so an unavoidable full-page reload
  // (Spotify OAuth, external return) resumes at the same track. Never
  // autoplays on restore — the load path above only restores position.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    savePlaybackState(window.sessionStorage, {
      queue: queueRef.current,
      index: indexRef.current,
      wasPlaying: wasPlayingRef.current,
    });
  }, [queue, index, playing]);

  // First-load flags: mark the device immediately; mirror per-user when
  // signed in. A signed-in user who never got the ritual on this device
  // (Retired 2026-10-06: the ENCOM first-load ritual is gone. Every open now
  // starts with "The Grid" via buildQueue(), so no per-user first-load
  // gating is needed.)

  // Collaborate invite: retired with the ENCOM ritual — the station is now an
  // album, not a collaborative playlist. The card stays dormant (never shown);
  // the component and dismiss plumbing remain so nothing else breaks.
  const [collabDismissed, setCollabDismissed] = useState(true);
  const dismissCollabInvite = useCallback(() => {
    setCollabDismissed(true);
  }, []);
  const showCollabInvite = false;

  // Rebuild the queue when shuffle mode or contributions change.
  // Keeps the currently-playing track at the head of the new order.
  const rebuildQueue = useCallback((nextShuffle, keepUri) => {
    const q = buildQueue({
      shuffle: nextShuffle,
      vaultTracks: VAULT_TRACKS,
      contributions: contributionStore.allTracks(),
    });
    let startAt = 0;
    if (keepUri) {
      const found = q.findIndex((t) => t.uri === keepUri);
      if (found >= 0) {
        // Rotate so the current track stays first; order otherwise preserved.
        const rotated = [...q.slice(found), ...q.slice(0, found)];
        setQueue(rotated);
        queueRef.current = rotated;
        setIndex(0);
        indexRef.current = 0;
        return rotated;
      }
    }
    setQueue(q);
    queueRef.current = q;
    setIndex(startAt);
    indexRef.current = startAt;
    return q;
  }, []);

  useEffect(() => {
    rebuildQueue(shuffleRef.current, queueRef.current[queueRef.current.length ? indexRef.current : 0]?.uri);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contribVersion]);

  // Master sound wiring: the localStorage cache paints instantly;
  // the Settings sheet broadcasts changes on UI_SETTINGS_EVENT (the
  // Concourse also dispatches it when the account copy lands).
  useEffect(() => {
    const cached = readUiSettingsCache(typeof window !== 'undefined' ? window.localStorage : null);
    if (cached) {
      soundOnRef.current = cached.sound;
      setSoundOn(cached.sound);
    }
    const onChange = (e) => {
      const next = resolveUiSettings(e?.detail?.settings);
      soundOnRef.current = next.sound;
      setSoundOn(next.sound);
    };
    window.addEventListener(UI_SETTINGS_EVENT, onChange);
    return () => window.removeEventListener(UI_SETTINGS_EVENT, onChange);
  }, []);

  // The gate itself: fx follow the flag immediately; turning sound
  // off pauses the embed (least destructive — nothing unloads, the
  // station resumes only when the user presses play with sound on).
  useEffect(() => {
    setFxEnabled(soundOn);
    if (!soundOn) {
      const ctl = controllerRef.current;
      try { if (ctl && typeof ctl.pause === 'function') ctl.pause(); } catch {}
    }
  }, [soundOn]);

  const toggleShuffle = useCallback(() => {
    setShuffle((s) => {
      const next = !s;
      const currentUri = queueRef.current[indexRef.current]?.uri;
      rebuildQueue(next, currentUri);
      return next;
    });
  }, [rebuildQueue]);

  const loadTrack = useCallback((i, autoplay) => {
    const q = queueRef.current;
    if (!q.length) return;
    const wrapped = ((i % q.length) + q.length) % q.length;
    const track = q[wrapped];
    setIndex(wrapped);
    indexRef.current = wrapped;
    const ctl = controllerRef.current;
    if (ctl && typeof ctl.loadUri === 'function') {
      try {
        ctl.loadUri(track.uri);
        if (autoplay && soundOnRef.current && typeof ctl.play === 'function') ctl.play();
      } catch {
        // The embed reports its own errors; the bar never fakes state.
      }
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (!soundOnRef.current) return; // master sound off — the radio stays paused
    const ctl = controllerRef.current;
    if (!ctl) return; // engine not ready — button shows its loading state
    try {
      if (typeof ctl.togglePlay === 'function') ctl.togglePlay();
      else if (typeof ctl.play === 'function') ctl.play();
    } catch {
      // ignore; state stays honest via events
    }
  }, []);

  const next = useCallback(() => {
    loadTrack(nextIndex(queueRef.current, indexRef.current), true);
  }, [loadTrack]);

  const prev = useCallback(() => {
    loadTrack(prevIndex(queueRef.current, indexRef.current), true);
  }, [loadTrack]);

  // Real playback events from the official Spotify embed.
  const handlePlaybackUpdate = useCallback((e) => {
    const data = e?.data;
    if (!data || typeof data.isPaused !== 'boolean') return;
    const nowPlaying = !data.isPaused;
    const wasPlaying = wasPlayingRef.current;
    wasPlayingRef.current = nowPlaying;
    setPlaying(nowPlaying);

    // Keep the bar honest if the listener drives the embed directly:
    // match the embed's current track to our queue.
    const uri = data?.track_window?.current_track?.uri;
    if (typeof uri === 'string') {
      const found = queueRef.current.findIndex((t) => t.uri === uri);
      if (found >= 0 && found !== indexRef.current) {
        setIndex(found);
        indexRef.current = found;
      }
    }

    // Natural end of a preview/track while we were playing: advance.
    const pos = Number(data.position);
    const dur = Number(data.duration);
    if (wasPlaying && !nowPlaying && Number.isFinite(pos) && Number.isFinite(dur) && dur > 0 && pos >= dur - 1500) {
      const q = queueRef.current;
      if (q.length > 1) loadTrack(nextIndex(q, indexRef.current), true);
    }
  }, [loadTrack]);

  const registerController = useCallback((ctl) => {
    controllerRef.current = ctl;
    setEngineReady(!!ctl);
    if (!ctl) setEngineError('spotify-unavailable');
  }, []);

  // --- Module contribution API (the "other items add to it" surface) ---
  // Usage from any pocket universe:
  //   const { contribute, removeContribution } = useRadio();
  //   useEffect(() => {
  //     contribute('nova', 'NOVA', [{ uri: 'spotify:track:…', title, artist }]);
  //     return () => removeContribution('nova');
  //   }, []);
  // Community edits to the actual Spotify playlist happen through Spotify's
  // own invite-collaborators — this only shapes in-app playback order.
  const contribute = useCallback((moduleId, moduleName, tracks) => {
    const res = contributionStore.contribute(moduleId, moduleName, tracks);
    if (res.ok) setContribVersion((v) => v + 1);
    return res;
  }, []);

  const removeContribution = useCallback((moduleId) => {
    const removed = contributionStore.removeContribution(moduleId);
    if (removed) setContribVersion((v) => v + 1);
    return removed;
  }, []);

  const contributions = useMemo(
    () => contributionStore.list(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contribVersion]
  );

  // Dock paradigm: the radio registers itself in the shared window-dock
  // registry so the future universal dock picks it up automatically.
  // Until that dock ships, the radio renders its own interim dock chip.
  const restoreFromDock = useCallback(() => setMinimized(false), []);
  useEffect(() => {
    registerDockEntry({
      id: 'nexus-radio',
      title: 'Radio',
      module: 'launcher',
      minimized,
      onRestore: restoreFromDock,
    });
    return () => { unregisterDockEntry('nexus-radio'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // --- Spotify OAuth actions --------------------------------------------

  // Reads the stored connection (refreshing the token server-side if needed).
  const refreshSpotifyStatus = useCallback(async () => {
    const bearer = await getBearer();
    if (!bearer) {
      setSpotify((s) => ({ ...s, status: 'disconnected' }));
      return { connected: false };
    }
    try {
      const res = await fetch('/api/spotify/token', {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (!res.ok) {
        setSpotify((s) => ({ ...s, status: 'disconnected' }));
        return { connected: false };
      }
      const data = await res.json();
      if (!data?.connected) {
        setSpotify((s) => ({
          ...s,
          status: 'disconnected',
          revoked: data?.revoked === true,
          error: data?.revoked === true
            ? 'Your Spotify connection was revoked. Connect again to keep using My Spotify.'
            : null,
        }));
        if (sourceRef.current === SOURCES.MY_SPOTIFY) setSource(SOURCES.NEXUS);
        return { connected: false };
      }
      setSpotify((s) => ({
        ...s,
        status: 'connected',
        displayName: data.display_name || s.displayName,
        product: data.product || 'unknown',
        premium: data.product === 'premium',
        connecting: false,
        error: null,
        revoked: false,
      }));
      return data;
    } catch {
      // Network hiccup — leave the last known state alone (honest: unknown).
      return { connected: false };
    }
  }, [setSource]);

  // Short-lived access token for Spotify's own Web API / Playback SDK.
  // The refresh token never leaves the server.
  const getSpotifyToken = useCallback(async () => {
    const data = await refreshSpotifyStatus();
    return data && data.connected ? data : null;
  }, [refreshSpotifyStatus]);

  // Starts the Authorization Code + PKCE flow on Spotify's own login page.
  const connectSpotify = useCallback(async () => {
    if (!SPOTIFY_CLIENT_ID) {
      setSpotify((s) => ({ ...s, error: 'Spotify sign-in is not configured yet.' }));
      return;
    }
    const bearer = await getBearer();
    if (!bearer) {
      setSpotify((s) => ({ ...s, error: 'Sign in to Nexus first, then connect Spotify.' }));
      return;
    }
    setSpotify((s) => ({ ...s, connecting: true, error: null }));
    try {
      const verifier = randomString(64);
      const state = randomString(32);
      const challenge = await codeChallenge(verifier);
      const redirectUri = redirectUriFor(window.location.origin);
      try {
        window.sessionStorage.setItem(SS_VERIFIER, verifier);
        window.sessionStorage.setItem(SS_STATE, state);
        window.sessionStorage.setItem(SS_REDIRECT_URI, redirectUri);
      } catch {}
      const url = buildAuthorizeUrl({
        clientId: SPOTIFY_CLIENT_ID,
        redirectUri,
        state,
        challenge,
      });
      window.location.assign(url);
    } catch {
      setSpotify((s) => ({ ...s, connecting: false, error: 'Could not start Spotify sign-in. Please try again.' }));
    }
  }, []);

  // Finishes the flow after /api/spotify/callback bounces back to the app.
  // Runs once on mount: verifies `state`, exchanges code+verifier server-side.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('spotify_code');
    const returnedState = params.get('spotify_state');
    const spotifyError = params.get('spotify_error');

    const cleanUrl = () => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('spotify_code');
        url.searchParams.delete('spotify_state');
        url.searchParams.delete('spotify_error');
        window.history.replaceState({}, '', url.toString());
      } catch {}
    };

    if (spotifyError) {
      cleanUrl();
      setSpotify((s) => ({
        ...s,
        connecting: false,
        error: spotifyError === 'denied'
          ? 'Spotify sign-in was cancelled — nothing was connected.'
          : 'Spotify sign-in failed. Please try again.',
      }));
      return;
    }
    if (!code) return;

    (async () => {
      let verifier = null;
      let redirectUri = null;
      try {
        const expectedState = window.sessionStorage.getItem(SS_STATE);
        verifier = window.sessionStorage.getItem(SS_VERIFIER);
        redirectUri = window.sessionStorage.getItem(SS_REDIRECT_URI);
        window.sessionStorage.removeItem(SS_STATE);
        window.sessionStorage.removeItem(SS_VERIFIER);
        window.sessionStorage.removeItem(SS_REDIRECT_URI);
        if (!expectedState || expectedState !== returnedState) {
          throw new Error('state-mismatch');
        }
      } catch {
        cleanUrl();
        setSpotify((s) => ({
          ...s,
          connecting: false,
          error: "That sign-in didn't match this browser session. Please try connecting again.",
        }));
        return;
      }
      cleanUrl();
      const bearer = await getBearer();
      if (!bearer) {
        setSpotify((s) => ({ ...s, connecting: false, error: 'Sign in to Nexus first, then connect Spotify.' }));
        return;
      }
      setSpotify((s) => ({ ...s, connecting: true, error: null }));
      try {
        const res = await fetch('/api/spotify/exchange', {
          method: 'POST',
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirectUri }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.connected) {
          throw new Error(data?.error || 'Spotify sign-in failed. Please try again.');
        }
        await refreshSpotifyStatus();
        // Connected — move the listener onto their source (clear cause/effect).
        setSource(SOURCES.MY_SPOTIFY);
      } catch (e) {
        setSpotify((s) => ({ ...s, connecting: false, error: e?.message || 'Spotify sign-in failed.' }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quietly resolve the connection state on mount.
  useEffect(() => {
    refreshSpotifyStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnectSpotify = useCallback(async () => {
    const bearer = await getBearer();
    if (bearer) {
      try {
        await fetch('/api/spotify/disconnect', {
          method: 'POST',
          headers: { Authorization: `Bearer ${bearer}` },
        });
      } catch {
        // Even if the request fails, the local state clears — the server
        // row is deleted on the next successful attempt or token refresh.
      }
    }
    setSpotify((s) => ({
      ...s, status: 'disconnected', displayName: '', product: 'unknown',
      premium: false, connecting: false, error: null, revoked: false,
    }));
    // No connection, no "My Spotify" source — back to the house station.
    setSource(SOURCES.NEXUS);
  }, [setSource]);

  const current = queue[index] || null;
  useEffect(() => {
    updateDockEntry('nexus-radio', {
      minimized,
      title: current ? `Radio — ${current.title}` : 'Radio',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimized, current?.uri]);

  const value = useMemo(() => ({
    station: STATION,
    stationTrackCount: STATION_TRACKS.length,
    queue,
    index,
    current: queue[index] || null,
    playing,
    soundOn,
    engineReady,
    engineError,
    shuffle,
    minimized,
    expanded,
    contributions,
    // Collaborate invite (retired — always false; card stays dormant).
    isFirstLoad: false,
    showCollabInvite,
    dismissCollabInvite,
    togglePlay,
    next,
    prev,
    toggleShuffle,
    setMinimized,
    setExpanded,
    playAt: (i) => loadTrack(i, true),
    contribute,
    removeContribution,
    registerController,
    handlePlaybackUpdate,
    reshuffle: () => rebuildQueue(shuffleRef.current, null), // fresh shuffle, fresh order
    // --- Playback source toggle ("Nexus Radio" <-> "My Spotify") ---
    source,
    sourceLabel: SOURCE_LABELS[source] || SOURCE_LABELS[SOURCES.NEXUS],
    setSource,
    spotify,
    spotifyConfigured: SPOTIFY_CLIENT_ID.length > 0,
    connectSpotify,
    disconnectSpotify,
    refreshSpotifyStatus,
    getSpotifyToken,
  }), [
    queue, index, playing, soundOn, engineReady, engineError, shuffle, minimized,
    expanded, contributions, togglePlay, next, prev, toggleShuffle,
    contribute, removeContribution, registerController, handlePlaybackUpdate, rebuildQueue,
    source, setSource, spotify, connectSpotify, disconnectSpotify,
    refreshSpotifyStatus, getSpotifyToken,
    showCollabInvite, dismissCollabInvite,
  ]);

  return <RadioContext.Provider value={value}>{children}</RadioContext.Provider>;
}

export function useRadio() {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error('useRadio must be used inside <RadioProvider>');
  return ctx;
}

// Non-hook access for modules that can't use hooks (same shared store).
export function getRadioContributions() {
  return contributionStore;
}

export { shuffleTracks };
