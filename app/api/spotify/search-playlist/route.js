// app/api/spotify/search-playlist/route.js
// "Your Search Playlist" — per-account storage of tracks the user searched
// and played (or explicitly added with the + button).
//
//   GET    /api/spotify/search-playlist        -> { tracks: [...] }
//   POST   /api/spotify/search-playlist        { spotify_track_id, title,
//                                               artist, album_art }
//                                            -> { ok: true, track }
//   DELETE /api/spotify/search-playlist?spotify_track_id=<id>
//                                            -> { ok: true }
//
// Security contract:
// - The caller's Supabase session is verified (Bearer token).
// - All reads/writes go through the service-role key; RLS on the table is
//   owner-only as a second layer, never the only layer.
// - Tracks are Spotify catalog references (ids + display metadata) — no
//   tokens, no credentials, nothing sensitive.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sanitizeStoredTrack } from '@/lib/radio/spotify-search';
import { getAdminClient, getUserFromRequest, jsonError } from '../_server';
import { apiGuard } from '@/lib/api-guard';

function rowToTrack(row) {
  return {
    id: row.spotify_track_id,
    title: row.title || 'Unknown track',
    artist: row.artist || '',
    albumArt: row.album_art || null,
    uri: `spotify:track:${row.spotify_track_id}`,
    addedAt: row.added_at || null,
  };
}

export const GET = apiGuard(async function GET(req) {
  const { user, error, status } = await getUserFromRequest(req);
  if (error) return jsonError(error, status);

  let admin;
  try {
    admin = getAdminClient();
  } catch {
    return jsonError('The service is not configured yet.', 503);
  }

  const { data: rows, error: readError } = await admin
    .from('spotify_search_tracks')
    .select('spotify_track_id, title, artist, album_art, added_at')
    .eq('user_id', user.id)
    .order('added_at', { ascending: false })
    .limit(500);

  if (readError) return jsonError("Couldn't load your search playlist. Please try again.", 500);
  return NextResponse.json({ tracks: (rows || []).map(rowToTrack) });
});

export const POST = apiGuard(async function POST(req) {
  const { user, error, status } = await getUserFromRequest(req);
  if (error) return jsonError(error, status);

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const clean = sanitizeStoredTrack(body);
  if (!clean) return jsonError('That track is missing its Spotify id.', 400);

  let admin;
  try {
    admin = getAdminClient();
  } catch {
    return jsonError('The service is not configured yet.', 503);
  }

  const { data: row, error: upsertError } = await admin
    .from('spotify_search_tracks')
    .upsert(
      {
        user_id: user.id,
        spotify_track_id: clean.spotify_track_id,
        title: clean.title,
        artist: clean.artist,
        album_art: clean.album_art,
        added_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,spotify_track_id' }
    )
    .select('spotify_track_id, title, artist, album_art, added_at')
    .maybeSingle();

  if (upsertError) return jsonError("Couldn't save that track. Please try again.", 500);
  return NextResponse.json({ ok: true, track: row ? rowToTrack(row) : null });
});

export const DELETE = apiGuard(async function DELETE(req) {
  const { user, error, status } = await getUserFromRequest(req);
  if (error) return jsonError(error, status);

  const trackId = (new URL(req.url).searchParams.get('spotify_track_id') || '').trim();
  if (!trackId) return jsonError('Missing track id.', 400);

  let admin;
  try {
    admin = getAdminClient();
  } catch {
    return jsonError('The service is not configured yet.', 503);
  }

  const { error: deleteError } = await admin
    .from('spotify_search_tracks')
    .delete()
    .eq('user_id', user.id)
    .eq('spotify_track_id', trackId);

  if (deleteError) return jsonError("Couldn't remove that track. Please try again.", 500);
  return NextResponse.json({ ok: true });
});
