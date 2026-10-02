// app/api/friends/invite/route.js — summon a friend to an Order 67 call.
//   POST /api/friends/invite { friend_id, room_code } -> { ok: true }
// Accepted friends only. Drops a system notification on the friend with the
// channel code so they can join from their own throne room.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import {
  validateCallInvite,
  listMyFriendships,
  counterpartId,
  getDisplayProfile,
  notifyCallInvite,
} from '@/lib/friends';

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const v = validateCallInvite(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Friends are not connected yet.', status: 503 });

  const mine = await listMyFriendships(admin, auth.user.id);
  const isFriend = mine.some(
    (r) => r.status === 'accepted' && counterpartId(r, auth.user.id) === v.value.friend_id
  );
  if (!isFriend) {
    return NextResponse.json({ error: 'You can only summon friends.' }, { status: 403 });
  }

  const me = await getDisplayProfile(admin, auth.user.id);
  await notifyCallInvite(admin, {
    recipientId: v.value.friend_id,
    actorId: auth.user.id,
    actorName: (me && (me.display_name || me.username)) || 'A player',
    roomCode: v.value.room_code,
  });
  return NextResponse.json({ ok: true });
});
