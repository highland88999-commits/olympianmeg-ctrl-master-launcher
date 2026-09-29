// app/api/luge/complete/route.js
// POST /api/luge/complete { courseId, runMs, sledId }
//   -> { ok, courseId, completed, total }
//
// Records a course completion server-side. Anti-cheat: the run is validated
// against the game's own physics (minimum possible run time), the course
// must exist, and a premium sled must actually be owned. A client flag
// alone never records a completion. Replays are harmless (first completion
// stands). Only runs from deployment forward are recorded — nothing is
// ever backfilled.
import { getAdminClient, getUserFromRequest, jsonError } from '../_server.js';
import { validateRun, courseCompletionStatus } from '@/lib/luge/logic.js';

function tableMissing(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist/i.test(msg);
}

export async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return jsonError(auth.error, auth.status);
  const { user } = auth;

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid request.', 400);
  }
  const courseId = Number(body?.courseId);
  const runMs = Number(body?.runMs);
  const sledId = typeof body?.sledId === 'string' ? body.sledId : '';

  let supabase;
  try {
    supabase = getAdminClient();
  } catch {
    return jsonError('Progress tracking is not connected yet. Your run still happened — try again later.', 503);
  }

  const { data: owned, error: invError } = await supabase
    .from('luge_inventory')
    .select('sled_id')
    .eq('user_id', user.id);
  if (invError && !tableMissing(invError)) {
    console.error('Luge complete inventory error:', invError.message);
    return jsonError('Could not check your garage. Try again.', 500);
  }

  const check = validateRun({
    courseId,
    runMs,
    sledId,
    ownedSledIds: (owned || []).map((r) => r.sled_id),
  });
  if (!check.ok) return jsonError(check.error, check.status);

  const { error: insertError } = await supabase
    .from('luge_course_completions')
    .upsert(
      {
        user_id: user.id,
        course_id: check.course.id,
        run_seconds: runMs / 1000,
      },
      { onConflict: 'user_id,course_id', ignoreDuplicates: true }
    );
  if (insertError) {
    if (tableMissing(insertError)) {
      return jsonError('Progress tracking is not connected yet. Your run still happened — try again later.', 503);
    }
    console.error('Luge complete insert error:', insertError.message);
    return jsonError('Could not record your run. Try again.', 500);
  }

  const { data: completions, error: compError } = await supabase
    .from('luge_course_completions')
    .select('course_id')
    .eq('user_id', user.id);
  if (compError) {
    console.error('Luge complete readback error:', compError.message);
    return jsonError('Run recorded, but progress could not be read back.', 500);
  }

  const status = courseCompletionStatus((completions || []).map((r) => r.course_id));
  return Response.json({
    ok: true,
    courseId: check.course.id,
    completed: status.completed,
    total: status.total,
  });
}
