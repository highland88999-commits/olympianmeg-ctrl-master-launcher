// app/api/profiles/[id]/character/route.js
// GET /api/profiles/:id/character
//   Public: the profile character (platform roster id) a user has set,
//   or null. One safe field only — a roster id is public by design: it
//   is exactly what the user's public Agora profile displays.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { isCharacterId } from '@/lib/characters/roster';

export const GET = apiGuard(async function GET(req, ctx) {
  const params = await ctx.params;
  const id = String(params?.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing profile id.' }, { status: 400 });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Profiles are not connected yet.' }, { status: 503 });

  const { data, error } = await admin
    .from('user_profiles')
    .select('profile_character_id')
    .eq('user_id', id)
    .eq('type', 'personal')
    .maybeSingle();
  if (error) {
    // The profile_character_id column arrives with the
    // 20261013_profile_character migration. Until Merlin green-lights
    // it, nobody can have a character saved — answer "none" honestly
    // instead of failing the public profile page.
    if (error.code === '42703' || error.code === 'PGRST204') {
      return NextResponse.json({ ok: true, characterId: null });
    }
    return NextResponse.json({ error: 'Could not load character.' }, { status: 500 });
  }
  const characterId = data?.profile_character_id || null;
  // Never echo a stored value that is not a real roster character.
  return NextResponse.json({ ok: true, characterId: isCharacterId(characterId) ? characterId : null });
});
