// components/radio/SpotifyEmbed.jsx
// Official Spotify Embed IFrame API host.
// https://developer.spotify.com/documentation/embeds
//
// This is the real playback engine for the station. Without the listener's
// Spotify Premium (logged in inside the embed), Spotify itself limits
// playback to 30-second previews — the UI must say so and must never claim
// otherwise. Playing state always comes from Spotify's own `playback_update`
// events; this component never invents it.
//
// Render contract: this component renders ONLY the bare host div. The parent
// (RadioBar) owns the wrapper and moves it between the visible panel slot and
// a 1px keep-alive slot — the host is never unmounted, so playback survives
// collapsing the panel.

'use client';

import { useEffect, useRef } from 'react';
import { useRadio } from './RadioProvider';
import { STATION } from '@/lib/radio/station';

const IFRAME_API_URL = 'https://open.spotify.com/embed/iframe-api/v1';

let apiPromise = null;

function loadIframeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no-window'));
  if (window.SpotifyIframeApiReady) return window.SpotifyIframeApiReady;
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('spotify-api-timeout')), 15000);
    const prev = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = (api) => {
      clearTimeout(timeout);
      if (typeof prev === 'function') {
        try { prev(api); } catch {}
      }
      window.SpotifyIframeApiReady = Promise.resolve(api);
      resolve(api);
    };
    const script = document.querySelector(`script[src="${IFRAME_API_URL}"]`);
    if (!script) {
      const el = document.createElement('script');
      el.src = IFRAME_API_URL;
      el.async = true;
      el.onerror = () => {
        clearTimeout(timeout);
        apiPromise = null;
        reject(new Error('spotify-api-load-failed'));
      };
      document.head.appendChild(el);
    }
  });
  return apiPromise;
}

export default function SpotifyEmbed() {
  const { current, registerController, handlePlaybackUpdate } = useRadio();
  const hostRef = useRef(null);
  const createdRef = useRef(false);
  const handlerRef = useRef(handlePlaybackUpdate);
  handlerRef.current = handlePlaybackUpdate;

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    let cancelled = false;
    let controller = null;

    loadIframeApi()
      .then((api) => {
        if (cancelled || !hostRef.current) return;
        const initialUri = current?.uri || STATION.albumUri;
        api.createController(
          hostRef.current,
          { width: '100%', height: '152', uri: initialUri },
          (ctl) => {
            if (cancelled) return;
            controller = ctl;
            try {
              ctl.addListener('playback_update', (e) => handlerRef.current(e));
            } catch {}
            registerController(ctl);
          }
        );
      })
      .catch(() => {
        if (!cancelled) registerController(null);
      });

    return () => {
      cancelled = true;
      // The provider owns the controller for the app session.
      if (controller) {
        try { controller.removeListener('playback_update'); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} style={{ width: '100%' }} />;
}
