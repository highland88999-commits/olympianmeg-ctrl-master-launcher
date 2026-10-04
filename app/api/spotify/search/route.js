// app/api/spotify/search/route.js
// GET /api/spotify/search?q=<query>
// Searches Spotify's track catalog with the SIGNED-IN user's own Spotify
// account and returns slim UI-ready results.
//
// Security contract (same as the rest of /api/spotify/*):
// - The caller's Supabase session is verified (Bearer token).
// - The Spotify access token is read (and refreshed) SERVER-SIDE from the
//   spotify_tokens table — it never reaches the browser through this route.
// - Response: { items: [{ id, title, artist, albumArt, uri }] }.
// - No new Spotify scopes are required: search + playback of explicit URIs
//   are covered by the scopes granted at connect time.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { SPOTIFY_API_BASE, isExpired } from '@/lib/radio/spotify-auth';
import { mapSearchResponse, sanitizeQuery, SEARCH_LIMIT } from '@/lib/radio/spotify-search';
import {
  getAdminClient,
  getSpotifyClientId,
  getUserFromRequest,
  refreshTokens,
  jsonError,
} from '../_server';
import { apiGuard } from '@/lib/api-guard';

// Server-side read of the user's Spotify access token, refreshing when the
// stored one is past its safety skew. Mirrors app/api/spotify/token/route.js.
async function getServerAccessToken(admin, user) {
  const { data: row, error: readError } = await admin
    .from('spotify_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (readError || !row) {
    const e = new Error('Spotify is not connected for this account.');
    e.status = 409;
    throw e;
  }

  if (!isExpired(row.expires_at)) return row.access_token;

  try {
    const fresh = await refreshTokens(row.refresh_token);
    const expiresAt = new Date(Date.now() + (fresh.expires_in || 3600) * 1000).toISOString();
    const patch = {
      access_token: fresh.access_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };
    if (fresh.refresh_token) patch.refresh_token = fresh.refresh_token;
    await admin.from('spotify_tokens').update(patch).eq('user_id', user.id);
    return fresh.access_token;
  } catch (e) {
    if (e.code === 'invalid_grant') {
      await admin.from('spotify_tokens').delete().eq('user_id', user.id);
      const err = new Error('That Spotify sign-in expired or was revoked. Please connect again.');
      err.status = 409;
      throw err;
    }
    throw e;
  }
}

export const GET = apiGuard(async function GET(req) {
  if (!getSpotifyClientId()) {
    return NextResponse.json({ ok: false, items: [], unconfigured: true });
  }

  const { user, error, status } = await getUserFromRequest(req);
  if (error) return jsonError(error, status);

  const q = sanitizeQuery(new URL(req.url).searchParams.get('q'));
  if (!q) return NextResponse.json({ items: [] });

  let admin;
  try {
    admin = getAdminClient();
  } catch {
    return jsonError('The service is not configured yet.', 503);
  }

  let accessToken;
  try {
    accessToken = await getServerAccessToken(admin, user);
  } catch (e) {
    return jsonError(e.message, e.status || 502);
  }

  let res;
  try {
    res = await fetch(
      `${SPOTIFY_API_BASE}/search?type=track&limit=${SEARCH_LIMIT}&q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
  } catch {
    return jsonError("Couldn't reach Spotify. Check your connection and try again.", 502);
  }

  if (res.status === 401) {
    return jsonError('That Spotify sign-in expired. Please connect again.', 409);
  }
  if (res.status === 429) {
    return jsonError('Spotify is rate-limiting searches right now. Wait a moment and try again.', 429);
  }
  if (!res.ok) {
    return jsonError('Spotify refused the search. Please try again.', 502);
  }

  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return NextResponse.json({ items: mapSearchResponse(data) });
});
