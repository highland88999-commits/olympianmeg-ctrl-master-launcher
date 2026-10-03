// app/api/gallery/webhook/route.js
// Stripe webhook: credits a gallery account after a credit-pack checkout.
// Signature-verified, idempotent. Follows app/api/store/webhook/route.js.
//
// Setup (Merlin): in the Stripe dashboard, add a webhook endpoint for
//   https://<app>/api/gallery/webhook
// listening to `checkout.session.completed` + `checkout.session.async_payment_succeeded`, and set
// STRIPE_GALLERY_WEBHOOK_SECRET (or the shared STRIPE_WEBHOOK_SECRET)
// in Vercel env vars. Nothing is registered in Stripe by this code —
// scaffold only, per the rollout plan.
import Stripe from 'stripe';
import { getServiceClient } from '@/lib/economy/supabase';
import { CREDITS_PER_PACK } from '@/lib/gallery';
import { billableSessionOrNull } from '@/lib/stripe-webhook';
import { apiGuard } from '@/lib/api-guard';
import { accrueAffiliateCommission, stripeFeeCents } from '@/lib/affiliates/server';

export const POST = apiGuard(async function POST(req) {
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

  // Only act when the money has actually arrived (shared webhook gate).
  const billable = billableSessionOrNull(event);
  if (billable.ignore) {
    return Response.json({
      ok: true, received: true,
      ...(billable.reason === 'unpaid' ? { pending_payment: true } : {}),
    });
  }

  {
    const session = billable.session;
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
        // In-house affiliate hook: 10% of the house's net (revenue - fees).
        try {
          await accrueAffiliateCommission(admin, {
            source: 'gallery',
            source_id: session.id,
            buyer_user_id: userId,
            buyer_email: session.customer_details?.email || '',
            gross_cents: typeof session.amount_total === 'number' ? session.amount_total : 0,
            stripe_fee_cents: await stripeFeeCents(stripe, session),
          });
        } catch (affErr) {
          console.error('Gallery webhook: affiliate accrual failed (non-fatal):', affErr?.message || affErr);
        }
      }
      return Response.json({ ok: true, balance_after: row?.balance_after ?? null });
    } catch (err) {
      // Missing gallery tables (or any other DB failure) must NOT be
      // acknowledged: a 200 tells Stripe to stop retrying and the paid
      // credits would be lost forever. Return 500 so Stripe retries until
      // the tables exist and the credit lands.
      const msg = String(err?.message || '');
      const code = err?.code || '';
      if (code === 'PGRST205' || /gallery_(ledger|balances|downloads)/i.test(msg)) {
        console.error('Gallery webhook: gallery tables not provisioned yet; will retry.', msg);
      } else {
        console.error('Gallery webhook DB error:', msg);
      }
      return Response.json({ ok: false, error: 'Database update failed.' }, { status: 500 });
    }
  }
});
