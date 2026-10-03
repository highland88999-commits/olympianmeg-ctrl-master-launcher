// app/api/friends/remove/route.js — unfriend: delete my accepted friendship row.
//   POST /api/friends/remove { friend_id } -> { ok: true, friend_id }
// Only an accepted row the caller is party to is deleted; blocks, pending
// requests, and declines keep their own flows. Silent: no notification.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { validateRemoveFriendBody, removeFriend } from '@/lib/friends';

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const v = validateRemoveFriendBody(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Friends are not connected yet.', status: 503 });

  try {
    const result = await removeFriend(admin, { userId: auth.user.id, friendId: v.value.friend_id });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Could not remove this friend.' }, { status: e.status || 500 });
  }
});
