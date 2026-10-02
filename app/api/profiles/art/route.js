// app/api/profiles/art/route.js
// Owner-only art management for the signed-in user's profiles.
//   POST   /api/profiles/art { profile_id, title, description?, media_url, media_kind, for_sale?, price_cents? }
//   DELETE /api/profiles/art?id=<art_id>
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { validateArtPiece } from '@/lib/profiles/validation';
import { apiGuard } from '@/lib/api-guard';

// Confirm the profile row belongs to this user. Returns the profile or null.
async function ownProfile(admin, userId, profileId) {
  const { data, error } = await admin
    .from('user_profiles')
    .select('id, type, username')
    .eq('id', profileId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export const GET = apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Profiles are not connected yet.' }, { status: 503 });

  const profileId = req.nextUrl.searchParams.get('profile_id');
  if (!profileId) return NextResponse.json({ error: 'Missing profile_id.' }, { status: 400 });
  const profile = await ownProfile(admin, auth.user.id, profileId);
  if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });

  const { data, error } = await admin
    .from('art_pieces')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return NextResponse.json({ ok: true, art: data || [] });
});

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Profiles are not connected yet.' }, { status: 503 });

  const body = await req.json().catch(() => null);
  const profile = await ownProfile(admin, auth.user.id, body?.profile_id);
  if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });

  const v = validateArtPiece(body || {});
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const { data, error } = await admin
    .from('art_pieces')
    .insert({ profile_id: profile.id, ...v.value })
    .select('*')
    .single();
  if (error) throw error;
  return NextResponse.json({ ok: true, art: data });
});

export const DELETE = apiGuard(async function DELETE(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Profiles are not connected yet.' }, { status: 503 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing art id.' }, { status: 400 });

  // Delete only when the art belongs to one of this user's profiles.
  const { data: art } = await admin.from('art_pieces').select('id, profile_id').eq('id', id).maybeSingle();
  if (!art) return NextResponse.json({ error: 'Art not found.' }, { status: 404 });
  const profile = await ownProfile(admin, auth.user.id, art.profile_id);
  if (!profile) return NextResponse.json({ error: 'Not your art.' }, { status: 403 });

  const { error } = await admin.from('art_pieces').delete().eq('id', id);
  if (error) throw error;
  return NextResponse.json({ ok: true });
});
