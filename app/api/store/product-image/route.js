// app/api/store/product-image/route.js
// GET /api/store/product-image?id=pf_123456 | 123456 → { image }
//
// Lazy mockup resolution for store cards (2026-10-21). The Printful
// store LIST payload's thumbnail_url is the bare CDN root for ~94% of
// the Omega catalog (it 403s and rendered as a broken-image glyph), so
// cards whose list thumbnail is degenerate ask here for the product's
// real mockup: lib/store-printful's getProductImage reads the product
// detail once and returns the first sync variant's 'preview' file URL
// (cached server-side). A null image is an honest answer — the card
// keeps its kaleidoscope/placeholder and never renders a broken glyph.
import { NextResponse } from 'next/server';
import { getProductImage, isPrintfulConfigured } from '@/lib/store-printful';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const raw = new URL(request.url).searchParams.get('id') || '';
  const id = raw.replace(/^pf_/, '');
  if (!/^\d+$/.test(id) || !isPrintfulConfigured()) {
    return NextResponse.json({ image: null }, { status: 200 });
  }
  const image = await getProductImage(id);
  return NextResponse.json(
    { image },
    {
      headers: image
        ? { 'Cache-Control': 'public, max-age=1800' }
        : { 'Cache-Control': 'public, max-age=300' },
    }
  );
}
