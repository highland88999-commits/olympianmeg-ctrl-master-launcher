// app/api/medusa/statues/route.js
// The permanent statues (Merlin, 2026-11-15): every petrify
// leaves a solid monument where the head was used, visible to
// everyone. GET ?realm=hades -> the realm's statues, newest
// first. POST -> record one use's statues (the server verifies
// the caller holds the head and enforces their victims-per-use
// from the stored upgrade level — the client never self-grants
// a wider gaze). The use counter on medusa_heads rises with
// every recorded statue. Requires supabase/medusa.sql.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { victimsPerUse } from '@/lib/nether-realm/medusa';
import { sanitizeLabel } from '@/lib/presence';

function isMissingTable(error) {
  if (!error) return false;
  return error.code === '42P01' || /relation .* does not exist/i.test(String(error.message || ''));
}

function cleanName(raw) {
  return sanitizeLabel(typeof raw === 'string' ? raw : '');
}

function cleanAppearance(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  if (typeof raw.color === 'string') out.color = raw.color.slice(0, 16);
  if (typeof raw.characterId === 'string') out.characterId = raw.characterId.slice(0, 80);
  return out;
}

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The Medusa service is not connected yet.');
  const realm = new URL(req.url).searchParams.get('realm') || 'hades';
  const { data, error } = await admin
    .from('medusa_statues')
    .select('id, victim_user_id, victim_name, victim_appearance, petrifier_user_id, petrifier_name, realm, x, y, z, created_at')
    .eq('realm', realm)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    if (isMissingTable(error)) {
      return Response.json({ ok: false, error: 'The Medusa service is not live yet — the tables are staged, not run.' }, { status: 503 });
    }
    throw error;
  }
  return Response.json({ ok: true, statues: data || [] });
});

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The Medusa service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to turn foes to stone.' }, { status: 401 });
  }
  let body = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const wanted = Array.isArray(body.statues) ? body.statues : [];
  if (wanted.length === 0) {
    return Response.json({ ok: false, error: 'No statues to record.' }, { status: 400 });
  }
  // The head row is the authority: no head, no petrify.
  const { data: head, error: headError } = await admin
    .from('medusa_heads')
    .select('user_id, uses, upgrade_level')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (headError) {
    if (isMissingTable(headError)) {
      return Response.json({ ok: false, error: 'The Medusa service is not live yet — the tables are staged, not run.' }, { status: 503 });
    }
    throw headError;
  }
  if (!head) {
    return Response.json({ ok: false, error: 'You don’t hold her head yet — cut it off in her lair first.' }, { status: 403 });
  }
  const allowed = victimsPerUse(head.upgrade_level || 0);
  if (wanted.length > allowed) {
    return Response.json({ ok: false, error: `The head gazes at ${allowed} at once — your upgrade level allows no more.` }, { status: 400 });
  }
  const rows = [];
  for (const s of wanted) {
    if (!s || typeof s !== 'object') continue;
    const x = Number(s.x);
    const z = Number(s.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    // No self-petrify: the cone never targets the holder, and the
    // server drops any self-record that slips through.
    if (s.victim_user_id && String(s.victim_user_id) === auth.user.id) continue;
    rows.push({
      victim_user_id: s.victim_user_id != null ? String(s.victim_user_id) : null,
      victim_name: cleanName(s.victim_name),
      victim_appearance: cleanAppearance(s.victim_appearance),
      petrifier_user_id: auth.user.id,
      petrifier_name: cleanName(s.petrifier_name),
      realm: 'hades',
      x,
      y: 0,
      z,
    });
  }
  if (rows.length === 0) {
    return Response.json({ ok: false, error: 'No statues to record.' }, { status: 400 });
  }
  const { data, error } = await admin.from('medusa_statues').insert(rows).select();
  if (error) {
    if (isMissingTable(error)) {
      return Response.json({ ok: false, error: 'The Medusa service is not live yet — the tables are staged, not run.' }, { status: 503 });
    }
    throw error;
  }
  // The use counter rises with every recorded statue.
  try {
    await admin
      .from('medusa_heads')
      .update({ uses: (head.uses || 0) + rows.length })
      .eq('user_id', auth.user.id);
  } catch { /* the statues stand either way */ }
  return Response.json({ ok: true, statues: data || [] });
});
