// app/api/spotify/_server.js
// Shared server-only helpers for the Spotify OAuth routes.
// Not a route (underscore prefix). Uses the service-role key and talks to
// Spotify's own token API — never import into client code.

import { createClient } from '@supabase/supabase-js';
import {
  SPOTIFY_ACCOUNTS_BASE,
  SPOTIFY_API_BASE,
  buildExchangeBody,
  buildRefreshBody,
} from '@/lib/radio/spotify-auth';

let admin = null;

export function getAdminClient() {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Supabase is not configured (missing URL or service-role key).');
    }
    admin = createClient(url, key);
  }
  return admin;
}

export function getSpotifyClientId() {
  // Public client id — safe in NEXT_PUBLIC_ (Spotify public clients have no secret).
  return process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || '';
}

export function jsonError(message, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

// Verifies the caller's Supabase session. The client sends:
//   Authorization: Bearer <access_token>  (from supabase.auth.getSession())
export async function getUserFromRequest(req) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return { error: 'Sign in to use this feature.', status: 401 };

  let adminClient;
  try {
    adminClient = getAdminClient();
  } catch {
    return { error: 'The service is not configured yet.', status: 503 };
  }

  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) return { error: 'Your session has expired. Please sign in again.', status: 401 };
  return { user };
}

// POST to Spotify's token endpoint. Throws a plain-English Error on failure.
async function tokenRequest(body) {
  let res;
  try {
    res = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    throw new Error("Couldn't reach Spotify. Check your connection and try again.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const code = data?.error;
    if (code === 'invalid_grant') {
      const err = new Error('That Spotify sign-in expired or was revoked. Please connect again.');
      err.code = 'invalid_grant';
      throw err;
    }
    throw new Error(data?.error_description || 'Spotify refused the request. Please try again.');
  }
  if (!data?.access_token) throw new Error('Spotify returned an unexpected response. Please try again.');
  return data;
}

export function exchangeCodeForTokens({ code, verifier, redirectUri }) {
  const clientId = getSpotifyClientId();
  if (!clientId) throw new Error('Spotify sign-in is not configured yet.');
  return tokenRequest(buildExchangeBody({ code, verifier, redirectUri, clientId }));
}

export function refreshTokens(refreshToken) {
  const clientId = getSpotifyClientId();
  if (!clientId) throw new Error('Spotify sign-in is not configured yet.');
  return tokenRequest(buildRefreshBody({ refreshToken, clientId }));
}

// Minimal profile read: display name + plan (to detect Premium honestly).
export async function fetchSpotifyProfile(accessToken) {
  let res;
  try {
    res = await fetch(`${SPOTIFY_API_BASE}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error("Couldn't reach Spotify. Check your connection and try again.");
  }
  if (res.status === 401) {
    const err = new Error('That Spotify sign-in expired. Please connect again.');
    err.code = 'invalid_grant';
    throw err;
  }
  if (!res.ok) throw new Error('Spotify refused the request. Please try again.');
  const data = await res.json();
  return {
    displayName: data?.display_name || 'Spotify user',
    product: data?.product || 'unknown', // 'premium' | 'free' | 'open' | ...
  };
}
