// app/api/gallery/webhook/route.js
// Stripe webhook: credits a gallery account after a credit-pack checkout.
// Signature-verified, idempotent. Follows app/api/store/webhook/route.js.
//
// Setup (Merlin): in the Stripe dashboard, add a webhook endpoint for
//   https://<app>/api/gallery/webhook
// listening to `checkout.session.completed`, and set
// STRIPE_GALLERY_WEBHOOK_SECRET (or the shared STRIPE_WEBHOOK_SECRET)
// in Vercel env vars. Nothing is registered in Stripe by this code —
// scaffold only, per the rollout plan.
import Stripe from 'stripe';
import { getServiceClient } from '@/lib/economy/supabase';
import { CREDITS_PER_PACK } from '@/lib/gallery';

export async function POST(req) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_GALLERY_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
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
    console.error('Gallery webhook signature error:', err?.message || err);
    return new Response('Invalid signature.', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const meta = session?.metadata || {};
    if (meta.surface !== 'gallery') {
      // Not ours — acknowledge so Stripe stops retrying.
      return Response.json({ ok: true, received: true, ignored: true });
    }
    const userId = typeof meta.user_id === 'string' ? meta.user_id : '';
    if (!userId) {
      console.error(`Gallery webhook: session ${session.id} missing user_id metadata.`);
      return Response.json({ ok: true, received: true, ignored: true });
    }

    try {
      const admin = await getServiceClient();
      if (!admin) throw new Error('service client unavailable');
      // Idempotent: the Stripe session id is the ledger's idempotency key,
      // so webhook retries can never double-credit the account.
      const { data, error } = await admin.rpc('gallery_credit_apply', {
        p_user_id: userId,
        p_delta: CREDITS_PER_PACK,
        p_reason: 'credit_pack',
        p_idempotency_key: `stripe:${session.id}`,
        p_meta: { stripe_session_id: session.id, amount_cents: session.amount_total ?? null },
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (row?.was_duplicate) {
        console.log(`Gallery webhook: session ${session.id} already credited.`);
      } else {
        console.log(`Gallery webhook: credited ${CREDITS_PER_PACK} download credits to ${userId} (session ${session.id}).`);
      }
      return Response.json({ ok: true, balance_after: row?.balance_after ?? null });
    } catch (err) {
      // The gallery_* tables land in the final consolidated SQL; until they
      // exist this degrades honestly (acknowledge so Stripe stops retrying)
      // instead of crashing the webhook.
      const msg = String(err?.message || '');
      const code = err?.code || '';
      if (code === 'PGRST205' || /gallery_(ledger|balances|downloads)/i.test(msg)) {
        console.log('Gallery webhook: gallery tables not provisioned yet; acknowledging.', msg);
        return Response.json({ ok: true, received: true, pending_table: true });
      }
      console.error('Gallery webhook DB error:', msg);
      return Response.json({ ok: false, error: 'Database update failed.' }, { status: 500 });
    }
  }

  return Response.json({ ok: true, received: true });
}
