// app/api/creator/listings/route.js
// GET /api/creator/listings — my active listings with prices.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireUser } from '@/lib/wallet/server';

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The wallet service is not connected yet.');
  const user = await requireUser(req, admin);

  const { data, error } = await admin
    .from('creator_listings')
    .select('id, item_type, item_id, item_label, price_cents, currency, status, created_at')
    .eq('creator_user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load listings: ${error.message}`);

  return Response.json({ ok: true, listings: data || [] });
});
