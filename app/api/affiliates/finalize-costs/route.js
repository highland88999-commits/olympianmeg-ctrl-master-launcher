// app/api/affiliates/finalize-costs/route.js
// POST -> flip 'pending_cost' commissions to 'accrued' for a product_key
// whose true cost has landed. Merlin-only (it mutates money math).
// Body: { product_key: 'pf:474601990:L' } — or { all: true } to sweep every
// product_key that has both pending rows and a cost row.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { finalizePendingCosts, isAffiliateOwner } from '@/lib/affiliates/server';
import { getStoredCost } from '@/lib/affiliates/costs';

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The affiliate service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error || !isAffiliateOwner(auth.user)) {
    return Response.json({ ok: false, error: 'Not found.' }, { status: 404 });
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }

  // Which product keys have pending rows?
  let keys = [];
  if (body.all) {
    const { data, error } = await admin
      .from('aff_commissions')
      .select('product_key')
      .eq('status', 'pending_cost')
      .not('product_key', 'is', null)
      .limit(1000);
    if (error) throw error;
    keys = [...new Set((data || []).map((r) => r.product_key).filter(Boolean))];
  } else if (body.product_key) {
    keys = [String(body.product_key)];
  } else {
    return Response.json({ ok: false, error: 'Provide product_key or { all: true }.' }, { status: 400 });
  }

  let finalized = 0;
  const perKey = {};
  for (const key of keys) {
    // eslint-disable-next-line no-await-in-loop
    const r = await finalizePendingCosts(admin, {
      product_key: key,
      getCost: async () => {
        const stored = await getStoredCost(admin, { surface: 'store', product_key: key });
        return stored ? stored.cost_cents : null;
      },
    });
    perKey[key] = r.finalized;
    finalized += r.finalized;
  }
  return Response.json({ ok: true, finalized, perKey });
});
