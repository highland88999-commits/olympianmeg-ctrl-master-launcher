// ARES dashboard API: account bans (owner-locked: Merlin only).
// POST { userId, reason? } bans one account; DELETE { userId } lifts it.
// A banned account is refused by every API route until lifted. The
// keeper's own account can never be banned.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser, isOwnerEmail, serviceClient } from '@/lib/ares/server';
import { apiGuard } from '@/lib/api-guard';

async function ownerOnly(request) {
  const user = await requireUser(request);
  if (!user) return { error: 'sign in required', status: 401 };
  if (!isOwnerEmail(user)) return { error: 'restricted to the throne', status: 403 };
  let admin;
  try {
    admin = serviceClient();
  } catch {
    return { error: 'ARES is not connected', status: 503 };
  }
  return { user, admin };
}

export const POST = apiGuard(async function POST(request) {
  const auth = await ownerOnly(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  const reason = typeof body?.reason === 'string' && body.reason.trim()
    ? body.reason.trim().slice(0, 200)
    : 'Manual ban by the keeper';
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  const { data: target } = await auth.admin.auth.admin.getUserById(userId);
  if (!target?.user) return NextResponse.json({ error: 'no such user' }, { status: 404 });
  if (isOwnerEmail(target.user)) {
    return NextResponse.json({ error: 'the keeper cannot be banned' }, { status: 400 });
  }
  const { error } = await auth.admin.from('ares_user_bans').upsert([{
    user_id: userId,
    email: target.user.email || null,
    reason,
    banned_by: auth.user.email || null,
  }], { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: 'could not ban (run supabase/ares-allowlist.sql)' }, { status: 500 });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiGuard(async function DELETE(request) {
  const auth = await ownerOnly(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  const { error } = await auth.admin.from('ares_user_bans').delete().eq('user_id', userId);
  if (error) return NextResponse.json({ error: 'could not lift the ban' }, { status: 500 });
  return NextResponse.json({ ok: true });
});
