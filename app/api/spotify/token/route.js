// app/api/spotify/token/route.js
// GET /api/spotify/token
// Returns a fresh short-lived access token for the signed-in user's Spotify
// account, refreshing server-side when needed. The refresh token is never
// sent to the browser — the client only ever holds the short-lived token,
// good for calling Spotify's own Web API / Web Playback SDK.
//
// Response:
//   { connected: false }                                        — not connected
//   { connected: false, revoked: true }                         — revoked/expired grant
//   { connected: true, access_token, expires_in, display_name,
//     product, premium }                                        — ready to play

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { isExpired } from '@/lib/radio/spotify-auth';
import {
  getAdminClient,
  getSpotifyClientId,
  getUserFromRequest,
  refreshTokens,
  jsonError,
} from '../_server';

export async function GET(req) {
  if (!getSpotifyClientId()) {
    return NextResponse.json({ connected: false, unconfigured: true });
  }

  const { user, error, status } = await getUserFromRequest(req);
  if (error) return jsonError(error, status);

  let admin;
  try {
    admin = getAdminClient();
  } catch {
    return jsonError('The service is not configured yet.', 503);
  }

  const { data: row, error: readError } = await admin
    .from('spotify_tokens')
    .select('access_token, refresh_token, expires_at, display_name, product')
    .eq('user_id', user.id)
    .maybeSingle();

  if (readError || !row) {
    return NextResponse.json({ connected: false });
  }

  let accessToken = row.access_token;
  let expiresAt = row.expires_at;

  if (isExpired(expiresAt)) {
    try {
      const fresh = await refreshTokens(row.refresh_token);
      accessToken = fresh.access_token;
      expiresAt = new Date(Date.now() + (fresh.expires_in || 3600) * 1000).toISOString();
      const patch = {
        access_token: accessToken,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      };
      // Spotify may rotate the refresh token; keep the newest one.
      if (fresh.refresh_token) patch.refresh_token = fresh.refresh_token;
      await admin.from('spotify_tokens').update(patch).eq('user_id', user.id);
    } catch (e) {
      if (e.code === 'invalid_grant') {
        // Grant revoked or refresh token dead — drop the row so the UI
        // honestly shows "not connected" instead of erroring forever.
        await admin.from('spotify_tokens').delete().eq('user_id', user.id);
        return NextResponse.json({ connected: false, revoked: true });
      }
      return jsonError(e.message, 502);
    }
  }

  return NextResponse.json({
    connected: true,
    access_token: accessToken,
    expires_in: Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 1000)),
    display_name: row.display_name || 'Spotify user',
    product: row.product || 'unknown',
    premium: row.product === 'premium',
  });
}
