// app/api/affiliates/bind/route.js
// POST { code } -> bind the signed-in user to the affiliate who owns the code.
// Server-side only: the client supplies the code string, the server resolves
// the affiliate id and writes the row. First binding wins (unique on
// referred_user_id); self-referral is rejected; unknown codes are rejected.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { normalizeAffiliateCode, isWellFormedAffiliateCode } from '@/lib/affiliates';

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The affiliate service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to complete the referral.' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }
  const code = normalizeAffiliateCode(body.code);
  if (!isWellFormedAffiliateCode(code)) {
    return Response.json({ ok: false, error: 'That referral code is not valid.' }, { status: 400 });
  }

  // Already bound? First binding wins — keep the original.
  const { data: existing, error: exErr } = await admin
    .from('aff_referrals')
    .select('id')
    .eq('referred_user_id', auth.user.id)
    .maybeSingle();
  if (exErr) {
    if (exErr.code === '42P01') throw new Error('The affiliate service is not connected yet.');
    throw exErr;
  }
  if (existing) return Response.json({ ok: true, already: true });

  const { data: codeRow, error: cErr } = await admin
    .from('aff_codes')
    .select('user_id')
    .eq('code', code)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!codeRow?.user_id) {
    return Response.json({ ok: false, error: 'That referral code was not found.' }, { status: 404 });
  }
  if (codeRow.user_id === auth.user.id) {
    return Response.json({ ok: false, error: 'You cannot refer yourself.' }, { status: 400 });
  }

  const { error: insErr } = await admin.from('aff_referrals').insert({
    affiliate_user_id: codeRow.user_id,
    referred_user_id: auth.user.id,
    referred_email: String(auth.user.email || '').toLowerCase(),
    code_used: code,
  });
  if (insErr) {
    // Lost a race: another bind won first — that one stands.
    if (insErr.code === '23505') return Response.json({ ok: true, already: true });
    throw insErr;
  }
  return Response.json({ ok: true, bound: true });
});
