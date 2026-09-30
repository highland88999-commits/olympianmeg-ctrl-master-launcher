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
// `checkoutReady` is false for every Printful card until Merlin approves
// wiring checkout: the page keeps the buy CTA honestly disabled.
import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import {
  getCatalog,
  isPrintfulConfigured,
  noticeForError,
} from '@/lib/store-printful';

export const dynamic = 'force-dynamic';
// A cold catalog fetch makes ~370 Printful API calls (paginated list +
// per-product detail for variant prices) inside Printful's ~120 req/min
// rate limit, so the first fetch after a deploy can take minutes. Pro
// project: allow the full window; the 10-min cache + warming cron keep
// every later request instant.
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
    const products = await getCatalog();
    return NextResponse.json({ configured: true, products });
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
