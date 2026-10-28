// ARES dashboard API: registered-users allowlist (owner-locked: Merlin only).
//
// The allowlist IS the registered users: anyone who registers or signs in
// is allowed automatically, so this endpoint simply lists every account
// from Supabase Auth with its ban flag. No grant step exists to forget.
// A banned account shows as Banned with its reason; the keeper lifts it
// from the user-bans route.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser, isOwnerEmail, serviceClient } from '@/lib/ares/server';
import { apiGuard } from '@/lib/api-guard';

export const GET = apiGuard(async function GET(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  if (!isOwnerEmail(user)) return NextResponse.json({ error: 'restricted to the throne' }, { status: 403 });
  let admin;
  try {
    admin = serviceClient();
  } catch {
    return NextResponse.json({ error: 'ARES is not connected' }, { status: 503 });
  }
  const users = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000, page });
    if (error) return NextResponse.json({ error: 'could not load users' }, { status: 500 });
    users.push(...(data?.users || []));
    if (!data?.users || data.users.length < 1000 || page >= 10) break;
    page += 1;
  }
  let bans = {};
  try {
    const { data } = await admin.from('ares_user_bans').select('user_id, reason, created_at');
    for (const b of data || []) bans[b.user_id] = b;
  } catch { /* table missing before SQL runs: nobody flagged banned */ }
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email || null,
      created_at: u.created_at || null,
      last_sign_in_at: u.last_sign_in_at || null,
      allowed: !bans[u.id],
      banned: !!bans[u.id],
      ban_reason: bans[u.id]?.reason || null,
      banned_at: bans[u.id]?.created_at || null,
    })),
  });
});
