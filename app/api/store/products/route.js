// app/api/store/products/route.js
// GET /api/store/products — lists ALL active Stripe products for the store
// page. Server-side only: STRIPE_SECRET_KEY never leaves the server.
//
// Every product is looked up live from Stripe at runtime (by id from the
// list), so names, prices, and images are never hardcoded in the app.
//
// Response:
//   { configured: true, products: [ { id, name, description, priceCents,
//     currency, priceLabel, image, kind, priceId } ] }
//   { configured: false, products: [], notice }  (no Stripe key)
//
// `kind` is a soft grouping hint: Stripe metadata `kind` when set, else a
// name-based guess ('apparel' for hoodies/shirts/etc.), else 'other'. The
// store page groups apparel first and puts anything unclassified under
// "More" — nothing is hidden.
import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

const APPAREL_RE = /hoodie|sweatshirt|t-?shirt|shirt|jacket|cap|beanie|socks|sweater|apparel|crewneck/i;

function kindOf(product) {
  const explicit = (product?.metadata?.kind || '').trim().toLowerCase();
  if (explicit) return explicit;
  if (APPAREL_RE.test(product?.name || '')) return 'apparel';
  return 'other';
}

function formatMoney(cents, currency) {
  try {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: (currency || 'cad').toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)} ${(currency || 'cad').toUpperCase()}`;
  }
}

export const GET = apiGuard(async function GET() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({
      configured: false,
      products: [],
      notice: 'The store is not connected yet. Check back soon.',
    });
  }

  let stripe;
  try {
    const mod = await import('stripe');
    const Stripe = mod.default || mod.Stripe || mod;
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  } catch {
    return NextResponse.json({
      configured: false,
      products: [],
      notice: 'The store is not connected yet. Check back soon.',
    });
  }

  try {
    // The catalog is large (hundreds of products), so page through the whole
    // active list instead of stopping at Stripe's single-page limit.
    const all = [];
    let startingAfter;
    for (let page = 0; page < 10; page++) {
      const list = await stripe.products.list({
        active: true,
        limit: 100,
        expand: ['data.default_price'],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      all.push(...(list.data || []));
      if (!list.has_more || !list.data?.length) break;
      startingAfter = list.data[list.data.length - 1].id;
    }

    const products = all
      .map((p) => {
        const price = p.default_price && typeof p.default_price === 'object' ? p.default_price : null;
        const unit = typeof price?.unit_amount === 'number' ? price.unit_amount : null;
        const currency = price?.currency || 'cad';
        return {
          id: p.id,
          name: p.name,
          description: p.description || '',
          priceCents: unit,
          currency,
          priceLabel: unit != null ? formatMoney(unit, currency) : 'Price on request',
          image: (p.images && p.images[0]) || null,
          kind: kindOf(p),
          priceId: price?.id || null,
          recurring: !!price?.recurring,
        };
      })
      .filter((p) => p.priceCents != null && p.priceId);

    return NextResponse.json({ configured: true, products });
  } catch (err) {
    return NextResponse.json(
      { configured: false, products: [], notice: 'Could not reach the store right now. Please try again later.' },
      { status: 502 }
    );
  }
});
