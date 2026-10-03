// app/api/friends/route.js — the signed-in user's accepted friends.
//   GET /api/friends -> { friends: [{ user_id, username, display_name, avatar_url }] }
//
// NOTE (2026-10-02): The @/lib/friends import of listMyFriendships returns []
// in the Vercel build despite correct source (diagnosed via /api/debug-friends).
// Query logic is inlined here until the bundling issue is resolved.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';

export const GET = noCache(apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Friends are not connected yet.', status: 503 });

  const userId = auth.user.id;

  // Inline friendships query (bypasses broken lib import).
  const { data: rows, error: qErr } = await admin
    .from('friendships')
    .select('*')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    ;
  if (qErr) throw qErr;

  const ids = [
    ...new Set(
      (rows || [])
        .filter((r) => r.status === 'accepted')
        .map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id))
        .filter(Boolean)
    ),
  ];

  let friends = [];
  if (ids.length) {
    const { data: profs, error: pErr } = await admin
      .from('user_profiles')
      .select('user_id, username, display_name, avatar_url, type')
      .in('user_id', ids);
    if (pErr) throw pErr;
    const byUser = {};
    for (const p of profs || []) (byUser[p.user_id] = byUser[p.user_id] || []).push(p);
    // Prefer personal profile, fall back to first.
    friends = ids.map((id) => {
      const list = byUser[id] || [];
      const prof = list.find((p) => p.type === 'personal') || list[0] || null;
      return {
        user_id: id,
        username: (prof && prof.username) || 'player',
        display_name: (prof && (prof.display_name || prof.username)) || 'Player',
        avatar_url: (prof && prof.avatar_url) || null,
        type: (prof && prof.type) || null,
      };
    });
  }

  return NextResponse.json({ ok: true, friends, user_id: userId });
}));
