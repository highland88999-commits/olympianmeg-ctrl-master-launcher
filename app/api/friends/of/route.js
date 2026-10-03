// app/api/friends/of/route.js — one user's accepted friends, for profile pages.
//   GET /api/friends/of?user_id=<uuid> ->
//     { ok: true, friends: [{ user_id, username, display_name, avatar_url, type }] }
//
// Reads from the canonical friendships source (same listFriends as
// /api/friends). Blocks are respected: when the pair is blocked in either
// direction, the list is withheld (friends: [], blocked: true) — silent, no
// leak to the blocked party.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import {
  isUuid,
  isBlockedPair,
  getDisplayProfile,
  listMyFriendships,
  listFriends,
} from '@/lib/friends';

export const GET = apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const targetId = new URL(req.url).searchParams.get('user_id');
  if (!isUuid(targetId)) return NextResponse.json({ error: 'user_id must be a UUID.' }, { status: 400 });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Friends are not connected yet.', status: 503 });

  const target = await getDisplayProfile(admin, targetId);
  if (!target) return NextResponse.json({ error: 'Player not found.', status: 404 });

  // Block gate: a blocked pair never sees each other's friends list
  // (either direction — a block severs both ways).
  if (auth.user.id !== targetId) {
    const mine = await listMyFriendships(admin, auth.user.id);
    if (isBlockedPair(mine, auth.user.id, targetId)) {
      return NextResponse.json({ ok: true, friends: [], blocked: true });
    }
  }

  const friends = await listFriends(admin, { userId: targetId });
  return NextResponse.json({ ok: true, friends, blocked: false });
});
