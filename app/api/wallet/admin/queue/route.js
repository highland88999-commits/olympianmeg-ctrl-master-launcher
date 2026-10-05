// app/api/wallet/admin/queue/route.js
// GET /api/wallet/admin/queue — Merlin's payout queue: every withdrawal in
// requested/processing, oldest first. Merlin-only (no-leak rule).
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireOwner, emailForUserId } from '@/lib/wallet/server';

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The wallet service is not connected yet.');
  await requireOwner(req, admin);

  const { data, error } = await admin
    .from('wallet_withdrawals')
    .select('id, user_id, amount_cents, status, destination_label, note, created_at')
    .in('status', ['requested', 'processing'])
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw new Error(`Could not load queue: ${error.message}`);

  const items = [];
  for (const w of data || []) {
    items.push({ ...w, user_email: await emailForUserId(admin, w.user_id) });
  }
  return Response.json({ ok: true, queue: items });
});
