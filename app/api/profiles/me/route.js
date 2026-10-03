// app/api/profiles/me/route.js
// The signed-in user's own profiles.
//   GET   /api/profiles/me          -> { personal, business } (creates both if missing)
//   PATCH /api/profiles/me          { type:'personal'|'business', ...fields } -> updated profile
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { ensureProfiles } from '@/lib/profiles/ensure';
import { patchProfile } from '@/lib/profiles/patch';
import { apiGuard } from '@/lib/api-guard';

export const GET = apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const profiles = await ensureProfiles(auth.user);
  const admin = await getServiceClient();
  const { data, error } = await admin
    .from('user_profiles')
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
  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Profiles are not connected yet.' }, { status: 503 });

  // All save semantics (sparse updates, row guarantee, username races) live
  // in lib/profiles/patch.js so they can be regression-tested headlessly.
  const { status, json } = await patchProfile({ admin, user: auth.user, body });
  return NextResponse.json(json, { status });
});
