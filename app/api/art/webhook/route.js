// app/api/art/webhook/route.js
// Stripe webhook: records a completed art sale in public.art_orders.
// Signature-verified, idempotent (stripe_session_id is unique — retries
// can never double-record a sale). Follows app/api/gallery/webhook/route.js.
//
// Setup (Merlin): in the Stripe dashboard, add a webhook endpoint for
//   https://olympusverse.com/api/art/webhook
// listening to `checkout.session.completed` + `checkout.session.async_payment_succeeded`,
// and set STRIPE_ART_WEBHOOK_SECRET (or the shared STRIPE_WEBHOOK_SECRET)
// in Vercel env vars.
import Stripe from 'stripe';
import { getServiceClient } from '@/lib/economy/supabase';
import { billableSessionOrNull } from '@/lib/stripe-webhook';
import { apiGuard } from '@/lib/api-guard';
import { accrueAffiliateCommission, stripeFeeCents } from '@/lib/affiliates/server';

export const POST = apiGuard(async function POST(req) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_ART_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
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
    console.error('Art webhook signature error:', err?.message || err);
    return new Response('Invalid signature.', { status: 400 });
  }

  // Only act when the money has actually arrived (shared webhook gate).
  const billable = billableSessionOrNull(event);
  if (billable.ignore) {
    return Response.json({
      ok: true,
      received: true,
      ...(billable.reason === 'unpaid' ? { pending_payment: true } : {}),
    });
  }

  const session = billable.session;
  const meta = session?.metadata || {};
  if (meta.surface !== 'art') {
    // Not ours — acknowledge so Stripe stops retrying.
    return Response.json({ ok: true, received: true, ignored: true });
  }

  const artPieceId = typeof meta.art_piece_id === 'string' ? meta.art_piece_id : '';
  const sellerUserId = typeof meta.seller_user_id === 'string' ? meta.seller_user_id : '';
  if (!artPieceId || !sellerUserId) {
    console.error(`Art webhook: session ${session.id} missing art attribution metadata.`);
    return Response.json({ ok: true, received: true, ignored: true });
  }

  try {
    const admin = await getServiceClient();
    if (!admin) throw new Error('service client unavailable');

    const amountCents = Number(session.amount_total) || 0;
    const buyerUserId = typeof meta.buyer_user_id === 'string' && meta.buyer_user_id ? meta.buyer_user_id : null;

    // Idempotent ledger insert: the Stripe session id is unique, so a
    // retried webhook can never record the same sale twice.
    const { error: orderErr } = await admin.from('art_orders').upsert(
      {
        stripe_session_id: session.id,
        art_piece_id: artPieceId,
        seller_user_id: sellerUserId,
        buyer_user_id: buyerUserId,
        amount_cents: amountCents,
        currency: (session.currency || 'cad').toLowerCase(),
        status: 'paid',
      },
      { onConflict: 'stripe_session_id', ignoreDuplicates: true }
    );
    if (orderErr) throw orderErr;

    // Bump the piece's sold counter (best-effort; the ledger is the truth).
    try {
      const { data: piece } = await admin
        .from('art_pieces')
        .select('sold_count')
        .eq('id', artPieceId)
        .maybeSingle();
      if (piece) {
        await admin
          .from('art_pieces')
          .update({ sold_count: (Number(piece.sold_count) || 0) + 1 })
          .eq('id', artPieceId);
      }
    } catch (countErr) {
      console.error('Art webhook: sold_count bump failed (non-fatal):', countErr?.message || countErr);
    }

    console.log(`Art webhook: recorded sale ${session.id} — ${amountCents}c to seller ${sellerUserId}.`);

    // In-house affiliate hook. The full sale goes to the seller today —
    // the house takes no cut, so no commission accrues (the helper
    // computes 0 and skips). If Merlin ever adds a house commission on
    // art sales, this hook starts accruing with no code change.
    try {
      await accrueAffiliateCommission(admin, {
        source: 'art',
        source_id: session.id,
        buyer_user_id: buyerUserId,
        buyer_email: session.customer_details?.email || '',
        gross_cents: amountCents,
        stripe_fee_cents: await stripeFeeCents(stripe, session),
      });
    } catch (affErr) {
      console.error('Art webhook: affiliate accrual failed (non-fatal):', affErr?.message || affErr);
    }
    return Response.json({ ok: true, recorded: true });
  } catch (err) {
    // A DB failure must NOT be acknowledged: a 200 tells Stripe to stop
    // retrying and the paid sale would never reach the ledger.
    const msg = String(err?.message || '');
    const code = err?.code || '';
    if (code === 'PGRST205' || /art_(orders|pieces)/i.test(msg)) {
      console.error('Art webhook: art tables not provisioned yet; will retry.', msg);
    } else {
      console.error('Art webhook DB error:', msg);
    }
    return Response.json({ ok: false, error: 'Database update failed.' }, { status: 500 });
  }
});
