// app/api/trifold/connect/status/route.js
// GET /api/trifold/connect/status  (buddy only)
//   -> { ok, onboarded, account_id }
//
// Reads Devan's Stripe Express account and reports whether it can actually
// receive money (charges_enabled && payouts_enabled). Persists the result
// to trifold_settings.connect_onboarded (best-effort pre-migration).
export const dynamic = 'force-dynamic';

import Stripe from 'stripe';
import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireBuddy } from '@/lib/trifold/server';

export const GET = apiGuard(async function GET(req) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Card payments are not configured yet.');
  const admin = await getServiceClient();
  if (!admin) throw new Error('The newsletter service is not connected yet.');
  await requireBuddy(req, admin);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  let accountId = (process.env.STRIPE_DEVAN_ACCOUNT_ID || '').trim();
  if (!accountId) {
    try {
      const { data, error } = await admin
        .from('trifold_settings')
        .select('connect_account_id')
        .eq('id', 1)
        .maybeSingle();
      if (!error) accountId = String(data?.connect_account_id || '').trim();
    } catch {
      /* pre-migration — fall through to not-onboarded */
    }
  }
  if (!accountId) return Response.json({ ok: true, onboarded: false, account_id: '' });

  const account = await stripe.accounts.retrieve(accountId);
  const onboarded = !!(account.charges_enabled && account.payouts_enabled);

  // Persist for the studio to read without hitting Stripe every time.
  await admin.from('trifold_settings').update({ connect_onboarded: onboarded }).eq('id', 1);

  return Response.json({ ok: true, onboarded, account_id: accountId });
});
