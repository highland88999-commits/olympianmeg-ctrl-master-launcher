// app/api/store/webhook/route.js
// Stripe webhook: marks a store order paid after checkout.
// Signature-verified, idempotent. Follows app/api/persephone/webhook/route.js.
//
// Setup (Merlin): in the Stripe dashboard, add a webhook endpoint for
//   https://<app>/api/store/webhook
// listening to `checkout.session.completed` + `checkout.session.async_payment_succeeded`
// (order payment) AND `charge.refunded` + `charge.dispute.created`
// (creator-payout clawbacks — without those two events, refunds and
// chargebacks still land in Stripe but no creator credit is reversed),
// and set STRIPE_STORE_WEBHOOK_SECRET (or the shared STRIPE_WEBHOOK_SECRET)
// in Vercel env vars. Nothing is registered in Stripe by this code —
// scaffold only, per the rollout plan.
import Stripe from 'stripe';
import { getServiceClient } from '@/lib/economy/supabase';
import { billableSessionOrNull } from '@/lib/stripe-webhook';
import { apiGuard } from '@/lib/api-guard';
import { accrueAffiliateCommission, stripeFeeCents } from '@/lib/affiliates/server';
import { parseStoreCogsLines, resolveStoreOrderCogs, storeOrderProductKey } from '@/lib/affiliates/costs';
import { markBaselineOfferRedeemed } from '@/lib/store/custom-creations';
import { creditCreatorSale, reverseCreatorSale, parseCreatorSale } from '@/lib/store/creator-payouts';
import {
  submitPrintfulOrder,
  resolveFulfillmentItems,
  parseFulfillmentLines,
  recipientFromSession,
  recipientFromStoredShipping,
  mergeRecipients,
  missingRecipientFields,
  FulfillmentError,
} from '@/lib/store-fulfillment';

export const POST = apiGuard(async function POST(req) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_STORE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
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
    console.error('Store webhook signature error:', err?.message || err);
    return new Response('Invalid signature.', { status: 400 });
  }

  // Creator-payout clawbacks: a refund or chargeback on a custom-
  // creation sale reverses the creator's wallet credit (proportional
  // to the money that came back; lib/store/creator-payouts.js). These
  // events are not billable checkout sessions, so they are handled
  // before the gate below. Events that don't belong to a store
  // creation sale are acknowledged untouched; a reversal that fails
  // to apply is NOT acknowledged (500) so Stripe retries — reversals
  // are idempotent, so retrying is safe.
  if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
    try {
      const outcome = await handleCreatorReversal(stripe, event);
      if (!outcome.handled) {
        return Response.json({ ok: true, received: true, ignored: true });
      }
      return Response.json({ ok: true, received: true, creator_reversal: outcome.result });
    } catch (err) {
      console.error('Store webhook: creator reversal failed (not acknowledged; Stripe will retry):', err?.message || err);
      return Response.json({ ok: false, error: 'Creator reversal failed.' }, { status: 500 });
    }
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
    if (meta.surface !== 'store') {
      // Not ours — acknowledge so Stripe stops retrying.
      return Response.json({ ok: true, received: true, ignored: true });
    }

    try {
      const admin = await getServiceClient();
      if (!admin) throw new Error('service client unavailable');
      // Idempotent: only flip pending -> paid. Repeat deliveries are safe.
      const { data, error } = await admin
        .from('store_orders')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          amount_cents: typeof session.amount_total === 'number' ? session.amount_total : undefined,
          stripe_session_id: session.id,
          size: meta.size || undefined,
          // Shipping address for Printful: prefer shipping_details (the
          // address the buyer gave FOR SHIPPING via
          // shipping_address_collection) over the billing address in
          // customer_details. The stored value may be either shape —
          // lib/store-fulfillment.js reads both.
          shipping: session.shipping_details || session.customer_details?.address || undefined,
        })
        .eq('stripe_session_id', session.id)
        .eq('status', 'pending_payment')
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        console.log(`Store webhook: session ${session.id} already handled.`);
      } else {
        console.log(`Store webhook: order paid (${meta.product_name}${meta.size ? ` ${meta.size}` : ''}, session ${session.id}).`);

        // In-house affiliate hook: 10% of the house's net (revenue -
        // Stripe fees - true Printful COGS, resolved per line below).
        // Gold-paid orders never reach this webhook (recorded directly as
        // paid with zero card revenue), so only real-money sales accrue.
        try {
          const { data: order } = await admin
            .from('store_orders')
            .select('user_id, amount_cents')
            .eq('stripe_session_id', session.id)
            .maybeSingle();
          const meta = session.metadata || {};
          // True COGS: checkout transports every priced line in the
          // session metadata (cogs_lines*, lib/affiliates/costs.js). The
          // order cost is the sum of per-variant costs x qty across all
          // lines. When the lines are absent/malformed or any line's cost
          // can't be resolved, resolution returns null and the commission
          // parks as pending_cost — never silently accrued on the
          // inflated base. Single-line orders also carry a real
          // product_key so finalize-costs can un-park them by key;
          // multi-line parks carry none (their cost is an order total,
          // not one variant's cost).
          const cogsLines = parseStoreCogsLines(meta);
          await accrueAffiliateCommission(admin, {
            source: 'store',
            source_id: session.id,
            buyer_user_id: order?.user_id || null,
            buyer_email: session.customer_details?.email || '',
            gross_cents: order?.amount_cents ?? session.amount_total ?? 0,
            stripe_fee_cents: await stripeFeeCents(stripe, session),
            product_key: storeOrderProductKey(cogsLines),
            resolve_cogs: () => resolveStoreOrderCogs(admin, cogsLines),
          });
        } catch (affErr) {
          console.error('Store webhook: affiliate accrual failed (non-fatal):', affErr?.message || affErr);
        }

        // Custom creations: a paid baseline-offer session redeems the
        // creator's one-time first-copy-at-base-price offer. Additive
        // and best-effort — the creations record may still live only in
        // Stripe metadata (its Supabase migration is pending), and a
        // failure here must never fail the webhook.
        try {
          if (meta.custom_baseline_offer === 'true' && meta.printful_product_id) {
            await markBaselineOfferRedeemed(String(meta.printful_product_id), session.id);
          }
        } catch (redeemErr) {
          console.error('Store webhook: baseline offer redemption marking failed (non-fatal):', redeemErr?.message || redeemErr);
        }

        // Creator payout: a paid custom-creation sale credits the
        // creator's wallet with their markup, net of their proportional
        // share of the real Stripe fee and the $1.00 platform fee
        // (lib/store/creator-payouts.js). Baseline-offer redemptions
        // and plain store sales earn nothing here. Best-effort like
        // the hooks above — a payout failure never fails the order —
        // and idempotent on the session id via the wallet ledger's
        // reference guard, so redelivery can't double-credit.
        try {
          const payout = await creditCreatorSale(admin, stripe, session);
          if (payout.credited) {
            console.log(
              `Store webhook: creator payout ${payout.breakdown.netCents}c credited ` +
              `(markup ${payout.breakdown.grossCents}c - Stripe fee share ${payout.breakdown.stripeFeeCents}c ` +
              `- platform fee ${payout.breakdown.platformFeeCents}c, session ${session.id}).`
            );
          } else if (payout.reason === 'fees_consumed_markup') {
            console.error(
              `Store webhook: creator payout floored at $0 for session ${session.id} — fees ` +
              `(${payout.breakdown.stripeFeeCents}c Stripe fee share + ${payout.breakdown.platformFeeCents}c platform fee) ` +
              `consumed the ${payout.breakdown.grossCents}c markup; shortfall ${payout.breakdown.shortfallCents}c. No wallet row written.`
            );
          } else if (payout.duplicate) {
            console.log(`Store webhook: creator payout already applied for session ${session.id}.`);
          }
        } catch (payErr) {
          console.error('Store webhook: creator payout failed (non-fatal):', payErr?.message || payErr);
        }

        // Printful fulfillment: the order is paid, so submit it. Runs only
        // in this branch — the pending->paid flip above is the claim, so a
        // Stripe redelivery never reaches here and can never double-submit.
        // Never fails the webhook: fulfillPaidOrder records every outcome
        // on the order row and logs it; the order stays paid either way.
        try {
          await fulfillPaidOrder(admin, session, meta, data[0].id);
        } catch (fulfillErr) {
          console.error('Store webhook: fulfillment step threw (order stays paid):', fulfillErr?.message || fulfillErr);
        }
      }
      return Response.json({ ok: true });
    } catch (err) {
      // A missing store_orders table (or any other DB failure) must NOT be
      // acknowledged: a 200 tells Stripe to stop retrying and the paid order
      // would never be marked. Return 500 so Stripe retries until the table
      // exists and the order flips to paid.
      const msg = String(err?.message || '');
      const code = err?.code || '';
      if (code === 'PGRST205' || /store_orders/i.test(msg)) {
        console.error('Store webhook: store_orders table not provisioned yet; will retry.', msg);
      } else {
        console.error('Store webhook DB error:', msg);
      }
      return Response.json({ ok: false, error: 'Database update failed.' }, { status: 500 });
    }
  }
});

// ============================================================================
// CREATOR-PAYOUT CLAWBACKS — refund / chargeback resolution.
//
// A `charge.refunded` event carries the Charge (payment_intent +
// amount_refunded, cumulative); a `charge.dispute.created` event
// carries the Dispute (payment_intent + amount, with the Charge
// retrievable for the original total). Neither carries the checkout
// session's metadata, so the session is resolved through Stripe by
// payment intent — the only trustworthy link back to the server-
// stamped creator metadata. Returns { handled: false } for anything
// that isn't a store custom-creation sale (other surfaces share this
// Stripe account; their refunds are not this webhook's business).
// Throws on infrastructure failure so the caller answers 500 and
// Stripe retries; reverseCreatorSale is idempotent, so a retry after
// a partial failure can never double-claw.
// ============================================================================
async function handleCreatorReversal(stripe, event) {
  const obj = event?.data?.object || {};
  const kind = event.type === 'charge.dispute.created' ? 'chargeback' : 'refund';
  let paymentIntentId =
    typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id || null;
  let clawedBackTotalCents = 0;
  let transactionTotalCents = 0;

  if (kind === 'refund') {
    clawedBackTotalCents = Math.max(0, Math.round(Number(obj.amount_refunded) || 0));
    transactionTotalCents = Math.max(0, Math.round(Number(obj.amount) || 0));
  } else {
    clawedBackTotalCents = Math.max(0, Math.round(Number(obj.amount) || 0));
    const chargeId = typeof obj.charge === 'string' ? obj.charge : obj.charge?.id || null;
    if (chargeId) {
      const charge = await stripe.charges.retrieve(chargeId);
      transactionTotalCents = Math.max(0, Math.round(Number(charge?.amount) || 0));
      if (!paymentIntentId) {
        paymentIntentId =
          typeof charge?.payment_intent === 'string' ? charge.payment_intent : charge?.payment_intent?.id || null;
      }
    }
  }
  if (!paymentIntentId) return { handled: false };

  const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
  const session = sessions?.data?.[0];
  if (!session) return { handled: false };
  const meta = session.metadata || {};
  if (meta.surface !== 'store' || !parseCreatorSale(meta)) return { handled: false };

  const admin = await getServiceClient();
  if (!admin) throw new Error('service client unavailable');
  const result = await reverseCreatorSale(admin, {
    sessionId: session.id,
    kind,
    eventId: event.id,
    clawedBackTotalCents,
    transactionTotalCents,
  });
  if (result.reversed) {
    console.log(
      `Store webhook: creator payout reversed ${result.amountCents}c (${kind}, session ${session.id}` +
      `${result.shortfallCents ? `, ${result.shortfallCents}c unrecovered — see the ledger note` : ''}).`
    );
  } else if (result.reason === 'insufficient_balance') {
    console.error(
      `Store webhook: creator reversal for session ${session.id} could not recover ` +
      `${result.shortfallCents}c — the creator's wallet balance was spent or released first. Noted for Merlin.`
    );
  }
  return { handled: true, result };
}

// ============================================================================
// PRINTFUL FULFILLMENT — live since 2026-11-07 (Merlin's go-ahead).
//
// Runs once per order, only for the delivery that flipped pending -> paid
// (that update is the claim; a Stripe redelivery never reaches this
// code, so an order can never submit twice). The real submission lives
// in lib/store-fulfillment.js: draft (free) then confirm (charges
// Merlin's Printful account). Token scope note: PRINTFUL_API_KEY is set
// on Vercel and catalog reads work; if the token lacks order-write
// scope, POST /orders answers 401/403 and the order is recorded as
// fulfillment 'failed' (stays paid, loudly logged) for manual follow-up
// in the Printful dashboard (R.hightechindustries@gmail.com) — never
// silently dropped, never retried blindly.
//
// Outcomes, all recorded on the store_orders row:
//   fulfilled        Printful confirmed the order; status -> 'fulfilled',
//                    printful_order_id + fulfilled_at written back.
//   draft_only       draft created, confirm failed: the draft waits in
//                    the Printful dashboard for manual confirmation;
//                    printful_order_id holds the draft id, status stays
//                    'paid'.
//   awaiting_address no usable shipping address (gold-paid orders never
//                    collect one; a card order with an incomplete address
//                    lands here too). NOT submitted. Never invent one.
//   failed           variant resolution or Printful submission failed;
//                    status stays 'paid', error text on the row.
// Gold-paid orders never reach this webhook; their awaiting_address mark
// is set at insert in app/api/store/checkout/route.js, and fulfillment
// for them starts only once an address is on file (no UI for that yet —
// see the report note; the address-collection step is the follow-up).
// ============================================================================
async function fulfillPaidOrder(admin, session, meta, orderId) {
  // Defense in depth: never submit twice for one order row, even if this
  // function is ever called from a retry path. Also re-reads the stored
  // shipping address as a fallback when the session's is incomplete.
  const { data: row, error: rowError } = await admin
    .from('store_orders')
    .select('id, printful_order_id, shipping, amount_cents, currency')
    .eq('id', orderId)
    .maybeSingle();
  if (rowError || !row) {
    console.error(`Store webhook: fulfillment cannot read order ${orderId}; NOT submitted.`, rowError?.message || '');
    return;
  }
  if (row.printful_order_id) {
    console.log(`Store webhook: order ${orderId} already has Printful order ${row.printful_order_id}; skipping fulfillment.`);
    return;
  }

  // Recipient: session shipping address first, stored shipping fills gaps.
  let recipient = recipientFromSession(session);
  let missing = missingRecipientFields(recipient);
  if (missing.length) {
    const stored = recipientFromStoredShipping(row.shipping, {
      name: session?.customer_details?.name || null,
      email: session?.customer_details?.email || null,
      phone: session?.customer_details?.phone || null,
    });
    if (stored) {
      recipient = mergeRecipients(recipient, stored);
      missing = missingRecipientFields(recipient);
    }
  }
  if (missing.length) {
    await markFulfillment(admin, orderId, {
      fulfillmentStatus: 'awaiting_address',
      fulfillmentError: `Missing shipping address (${missing.join(', ')}) — order paid, awaiting an address before Printful fulfillment. Never fulfilled without one.`,
    });
    console.error(`Store webhook: order ${orderId} paid but has no usable shipping address (${missing.join(', ')}). Marked awaiting_address; NOT submitted to Printful.`);
    return;
  }

  const lines = parseFulfillmentLines(meta);
  if (!lines) {
    await markFulfillment(admin, orderId, {
      fulfillmentStatus: 'failed',
      fulfillmentError: 'Could not determine the ordered Printful variants from the session metadata.',
    });
    console.error(`Store webhook: order ${orderId} has no resolvable fulfillment lines. NOT submitted.`);
    return;
  }

  let items;
  try {
    items = await resolveFulfillmentItems(lines);
  } catch (err) {
    await markFulfillment(admin, orderId, {
      fulfillmentStatus: 'failed',
      fulfillmentError: String(err?.message || err).slice(0, 500),
    });
    console.error(`Store webhook: order ${orderId} variant resolution failed:`, err?.message || err);
    return;
  }

  try {
    const { printfulOrderId } = await submitPrintfulOrder({
      orderId,
      items,
      recipient,
      retailCents:
        typeof row.amount_cents === 'number'
          ? row.amount_cents
          : typeof session.amount_total === 'number'
            ? session.amount_total
            : 0,
      currency: row.currency || session.currency || 'cad',
    });
    await markFulfillment(admin, orderId, {
      fulfillmentStatus: 'fulfilled',
      printfulOrderId,
      markFulfilled: true,
    });
    console.log(`Store webhook: order ${orderId} fulfilled via Printful order ${printfulOrderId}.`);
  } catch (err) {
    const draftOnly = err instanceof FulfillmentError && err.draftOnly;
    await markFulfillment(admin, orderId, {
      fulfillmentStatus: draftOnly ? 'draft_only' : 'failed',
      fulfillmentError: String(err?.message || err).slice(0, 500),
      ...(err && err.printfulOrderId ? { printfulOrderId: String(err.printfulOrderId) } : {}),
    });
    console.error(
      `Store webhook: Printful fulfillment ${draftOnly ? 'draft created, confirm failed' : 'failed'} for order ${orderId}:`,
      err?.message || err
    );
  }
}

// Write fulfillment state back to the order row. Two updates, deliberately:
//   (1) pre-existing columns only (status / printful_order_id /
//       fulfilled_at) — this is the idempotency guard and must never fail
//       because of a missing new column;
//   (2) the fulfillment_status / fulfillment_error columns from migration
//       20261107_store_fulfillment_status.sql — best-effort. Until that
//       migration runs (Merlin's green-light SQL sequence, before the
//       deploy goes live) this update fails and is swallowed; the order
//       is still fulfilled and guarded by (1).
async function markFulfillment(admin, orderId, { fulfillmentStatus, fulfillmentError, printfulOrderId, markFulfilled } = {}) {
  try {
    const patch = {};
    if (printfulOrderId) patch.printful_order_id = String(printfulOrderId);
    if (markFulfilled) {
      patch.status = 'fulfilled';
      patch.fulfilled_at = new Date().toISOString();
    }
    if (Object.keys(patch).length) {
      const { error } = await admin.from('store_orders').update(patch).eq('id', orderId);
      if (error) throw error;
    }
  } catch (err) {
    console.error(`Store webhook: fulfillment writeback failed for order ${orderId}:`, err?.message || err);
  }
  try {
    const patch = {};
    if (fulfillmentStatus) patch.fulfillment_status = fulfillmentStatus;
    if (fulfillmentError !== undefined) patch.fulfillment_error = fulfillmentError || null;
    if (Object.keys(patch).length) {
      const { error } = await admin.from('store_orders').update(patch).eq('id', orderId);
      if (error) throw error;
    }
  } catch (err) {
    console.log(
      `Store webhook: fulfillment_status columns not provisioned yet for order ${orderId} (run migration 20261107_store_fulfillment_status.sql):`,
      err?.message || err
    );
  }
}
