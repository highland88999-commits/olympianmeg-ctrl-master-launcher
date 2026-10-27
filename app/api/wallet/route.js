// app/api/wallet/route.js
// GET /api/wallet — the signed-in user's wallet summary + recent activity.
// Auth: Bearer <supabase access_token>. Users see ONLY their own wallet.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireUser } from '@/lib/wallet/server';
import { getOrCreateWallet, availableCents } from '@/lib/wallet/ledger';
import { getLockInfo } from '@/lib/wallet/lock';
import { getOrCreateCreditBalance } from '@/lib/billboards/credit';

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The wallet service is not connected yet.');
  const user = await requireUser(req, admin);

  const wallet = await getOrCreateWallet(admin, user.id);
  const lock = await getLockInfo(admin, new Date());
  const { data: recent } = await admin
    .from('wallet_transactions')
    .select('id, kind, amount_cents, program, reason, balance_after_cents, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  // CAD credit for services (billboard ads) — a SEPARATE balance from
  // the earnings wallet above and from gold/aether. Missing tables
  // answer ready:false (the wallet shows "being set up"), never an error.
  let credit = { balance_cents: 0, currency: 'cad', ready: false };
  try {
    const row = await getOrCreateCreditBalance(admin, user.id);
    credit = { balance_cents: Math.round(Number(row.balance_cents) || 0), currency: 'cad', ready: true };
  } catch {
    credit = { balance_cents: 0, currency: 'cad', ready: false };
  }

  return Response.json({
    ok: true,
    wallet: {
      balance_cents: wallet.balance_cents,
      held_cents: wallet.held_cents,
      available_cents: availableCents(wallet),
      currency: wallet.currency,
      payout_destination_set: !!String(wallet.payout_destination || '').trim(),
    },
    credit,
    lock,
    recent: recent || [],
  });
});
