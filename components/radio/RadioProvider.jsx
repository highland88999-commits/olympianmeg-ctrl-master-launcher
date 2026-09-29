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

const RadioContext = createContext(null);

// Shared across the whole app: any pocket universe can contribute.
// Import { radioContributions } from '@/lib/radio/contributions' ... (see below)
const contributionStore = createContributionStore();
export { contributionStore as radioContributions };

const LS_SHUFFLE = 'nexus.radio.shuffle';
const LS_MINIMIZED = 'nexus.radio.minimized';

function readLS(key, fallback) {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

export function RadioProvider({ children }) {
  // Shuffle is the station's default mode.
  const [shuffle, setShuffle] = useState(() => (typeof window === 'undefined' ? true : readLS(LS_SHUFFLE, true)));
  const [minimized, setMinimized] = useState(() => (typeof window === 'undefined' ? false : readLS(LS_MINIMIZED, false)));
  const [expanded, setExpanded] = useState(false);
  const [queue, setQueue] = useState(() => buildQueue({ shuffle: true }));
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false); // real state, from Spotify events only
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState(null);
  const [contribVersion, setContribVersion] = useState(0); // bump to rebuild queue

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
        if (autoplay && typeof ctl.play === 'function') ctl.play();
      } catch {
        // The embed reports its own errors; the bar never fakes state.
      }
    }
  }, []);

  const togglePlay = useCallback(() => {
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
    engineReady,
    engineError,
    shuffle,
    minimized,
    expanded,
    contributions,
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
  }), [
    queue, index, playing, engineReady, engineError, shuffle, minimized,
    expanded, contributions, togglePlay, next, prev, toggleShuffle,
    contribute, removeContribution, registerController, handlePlaybackUpdate, rebuildQueue,
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
