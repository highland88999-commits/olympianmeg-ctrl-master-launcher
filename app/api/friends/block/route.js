// app/api/friends/block/route.js — block a user.
//   POST /api/friends/block { friend_id } -> { ok: true }
// Reuses the friendships table (status 'blocked' is in the check constraint —
// no migration). Any existing row between the pair becomes the block row,
// re-pointed at the blocker, so the friendship is severed. SILENT: the
// blocked user is never notified; the blocker's own pending request
// notifications from them are quietly dismissed.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { validateBlockBody, blockUser } from '@/lib/friends';

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const v = validateBlockBody(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Friends are not connected yet.', status: 503 });

  try {
    await blockUser(admin, { blockerId: auth.user.id, blockedId: v.value.friend_id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Could not block this player.' }, { status: e.status || 500 });
  }
});
