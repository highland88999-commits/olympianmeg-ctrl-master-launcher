// app/api/connect/onboard/route.js
// POST -> start (or resume) Stripe Connect onboarding for the signed-in user.
// Creates an Express connected account on first call, then returns a fresh
// Stripe-hosted onboarding URL every time (links expire; re-calling is the
// refresh path). Body: { kind: 'affiliate'|'performer', next?: '/affiliates' |
// '/persymphony/tickets/dashboard' }.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import {
  getStripe,
  getConnectState,
  upsertConnectAccount,
  createExpressAccount,
  createOnboardingLink,
} from '@/lib/connect/server';

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The payout service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to set up payouts.' }, { status: 401 });
  }
  const stripe = await getStripe();
  if (!stripe) throw new Error('Stripe is not connected yet (STRIPE_SECRET_KEY missing).');

  let body = {};
  try {
    body = await req.json();
  } catch { /* empty body is fine */ }
  const kind = body.kind === 'performer' ? 'performer' : 'affiliate';
  const next = body.next === '/persymphony/tickets/dashboard' ? body.next : '/affiliates';
  const userId = auth.user.id;

  const state = await getConnectState(admin, userId);
  if (!state.tables) throw new Error('The payout service is not connected yet.');
  if (state.status === 'ready' && state.stripe_account_id) {
    return Response.json({ ok: true, ready: true, message: 'Your payout account is already set up.' });
  }

  let stripeAccountId = state.stripe_account_id;
  if (!stripeAccountId) {
    const account = await createExpressAccount(stripe, {
      email: auth.user.email,
      userId,
      kind,
    });
    stripeAccountId = account.id;
    await upsertConnectAccount(admin, userId, {
      stripe_account_id: stripeAccountId,
      onboarding_status: 'pending',
      connect_ready_at: null,
    });
  }

  const origin = new URL(req.url).origin;
  const url = await createOnboardingLink(stripe, { stripeAccountId, origin, next });
  return Response.json({ ok: true, ready: false, url });
});
