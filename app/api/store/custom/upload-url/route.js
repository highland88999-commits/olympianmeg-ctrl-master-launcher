// app/api/store/custom/upload-url/route.js
// POST /api/store/custom/upload-url — mint one-time signed upload URLs
// so the Custom Designer can stage each print PNG directly in Supabase
// Storage as a binary file (see lib/store/design-upload.js for why the
// old base64-in-JSON transport broke on real phones).
//
// Body: { productKey, keys: [placementKey, ...] }
// The template and its placement keys are validated against the
// server-side config — a client can only ever stage files for real
// placements of a real template, under unguessable paths. The create
// route re-validates the path shape and the PNG itself before anything
// reaches Printful.
import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import {
  getCustomProduct,
  DEFAULT_PRODUCT_KEY,
  placementsFor,
} from '@/lib/store/custom-products';
import { mintDesignUpload } from '@/lib/store/design-upload';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = apiGuard(async (req) => {
  let body = null;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }

  const product = getCustomProduct((body && body.productKey) || DEFAULT_PRODUCT_KEY);
  if (!product) {
    return NextResponse.json({ ok: false, error: 'Unknown product template.' }, { status: 400 });
  }

  const validKeys = new Set(placementsFor(product).map((p) => p.key));
  const requested = body && Array.isArray(body.keys) ? body.keys : [];
  const keys = [...new Set(requested.filter((k) => typeof k === 'string' && validKeys.has(k)))];
  if (!keys.length) {
    return NextResponse.json({ ok: false, error: 'No design files to upload.' }, { status: 400 });
  }

  const uploads = [];
  for (const key of keys) {
    uploads.push(await mintDesignUpload(key));
  }
  return NextResponse.json({ ok: true, uploads });
});
