// app/api/store/variants/route.js
// GET /api/store/variants?productId=pf_474601990
//   -> { sizes: ['2XS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'] }
//
// The store page's size picker is honest: it offers exactly the sizes
// Printful reports as active for that design, in Printful's size order.
// Server-side only — PRINTFUL_API_KEY never leaves the server.
import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getProductVariants, isPrintfulConfigured } from '@/lib/store-printful';

export const dynamic = 'force-dynamic';

export const GET = apiGuard(async function GET(req) {
  if (!isPrintfulConfigured()) {
    return NextResponse.json({ sizes: [] }, { status: 503 });
  }
  const productId = req.nextUrl.searchParams.get('productId') || '';
  const m = /^pf_(\d+)$/.exec(productId.trim());
  if (!m) {
    return NextResponse.json({ error: 'Invalid product.' }, { status: 400 });
  }
  try {
    const variants = await getProductVariants(m[1]);
    return NextResponse.json({
      sizes: variants.filter((v) => v.available).map((v) => v.size),
    });
  } catch {
    // A Printful hiccup must not break the page: the card falls back to
    // its default size list and checkout re-validates server-side anyway.
    return NextResponse.json({ sizes: [] }, { status: 502 });
  }
});
