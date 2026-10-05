// app/api/wallet/withdrawals/route.js
// GET /api/wallet/withdrawals — the user's own withdrawal history,
// every entry timestamped.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireUser } from '@/lib/wallet/server';

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The wallet service is not connected yet.');
  const user = await requireUser(req, admin);

  const { data, error } = await admin
    .from('wallet_withdrawals')
    .select('id, amount_cents, status, destination_label, note, created_at, processed_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(`Could not load withdrawals: ${error.message}`);
  return Response.json({ ok: true, withdrawals: data || [] });
});
