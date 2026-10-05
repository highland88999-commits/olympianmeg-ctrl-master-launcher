// app/api/trifold/webhook/route.js
// Stripe webhook for TRIFOLD subscriptions.
// Signature-verified, idempotent. Events handled:
//   checkout.session.completed        -> create/refresh subscription row (trialing)
//   customer.subscription.updated     -> sync status + trial end
//   customer.subscription.deleted     -> canceled
//   invoice.payment_failed            -> past_due
//   invoice.payment_succeeded         -> log the revenue split to trifold_revenue_log
//                                       AND credit Devan's in-house wallet $4.99
//                                       (idempotent; Merlin's $1 stays on the platform)
//
// Money model: the full $5.99 lands on Merlin's platform. Per paid invoice:
// Devan's wallet is credited his $4.99 share NET of the REAL Stripe fee
// (read from the charge's balance_transaction — never estimated),
// Merlin's $1.00 platform share stays whole and stays on the platform.
// Devan needs NO Stripe account to earn; Connect is the withdrawal rail only.
//
// MERLIN'S FEE RULE: user credits are net of Stripe fees; the breakdown
// (gross / stripe fee / platform fee / net) is persisted on every credit
// row and shown in the wallet UI.
//
// Setup (Merlin): in the Stripe dashboard, the webhook endpoint
//   https://olympusverse.com/api/trifold/webhook
// must listen to those five events. Set STRIPE_TRIFOLD_WEBHOOK_SECRET
// (or the shared STRIPE_WEBHOOK_SECRET) in Vercel env vars.
export const dynamic = 'force-dynamic';

import Stripe from 'stripe';
import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getEditorUserId } from '@/lib/trifold/server';
import { creditWallet, trifoldInvoiceReference } from '@/lib/wallet/ledger';

// Devan's cut per paid TRIFOLD invoice, in cents. Merlin's $1 stays on the platform.
const DEVAN_CENTS_PER_INVOICE = 499;

function webhookSecret() {
  return process.env.STRIPE_TRIFOLD_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || '';
}

async function upsertSubscription(admin, { email, customerId, subscriptionId, status, trialEndsAt }) {
  // Idempotent on stripe_subscription_id; email unique as fallback key.
  const row = {
    email,
    stripe_customer_id: customerId || null,
    stripe_subscription_id: subscriptionId || null,
    status,
    trial_ends_at: trialEndsAt ? new Date(trialEndsAt * 1000).toISOString() : null,
  };
  // Try subscription id first (unique), else email.
  if (subscriptionId) {
    const { data: existing } = await admin
      .from('trifold_subscriptions')
      .select('id')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle();
    if (existing) {
      await admin.from('trifold_subscriptions').update(row).eq('id', existing.id);
      return;
    }
  }
  const { data: byEmail } = await admin
    .from('trifold_subscriptions')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (byEmail) {
    await admin.from('trifold_subscriptions').update(row).eq('id', byEmail.id);
  } else {
    await admin.from('trifold_subscriptions').insert(row);
  }
}

async function subscriptionFromSession(stripe, session) {
  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  if (!subId) return null;
  return stripe.subscriptions.retrieve(subId);
}

export const POST = apiGuard(async function POST(req) {
  const secret = webhookSecret();
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    throw new Error('Newsletter webhook is not configured yet.');
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const admin = await getServiceClient();
  if (!admin) throw new Error('The newsletter service is not connected yet.');

  const raw = await req.text();
  const sig = req.headers.get('stripe-signature') || '';
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return Response.json({ ok: false, error: 'Bad signature.' }, { status: 400 });
  }

  // Only ours: subscription checkouts carry metadata.product = 'trifold'.
  const md = (obj) => (obj && obj.metadata) || {};

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (md(session).product !== 'trifold') break;
      const sub = await subscriptionFromSession(stripe, session);
      const email = (session.customer_details?.email || session.customer_email || '').toLowerCase();
      if (!email) break;
      await upsertSubscription(admin, {
        email,
        customerId: typeof session.customer === 'string' ? session.customer : null,
        subscriptionId: sub ? sub.id : null,
        status: sub && sub.status === 'trialing' ? 'trialing' : 'active',
        trialEndsAt: sub ? sub.trial_end : null,
      });
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      if (md(sub).product !== 'trifold' && !(await isOurs(admin, sub.id))) break;
      const email = await emailForSubscription(admin, stripe, sub);
      const status = sub.status === 'trialing' ? 'trialing'
        : sub.status === 'active' ? 'active'
        : sub.status === 'past_due' ? 'past_due'
        : sub.status === 'canceled' ? 'canceled' : 'active';
      await upsertSubscription(admin, {
        email, customerId: sub.customer, subscriptionId: sub.id,
        status, trialEndsAt: sub.trial_end,
      });
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const email = await emailForSubscription(admin, stripe, sub);
      if (!email) break;
      await upsertSubscription(admin, {
        email, customerId: sub.customer, subscriptionId: sub.id,
        status: 'canceled', trialEndsAt: sub.trial_end,
      });
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (!subId) break;
      const { data: row } = await admin
        .from('trifold_subscriptions')
        .select('id')
        .eq('stripe_subscription_id', subId)
        .maybeSingle();
      if (row) await admin.from('trifold_subscriptions').update({ status: 'past_due' }).eq('id', row.id);
      break;
    }
    case 'invoice.payment_succeeded': {
      // Money moved: record it in the revenue log AND credit Devan's
      // in-house wallet — his $4.99 share NET of the real Stripe fee.
      // Never fails the webhook — both writers degrade gracefully
      // pre-migration with honest server-side notes.
      const invoice = event.data.object;
      const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (!subId) break;
      const ours = md(invoice).product === 'trifold' || (await isOurs(admin, subId));
      if (!ours) break;
      // The REAL Stripe fee, read from the charge — never estimated.
      // null = unreadable (fallback below credits the gross and flags it).
      let stripeFeeCents = null;
      try {
        stripeFeeCents = await getStripeFeeCents(stripe, invoice);
      } catch (e) {
        console.error('TRIFOLD: fee read failed for invoice', invoice.id, '—', e && e.message ? e.message : e);
        stripeFeeCents = null;
      }
      try {
        await logTrifoldRevenue(admin, invoice, stripeFeeCents);
      } catch (e) {
        console.error('TRIFOLD: revenue log skipped —', e && e.message ? e.message : e);
      }
      try {
        await creditDevanWallet(admin, invoice, stripeFeeCents);
      } catch (e) {
        console.error('TRIFOLD: wallet credit skipped —', e && e.message ? e.message : e);
      }
      break;
    }
    default:
      break;
  }
  return Response.json({ ok: true });
});

/**
 * The REAL Stripe fee for an invoice, in cents — read from the charge's
 * balance_transaction, never estimated. Returns null when it cannot be
 * determined (the caller falls back honestly and flags it — never silent).
 */
async function getStripeFeeCents(stripe, invoice) {
  try {
    let charge = null;
    const chargeRef = invoice.charge;
    const chargeId = typeof chargeRef === 'string' ? chargeRef : chargeRef && chargeRef.id;
    if (chargeId) {
      charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
    } else {
      const list = await stripe.charges.list({ invoice: invoice.id, limit: 1 });
      const first = list && list.data && list.data[0];
      if (first) {
        charge = first.balance_transaction
          ? first
          : await stripe.charges.retrieve(first.id, { expand: ['balance_transaction'] });
      }
    }
    let bt = charge && charge.balance_transaction;
    if (typeof bt === 'string') bt = await stripe.balanceTransactions.retrieve(bt);
    const fee = bt && typeof bt.fee === 'number' ? Math.round(bt.fee) : null;
    return fee === null || fee < 0 ? null : fee;
  } catch (e) {
    console.error('TRIFOLD: could not read Stripe fee for invoice', invoice && invoice.id, '—', e && e.message ? e.message : e);
    return null;
  }
}

/**
 * One row per paid invoice: the gross, the REAL Stripe fee, Devan's net
 * wallet credit ($4.99 minus the fee, floored at 0), and the platform's
 * keep ($1.00 = gross - Devan's gross share, always whole).
 * Idempotent on stripe_invoice_id. This is the money-truth audit row;
 * the wallet transaction is the spendable side. Throws when the table
 * doesn't exist yet — the caller swallows that so a pending migration
 * never fails a live webhook.
 */
async function logTrifoldRevenue(admin, invoice, stripeFeeCents) {
  const { data: existing, error: findErr } = await admin
    .from('trifold_revenue_log')
    .select('id')
    .eq('stripe_invoice_id', invoice.id)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (existing) return; // webhook redelivery — already counted

  const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  const amountCents = typeof invoice.amount_paid === 'number' ? invoice.amount_paid : 0;
  if (amountCents <= 0) return; // nothing to split (e.g. fully-discounted invoice)
  const devanGross = Math.min(DEVAN_CENTS_PER_INVOICE, amountCents);
  const fee = stripeFeeCents === null ? 0 : stripeFeeCents;
  const devanCents = Math.max(0, devanGross - fee); // net of the real Stripe fee

  const { error } = await admin.from('trifold_revenue_log').insert({
    stripe_invoice_id: invoice.id,
    stripe_subscription_id: subId,
    amount_cents: amountCents,
    fee_cents: fee, // the REAL Stripe fee on this payment (0 when unreadable)
    devan_cents: devanCents, // what actually landed in his wallet
    currency: String(invoice.currency || 'usd').toLowerCase(),
  });
  if (error) throw new Error(error.message);
}

/**
 * Credit Devan's in-house wallet for this paid invoice: his $4.99 share
 * NET of the real Stripe fee (Merlin's $1 platform share stays whole).
 * Idempotent: the reference (trifold:invoice:<id>) means a redelivered
 * webhook can never pay twice. Skips with a warning when the editor's
 * user id isn't configured yet — the money is still audited in
 * trifold_revenue_log, and Merlin can set TRIFOLD_EDITOR_USER_ID later.
 *
 * If the Stripe fee is unreadable, the gross share is credited and the
 * row is FLAGGED (reason + server log) — never silently swallowed.
 * If the fee eats the whole share (net 0), no wallet row is written;
 * the audit row still records the truth.
 */
async function creditDevanWallet(admin, invoice, stripeFeeCents) {
  const devanId = await getEditorUserId(admin);
  if (!devanId) {
    console.warn('TRIFOLD: no editor user id configured — $4.99 stays on the platform until TRIFOLD_EDITOR_USER_ID is set.');
    return;
  }
  const feeKnown = stripeFeeCents !== null;
  const stripeFee = feeKnown ? stripeFeeCents : 0;
  const net = Math.max(0, DEVAN_CENTS_PER_INVOICE - stripeFee);
  if (net <= 0) {
    console.error(
      `TRIFOLD: invoice ${invoice.id} — Stripe fee ${stripeFee}¢ consumed Devan's whole $4.99 share; no wallet credit written.`
    );
    return;
  }
  const currency = String(invoice.currency || 'usd').toLowerCase();
  const feeDollars = (stripeFee / 100).toFixed(2);
  const res = await creditWallet(admin, devanId, {
    program: 'trifold',
    amountCents: net,
    grossCents: DEVAN_CENTS_PER_INVOICE,
    stripeFeeCents: stripeFee,
    platformFeeCents: 0, // Merlin's $1 stays on the platform — never carved from Devan
    reason: feeKnown
      ? `TRIFOLD subscription revenue — invoice ${invoice.id} (net of $${feeDollars} Stripe fee)`
      : `TRIFOLD subscription revenue — invoice ${invoice.id} (Stripe fee unreadable — credited gross; see server log)`,
    reference: trifoldInvoiceReference(invoice.id),
    currency,
  });
  if (res.duplicate) console.log('TRIFOLD: wallet credit already applied for', invoice.id);
  if (!feeKnown) {
    console.error(
      `TRIFOLD: Stripe fee unreadable for invoice ${invoice.id} — credited gross ${DEVAN_CENTS_PER_INVOICE}¢ with stripe_fee_cents=0 flagged on the row.`
    );
  }
}

async function isOurs(admin, subscriptionId) {
  if (!subscriptionId) return false;
  const { data } = await admin
    .from('trifold_subscriptions')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();
  return !!data;
}

async function emailForSubscription(admin, stripe, sub) {
  const { data } = await admin
    .from('trifold_subscriptions')
    .select('email')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle();
  if (data?.email) return data.email;
  try {
    const customer = await stripe.customers.retrieve(sub.customer);
    return (customer?.email || '').toLowerCase() || null;
  } catch {
    return null;
  }
}
