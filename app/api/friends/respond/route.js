// app/api/friends/respond/route.js — answer a friend request for real.
//   POST /api/friends/respond { friendship_id, action: 'accept'|'decline' }
//     -> { status }
// Addressee only. Writes the friendship row, marks the matching
// friend_request notification handled+read, and notifies the requester
// when accepted.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import { validateFriendRespond, answerFriendRequest } from '@/lib/friends';

export const POST = noCache(apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const v = validateFriendRespond(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Friends are not connected yet.', status: 503 });

  try {
    const { friendship } = await answerFriendRequest(admin, {
      userId: auth.user.id,
      friendshipId: v.value.friendship_id,
      action: v.value.action,
    });
    return NextResponse.json({ ok: true, status: friendship.status });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Could not answer the request.' }, { status: e.status || 500 });
  }
}));
