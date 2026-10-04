// app/api/trifold/connect/onboard/route.js
// POST /api/trifold/connect/onboard  (buddy only) -> { ok, url, account_id }
//
// Starts (or resumes) Devan's Stripe Express onboarding so subscription
// revenue can split $1 Merlin / $4.99 Devan via the application fee.
// Creates the Express account once (reuses trifold_settings.connect_account_id
// when already set), builds a fresh accountLink each call, and returns the
// onboarding URL for the buddy to visit. API only — never Merlin's card.
export const dynamic = 'force-dynamic';

import Stripe from 'stripe';
import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireBuddy, getSettingsRaw } from '@/lib/trifold/server';

const STUDIO_URL = 'https://olympusverse.com/trifold/studio';

function devanCountry() {
  return (process.env.STRIPE_DEVAN_COUNTRY || 'CA').toUpperCase();
}

export const POST = apiGuard(async function POST(req) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Card payments are not configured yet.');
  const admin = await getServiceClient();
  if (!admin) throw new Error('The newsletter service is not connected yet.');
  await requireBuddy(req, admin);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  // Reuse the existing Connect account if we've already created one.
  let accountId = '';
  let buddyEmail = '';
  try {
    const raw = await getSettingsRaw(admin);
    accountId = String(raw?.connect_account_id || '').trim();
    buddyEmail = String(raw?.buddy_email || '').trim();
  } catch {
    /* pre-migration settings shape — create fresh below */
  }

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: devanCountry(),
      email: buddyEmail || undefined,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { product: 'trifold', role: 'editor' },
    });
    accountId = account.id;
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    return_url: `${STUDIO_URL}?connect=done`,
    refresh_url: `${STUDIO_URL}?connect=refresh`,
    type: 'account_onboarding',
  });

  // Persist (best-effort pre-migration; the env fallback covers the gap).
  const { error: saveErr } = await admin
    .from('trifold_settings')
    .update({ connect_account_id: accountId })
    .eq('id', 1);

  return Response.json({
    ok: true,
    url: link.url,
    account_id: accountId,
    ...(saveErr ? { note: 'Onboarding link created, but the account id could not be saved yet (migration pending) — set STRIPE_DEVAN_ACCOUNT_ID to ' + accountId } : {}),
  });
});
