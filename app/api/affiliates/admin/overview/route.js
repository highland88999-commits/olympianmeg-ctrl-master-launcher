// app/api/affiliates/admin/overview/route.js
// GET -> every affiliate's wallet + the house's total outstanding liability.
// MERLIN ONLY. Returns 404 for anyone else (the no-leak rule: no user ever
// sees another affiliate's balance).
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { isAffiliateOwner, AFF_OWNER_EMAIL } from '@/lib/affiliates/server';
import { formatCents } from '@/lib/affiliates';

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The affiliate service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error || !isAffiliateOwner(auth.user)) {
    return Response.json({ ok: false, error: 'Not found.' }, { status: 404 });
  }

  const { data: codes, error: cErr } = await admin
    .from('aff_codes')
    .select('code, user_id, created_at')
    .order('created_at', { ascending: true })
    .limit(2000);
  if (cErr) {
    if (cErr.code === '42P01') throw new Error('The affiliate service is not connected yet.');
    throw cErr;
  }

  const { data: commissions, error: mErr } = await admin
    .from('aff_commissions')
    .select('affiliate_user_id, commission_cents, status')
    .limit(20000);
  if (mErr) throw mErr;

  const { data: referrals, error: rErr } = await admin
    .from('aff_referrals')
    .select('affiliate_user_id')
    .limit(20000);
  if (rErr) throw rErr;

  const byUser = new Map();
  for (const c of codes || []) {
    byUser.set(c.user_id, {
      user_id: c.user_id,
      code: c.code,
      since: c.created_at,
      referred_count: 0,
      accrued_cents: 0,
      pending_count: 0,
      lifetime_cents: 0,
      paid_cents: 0,
    });
  }
  for (const r of referrals || []) {
    const row = byUser.get(r.affiliate_user_id);
    if (row) row.referred_count++;
  }
  for (const m of commissions || []) {
    const row = byUser.get(m.affiliate_user_id);
    if (!row) continue;
    if (m.status === 'accrued') {
      row.accrued_cents += m.commission_cents;
      row.lifetime_cents += m.commission_cents;
    } else if (m.status === 'paid') {
      row.paid_cents += m.commission_cents;
      row.lifetime_cents += m.commission_cents;
    } else if (m.status === 'pending_cost') {
      row.pending_count++;
    }
  }

  // Resolve emails for identification (owner-only data). Page through the
  // user list until every affiliate is identified or the list is exhausted.
  const emails = new Map();
  for (let page = 1; page <= 40 && emails.size < byUser.size; page++) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 100, page });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (byUser.has(u.id) && !emails.has(u.id)) emails.set(u.id, u.email || '');
    }
    if (data.users.length < 100) break;
  }

  const affiliates = [...byUser.values()].map((r) => ({
    ...r,
    email: emails.get(r.user_id) || '',
    accrued_display: formatCents(r.accrued_cents),
    lifetime_display: formatCents(r.lifetime_cents),
    paid_display: formatCents(r.paid_cents),
  }));

  const total_liability_cents = affiliates.reduce((s, r) => s + r.accrued_cents, 0);
  const total_pending = affiliates.reduce((s, r) => s + r.pending_count, 0);

  return Response.json({
    ok: true,
    owner: AFF_OWNER_EMAIL,
    affiliate_count: affiliates.length,
    total_liability_cents,
    total_liability_display: formatCents(total_liability_cents),
    total_pending_count: total_pending,
    affiliates: affiliates.sort((a, b) => b.accrued_cents - a.accrued_cents),
  });
});
