// app/api/friends/pending/route.js — incoming friend requests.
//   GET /api/friends/pending -> { requests: [{ friendship_id, created_at, requester }] }
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import { listPendingRequests } from '@/lib/friends';

export const GET = noCache(apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Friends are not connected yet.', status: 503 });

  const requests = await listPendingRequests(admin, { userId: auth.user.id });
  return NextResponse.json({ ok: true, requests, user_id: auth.user.id });
}));
