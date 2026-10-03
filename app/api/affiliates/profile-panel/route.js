// app/api/affiliates/profile-panel/route.js
// GET ?username= -> the affiliate panel for /u/[username], OWNER ONLY.
// Server-side ownership check: the logged-in user's id must own a
// user_profiles row with this username (personal or business). Anyone else
// — including other signed-in users — gets { mine: false } and zero stats.
// The no-leak rule: a viewer never learns whether the profile owner even
// has an affiliate code.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { AFF_MIN_PAYOUT_CENTS, payoutProgress, formatCents } from '@/lib/affiliates';

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) return Response.json({ ok: true, mine: false });
  const auth = await getUserFromRequest(req);
  if (auth.error) return Response.json({ ok: true, mine: false });

  const username = new URL(req.url).searchParams.get('username') || '';
  if (!username) return Response.json({ ok: false, error: 'username required' }, { status: 400 });

  // Ownership: does this username belong to the viewer (any profile type)?
  const { data: owned, error: oErr } = await admin
    .from('user_profiles')
    .select('id')
    .eq('username', username)
    .eq('user_id', auth.user.id)
    .limit(1);
  if (oErr) {
    if (oErr.code === '42P01') return Response.json({ ok: true, mine: false });
    throw oErr;
  }
  if (!owned || owned.length === 0) return Response.json({ ok: true, mine: false });

  // Owner: same shape as /api/affiliates/overview, compact for the panel.
  const { data: codeRow, error: cErr } = await admin
    .from('aff_codes')
    .select('code')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (cErr) throw cErr;

  let referred_count = 0;
  let balance_cents = 0;
  let pending_count = 0;
  if (codeRow?.code) {
    const [{ count }, { data: rows }] = await Promise.all([
      admin.from('aff_referrals').select('id', { count: 'exact', head: true }).eq('affiliate_user_id', auth.user.id),
      admin.from('aff_commissions').select('commission_cents, status').eq('affiliate_user_id', auth.user.id).limit(5000),
    ]);
    referred_count = count || 0;
    for (const r of rows || []) {
      if (r.status === 'accrued') balance_cents += r.commission_cents;
      else if (r.status === 'pending_cost') pending_count++;
    }
  }

  const progress = payoutProgress({ balance_cents });
  const origin = new URL(req.url).origin;
  return Response.json({
    ok: true,
    mine: true,
    is_affiliate: !!codeRow?.code,
    link: codeRow?.code ? `${origin}/?ref=${encodeURIComponent(codeRow.code)}` : null,
    referred_count,
    balance_cents,
    balance_display: formatCents(balance_cents),
    pending_count,
    threshold: { ...progress, threshold_display: formatCents(AFF_MIN_PAYOUT_CENTS) },
  });
});
