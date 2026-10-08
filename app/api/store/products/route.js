// app/api/store/products/route.js
// GET /api/store/products — lists Merlin's real catalog from Printful
// ("Omega Store", 368 published products). Server-side only:
// PRINTFUL_API_KEY never leaves the server.
//
// The catalog is cached server-side for 10 minutes (stale-while-revalidate)
// so the page stays fast; every card maps 1:1 to a Printful product —
// nothing is hardcoded, nothing is invented.
//
// Response:
//   { configured: true, products: [ { id, name, description, priceCents,
//     currency, priceLabel, image, kind, priceId, checkoutReady,
//     variantCount } ] }
//   { configured: false, products: [], notice }  (no Printful key, or the
//     Printful API could not be reached — honest, never fake products)
//
// `kind` is a soft grouping hint from the product name ('apparel' for
// hoodies/shirts/etc., else 'other'). The store page groups apparel first
// and puts anything unclassified under "More" — nothing is hidden.
// `checkoutReady` is true when Stripe is configured server-side: the buy
// CTA enables and POST /api/store/checkout runs the real server-priced
// flow. Without STRIPE_SECRET_KEY the CTA stays honestly disabled
// ("Checkout coming soon"). Note the checkout re-prices every product from
// Stripe by exact name at purchase time — run POST /api/store/sync-products
// (Merlin-only) once so the catalog exists in Stripe before selling.
import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import {
  getCatalog,
  isPrintfulConfigured,
  noticeForError,
} from '@/lib/store-printful';

export const dynamic = 'force-dynamic';
// A cold catalog fetch paginates the Printful store list (4-5 list calls
// for 368 products) inside Printful's ~120 req/min rate limit, with 429
// retries. Pro project: allow the full window; the 10-min cache + warming
// cron keep every later request instant.
export const maxDuration = 300;

export const GET = apiGuard(async function GET() {
  if (!isPrintfulConfigured()) {
    return NextResponse.json({
      configured: false,
      products: [],
      notice: 'The store is not connected yet. Check back soon.',
    });
  }

  try {
    const catalog = await getCatalog();
    const checkoutReady = !!process.env.STRIPE_SECRET_KEY;
    return NextResponse.json({
      configured: true,
      products: catalog.map((p) => ({ ...p, checkoutReady })),
    });
  } catch (err) {
    return NextResponse.json(
      {
        configured: false,
        products: [],
        notice: noticeForError(err && err.status),
      },
      { status: 502 }
    );
  }
});
