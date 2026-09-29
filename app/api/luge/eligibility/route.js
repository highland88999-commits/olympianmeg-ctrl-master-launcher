// app/api/luge/eligibility/route.js
// GET /api/luge/eligibility
//   -> { ok, provisioned, eligible, coursesCompleted, coursesTotal,
//        missingCourses, premiumOwned, premiumTotal, arsenalComplete,
//        alreadyRedeemed }
//
// Server-side truth for the free-hoodie reward: the rider is eligible only
// when they have completed EVERY course (recorded by /api/luge/complete,
// deployment-forward, no backfills) AND own every premium sled. Nothing is
// trusted from the client. When the tables are not provisioned yet, the
// route says so honestly instead of inventing progress.
import { getAdminClient, getUserFromRequest, jsonError } from '../_server.js';
import { courseCompletionStatus, ownsArsenal, LUGE_PREMIUM_COUNT } from '@/lib/luge/logic.js';

function tableMissing(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist/i.test(msg);
}

const NOT_PROVISIONED = {
  ok: true,
  provisioned: false,
  eligible: false,
  coursesCompleted: 0,
  coursesTotal: 20,
  missingCourses: [],
  premiumOwned: 0,
  premiumTotal: LUGE_PREMIUM_COUNT,
  arsenalComplete: false,
  alreadyRedeemed: false,
  notice: 'Reward tracking is not connected yet. Your runs will count once it is — nothing is lost.',
};

export async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return jsonError(auth.error, auth.status);
  const { user } = auth;

  let supabase;
  try {
    supabase = getAdminClient();
  } catch {
    return Response.json(NOT_PROVISIONED);
  }

  const { data: completions, error: compError } = await supabase
    .from('luge_course_completions')
    .select('course_id')
    .eq('user_id', user.id);
  if (compError) {
    if (tableMissing(compError)) return Response.json(NOT_PROVISIONED);
    console.error('Luge eligibility completions error:', compError.message);
    return jsonError('Could not check your progress. Try again.', 500);
  }

  const { data: owned, error: invError } = await supabase
    .from('luge_inventory')
    .select('sled_id')
    .eq('user_id', user.id);
  if (invError) {
    if (tableMissing(invError)) return Response.json(NOT_PROVISIONED);
    console.error('Luge eligibility inventory error:', invError.message);
    return jsonError('Could not check your garage. Try again.', 500);
  }

  const { data: existing, error: redError } = await supabase
    .from('luge_redemptions')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (redError) {
    if (tableMissing(redError)) return Response.json(NOT_PROVISIONED);
    console.error('Luge eligibility redemption error:', redError.message);
    return jsonError('Could not check your claim status. Try again.', 500);
  }

  const ownedIds = (owned || []).map((r) => r.sled_id);
  const courses = courseCompletionStatus((completions || []).map((r) => r.course_id));
  const arsenalComplete = ownsArsenal(ownedIds);
  const alreadyRedeemed = !!existing;

  return Response.json({
    ok: true,
    provisioned: true,
    eligible: courses.complete && arsenalComplete && !alreadyRedeemed,
    coursesCompleted: courses.completed,
    coursesTotal: courses.total,
    missingCourses: courses.missing,
    premiumOwned: new Set(ownedIds).size,
    premiumTotal: LUGE_PREMIUM_COUNT,
    arsenalComplete,
    alreadyRedeemed,
  });
}
