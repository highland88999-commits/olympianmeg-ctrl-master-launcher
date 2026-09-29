// app/api/spotify/prefs/route.js
// Per-user radio source preference: "nexus" (house station, default) or
// "my-spotify" (the user's own Spotify account).
//
//   GET  /api/spotify/prefs  -> { source }
//   PUT  /api/spotify/prefs  { source } -> { ok, source }
//
// The client also keeps a localStorage copy as the offline fallback and
// syncs it up when it can reach this route. Server wins on conflict.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { SOURCES, isValidSource } from '@/lib/radio/spotify-auth';
import { getAdminClient, getUserFromRequest, jsonError } from '../_server';

export async function GET(req) {
  const { user, error, status } = await getUserFromRequest(req);
  if (error) return jsonError(error, status);

  let admin;
  try {
    admin = getAdminClient();
  } catch {
    return jsonError('The service is not configured yet.', 503);
  }

  const { data: row } = await admin
    .from('radio_source_prefs')
    .select('source')
    .eq('user_id', user.id)
    .maybeSingle();

  const source = row && isValidSource(row.source) ? row.source : SOURCES.NEXUS;
  return NextResponse.json({ source });
}

export async function PUT(req) {
  const { user, error, status } = await getUserFromRequest(req);
  if (error) return jsonError(error, status);

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const source = typeof body?.source === 'string' ? body.source : '';
  if (!isValidSource(source)) {
    return jsonError('Unknown source. Use "nexus" or "my-spotify".', 400);
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch {
    return jsonError('The service is not configured yet.', 503);
  }

  const { error: upsertError } = await admin.from('radio_source_prefs').upsert({
    user_id: user.id,
    source,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (upsertError) {
    return jsonError("Couldn't save your radio source. Please try again.", 500);
  }
  return NextResponse.json({ ok: true, source });
}
