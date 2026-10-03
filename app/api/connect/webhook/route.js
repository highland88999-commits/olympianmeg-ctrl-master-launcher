// app/api/connect/webhook/route.js
// Stripe webhook: flips Connect accounts to 'ready' when onboarding completes.
// Listens for `account.updated`; an account counts as ready when Stripe
// reports charges_enabled AND payouts_enabled.
//
// Signature-verified. Setup (Merlin): in the Stripe dashboard, add a webhook
// endpoint for https://<app>/api/connect/webhook listening to
// `account.updated`, and set STRIPE_CONNECT_WEBHOOK_SECRET in Vercel env vars.
import Stripe from 'stripe';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { markConnectReady, connectAccountReady } from '@/lib/connect/server';

export const POST = apiGuard(async function POST(req) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) {
    return new Response('Webhook not configured.', { status: 503 });
  }

  const stripe = new Stripe(stripeKey);
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Connect webhook signature error:', err?.message || err);
    return new Response('Invalid signature.', { status: 400 });
  }

  if (event.type !== 'account.updated') {
    return Response.json({ ok: true, received: true, ignored: true });
  }

  const account = event.data?.object;
  if (!account?.id) {
    return Response.json({ ok: true, received: true, ignored: true });
  }

  if (connectAccountReady(account)) {
    const admin = await getServiceClient();
    if (!admin) throw new Error('The payout service is not connected yet.');
    try {
      await markConnectReady(admin, account.id);
      console.log(`Connect: account ${account.id} is ready for payouts.`);
    } catch (err) {
      if (err?.code === '42P01') {
        console.error('Connect webhook: connect tables not provisioned yet.');
        return Response.json({ ok: true, received: true, ignored: true });
      }
      throw err;
    }
    return Response.json({ ok: true, received: true, ready: true });
  }

  return Response.json({ ok: true, received: true, ready: false });
});
