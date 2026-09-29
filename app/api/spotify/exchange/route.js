// app/api/spotify/exchange/route.js
// POST /api/spotify/exchange
// Completes the PKCE flow: the signed-in app user sends the authorization
// `code`, the PKCE `code_verifier`, and the `redirect_uri` they used.
// The server exchanges them with Spotify (no client secret exists — public
// client + PKCE), caches the account's display name + plan, and stores the
// tokens per-user in spotify_tokens. The refresh token never leaves the server.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  getAdminClient,
  getSpotifyClientId,
  getUserFromRequest,
  exchangeCodeForTokens,
  fetchSpotifyProfile,
  jsonError,
} from '../_server';

export async function POST(req) {
  if (!getSpotifyClientId()) {
    return jsonError('Spotify sign-in is not configured yet.', 503);
  }

  const { user, error, status } = await getUserFromRequest(req);
  if (error) return jsonError(error, status);

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const code = typeof body?.code === 'string' ? body.code : '';
  const verifier = typeof body?.code_verifier === 'string' ? body.code_verifier : '';
  const redirectUri = typeof body?.redirect_uri === 'string' ? body.redirect_uri : '';
  if (!code || !verifier || !redirectUri) {
    return jsonError('Missing code, verifier, or redirect URI.', 400);
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({ code, verifier, redirectUri });
  } catch (e) {
    const status = e.code === 'invalid_grant' ? 400 : 502;
    return jsonError(e.message, status);
  }

  // Honest account info: display name + plan (Premium detection for the
  // Web Playback SDK, which only works on Premium).
  let displayName = 'Spotify user';
  let product = 'unknown';
  try {
    const profile = await fetchSpotifyProfile(tokens.access_token);
    displayName = profile.displayName;
    product = profile.product;
  } catch {
    // Non-fatal: tokens are still valid; the panel retries profile later.
  }

  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
  let admin;
  try {
    admin = getAdminClient();
  } catch {
    return jsonError('The service is not configured yet.', 503);
  }

  const { error: upsertError } = await admin.from('spotify_tokens').upsert({
    user_id: user.id,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    scope: tokens.scope || '',
    display_name: displayName,
    product,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (upsertError) {
    return jsonError("Couldn't save your Spotify connection. Please try again.", 500);
  }

  return NextResponse.json({
    ok: true,
    connected: true,
    display_name: displayName,
    product,
    premium: product === 'premium',
  });
}
