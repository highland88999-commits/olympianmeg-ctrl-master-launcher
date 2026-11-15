// app/api/ghost-rider/incinerations/route.js
// The chain's burn records (Merlin, 2026-11-15): every chain use
// that lands leaves a shared record, so the victim's client can
// see it and respawn in the Lake of Fire. GET ?realm=hades ->
// the realm's incinerations, newest first. POST -> record one
// use's incineration (the server verifies the caller is signed
// in and is not burning themself — the 3-use + 1-hour cooldown
// itself lives in the backpack on the device, lib/ghost-rider/
// chain.js, and is NOT enforced here; a server chain table is
// the follow-up if Merlin wants it cross-device). Requires
// supabase/ghost-rider.sql.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { sanitizeIncineration } from '@/lib/ghost-rider/chain';
import { sanitizeLabel } from '@/lib/presence';

function isMissingTable(error) {
  if (!error) return false;
  return error.code === '42P01' || /relation .* does not exist/i.test(String(error.message || ''));
}

function cleanName(raw) {
  return sanitizeLabel(typeof raw === 'string' ? raw : '');
}

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The Ghost Rider service is not connected yet.');
  const realm = new URL(req.url).searchParams.get('realm') || 'hades';
  const { data, error } = await admin
    .from('ghost_rider_incinerations')
    .select('id, victim_user_id, victim_name, victim_kind, chainer_user_id, chainer_name, realm, x, y, z, created_at')
    .eq('realm', realm)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingTable(error)) {
      return Response.json({ ok: false, error: 'The Ghost Rider service is not live yet — the tables are staged, not run.' }, { status: 503 });
    }
    throw error;
  }
  return Response.json({ ok: true, incinerations: (data || []).map(sanitizeIncineration).filter(Boolean) });
});

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The Ghost Rider service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to burn a foe with the chain.' }, { status: 401 });
  }
  let body = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const wanted = Array.isArray(body.incinerations) ? body.incinerations : [];
  if (wanted.length === 0) {
    return Response.json({ ok: false, error: 'No incineration to record.' }, { status: 400 });
  }
  const rows = [];
  for (const s of wanted) {
    if (!s || typeof s !== 'object') continue;
    const x = Number(s.x);
    const z = Number(s.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    // No self-burning: the chain never targets its holder, and the
    // server drops any self-record that slips through.
    if (s.victim_kind !== 'npc' && s.victim_user_id && String(s.victim_user_id) === auth.user.id) continue;
    rows.push({
      victim_user_id: s.victim_user_id != null ? String(s.victim_user_id) : null,
      victim_name: cleanName(s.victim_name),
      victim_kind: s.victim_kind === 'npc' ? 'npc' : 'user',
      chainer_user_id: auth.user.id,
      chainer_name: cleanName(s.chainer_name),
      realm: typeof s.realm === 'string' ? s.realm.slice(0, 60) : 'hades',
      x,
      y: 0,
      z,
    });
  }
  if (rows.length === 0) {
    return Response.json({ ok: false, error: 'No incineration to record.' }, { status: 400 });
  }
  const { data, error } = await admin.from('ghost_rider_incinerations').insert(rows).select();
  if (error) {
    if (isMissingTable(error)) {
      return Response.json({ ok: false, error: 'The Ghost Rider service is not live yet — the tables are staged, not run.' }, { status: 503 });
    }
    throw error;
  }
  return Response.json({ ok: true, incinerations: (data || []).map(sanitizeIncineration).filter(Boolean) });
});
