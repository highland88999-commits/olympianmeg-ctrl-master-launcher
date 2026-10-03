// app/api/connect/status/route.js
// GET -> the signed-in user's payout account status + transaction history.
// Service-role reads scoped server-side to the logged-in user (the
// connect_* tables have no public policies). Never leaks another user's data.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getConnectState } from '@/lib/connect/server';
import { connectStatusLabel, formatCents } from '@/lib/connect';

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The payout service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to view payout status.' }, { status: 401 });
  }
  const userId = auth.user.id;

  const state = await getConnectState(admin, userId);
  let payouts = [];
  if (state.tables) {
    const { data, error } = await admin
      .from('connect_payouts')
      .select('kind, amount_cents, currency, status, created_at')
      .eq('payee_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    payouts = (data || []).map((p) => ({
      ...p,
      amount_display: formatCents(p.amount_cents),
    }));
  }

  return Response.json({
    ok: true,
    connect_status: state.status,
    connect_label: connectStatusLabel(state.status),
    connect_ready: state.status === 'ready',
    tables: state.tables,
    payouts,
  });
});
