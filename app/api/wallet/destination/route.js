// app/api/wallet/destination/route.js
// POST /api/wallet/destination { payout_destination }
// The user saves where autonomous payouts go (their Stripe Connect
// account id). Stored service-side; the UI shows a label only.
// Required before a withdrawal can join the automatic Christmas queue.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireUser } from '@/lib/wallet/server';
import { getOrCreateWallet } from '@/lib/wallet/ledger';

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The wallet service is not connected yet.');
  const user = await requireUser(req, admin);

  let body = {};
  try { body = await req.json(); } catch { /* validation below */ }
  const destination = String(body.payout_destination || '').trim().slice(0, 128);

  const wallet = await getOrCreateWallet(admin, user.id);
  const { error } = await admin
    .from('wallets')
    .update({ payout_destination: destination })
    .eq('id', wallet.id);
  if (error) throw new Error(`Could not save the payout destination: ${error.message}`);

  const masked = destination
    ? `${destination.slice(0, 4)}…${destination.slice(-4)}`
    : '';
  return Response.json({ ok: true, saved: !!destination, masked });
});
