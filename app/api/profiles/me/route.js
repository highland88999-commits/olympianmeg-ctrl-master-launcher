// app/api/profiles/me/route.js
// The signed-in user's own profiles.
//   GET   /api/profiles/me          -> { personal, business } (creates both if missing)
//   PATCH /api/profiles/me          { type:'personal'|'business', ...fields } -> updated profile
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { ensureProfiles } from '@/lib/profiles/ensure';
import { validateProfileUpdate, PROFILE_TYPES } from '@/lib/profiles/validation';
import { apiGuard } from '@/lib/api-guard';

export const GET = apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const profiles = await ensureProfiles(auth.user);
  const admin = await getServiceClient();
  const { data, error } = await admin
    .from('profiles')
    .select('*')
    .eq('user_id', auth.user.id);
  if (error) throw error;
  const out = {};
  for (const row of data || []) out[row.type] = row;
  // Belt and suspenders: ensureProfiles guarantees both rows exist.
  return NextResponse.json({ ok: true, profiles: { personal: out.personal || profiles.personal, business: out.business || profiles.business } });
});

export const PATCH = apiGuard(async function PATCH(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const type = body?.type;
  if (!PROFILE_TYPES.includes(type)) {
    return NextResponse.json({ error: 'type must be personal or business.' }, { status: 400 });
  }
  const v = validateProfileUpdate(body || {});
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Profiles are not connected yet.' }, { status: 503 });

  // Username changes must stay unique across all users.
  if (v.value.username) {
    const { data: clash } = await admin
      .from('profiles')
      .select('id, user_id')
      .eq('username', v.value.username)
      .maybeSingle();
    if (clash && clash.user_id !== auth.user.id) {
      return NextResponse.json({ error: 'That username is taken.' }, { status: 409 });
    }
    // Keep both of the user's profiles on the same username so /u/<name>
    // always resolves to them.
    await admin
      .from('profiles')
      .update({ username: v.value.username })
      .eq('user_id', auth.user.id);
    delete v.value.username;
  }

  const { data, error } = await admin
    .from('profiles')
    .update(v.value)
    .eq('user_id', auth.user.id)
    .eq('type', type)
    .select('*')
    .single();
  if (error) throw error;
  return NextResponse.json({ ok: true, profile: data });
});
