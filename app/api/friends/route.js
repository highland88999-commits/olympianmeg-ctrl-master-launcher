// app/api/friends/route.js — the signed-in user's accepted friends.
//   GET /api/friends -> { friends: [{ user_id, username, display_name, avatar_url }] }
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import { listFriends } from '@/lib/friends';

export const GET = noCache(apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Friends are not connected yet.', status: 503 });

  const friends = await listFriends(admin, { userId: auth.user.id });
  return NextResponse.json({ ok: true, friends, user_id: auth.user.id });
}));
