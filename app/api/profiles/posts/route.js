// app/api/profiles/posts/route.js
// Owner-only post management for the signed-in user's profiles.
//   POST   /api/profiles/posts { profile_id, body, media_url?, media_kind? }
//   DELETE /api/profiles/posts?id=<post_id>
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { validateProfilePost } from '@/lib/profiles/validation';
import { apiGuard } from '@/lib/api-guard';

async function ownProfile(admin, userId, profileId) {
  const { data, error } = await admin
    .from('user_profiles')
    .select('id')
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
    .from('profile_posts')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return NextResponse.json({ ok: true, posts: data || [] });
});

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Profiles are not connected yet.' }, { status: 503 });

  const body = await req.json().catch(() => null);
  const profile = await ownProfile(admin, auth.user.id, body?.profile_id);
  if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });

  const v = validateProfilePost(body || {});
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const { data, error } = await admin
    .from('profile_posts')
    .insert({ profile_id: profile.id, ...v.value })
    .select('*')
    .single();
  if (error) throw error;
  return NextResponse.json({ ok: true, post: data });
});

export const DELETE = apiGuard(async function DELETE(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Profiles are not connected yet.' }, { status: 503 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing post id.' }, { status: 400 });

  const { data: post } = await admin.from('profile_posts').select('id, profile_id').eq('id', id).maybeSingle();
  if (!post) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
  const profile = await ownProfile(admin, auth.user.id, post.profile_id);
  if (!profile) return NextResponse.json({ error: 'Not your post.' }, { status: 403 });

  const { error } = await admin.from('profile_posts').delete().eq('id', id);
  if (error) throw error;
  return NextResponse.json({ ok: true });
});
