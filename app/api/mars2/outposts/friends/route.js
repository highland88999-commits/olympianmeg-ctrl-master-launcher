// app/api/mars2/outposts/friends/route.js — friends' Mars 2 outposts.
//   GET /api/mars2/outposts/friends -> { ok, friends: [{ user_id,
//   display_name, username, avatar_url, x, z }] }
// Only accepted friends, only those with a placed outpost. Before
// the mars2-outposts SQL runs, the route answers 503 and the
// compass simply shows no friend markers — the game still loads.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import { listFriends } from '@/lib/friends';

function tableMissingResponse() {
  return NextResponse.json(
    { ok: false, error: 'Personal outposts are not set up yet. The host needs to add the database table first.' },
    { status: 503 },
  );
}

export const GET = noCache(apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Outposts are not connected yet.' }, { status: 503 });

  try {
    const friends = await listFriends(admin, { userId: auth.user.id });
    if (!friends.length) return NextResponse.json({ ok: true, friends: [] });
    const ids = friends.map((f) => f.user_id);
    const { data, error } = await admin
      .from('mars2_outposts')
      .select('user_id, x, z')
      .in('user_id', ids);
    if (error) throw error;
    const byUser = {};
    for (const row of data || []) byUser[row.user_id] = row;
    const out = [];
    for (const f of friends) {
      const row = byUser[f.user_id];
      if (!row) continue;
      out.push({
        user_id: f.user_id,
        display_name: f.display_name,
        username: f.username,
        avatar_url: f.avatar_url,
        x: row.x,
        z: row.z,
      });
    }
    return NextResponse.json({ ok: true, friends: out });
  } catch (e) {
    if (e && e.code === '42P01') return tableMissingResponse();
    return NextResponse.json({ error: e.message || 'Could not load friends’ outposts.' }, { status: 500 });
  }
}));
