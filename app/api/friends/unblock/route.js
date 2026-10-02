// app/api/friends/unblock/route.js — lift a block.
//   POST /api/friends/unblock { friend_id } -> { ok: true }
// Only the blocker can unblock. Deletes the block row — it does NOT restore
// a friendship; both sides must re-add afterwards. Silent both ways.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { validateBlockBody, unblockUser } from '@/lib/friends';

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const v = validateBlockBody(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Friends are not connected yet.', status: 503 });

  try {
    await unblockUser(admin, { blockerId: auth.user.id, blockedId: v.value.friend_id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Could not unblock this player.' }, { status: e.status || 500 });
  }
});
