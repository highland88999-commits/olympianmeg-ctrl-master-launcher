// app/api/hawkins/vecna-kill/route.js
// POST -> record a Vecna kill for the signed-in user (atomic via
// public.record_vecna_kill).
// Response: { ok, killNumber, milestone } where milestone is null or the
// awarded milestone { key, title, videoPrompt }.
// Requires the vecna_slayer_achievements.sql migration to be applied.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { VECNA_MILESTONES } from '@/lib/hawkins/vecna-slayer';

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The achievement service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to record Vecna kills.' }, { status: 401 });
  }

  // Peek the next kill number cheaply to decide the milestone client-side;
  // the function itself assigns the authoritative number atomically.
  const { data: top } = await admin
    .from('vecna_kills')
    .select('kill_number')
    .order('kill_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (top === undefined) throw new Error('The achievement service is not connected yet.');

  const prompts = Object.fromEntries(
    Object.entries(VECNA_MILESTONES).map(([k, m]) => [k, m.videoPrompt])
  );
  const { data, error } = await admin.rpc('record_vecna_kill', {
    p_user_id: auth.user.id,
    p_prompts: prompts,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;

  // The guess can lose a race; only report the milestone the DB awarded.
  const awardedKey = row?.awarded_milestone || null;
  const awarded = awardedKey
    ? { key: awardedKey, title: VECNA_MILESTONES[awardedKey].title, videoPrompt: VECNA_MILESTONES[awardedKey].videoPrompt }
    : null;

  return Response.json({ ok: true, killNumber: row?.kill_number, milestone: awarded });
});
