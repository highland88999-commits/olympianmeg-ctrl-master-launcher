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
import { isCharacterId } from '@/lib/characters/roster';
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
  const type = body?.type;
  if (!PROFILE_TYPES.includes(type)) {
    return NextResponse.json({ error: 'type must be personal or business.' }, { status: 400 });
  }
  const v = validateProfileUpdate(body || {});
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Profiles are not connected yet.' }, { status: 503 });

  // TikTok handle belongs on the PERSONAL row only — never store it on
  // the business row, and never let a business-tab save clear it.
  let tiktokHandle = null;
  let tiktokSent = false;
  if (type === 'personal' && 'tiktok_handle' in v.value) {
    tiktokHandle = v.value.tiktok_handle;
    tiktokSent = true;
  }
  delete v.value.tiktok_handle;

  // Preferred language belongs on the PERSONAL row only, same as the
  // TikTok handle — never store it on the business row, and never let
  // a business-tab save clear it.
  let preferredLanguage = null;
  let langSent = false;
  if (type === 'personal' && 'preferred_language' in v.value) {
    preferredLanguage = v.value.preferred_language;
    langSent = true;
  }
  delete v.value.preferred_language;

  // Profile character belongs on the PERSONAL row only, same rule.
  // Roster membership is enforced here (validation only checks the
  // id's shape): an id that is not a real platform character is a 400,
  // never a silent store.
  let profileCharacterId = null;
  let characterSent = false;
  if (type === 'personal' && 'profile_character_id' in v.value) {
    profileCharacterId = v.value.profile_character_id;
    characterSent = true;
    if (profileCharacterId !== null && !isCharacterId(profileCharacterId)) {
      return NextResponse.json({ error: 'Unknown character.' }, { status: 400 });
    }
  }
  delete v.value.profile_character_id;

  // Username changes must stay unique across all users.
  if (v.value.username) {
    const { data: clash } = await admin
      .from('user_profiles')
      .select('id, user_id')
      .eq('username', v.value.username)
      .maybeSingle();
    if (clash && clash.user_id !== auth.user.id) {
      return NextResponse.json({ error: 'That username is taken.' }, { status: 409 });
    }
    // Keep both of the user's profiles on the same username so /u/<name>
    // always resolves to them.
    await admin
      .from('user_profiles')
      .update({ username: v.value.username })
      .eq('user_id', auth.user.id);
    delete v.value.username;
  }

  const { data, error } = await admin
    .from('user_profiles')
    .update(v.value)
    .eq('user_id', auth.user.id)
    .eq('type', type)
    .select('*')
    .single();
  if (error) throw error;

  // TikTok handle, written defensively: the 20261004_tiktok_handle migration
  // has NOT run yet, so the column may not exist. Write it separately so a
  // missing column (Postgres 42703) can never fail the rest of the profile
  // save; the handle lands once Merlin green-lights the migration.
  if (tiktokSent) {
    const { error: tErr } = await admin
      .from('user_profiles')
      .update({ tiktok_handle: tiktokHandle })
      .eq('user_id', auth.user.id)
      .eq('type', 'personal');
    if (tErr && tErr.code !== '42703') throw tErr;
    // 42703 = column missing: skip the handle, keep the saved profile.
  }

  // Preferred language, written defensively: the 20261004_preferred_language
  // migration has NOT run yet, so the column may not exist. Same 42703
  // tolerance as the TikTok handle — the language lands once Merlin
  // green-lights the migration. localStorage stays the fallback meanwhile.
  if (langSent) {
    const { error: lErr } = await admin
      .from('user_profiles')
      .update({ preferred_language: preferredLanguage })
      .eq('user_id', auth.user.id)
      .eq('type', 'personal');
    if (lErr && lErr.code !== '42703') throw lErr;
  }

  // Profile character, written defensively: the 20261013_profile_character
  // migration has NOT run yet, so the column may not exist. Same
  // tolerance as the TikTok handle (42703, plus PostgREST's PGRST204
  // schema-cache code) — the pick lands once Merlin green-lights the
  // migration; the client keeps it in localStorage meanwhile and is
  // told honestly via `persisted` whether the account row took it.
  let characterPersisted = null;
  if (characterSent) {
    const { error: cErr } = await admin
      .from('user_profiles')
      .update({ profile_character_id: profileCharacterId })
      .eq('user_id', auth.user.id)
      .eq('type', 'personal');
    if (cErr && cErr.code !== '42703' && cErr.code !== 'PGRST204') throw cErr;
    characterPersisted = !cErr;
  }
  return NextResponse.json({
    ok: true,
    profile: data,
    ...(characterSent
      ? { profileCharacter: { id: profileCharacterId, persisted: characterPersisted } }
      : {}),
  });
});
