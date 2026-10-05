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
// $4.99 -> Devan's wallet (program 'trifold'), $1.00 -> platform.
// Devan needs NO Stripe account to earn; Connect is the withdrawal rail only.
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
      // in-house wallet. Never fails the webhook — both writers degrade
      // gracefully pre-migration with honest server-side notes.
      const invoice = event.data.object;
      const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (!subId) break;
      const ours = md(invoice).product === 'trifold' || (await isOurs(admin, subId));
      if (!ours) break;
      try {
        await logTrifoldRevenue(admin, invoice);
      } catch (e) {
        console.error('TRIFOLD: revenue log skipped —', e && e.message ? e.message : e);
      }
      try {
        await creditDevanWallet(admin, invoice, subId);
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
 * One row per paid invoice: the gross, Devan's wallet credit ($4.99), and
 * the platform's keep ($1.00 = gross - 499). Idempotent on stripe_invoice_id.
 * This is the money-truth audit row; the wallet transaction is the spendable
 * side. Throws when the table doesn't exist yet — the caller swallows that
 * so a pending migration never fails a live webhook.
 */
async function logTrifoldRevenue(admin, invoice) {
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
  const devanCents = Math.min(DEVAN_CENTS_PER_INVOICE, amountCents);

  const { error } = await admin.from('trifold_revenue_log').insert({
    stripe_invoice_id: invoice.id,
    stripe_subscription_id: subId,
    amount_cents: amountCents,
    fee_cents: 0, // no Connect application fee anymore — the wallet is the split
    devan_cents: devanCents,
    currency: String(invoice.currency || 'usd').toLowerCase(),
  });
  if (error) throw new Error(error.message);
}

/**
 * Credit Devan's in-house wallet $4.99 for this paid invoice.
 * Idempotent: the reference (trifold:invoice:<id>) means a redelivered
 * webhook can never pay twice. Skips with a warning when the editor's
 * user id isn't configured yet — the money is still audited in
 * trifold_revenue_log, and Merlin can set TRIFOLD_EDITOR_USER_ID later.
 */
async function creditDevanWallet(admin, invoice, subId) {
  const devanId = await getEditorUserId(admin);
  if (!devanId) {
    console.warn('TRIFOLD: no editor user id configured — $4.99 stays on the platform until TRIFOLD_EDITOR_USER_ID is set.');
    return;
  }
  const currency = String(invoice.currency || 'usd').toLowerCase();
  const res = await creditWallet(admin, devanId, {
    program: 'trifold',
    amountCents: DEVAN_CENTS_PER_INVOICE,
    reason: `TRIFOLD subscription revenue — invoice ${invoice.id}`,
    reference: trifoldInvoiceReference(invoice.id),
    currency,
  });
  if (res.duplicate) console.log('TRIFOLD: wallet credit already applied for', invoice.id);
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
