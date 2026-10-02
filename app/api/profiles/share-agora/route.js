// app/api/profiles/share-agora/route.js
// POST /api/profiles/share-agora { username, type? }
// Shares one of the signed-in user's profiles to the Agora town square as a
// 'craft' (Arts, Trades & Work) post linking back to the profile page.
// Only the owner can share their own profile.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { profileUrl, PROFILE_TYPES } from '@/lib/profiles/validation';
import { apiGuard } from '@/lib/api-guard';

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Sharing is not connected yet.' }, { status: 503 });

  const body = await req.json().catch(() => null);
  const type = PROFILE_TYPES.includes(body?.type) ? body.type : 'personal';

  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, type, username, display_name, bio')
    .eq('user_id', auth.user.id)
    .eq('type', type)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });

  const link = profileUrl(profile.username, profile.type);
  const title = `${profile.display_name || profile.username} — ${profile.type === 'business' ? 'Business' : 'Personal'} profile`;
  const body_text = [
    profile.bio || 'Check out my Olympus profile.',
    '',
    `View it here: ${link}`,
  ].join('\n').slice(0, 2000);

  const { data: post, error: postErr } = await admin
    .from('agora_posts')
    .insert({
      user_id: auth.user.id,
      title: title.slice(0, 120),
      body: body_text,
      category: 'craft',
    })
    .select('id')
    .single();
  if (postErr) throw postErr;

  return NextResponse.json({ ok: true, agora_post_id: post.id, agora_url: `/agora/post/${post.id}` });
});
