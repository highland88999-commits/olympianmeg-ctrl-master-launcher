// app/api/affiliates/code/route.js
// POST -> mint (or return the existing) affiliate code for the signed-in user.
// Response: { ok, code, link }. The link carries ?ref=CODE to the homepage,
// where the signup panel binds it server-side after account creation.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { makeAffiliateCode } from '@/lib/affiliates';

async function mintUniqueCode(admin, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const code = makeAffiliateCode();
    const { data } = await admin.from('aff_codes').select('code').eq('code', code).limit(1);
    if (!data || data.length === 0) return code;
  }
  throw new Error('Could not mint a unique affiliate code.');
}

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The affiliate service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to become an affiliate.' }, { status: 401 });
  }

  // Idempotent: one code per user, forever.
  const { data: existing, error: exErr } = await admin
    .from('aff_codes')
    .select('code')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (exErr) {
    if (exErr.code === '42P01') throw new Error('The affiliate service is not connected yet.');
    throw exErr;
  }
  let code = existing?.code || null;
  if (!code) {
    code = await mintUniqueCode(admin);
    const { error: insErr } = await admin
      .from('aff_codes')
      .upsert({ code, user_id: auth.user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (insErr) throw insErr;
    // Lost a race: someone else inserted first — read the winner.
    const { data: raced } = await admin
      .from('aff_codes')
      .select('code')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    code = raced?.code || code;
  }

  const origin = new URL(req.url).origin;
  return Response.json({ ok: true, code, link: `${origin}/?ref=${encodeURIComponent(code)}` });
});
