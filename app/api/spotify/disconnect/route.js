// app/api/spotify/disconnect/route.js
// POST /api/spotify/disconnect
// Removes the signed-in user's stored Spotify tokens. The Spotify-side
// authorization stays until the user revokes it in their Spotify account
// settings — the response says so honestly.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminClient, getUserFromRequest, jsonError } from '../_server';

export async function POST(req) {
  const { user, error, status } = await getUserFromRequest(req);
  if (error) return jsonError(error, status);

  let admin;
  try {
    admin = getAdminClient();
  } catch {
    return jsonError('The service is not configured yet.', 503);
  }

  const { error: delError } = await admin
    .from('spotify_tokens')
    .delete()
    .eq('user_id', user.id);

  if (delError) {
    return jsonError("Couldn't disconnect Spotify. Please try again.", 500);
  }

  return NextResponse.json({
    ok: true,
    connected: false,
    note: 'Disconnected here. To fully revoke access, remove "Nexus Radio" in your Spotify account settings.',
  });
}
