// app/api/hermes/checkout/route.js
// POST { name, url, category } -> { ok, url } (Stripe Checkout URL).
// Price is fixed server-side: $2.00 USD for a 12-month listing. One listing per domain.
import Stripe from 'stripe';
import { getAdminClient, jsonError } from '../_server.js';
import {
  validateSubmission,
  isDuplicateDomain,
  buildLineItem,
  LISTING_TERMS,
} from '@/lib/hermes/listings.js';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError('Could not read your submission. Try again.', 400);
  }

  const check = validateSubmission(body);
  if (!check.ok) {
    return jsonError(check.errors[0], 400);
  }
  const { name, url, rootDomain, category } = check.data;

  let supabase;
  try {
    supabase = getAdminClient();
  } catch {
    return jsonError('Listings are not available right now. Try again later.', 503);
  }

  // One listing per domain (checks pending + approved).
  const { data: existing } = await supabase
    .from('hermes_links')
    .select('root_domain')
    .in('payment_status', ['pending', 'approved']);
  if (isDuplicateDomain(rootDomain, (existing || []).map((r) => r.root_domain))) {
    return jsonError('That domain already has a listing in the directory.', 409);
  }

  // Record the pending submission first so the webhook can match it exactly.
  const { data: inserted, error: insertError } = await supabase
    .from('hermes_links')
    .insert({ name, url, root_domain: rootDomain, category, payment_status: 'pending' })
    .select('submission_id')
    .single();

  if (insertError || !inserted) {
    return jsonError('Could not save your submission. Try again.', 500);
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return jsonError('Payments are not set up yet. Your submission was saved and is pending.', 503);
  }

  const stripe = new Stripe(stripeKey);
  const item = buildLineItem(check.data);
  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || '';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: item.currency,
            product_data: { name: item.name, description: item.description },
            unit_amount: item.unit_amount, // fixed server-side
          },
          quantity: item.quantity,
        },
      ],
      mode: 'payment',
      success_url: `${origin}/hermes?success=true`,
      cancel_url: `${origin}/hermes?cancelled=true`,
      metadata: {
        submission_id: inserted.submission_id,
        root_domain: rootDomain,
      },
    });

    // Tie the Stripe session to the submission for support/debugging.
    await supabase
      .from('hermes_links')
      .update({ stripe_session_id: session.id })
      .eq('submission_id', inserted.submission_id);

    return Response.json({ ok: true, url: session.url, terms: LISTING_TERMS.summary });
  } catch (err) {
    console.error('Hermes checkout error:', err?.message || err);
    return jsonError('Could not start checkout. Try again.', 500);
  }
}
