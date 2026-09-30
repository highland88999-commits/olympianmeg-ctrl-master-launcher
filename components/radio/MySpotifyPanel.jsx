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
  Heart, Star, Loader2, AlertTriangle, User,
} from 'lucide-react';
import { useRadio } from './RadioProvider';
import {
  MY_SPOTIFY_OPEN_URL,
  NO_CLIENT_ID_NOTICE,
  NO_DEVICE_NOTICE,
  NON_PREMIUM_NOTICE,
  SPOTIFY_API_BASE,
} from '@/lib/radio/spotify-auth';

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
    </div>
  );
}
