// app/api/earth/rendered-tiles/route.js — Earth 1 rendered-tiles
// server record (Merlin, 2026-10-27: a Supabase table tracking
// what tiles have been rendered, so tiles sent to it render again
// on load for that user).
//
//   GET /api/earth/rendered-tiles ->
//     { ok: true, tiles: [{ tileKey, preset, centerLat, centerLon,
//       renderedAt }] } — the CALLING user's rows only, most
//       recent first (capped at RENDERED_FETCH_MAX).
//     or, before the migration has been run,
//     { ok: false, error: 'not_ready' } — the client falls back
//     to today's device-only behavior, never an error surface.
//   POST /api/earth/rendered-tiles { tiles: [...] } ->
//     { ok: true, recorded: n } — upserted (user_id, tile_key),
//     so re-recording refreshes rendered_at, never duplicates.
//     Same not_ready shape when the table does not exist yet.
//
// Auth: Bearer token required (getUserFromRequest, the ui-state
// pattern). Rows are read/written with the service-role client
// filtered by the authenticated user id — the RLS own-row
// policies are the backstop, not the enforcement. No row, no
// user id, no other user's data ever leaves this route.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import {
  RENDERED_TILES_TABLE,
  RENDERED_FETCH_MAX,
  RENDERED_RECORD_BATCH_MAX,
  sanitizeRenderedTiles,
} from '@/lib/earth/rendered-tiles';

function publicRow(r) {
  return {
    tileKey: r.tile_key,
    preset: r.preset,
    centerLat: r.center_lat,
    centerLon: r.center_lon,
    renderedAt: r.rendered_at,
  };
}

function notReady() {
  return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
}

export const GET = noCache(
  apiGuard(async function GET(req) {
    const auth = await getUserFromRequest(req);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const admin = await getServiceClient();
    if (!admin) return NextResponse.json({ error: 'Rendered tiles are not connected yet.' }, { status: 503 });

    try {
      const { data, error } = await admin
        .from(RENDERED_TILES_TABLE)
        .select('tile_key, preset, center_lat, center_lon, rendered_at')
        .eq('user_id', auth.user.id)
        .order('rendered_at', { ascending: false })
        .limit(RENDERED_FETCH_MAX);
      if (error) throw error;
      return NextResponse.json({ ok: true, tiles: (data || []).map(publicRow) });
    } catch {
      // Table does not exist yet (migration not run) or
      // unreadable: "not ready", not an error — the client
      // falls back to device-only silently.
      return notReady();
    }
  })
);

export const POST = noCache(
  apiGuard(async function POST(req) {
    const auth = await getUserFromRequest(req);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const admin = await getServiceClient();
    if (!admin) return NextResponse.json({ error: 'Rendered tiles are not connected yet.' }, { status: 503 });

    const body = await req.json().catch(() => null);
    const tiles = sanitizeRenderedTiles(body && body.tiles, RENDERED_RECORD_BATCH_MAX);
    if (tiles.length === 0) {
      return NextResponse.json({ error: 'No valid tiles to record.' }, { status: 400 });
    }

    try {
      const rows = tiles.map((t) => ({
        user_id: auth.user.id,
        tile_key: t.tile_key,
        preset: t.preset,
        center_lat: t.center_lat,
        center_lon: t.center_lon,
        rendered_at: new Date().toISOString(),
      }));
      const { error } = await admin
        .from(RENDERED_TILES_TABLE)
        .upsert(rows, { onConflict: 'user_id,tile_key' });
      if (error) throw error;
      return NextResponse.json({ ok: true, recorded: rows.length });
    } catch {
      return notReady();
    }
  })
);
