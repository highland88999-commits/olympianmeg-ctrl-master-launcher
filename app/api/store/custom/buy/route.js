// app/api/store/custom/buy/route.js
// POST /api/store/custom/buy — purchase a Custom Product Designer
// creation at its recorded price.
//
//   { productId: 'pf_<printfulSyncId>' (or printfulId / stripeProductId),
//     size?, baselineOffer? }
//   -> { type: 'stripe', url, amountCents, baselineOffer }
//
// The amount NEVER comes from the client. It is read from the creation
// record (lib/store/custom-creations.js): the store price is baseline +
// creator markup, both stamped server-side at creation time. This route
// exists alongside the generic /api/store/checkout (which prices from
// the Printful catalog cards) because a creation's price lives in its
// own record — including the creator markup the catalog doesn't know.
//
// Creator baseline offer (Merlin, 2026-10-13): a creator's first copy
// of their own creation is offered at the BASELINE price (no markup).
// Enforced here, server-side:
//   - the buyer must be a verified Supabase user AND the record's
//     creator — guests and other users pay the store price;
//   - one redemption per creation: a paid baseline session redeems it
//     forever (the store webhook also marks redemption on payment);
//     an open baseline session is resumed rather than duplicated; an
//     expired one releases the claim so the creator can try again.
// Sessions carry the same metadata family as /api/store/checkout
// (surface, printful ids, product_id + cogs_lines) so the store webhook
// flips the order to paid and affiliate true-COGS resolution works for
// custom sales too. Session metadata also carries creator_user_id +
// markup_cents (gross) for the future wallet-crediting step — this
// route credits nobody.
//
// Card only: gold redemption stays on the generic store checkout.
import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getProductVariants } from '@/lib/store-printful';
import { encodeStoreCogsLines } from '@/lib/affiliates/costs';
import {
  optionalUserFromRequest,
  getCreationRecord,
  getBaselineClaimSession,
  baselineOfferState,
  claimBaselineOffer,
  releaseBaselineClaim,
  markBaselineOfferRedeemed,
} from '@/lib/store/custom-creations';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function loadStripe() {
  try {
    const mod = await import('stripe');
    const Stripe = mod.default || mod.Stripe || mod;
    return new Stripe(process.env.STRIPE_SECRET_KEY);
  } catch {
    return null;
  }
}

// Pending-order record, same best-effort anon-key pattern as
// /api/store/checkout — the store webhook flips it to paid by session
// id. Never fails the purchase.
async function recordPendingOrder({ sessionId, userId, productName, amountCents, currency, size, printfulId, variantId, note }) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, key);
    await supabase.from('store_orders').insert([
      {
        user_id: userId || null,
        stripe_session_id: sessionId,
        product_name: productName,
        price_id: null,
        amount_cents: amountCents,
        currency,
        size: size || null,
        printful_product_id: String(printfulId),
        printful_variant_id: String(variantId),
        status: 'pending_payment',
        customer_notes: note,
      },
    ]);
  } catch {
    // Bookkeeping only.
  }
}

export const POST = apiGuard(async (req) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { ok: false, error: 'Card payments are not connected yet. Please check back soon.' },
      { status: 503 }
    );
  }

  let body = null;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }

  // Identify the creation without trusting anything else from the client.
  let printfulId = null;
  const pidRaw = String((body && (body.productId || body.printfulId)) || '').trim();
  const pfMatch = /^pf_(\d+)$/.exec(pidRaw);
  if (pfMatch) printfulId = pfMatch[1];
  else if (/^\d+$/.test(pidRaw)) printfulId = pidRaw;
  const stripeProductId =
    body && typeof body.stripeProductId === 'string' && body.stripeProductId.startsWith('prod_')
      ? body.stripeProductId
      : null;
  if (!printfulId && !stripeProductId) {
    return NextResponse.json({ ok: false, error: 'Invalid product.' }, { status: 400 });
  }

  const record = await getCreationRecord({ printfulId, stripeProductId });
  if (!record || !record.printfulProductId) {
    return NextResponse.json(
      { ok: false, error: "This creation isn't available to buy yet." },
      { status: 404 }
    );
  }
  printfulId = record.printfulProductId;

  // Resolve the variant from Printful's live list (same rule as the
  // generic checkout): multi-variant creations need a valid size;
  // single-variant creations fulfill their one variant.
  let variant = null;
  let needsSize = false;
  try {
    const variants = await getProductVariants(printfulId);
    const live = (variants || []).filter((v) => v.available);
    if (!live.length) throw new Error('That product is not available right now.');
    needsSize = live.length > 1;
    if (needsSize) {
      const wantSize = String((body && body.size) || '').trim();
      if (!wantSize) {
        return NextResponse.json({ ok: false, error: 'Please choose a size.' }, { status: 400 });
      }
      variant = live.find((v) => v.size.toLowerCase() === wantSize.toLowerCase());
      if (!variant) {
        return NextResponse.json(
          { ok: false, error: `Size ${wantSize} isn't available for this design right now.` },
          { status: 400 }
        );
      }
    } else {
      variant = live[0];
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err.message || 'That product is not available right now.' },
      { status: 400 }
    );
  }

  const stripe = await loadStripe();
  if (!stripe) {
    return NextResponse.json(
      { ok: false, error: 'Card payments are not connected yet. Please check back soon.' },
      { status: 503 }
    );
  }

  const buyer = await optionalUserFromRequest(req);
  const wantsBaseline = !!(body && body.baselineOffer === true);
  let amountCents = record.finalCents;
  let isBaselineOffer = false;

  if (wantsBaseline) {
    if (!buyer) {
      return NextResponse.json(
        { ok: false, error: 'Sign in to use your creator offer.' },
        { status: 401 }
      );
    }
    if (!record.creatorUserId || buyer.id !== record.creatorUserId) {
      return NextResponse.json(
        { ok: false, error: 'The baseline offer is only for the creator of this design.' },
        { status: 403 }
      );
    }
    // One redemption per creation, verified against Stripe — never
    // against the client's word.
    const claimSession = await getBaselineClaimSession(record);
    const state = baselineOfferState(record, claimSession);
    if (state === 'redeemed' || state === 'claimed-paid') {
      if (state === 'claimed-paid') {
        await markBaselineOfferRedeemed(printfulId, record.baselineOfferSessionId);
      }
      return NextResponse.json(
        { ok: false, error: 'Your baseline offer for this creation has already been used.' },
        { status: 409 }
      );
    }
    if (state === 'claimed-open') {
      if (claimSession && claimSession.url) {
        // Resume the open checkout instead of issuing a second one.
        return NextResponse.json({
          ok: true, type: 'stripe', url: claimSession.url,
          amountCents: record.baselineCents, baselineOffer: true, resumed: true,
        });
      }
      return NextResponse.json(
        { ok: false, error: 'Your baseline checkout is still open — please complete it or let it expire.' },
        { status: 409 }
      );
    }
    if (state === 'claimed-expired') {
      await releaseBaselineClaim(record);
    }
    amountCents = record.baselineCents;
    isBaselineOffer = true;
  }

  const lineName = needsSize
    ? `${record.productName || 'Custom creation'} (${variant.size})`
    : record.productName || 'Custom creation';
  const origin = req.nextUrl.origin;

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      currency: record.currency || 'cad',
      line_items: [
        {
          price_data: {
            currency: record.currency || 'cad',
            unit_amount: amountCents,
            product_data: { name: lineName },
          },
          quantity: 1,
        },
      ],
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      metadata: {
        surface: 'store',
        product_name: record.productName || lineName,
        printful_product_id: String(printfulId),
        printful_variant_id: String(variant.variantId),
        size: needsSize ? variant.size : '',
        product_id: `pf_${printfulId}`,
        ...encodeStoreCogsLines([
          {
            product_id: `pf_${printfulId}`,
            variant_id: String(variant.variantId),
            size: variant.size,
            qty: 1,
          },
        ]),
        custom_creation: 'true',
        custom_template_key: record.templateKey || '',
        creator_user_id: record.creatorUserId || '',
        baseline_cents: String(record.baselineCents),
        markup_cents: String(record.markupCents),
        ...(isBaselineOffer
          ? { custom_baseline_offer: 'true', custom_stripe_product_id: record.stripeProductId || '' }
          : {}),
        gold_applied_gold: '0',
        gold_applied_cents: '0',
        hoodie_units: '0',
      },
      success_url: `${origin}/store?checkout=success`,
      cancel_url: `${origin}/store/custom?checkout=cancelled`,
    },
    { idempotencyKey: `store_custom_buy_${crypto.randomUUID()}` }
  );

  if (isBaselineOffer) {
    // Claim AFTER the session exists, BEFORE answering — a second
    // baseline request now finds this claim and resumes/verifies it.
    await claimBaselineOffer(record, session.id);
  }

  await recordPendingOrder({
    sessionId: session.id,
    userId: buyer ? buyer.id : null,
    productName: lineName.slice(0, 200),
    amountCents,
    currency: record.currency || 'cad',
    size: needsSize ? variant.size : null,
    printfulId,
    variantId: variant.variantId,
    note: isBaselineOffer
      ? 'Custom creation — creator baseline offer (first copy at base price, no markup).'
      : 'Custom creation purchase.',
  });

  return NextResponse.json({
    ok: true,
    type: 'stripe',
    url: session.url,
    amountCents,
    baselineOffer: isBaselineOffer,
  });
});
