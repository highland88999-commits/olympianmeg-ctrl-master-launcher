// lib/maptiles-session.js — Shared Google Map Tiles session token hook.
//
// The API key lives ONLY in the server env var GOOGLE_MAP_TILES_API_KEY and
// is used ONLY by /api/earth/tiles/session. The browser receives a
// short-lived session token. This module caches one token across components
// (globe + street renderers) and refreshes it ahead of expiry, so ARGO never
// mints more sessions than it needs.
//
// Trust boundary unchanged: the key never reaches the browser.

'use client';

import { useEffect, useState } from 'react';
import { sessionExpiryMs, refreshDelayMs } from '@/lib/maptiles';

const cache = {
  session: null,
  expiryMs: null,
  waiters: [],
  fetching: false,
};

function cacheValid() {
  return (
    cache.session &&
    cache.expiryMs &&
    Date.now() < cache.expiryMs - 5 * 60 * 1000
  );
}

async function fetchToken() {
  const res = await fetch('/api/earth/tiles/session', { cache: 'no-store' });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok || !data.session) {
    throw new Error(data.error || `tile session unavailable (HTTP ${res.status})`);
  }
  cache.session = data.session;
  cache.expiryMs = sessionExpiryMs(data.expiry) || Date.now() + 50 * 60 * 1000;
  // Proactive refresh so street mode never 403s mid-ride.
  const delay = refreshDelayMs(cache.expiryMs);
  if (delay != null) {
    setTimeout(() => {
      cache.session = null;
      cache.expiryMs = null;
    }, delay);
  }
  return cache.session;
}

export function getCachedSession() {
  return cacheValid() ? cache.session : null;
}

export function useMapTilesSession() {
  const [session, setSession] = useState(() => getCachedSession());
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    if (cacheValid()) {
      setSession(cache.session);
      return;
    }
    if (cache.fetching) {
      cache.waiters.push((s) => alive && setSession(s));
      return;
    }
    cache.fetching = true;
    fetchToken()
      .then((s) => {
        cache.fetching = false;
        if (!alive) return;
        setSession(s);
        cache.waiters.splice(0).forEach((w) => w(s));
      })
      .catch((e) => {
        cache.fetching = false;
        cache.waiters.splice(0);
        if (alive) setError(e);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { session, error };
}
