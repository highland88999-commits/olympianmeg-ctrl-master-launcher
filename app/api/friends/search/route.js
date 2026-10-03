// app/api/friends/search/route.js — player search for adding friends.
//   GET /api/friends/search?q= -> { players: [{ user_id, username, display_name, avatar_url }] }
// Searches username + display_name (ilike), excludes self and anyone already
// connected in any friendship status. Requires at least 2 characters.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import { normalizeSearchQuery, searchPlayers } from '@/lib/friends';

export const GET = noCache(apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Friends are not connected yet.', status: 503 });

  const q = new URL(req.url).searchParams.get('q') || '';
  const query = normalizeSearchQuery(q);
  if (!query) return NextResponse.json({ ok: true, players: [], user_id: auth.user.id });

  const players = await searchPlayers(admin, { userId: auth.user.id, q: query });
  return NextResponse.json({ ok: true, players, user_id: auth.user.id });
}));
