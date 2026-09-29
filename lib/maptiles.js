// lib/maptiles.js — Google Map Tiles API session helpers for the Nexus Earth.
// Pure logic: no DOM, no THREE imports, fully headless-testable.
//
// Trust boundary: the API key lives ONLY in the server env var
// GOOGLE_MAP_TILES_API_KEY and is used ONLY by the server route
// (app/api/earth/tiles/session/route.js). The browser client never sees
// the key — it only ever receives the short-lived session token, which
// Google accepts on tile requests in place of the key.

export const MAPTILES_ENV_VAR = 'GOOGLE_MAP_TILES_API_KEY';
export const MAPTILES_SESSION_URL = 'https://tile.googleapis.com/v1/3dtiles/sessions';
export const MAPTILES_ROOT_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json';
export const MAPTILES_ORIGIN = 'https://tile.googleapis.com';
// The production key is restricted to this HTTP referrer, so the
// server-side session call must send it or Google rejects the request.
export const MAPTILES_KEY_REFERER = 'https://nexus-phi-taupe.vercel.app/';

export const MAPTILES_SESSION_BODY = Object.freeze({
  mapType: 'satellite',
  language: 'en-US',
  region: 'US',
});

// Refresh the session this far ahead of its expiry so tiles never 403 mid-stream.
export const MAPTILES_REFRESH_AHEAD_MS = 5 * 60 * 1000;

// Build the exact HTTP request Google expects for a 3D-tiles session token.
export function buildSessionRequest(apiKey) {
  return {
    url: `${MAPTILES_SESSION_URL}?key=${encodeURIComponent(apiKey)}`,
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Referer: MAPTILES_KEY_REFERER,
      },
      body: JSON.stringify(MAPTILES_SESSION_BODY),
    },
  };
}

// Root tileset URL for a session token. Tile requests made with a session
// token need no API key.
export function rootUrlForSession(session) {
  return `${MAPTILES_ROOT_URL}?session=${encodeURIComponent(session)}`;
}

// Append the session token to a tile URL. Used as the 3D-tiles renderer's
// URL preprocessor: every request to tile.googleapis.com carries the token.
// - URLs that already carry a session param pass through untouched.
// - Relative URIs are resolved against the Map Tiles origin first.
// - Non-Google URLs are never modified.
export function withSession(uri, session, origin = MAPTILES_ORIGIN) {
  if (!uri || !session) return uri;
  try {
    const u = new URL(uri, `${origin}/`);
    if (u.origin !== origin) return uri;
    if (u.searchParams.has('session')) return u.toString();
    u.searchParams.set('session', session);
    return u.toString();
  } catch {
    return uri;
  }
}

// Google returns expiry as unix seconds (string). -> ms timestamp, or null.
export function sessionExpiryMs(expiry) {
  const s = Number(expiry);
  return Number.isFinite(s) && s > 0 ? s * 1000 : null;
}

// How long to wait before refreshing the token. Never negative; at least a
// minute out so a nearly-expired token still gets one refresh attempt.
export function refreshDelayMs(expiryMs, nowMs = Date.now()) {
  if (!expiryMs) return null;
  return Math.max(expiryMs - nowMs - MAPTILES_REFRESH_AHEAD_MS, 60 * 1000);
}

// Run the full session exchange. fetchImpl is injectable so tests can mock
// the network. Never throws and never returns the API key: the result is
// { ok, status, json } where json is exactly what the route sends the client.
export async function createMapTilesSession(apiKey, fetchImpl = fetch) {
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      json: {
        error: 'Google Map Tiles API key is not configured',
        detail: 'Set GOOGLE_MAP_TILES_API_KEY on the server to enable the photorealistic Earth layer.',
        layer: 'satellite',
      },
    };
  }
  const { url, options } = buildSessionRequest(apiKey);
  let res;
  try {
    res = await fetchImpl(url, options);
  } catch (e) {
    return {
      ok: false,
      status: 502,
      json: {
        error: 'Map Tiles session request failed',
        detail: String(e && e.message ? e.message : e).slice(0, 200),
      },
    };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const detail =
      data && data.error && typeof data.error.message === 'string'
        ? data.error.message.slice(0, 200)
        : null;
    return {
      ok: false,
      status: 502,
      json: {
        error: `Map Tiles session rejected (HTTP ${res.status})`,
        ...(detail ? { detail } : {}),
      },
    };
  }
  if (!data || typeof data.session !== 'string' || !data.session) {
    return {
      ok: false,
      status: 502,
      json: { error: 'Map Tiles session response did not include a token' },
    };
  }
  return {
    ok: true,
    status: 200,
    json: {
      session: data.session,
      expiry: data.expiry ?? null,
      tileWidth: data.tileWidth ?? null,
      tileHeight: data.tileHeight ?? null,
      imageFormat: data.imageFormat ?? null,
    },
  };
}
