// app/api/friends/blocked/route.js — my blocked list.
//   GET /api/friends/blocked -> { blocked: [{ user_id, username, display_name, avatar_url, blocked_at }] }
// Blocked rows are stored requester = blocker, so this is one indexed query.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { listBlockedUsers } from '@/lib/friends';

export const GET = apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Friends are not connected yet.', status: 503 });

  try {
    const blocked = await listBlockedUsers(admin, { userId: auth.user.id });
    return NextResponse.json({ ok: true, blocked });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Could not load the blocked list.' }, { status: e.status || 500 });
  }
});
