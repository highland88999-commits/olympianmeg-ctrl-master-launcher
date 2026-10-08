// app/api/achievements/award/route.js
// POST -> award a generic achievement to the signed-in user (idempotent).
// Body: { key, lessonIds? } — for 'olympian-scholar' the server verifies all
// 12 curriculum lesson IDs are present.
// Response: { ok, awarded } (awarded=false when already held).
// Requires the user_achievements.sql migration to be applied.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getAchievement } from '@/lib/achievements/catalog';

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The achievement service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to earn achievements.' }, { status: 401 });
  }

  let body = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const def = getAchievement(body.key);
  if (!def) {
    return Response.json({ ok: false, error: 'Unknown achievement.' }, { status: 400 });
  }

  // Server-side verification per achievement.
  if (body.key === 'olympian-scholar') {
    const have = new Set(Array.isArray(body.lessonIds) ? body.lessonIds : []);
    const missing = def.requiresLessonIds.filter((id) => !have.has(id));
    if (missing.length > 0) {
      return Response.json({ ok: false, error: 'Not all lessons are complete yet.' }, { status: 400 });
    }
  }

  const { error } = await admin.from('user_achievements').insert({
    user_id: auth.user.id,
    key: body.key,
    title: def.title,
    metadata: { description: def.description },
  });
  if (error && error.code !== '23505') throw error;

  return Response.json({ ok: true, awarded: !error, key: body.key, title: def.title });
});
