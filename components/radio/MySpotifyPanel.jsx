// components/radio/MySpotifyPanel.jsx
// "My Spotify" source panel — the user's own Spotify account.
//
// Honesty contract (hard):
// - In-app playback uses Spotify's Web Playback SDK, which REQUIRES Spotify
//   Premium. Non-Premium accounts get a plain-English notice and a working
//   "Open in Spotify" deep link — playback is never faked.
// - Track/playing state comes only from the SDK's real player_state_changed
//   events. The panel never invents it.
// - The client only ever holds short-lived access tokens (from
//   /api/spotify/token); the refresh token never leaves the server.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Play, Pause, SkipBack, SkipForward, ExternalLink, LogOut,
  Heart, Star, Loader2, AlertTriangle, User, Search, Plus, X, ListMusic,
} from 'lucide-react';
import { useRadio } from './RadioProvider';
import { supabase } from '@/lib/supabase';
import {
  MY_SPOTIFY_OPEN_URL,
  NO_CLIENT_ID_NOTICE,
  NO_DEVICE_NOTICE,
  NON_PREMIUM_NOTICE,
  SPOTIFY_API_BASE,
} from '@/lib/radio/spotify-auth';
import {
  sanitizeQuery,
  dedupeTracks,
  trackOpenUrl,
} from '@/lib/radio/spotify-search';

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

const iconBtn =
  'rounded-full p-2 text-white/80 transition-colors motion-reduce:transition-none hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300';

let sdkPromise = null;
function loadSdk() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no-window'));
  if (window.Spotify) return Promise.resolve(window.Spotify);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { sdkPromise = null; reject(new Error('spotify-sdk-timeout')); }, 15000);
    const prev = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      clearTimeout(timeout);
      if (typeof prev === 'function') { try { prev(); } catch {} }
      resolve(window.Spotify);
    };
    if (!document.querySelector(`script[src="${SDK_URL}"]`)) {
      const el = document.createElement('script');
      el.src = SDK_URL;
      el.async = true;
      el.onerror = () => { clearTimeout(timeout); sdkPromise = null; reject(new Error('spotify-sdk-load-failed')); };
      document.head.appendChild(el);
    }
  });
  return sdkPromise;
}

// Thin client for Spotify's own Web API. Throws plain-English errors.
async function spotifyFetch(getToken, path, { method = 'GET', body = null, deviceId = null } = {}) {
  const tok = await getToken();
  const access = tok?.access_token;
  if (!access) throw new Error('Not connected to Spotify.');
  const url = deviceId
    ? `${SPOTIFY_API_BASE}${path}${path.includes('?') ? '&' : '?'}device_id=${encodeURIComponent(deviceId)}`
    : `${SPOTIFY_API_BASE}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Couldn't reach Spotify. Check your connection and try again.");
  }
  if (res.status === 401) {
    const e = new Error('That Spotify sign-in expired. Please connect again.');
    e.code = 'auth';
    throw e;
  }
  if (res.status === 403) throw new Error('Spotify refused that action for this account.');
  if (res.status === 404) throw new Error('No Spotify player is available on this device yet.');
  if (!res.ok && res.status !== 204) throw new Error('Spotify refused the request. Please try again.');
  if (res.status === 204) return null;
  try { return await res.json(); } catch { return null; }
}

function trackLabel(t) {
  if (!t) return 'Nothing playing';
  const artists = (t.artists || []).map((a) => a.name).join(', ');
  return artists ? `${t.name} — ${artists}` : t.name;
}

export default function MySpotifyPanel() {
  const {
    spotify, spotifyConfigured, connectSpotify, disconnectSpotify,
    getSpotifyToken, refreshSpotifyStatus,
  } = useRadio();

  const [deviceId, setDeviceId] = useState(null);
  const [sdkError, setSdkError] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null); // { name, artists, image, paused }
  const [busy, setBusy] = useState(null); // which action is in flight
  const [actionError, setActionError] = useState(null);
  const playerRef = useRef(null);

  const premium = spotify.premium === true;
  const connected = spotify.status === 'connected';

  // --- Web Playback SDK lifecycle (Premium only) ---
  useEffect(() => {
    if (!connected || !premium) return;
    let cancelled = false;
    let player = null;

    setSdkError(null);
    loadSdk()
      .then((Spotify) => {
        if (cancelled) return null;
        player = new Spotify.Player({
          name: 'Nexus Radio — My Spotify',
          getOAuthToken: (cb) => {
            getSpotifyToken()
              .then((t) => cb(t?.access_token || ''))
              .catch(() => cb(''));
          },
          volume: 0.8,
        });
        playerRef.current = player;

        player.addListener('ready', ({ device_id }) => {
          if (cancelled) return;
          setDeviceId(device_id);
          setSdkError(null);
          // Claim the device quietly (no autoplay) so later play calls land here.
          spotifyFetch(getSpotifyToken, '/me/player', {
            method: 'PUT', body: { device_ids: [device_id], play: false },
          }).catch(() => {});
        });
        player.addListener('not_ready', () => { if (!cancelled) setDeviceId(null); });
        player.addListener('player_state_changed', (state) => {
          if (cancelled || !state) return;
          const t = state.track_window?.current_track;
          setNowPlaying(t ? {
            name: t.name,
            artists: (t.artists || []).map((a) => a.name),
            image: t.album?.images?.[0]?.url || null,
            paused: !!state.paused,
          } : null);
        });
        const fail = (label) => () => {
          if (!cancelled) setSdkError(label === 'account' ? 'account' : 'init');
        };
        player.addListener('initialization_error', fail('init'));
        player.addListener('authentication_error', fail('auth'));
        player.addListener('account_error', fail('account'));
        player.addListener('playback_error', () => {});
        return player.connect().then((ok) => { if (!ok && !cancelled) setSdkError('init'); });
      })
      .catch(() => { if (!cancelled) setSdkError('load'); });

    return () => {
      cancelled = true;
      try { player?.disconnect(); } catch {}
      playerRef.current = null;
      setDeviceId(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, premium]);

  const run = useCallback(async (label, fn) => {
    setBusy(label);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      if (e?.code === 'auth') refreshSpotifyStatus();
      setActionError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }, [getSpotifyToken, refreshSpotifyStatus]);

  const playTopTracks = useCallback(() => run('top', async () => {
    const data = await spotifyFetch(getSpotifyToken, '/me/top/tracks?limit=20');
    const uris = (data?.items || []).map((t) => t.uri).filter(Boolean);
    if (!deviceId) throw new Error(NO_DEVICE_NOTICE);
    if (!uris.length) throw new Error("Couldn't find your top tracks.");
    await spotifyFetch(getSpotifyToken, '/me/player/play', {
      method: 'PUT', body: { uris }, deviceId,
    });
  }), [run, getSpotifyToken, deviceId]);

  const playLikedSongs = useCallback(() => run('liked', async () => {
    const data = await spotifyFetch(getSpotifyToken, '/me/tracks?limit=50');
    const uris = (data?.items || []).map((i) => i?.track?.uri).filter(Boolean);
    if (!deviceId) throw new Error(NO_DEVICE_NOTICE);
    if (!uris.length) throw new Error('No liked songs found on this account.');
    await spotifyFetch(getSpotifyToken, '/me/player/play', {
      method: 'PUT', body: { uris }, deviceId,
    });
  }), [run, getSpotifyToken, deviceId]);

  const transport = useCallback((kind) => {
    const paths = { toggle: null, next: '/me/player/next', prev: '/me/player/previous' };
    if (kind === 'toggle') {
      return run('toggle', async () => {
        if (!deviceId) throw new Error(NO_DEVICE_NOTICE);
        const path = nowPlaying && !nowPlaying.paused ? '/me/player/pause' : '/me/player/play';
        await spotifyFetch(getSpotifyToken, path, { method: 'PUT', deviceId });
      });
    }
    return run(kind, () => spotifyFetch(getSpotifyToken, paths[kind], { method: 'POST', deviceId }));
  }, [run, getSpotifyToken, deviceId, nowPlaying]);

  // --- Search + per-user search playlist -----------------------------------
  // Search runs through OUR server route (/api/spotify/search), which holds
  // the Spotify access token server-side. The browser never calls Spotify's
  // search API directly. Playlist storage is per Supabase account, so the
  // list survives sessions (account-mapped, like everything else).

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistBusy, setPlaylistBusy] = useState(null); // track id being saved/removed
  const searchTimer = useRef(null);

  const apiFetch = useCallback(async (path, { method = 'GET', body = null } = {}) => {
    let bearer = null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      bearer = session?.access_token || null;
    } catch {}
    if (!bearer) throw new Error('Sign in to use this feature.');
    const res = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${bearer}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data?.error || 'Something went wrong. Please try again.');
    return data;
  }, []);

  // Load the user's saved search playlist when the panel connects.
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    setPlaylistLoading(true);
    apiFetch('/api/spotify/search-playlist')
      .then((data) => { if (!cancelled) setPlaylist(dedupeTracks(data?.tracks || [])); })
      .catch(() => { if (!cancelled) setPlaylist([]); })
      .finally(() => { if (!cancelled) setPlaylistLoading(false); });
    return () => { cancelled = true; };
  }, [connected, apiFetch]);

  // Debounced search (350ms) through the server route.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = sanitizeQuery(query);
    if (!q) { setResults([]); setSearching(false); setSearchError(null); return; }
    setSearching(true);
    searchTimer.current = setTimeout(() => {
      let cancelled = false;
      apiFetch(`/api/spotify/search?q=${encodeURIComponent(q)}`)
        .then((data) => {
          if (cancelled) return;
          setResults(dedupeTracks(data?.items || []));
          setSearchError(null);
        })
        .catch((e) => {
          if (cancelled) return;
          setResults([]);
          setSearchError(e?.message || 'Search failed. Please try again.');
        })
        .finally(() => { if (!cancelled) setSearching(false); });
      searchTimer.current = null;
    }, 350);
    return () => { if (searchTimer.current) { clearTimeout(searchTimer.current); searchTimer.current = null; } };
  }, [query, apiFetch]);

  const addToPlaylist = useCallback(async (track) => {
    if (!track?.id || playlistBusy) return;
    setPlaylistBusy(track.id);
    try {
      const data = await apiFetch('/api/spotify/search-playlist', {
        method: 'POST',
        body: {
          spotify_track_id: track.id,
          title: track.title,
          artist: track.artist,
          album_art: track.albumArt,
        },
      });
      const saved = data?.track || track;
      setPlaylist((prev) => dedupeTracks([{ ...track, ...saved }, ...prev]));
    } catch (e) {
      setActionError(e?.message || "Couldn't save that track. Please try again.");
    } finally {
      setPlaylistBusy(null);
    }
  }, [apiFetch, playlistBusy]);

  const removeFromPlaylist = useCallback(async (trackId) => {
    if (!trackId || playlistBusy) return;
    setPlaylistBusy(trackId);
    const prev = playlist;
    setPlaylist((p) => p.filter((t) => t.id !== trackId));
    try {
      await apiFetch(`/api/spotify/search-playlist?spotify_track_id=${encodeURIComponent(trackId)}`, { method: 'DELETE' });
    } catch (e) {
      setPlaylist(prev); // put it back on failure
      setActionError(e?.message || "Couldn't remove that track. Please try again.");
    } finally {
      setPlaylistBusy(null);
    }
  }, [apiFetch, playlist, playlistBusy]);

  // Play a single track on the in-site player (Premium). Every played track
  // is also saved to the user's search playlist (server dedupes repeats).
  const playTrack = useCallback((track) => run(`play-${track.id}`, async () => {
    if (!track?.uri) throw new Error("Couldn't play that track.");
    if (!deviceId) throw new Error(NO_DEVICE_NOTICE);
    await spotifyFetch(getSpotifyToken, '/me/player/play', {
      method: 'PUT', body: { uris: [track.uri] }, deviceId,
    });
    // Fire-and-forget save: the playlist is a record of what you searched
    // and played. Failures here must never break playback.
    apiFetch('/api/spotify/search-playlist', {
      method: 'POST',
      body: {
        spotify_track_id: track.id,
        title: track.title,
        artist: track.artist,
        album_art: track.albumArt,
      },
    })
      .then((data) => {
        const saved = data?.track || track;
        setPlaylist((prev) => dedupeTracks([{ ...track, ...saved }, ...prev]));
      })
      .catch(() => {});
  }), [run, getSpotifyToken, deviceId, apiFetch]);

  // Free accounts can't play in-site: every track opens in their Spotify app.
  const openTrack = useCallback((track) => {
    if (!track?.id) return;
    window.open(trackOpenUrl(track.id), '_blank', 'noopener,noreferrer');
  }, []);

  const activateTrack = useCallback((track) => {
    if (premium) playTrack(track);
    else openTrack(track);
  }, [premium, playTrack, openTrack]);

  const trackRow = (track, { onRemove = null } = {}) => (
    <div key={track.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors motion-reduce:transition-none hover:bg-white/5">
      <button
        type="button"
        onClick={() => activateTrack(track)}
        disabled={premium && (!deviceId || !!busy)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 disabled:opacity-50"
        title={premium ? `Play ${track.title}` : `Open ${track.title} in Spotify`}
        aria-label={premium ? `Play ${track.title}` : `Open ${track.title} in Spotify`}
      >
        {track.albumArt ? (
          <Image src={track.albumArt} alt="" width={40} height={40} unoptimized className="h-10 w-10 shrink-0 rounded-lg" aria-hidden="true" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <Play size={14} className="text-white/50" aria-hidden="true" />
          </div>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-white">{track.title}</span>
          <span className="block truncate text-[11px] text-white/55">
            {track.artist || (premium ? 'Spotify' : 'Tap to open in Spotify')}
          </span>
        </span>
      </button>
      {!onRemove && (
        <button
          type="button"
          onClick={() => addToPlaylist(track)}
          disabled={playlistBusy === track.id || playlist.some((t) => t.id === track.id)}
          aria-label={playlist.some((t) => t.id === track.id) ? 'In your search playlist' : `Add ${track.title} to your search playlist`}
          title={playlist.some((t) => t.id === track.id) ? 'In your search playlist' : 'Add to your search playlist'}
          className={iconBtn}
        >
          {playlistBusy === track.id
            ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            : <Plus size={16} className={playlist.some((t) => t.id === track.id) ? 'text-teal-300' : ''} aria-hidden="true" />}
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(track.id)}
          disabled={playlistBusy === track.id}
          aria-label={`Remove ${track.title} from your search playlist`}
          title="Remove"
          className={iconBtn}
        >
          {playlistBusy === track.id
            ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            : <X size={16} aria-hidden="true" />}
        </button>
      )}
    </div>
  );

  // --- Render ---------------------------------------------------------------

  // Not connected: the connect CTA.
  if (!connected) {
    return (
      <div className="px-6 py-8 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
          <User size={20} className="text-teal-300" aria-hidden="true" />
        </div>
        <h3 className="text-sm font-semibold text-white">My Spotify</h3>
        <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-white/60">
          Connect your own Spotify account to play your music here, in the radio bar.
          Merlin&apos;s station stays exactly as it is — this only switches the source.
        </p>
        {spotifyConfigured ? (
          <button
            type="button"
            onClick={() => run('connect', () => connectSpotify())}
            disabled={busy === 'connect' || spotify.connecting}
            className="mx-auto mt-4 flex items-center gap-2 rounded-xl bg-[#1DB954] px-5 py-2.5 text-sm font-semibold text-black transition-opacity motion-reduce:transition-none hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-50"
          >
            {(busy === 'connect' || spotify.connecting)
              ? <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              : <ExternalLink size={15} aria-hidden="true" />}
            Connect Spotify
          </button>
        ) : (
          <p className="mx-auto mt-4 max-w-xs rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-[13px] leading-relaxed text-amber-200/90">
            {NO_CLIENT_ID_NOTICE}
          </p>
        )}
        {(actionError || spotify.error) && (
          <p className="mx-auto mt-3 max-w-xs text-[13px] text-red-300/90">{actionError || spotify.error}</p>
        )}
        <p className="mx-auto mt-3 max-w-xs text-[11px] leading-relaxed text-white/40">
          Sign-in uses Spotify&apos;s own login page. We store only what&apos;s needed
          to keep you connected — never your password.
        </p>
      </div>
    );
  }

  const playing = nowPlaying && !nowPlaying.paused;

  return (
    <div className="flex min-h-0 flex-col">
      {/* Account row */}
      <div className="flex items-center gap-2 px-3 pb-1 pt-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1DB954]/20">
          <User size={15} className="text-[#1DB954]" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{spotify.displayName || 'Spotify user'}</p>
          <p className="text-[11px] text-white/55">
            {premium ? 'Premium — full in-app playback' : 'Free account'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => run('disconnect', () => disconnectSpotify())}
          disabled={busy === 'disconnect'}
          aria-label="Disconnect Spotify"
          title="Disconnect Spotify"
          className={iconBtn}
        >
          {busy === 'disconnect'
            ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            : <LogOut size={16} aria-hidden="true" />}
        </button>
      </div>

      {/* Honest degradation for non-Premium */}
      {!premium && (
        <div className="mx-3 mb-1 rounded-xl border border-white/12 bg-white/5 px-4 py-3">
          <p className="flex items-start gap-2 text-[13px] leading-relaxed text-white/80">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
            <span>{NON_PREMIUM_NOTICE}</span>
          </p>
          <a
            href={MY_SPOTIFY_OPEN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1DB954] px-4 py-2.5 text-sm font-semibold text-black transition-opacity motion-reduce:transition-none hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <ExternalLink size={15} aria-hidden="true" /> Open in Spotify
          </a>
        </div>
      )}

      {/* Search anything in Spotify */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any song on Spotify…"
            aria-label="Search any song on Spotify"
            autoComplete="off"
            className="w-full rounded-xl border border-white/12 bg-white/5 py-2.5 pl-10 pr-9 text-[13px] text-white placeholder:text-white/35 focus:border-teal-300/50 focus:outline-none"
          />
          {searching && (
            <Loader2 size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-white/40" aria-hidden="true" />
          )}
        </div>
        {searchError && (
          <p className="px-1 pt-1.5 text-[12px] text-red-300/90">{searchError}</p>
        )}
        {sanitizeQuery(query) && !searching && results.length === 0 && !searchError && (
          <p className="px-1 pt-1.5 text-[12px] text-white/45">No matches on Spotify for that.</p>
        )}
        {results.length > 0 && (
          <div className="mt-1 max-h-56 overflow-y-auto" role="list" aria-label="Search results">
            {results.map((t) => trackRow(t))}
          </div>
        )}
      </div>

      {/* Premium playback */}
      {premium && (
        <>
          {sdkError && (
            <p className="mx-3 mb-1 rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-2.5 text-[13px] leading-relaxed text-red-200/90">
              {sdkError === 'account'
                ? NON_PREMIUM_NOTICE
                : 'The Spotify player failed to start on this device. Try reopening the panel.'}
            </p>
          )}

          {/* Now playing (real SDK state only) */}
          <div className="flex items-center gap-3 px-4 py-2">
            {nowPlaying?.image ? (
              <Image src={nowPlaying.image} alt="" width={44} height={44} unoptimized className="h-11 w-11 shrink-0 rounded-lg" aria-hidden="true" />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <Play size={16} className="text-white/50" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{trackLabel(nowPlaying)}</p>
              <p className="text-[11px] text-white/55">
                {deviceId ? 'Playing on this device' : 'Starting the Spotify player…'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1 px-3 pb-1" role="group" aria-label="My Spotify playback controls">
            <button type="button" onClick={() => transport('prev')} disabled={!deviceId || !!busy} aria-label="Previous track" title="Previous track" className={iconBtn}>
              <SkipBack size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => transport('toggle')}
              disabled={!deviceId || !!busy}
              aria-label={playing ? 'Pause' : 'Play'}
              title={playing ? 'Pause' : 'Play'}
              className="rounded-full bg-teal-300 p-3 text-black transition-opacity motion-reduce:transition-none hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40"
            >
              {busy === 'toggle'
                ? <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                : playing
                  ? <Pause size={20} aria-hidden="true" />
                  : <Play size={20} aria-hidden="true" className="ml-0.5" />}
            </button>
            <button type="button" onClick={() => transport('next')} disabled={!deviceId || !!busy} aria-label="Next track" title="Next track" className={iconBtn}>
              <SkipForward size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="flex gap-2 px-3 pb-2">
            <button
              type="button"
              onClick={playTopTracks}
              disabled={!deviceId || !!busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3 py-2.5 text-[13px] font-medium text-white transition-colors motion-reduce:transition-none hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 disabled:opacity-40"
            >
              {busy === 'top' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Star size={14} aria-hidden="true" />}
              Play my top tracks
            </button>
            <button
              type="button"
              onClick={playLikedSongs}
              disabled={!deviceId || !!busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3 py-2.5 text-[13px] font-medium text-white transition-colors motion-reduce:transition-none hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 disabled:opacity-40"
            >
              {busy === 'liked' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Heart size={14} aria-hidden="true" />}
              Play my liked songs
            </button>
          </div>

          {actionError && (
            <p className="px-4 pb-2 text-center text-[13px] text-red-300/90">{actionError}</p>
          )}
        </>
      )}

      {/* Your Search Playlist — per-account, survives sessions */}
      <div className="border-t border-white/8 px-3 pb-3 pt-2">
        <div className="flex items-center gap-2 px-1 pb-1">
          <ListMusic size={14} className="text-teal-300" aria-hidden="true" />
          <h4 className="text-[12px] font-semibold uppercase tracking-wide text-white/70">Your Search Playlist</h4>
          {playlist.length > 0 && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/60">{playlist.length}</span>
          )}
        </div>
        {playlistLoading ? (
          <p className="flex items-center gap-2 px-1 py-2 text-[12px] text-white/45">
            <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Loading your playlist…
          </p>
        ) : playlist.length === 0 ? (
          <p className="px-1 py-1 text-[12px] leading-relaxed text-white/45">
            Songs you search and play — or tap + on — land here, kept on your account.
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto" role="list" aria-label="Your search playlist">
            {playlist.map((t) => trackRow(t, { onRemove: removeFromPlaylist }))}
          </div>
        )}
      </div>
    </div>
  );
}
