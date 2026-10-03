// app/api/friends/request/route.js — send a friend request.
//   POST /api/friends/request { addressee_id } -> { friendship_id }
// Creates a pending friendship row and a friend_request notification for the
// addressee (the notification carries meta.friendship_id so the bell can
// answer it for real). Re-requesting after a decline refreshes the old row.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import {
  validateFriendRequest,
  createFriendRequest,
  getDisplayProfile,
  notifyFriendRequest,
} from '@/lib/friends';

export const POST = noCache(apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const v = validateFriendRequest(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  if (v.value.addressee_id === auth.user.id) {
    return NextResponse.json({ error: 'You cannot friend yourself.' }, { status: 400 });
  }

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Friends are not connected yet.', status: 503 });

  const target = await getDisplayProfile(admin, v.value.addressee_id);
  if (!target) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });

  try {
    const { friendship } = await createFriendRequest(admin, {
      requesterId: auth.user.id,
      addresseeId: v.value.addressee_id,
    });
    const me = await getDisplayProfile(admin, auth.user.id);
    await notifyFriendRequest(admin, {
      recipientId: v.value.addressee_id,
      actorId: auth.user.id,
      actorName: (me && (me.display_name || me.username)) || 'A player',
      friendshipId: friendship.id,
    });
    return NextResponse.json({ ok: true, friendship_id: friendship.id });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Could not send the request.' }, { status: e.status || 500 });
  }
}));
