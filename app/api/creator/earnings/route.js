// app/api/creator/earnings/route.js
// GET /api/creator/earnings — my creator sales: totals + per-sale history.
// Reads the creator_sales rows written by the sale settlement
// (lib/creator/ledger.js creditCreatorSale).
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireUser } from '@/lib/wallet/server';

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The wallet service is not connected yet.');
  const user = await requireUser(req, admin);

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));

  const { data: sales, error } = await admin
    .from('creator_sales')
    .select(
      'id, listing_id, gross_cents, stripe_fee_cents, platform_fee_cents, net_cents, item_label, created_at'
    )
    .eq('seller_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load earnings: ${error.message}`);

  const rows = sales || [];
  const totals = rows.reduce(
    (t, r) => ({
      gross_cents: t.gross_cents + (Number(r.gross_cents) || 0),
      stripe_fee_cents: t.stripe_fee_cents + (Number(r.stripe_fee_cents) || 0),
      platform_fee_cents: t.platform_fee_cents + (Number(r.platform_fee_cents) || 0),
      net_cents: t.net_cents + (Number(r.net_cents) || 0),
      count: t.count + 1,
    }),
    { gross_cents: 0, stripe_fee_cents: 0, platform_fee_cents: 0, net_cents: 0, count: 0 }
  );

  return Response.json({ ok: true, totals, sales: rows });
});
