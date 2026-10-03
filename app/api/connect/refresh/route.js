// app/api/connect/refresh/route.js
// GET -> regenerates an expired onboarding link and redirects to it.
// Stripe sends users here when an account_link has expired. Authed.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getStripe, getConnectState, createOnboardingLink } from '@/lib/connect/server';

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The payout service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to set up payouts.' }, { status: 401 });
  }
  const stripe = await getStripe();
  if (!stripe) throw new Error('Stripe is not connected yet (STRIPE_SECRET_KEY missing).');

  const url = new URL(req.url);
  const next = url.searchParams.get('next') === '/persymphony/tickets/dashboard'
    ? '/persymphony/tickets/dashboard'
    : '/affiliates';

  const state = await getConnectState(admin, auth.user.id);
  if (!state.tables) throw new Error('The payout service is not connected yet.');
  if (!state.stripe_account_id) {
    return Response.redirect(`${url.origin}${next}?connect=restart`, 302);
  }
  if (state.status === 'ready') {
    return Response.redirect(`${url.origin}${next}?connect=ready`, 302);
  }

  const link = await createOnboardingLink(stripe, {
    stripeAccountId: state.stripe_account_id,
    origin: url.origin,
    next,
  });
  return Response.redirect(link, 302);
});
