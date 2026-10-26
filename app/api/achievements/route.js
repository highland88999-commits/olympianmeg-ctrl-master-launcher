// app/api/achievements/route.js
// GET -> the achievements ledger: every Vecna Slayer milestone plus every
// generic achievement, newest first. Also returns the caller's user id when
// signed in so clients can highlight "mine".
// Query: ?mine=1 -> only the signed-in caller's rows (used by the
// Notifications panel's ACHIEVEMENTS section). Unsigned + mine=1 returns
// empty lists, never another account's rows.
// Response: { ok, myUserId, milestones: [...], achievements: [...] }
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The achievement service is not connected yet.');
  const auth = await getUserFromRequest(req);
  const mine = new URL(req.url).searchParams.get('mine') === '1';
  if (mine && auth.error) {
    return Response.json({ ok: true, myUserId: null, milestones: [], achievements: [] });
  }

  const msQuery = admin
    .from('vecna_slayer_milestones')
    .select('user_id, milestone, kill_number, status, awarded_at')
    .order('kill_number', { ascending: true });
  const achQuery = admin
    .from('user_achievements')
    .select('user_id, key, title, metadata, awarded_at')
    .order('awarded_at', { ascending: false })
    .limit(200);
  if (mine) {
    msQuery.eq('user_id', auth.user.id);
    achQuery.eq('user_id', auth.user.id);
  }
  const [ms, ach] = await Promise.all([msQuery, achQuery]);
  if (ms.error && ms.error.code !== '42P01') throw ms.error;
  if (ach.error && ach.error.code !== '42P01') throw ach.error;

  return Response.json({
    ok: true,
    myUserId: auth.error ? null : auth.user.id,
    milestones: ms.data || [],
    achievements: ach.data || [],
  });
});
