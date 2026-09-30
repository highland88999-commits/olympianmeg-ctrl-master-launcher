// app/api/hermes/checkout/route.js
// POST { name, url, category, useGold?, idemKey? }
//   -> { ok, type:'stripe', url, ... } (Stripe Checkout URL)
//   -> { ok, type:'gold', notice, ... } (gold covered the $2 listing — live now)
// Price is fixed server-side: $2.00 USD for a 12-month listing. One listing per domain.
// Gold redemption requires a signed-in user (gold is per-account); the listing
// itself stays guest-submittable for card payment.
import Stripe from 'stripe';
import { getAdminClient, jsonError } from '../_server.js';
import { getUserFromRequest as getGoldUser } from '@/lib/economy/auth';
import { applyGoldCheckout } from '@/lib/economy/checkout';
import {
  validateSubmission,
  isDuplicateDomain,
  buildLineItem,
  listingExpiryIso,
  LISTING_TERMS,
} from '@/lib/hermes/listings.js';
import { apiGuard } from '@/lib/api-guard';

export const POST = apiGuard(async function POST(req) {
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

  const useGold = body?.useGold === true;
  const idemKey = typeof body?.idemKey === 'string' && body.idemKey.length > 0 && body.idemKey.length <= 80
    ? body.idemKey
    : null;
  if (useGold && !idemKey) return jsonError('Checkout key missing. Please try again.', 400);

  // Gold is per-account: redemption needs a verified user.
  let goldUserId = null;
  if (useGold) {
    const goldAuth = await getGoldUser(req);
    if (goldAuth.error) return jsonError(goldAuth.error, goldAuth.status);
    goldUserId = goldAuth.user.id;
  }

  let supabase;
  try {
    supabase = getAdminClient();
  } catch {
    return jsonError('Listings are not available right now. Try again later.', 503);
  }

  // One listing per domain (checks pending + approved).
  const { data: existing, error: existingError } = await supabase
    .from('hermes_links')
    .select('root_domain')
    .in('payment_status', ['pending', 'approved']);
  if (existingError) {
    return jsonError('Could not check the directory. Try again.', 500);
  }
  if (isDuplicateDomain(rootDomain, (existing || []).map((r) => r.root_domain))) {
    return jsonError('That domain already has a listing in the directory.', 409);
  }

  // Record the pending submission first so the webhook / gold fulfillment can
  // match it exactly.
  const { data: inserted, error: insertError } = await supabase
    .from('hermes_links')
    .insert({ name, url, root_domain: rootDomain, category, payment_status: 'pending' })
    .select('submission_id')
    .single();

  if (insertError || !inserted) {
    return jsonError('Could not save your submission. Try again.', 500);
  }
  const submissionId = inserted.submission_id;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripe = stripeKey ? new Stripe(stripeKey) : null;
  if (!stripe && !useGold) {
    return jsonError('Payments are not set up yet. Your submission was saved and is pending.', 503);
  }

  const item = buildLineItem(check.data); // fixed server-side: $2.00
  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || '';

  try {
    const result = await applyGoldCheckout({
      surface: 'hermes',
      userId: goldUserId,
      totalCents: item.unit_amount,
      useGold,
      idemKey: idemKey || crypto.randomUUID(),
      stripe,
      buildSessionParams: ({ amountCents, gold }) => ({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: item.currency,
              product_data: {
                name: item.name,
                description: item.description
                  + (gold.goldAppliedCents > 0
                    ? ` Gold applied: ${gold.goldAppliedGold} gold (-$${(gold.goldAppliedCents / 100).toFixed(2)}).`
                    : ''),
              },
              unit_amount: amountCents, // fixed server-side, minus any gold
            },
            quantity: item.quantity,
          },
        ],
        mode: 'payment',
        success_url: `${origin}/hermes?success=true`,
        cancel_url: `${origin}/hermes?cancelled=true`,
        metadata: {
          submission_id: submissionId,
          root_domain: rootDomain,
          gold_applied_gold: String(gold.goldAppliedGold),
          gold_applied_cents: String(gold.goldAppliedCents),
        },
      }),
      // Paid-by-gold: approve the listing directly (mirrors the webhook;
      // only flips pending -> approved, so retries are safe).
      fulfillPaidByGold: async ({ goldSpentGold }) => {
        const { error } = await supabase
          .from('hermes_links')
          .update({
            payment_status: 'approved',
            approved_at: new Date().toISOString(),
            expires_at: listingExpiryIso(),
          })
          .eq('submission_id', submissionId)
          .eq('payment_status', 'pending');
        if (error) {
          const e = new Error('Could not publish your listing. Your gold has been refunded — please try again.');
          e.status = 502; throw e;
        }
        return {
          notice: `Paid with ${goldSpentGold.toLocaleString('en-US')} gold — your listing is live in the directory. No card charged.`,
        };
      },
    });

    if (result.type === 'gold') {
      return Response.json({
        ok: true,
        type: 'gold',
        goldAppliedGold: result.goldAppliedGold,
        goldAppliedCents: result.goldAppliedCents,
        notice: result.fulfillment.notice,
        terms: LISTING_TERMS.summary,
      });
    }

    // Tie the Stripe session to the submission for support/debugging.
    await supabase
      .from('hermes_links')
      .update({ stripe_session_id: result.sessionId })
      .eq('submission_id', submissionId);

    return Response.json({
      ok: true,
      type: 'stripe',
      url: result.url,
      goldAppliedGold: result.goldAppliedGold,
      goldAppliedCents: result.goldAppliedCents,
      chargeCents: result.chargeCents,
      terms: LISTING_TERMS.summary,
    });
  } catch (err) {
    console.error('Hermes checkout error:', err?.message || err);
    return jsonError(err.message || 'Could not start checkout. Try again.', err.status || 500);
  }
});
