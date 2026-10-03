// app/api/affiliates/overview/route.js
// GET -> the signed-in user's affiliate dashboard data. Service-role reads
// scoped server-side to the logged-in user (aff_commissions has no public
// policies). LEDGER ONLY — balances accrue here; payouts are a later phase.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { isAffiliateOwner } from '@/lib/affiliates/server';
import { AFF_MIN_PAYOUT_CENTS, payoutProgress, formatCents, walletSummary } from '@/lib/affiliates';

const SOURCE_LABELS = {
  tickets: 'PerSymphony tickets',
  store: 'Store',
  hermes: 'HERMES listings',
  luge: 'Luge arsenal',
  persephone: 'Persephone',
  gallery: 'Gallery credits',
  fortress: 'Fortress storage',
  'world-engine': 'World Engine',
  art: 'Art sales',
};

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The affiliate service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to view your affiliate dashboard.' }, { status: 401 });
  }
  const userId = auth.user.id;

  const { data: codeRow, error: cErr } = await admin
    .from('aff_codes')
    .select('code')
    .eq('user_id', userId)
    .maybeSingle();
  if (cErr) {
    if (cErr.code === '42P01') throw new Error('The affiliate service is not connected yet.');
    throw cErr;
  }

  let referredCount = 0;
  let commissions = [];
  if (codeRow?.code) {
    const { count, error: rErr } = await admin
      .from('aff_referrals')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_user_id', userId);
    if (rErr) throw rErr;
    referredCount = count || 0;

    const { data: rows, error: mErr } = await admin
      .from('aff_commissions')
      .select('source, source_id, purchase_net_cents, house_margin_cents, commission_cents, status, created_at')
      .eq('affiliate_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (mErr) throw mErr;
    commissions = (rows || []).map((r) => ({
      ...r,
      source_label: SOURCE_LABELS[r.source] || r.source,
      commission_display: formatCents(r.commission_cents),
    }));
  }

  // Wallet view over the ledger (pure helper — balance = accrued only;
  // pending_cost rows never inflate it).
  const { balance_cents, lifetime_cents, paid_cents, pending_count } = walletSummary(commissions);
  const progress = payoutProgress({ balance_cents });
  const origin = new URL(req.url).origin;

  return Response.json({
    ok: true,
    is_affiliate: !!codeRow?.code,
    is_owner: isAffiliateOwner(auth.user),
    code: codeRow?.code || null,
    link: codeRow?.code ? `${origin}/?ref=${encodeURIComponent(codeRow.code)}` : null,
    referred_count: referredCount,
    balance_cents,
    balance_display: formatCents(balance_cents),
    lifetime_cents,
    lifetime_display: formatCents(lifetime_cents),
    paid_cents,
    paid_display: formatCents(paid_cents),
    pending_count,
    threshold: { ...progress, threshold_display: formatCents(AFF_MIN_PAYOUT_CENTS) },
    commissions,
  });
});
