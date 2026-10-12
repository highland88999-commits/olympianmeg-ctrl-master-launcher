// app/api/store/custom/create/route.js
// POST /api/store/custom/create — Custom Hoodie Designer backend.
//
// Takes a user-designed print file (base64 PNG, already composited at print
// resolution by the /store/custom designer canvas) and:
//   1. Uploads it to Printful Files (POST /files)
//   2. Creates a real sync product in Omega Store (POST /store/products)
//      on the same base as Merlin's hoodies: All-Over Print Recycled Unisex
//      Hoodie, White, 2XS-6XL (11 variants), CA$95.00
//   3. Returns the product id + Printful mockup so the designer can show
//      the official render and hand off to the existing checkout flow.
//
// Server-side only: PRINTFUL_API_KEY never leaves the server.
// Writes are real (a real Printful product is created) — the designer UI
// makes that explicit before the user confirms.
import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const PF_BASE = 'https://api.printful.com';
const STORE_ID = '17419146';
// Unisex Hoodie variant IDs (White, 2XS-6XL) — same base as Merlin's hoodies.
const VARIANTS = [18730, 10869, 10870, 10871, 10872, 10873, 10874, 10875, 18731, 18732, 18733];
const RETAIL_PRICE = '95.00';
const CURRENCY = 'CAD';

function pfHeaders() {
  return {
    Authorization: 'Bearer ' + (process.env.PRINTFUL_API_KEY || ''),
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'olympusverse-store/1.0',
    'X-PF-Store-Id': STORE_ID,
  };
}

async function pf(method, path, body) {
  const res = await fetch(PF_BASE + path, {
    method,
    headers: pfHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  const code = (data && typeof data.code === 'number') ? data.code : res.status;
  if (code < 200 || code >= 300) {
    const msg = (data && data.error && data.error.message) || `Printful ${code}`;
    throw new Error(msg);
  }
  return data.result;
}

export const POST = apiGuard(async (req) => {
  if (!process.env.PRINTFUL_API_KEY) {
    return NextResponse.json(
      { ok: false, error: 'Store not connected yet.' },
      { status: 503 }
    );
  }

  let body = null;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }

  const { imageBase64, fileName, designName } = body || {};
  if (!imageBase64 || typeof imageBase64 !== 'string' || imageBase64.length < 100) {
    return NextResponse.json({ ok: false, error: 'No design image received.' }, { status: 400 });
  }
  if (imageBase64.length > 25 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: 'Design image too large.' }, { status: 400 });
  }

  const safeName = (designName || 'Custom Hoodie').toString().slice(0, 80) || 'Custom Hoodie';
  const safeFile = (fileName || 'custom-hoodie.png').toString().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);

  // 1. Upload the print file to Printful.
  const stripPrefix = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const file = await pf('POST', '/files', { file_name: safeFile, data: stripPrefix });
  const fileId = file && file.id;
  if (!fileId) throw new Error('Printful file upload failed.');

  // 2. Create the sync product with all 11 size variants.
  const created = await pf('POST', '/store/products', {
    sync_product: { name: `Unisex Hoodie - Custom: ${safeName}` },
    sync_variants: VARIANTS.map((vid) => ({
      variant_id: vid,
      retail_price: RETAIL_PRICE,
      currency: CURRENCY,
      files: [{ id: fileId }],
    })),
  });
  const sp = (created && (created.sync_product || created)) || {};
  const productId = sp.id;
  if (!productId) throw new Error('Printful product creation failed.');

  // 3. Fetch the product to get Printful's official mockup image.
  let mockupUrl = null;
  try {
    const detail = await pf('GET', `/store/products/${productId}`);
    const dsp = (detail && (detail.sync_product || detail)) || {};
    mockupUrl = dsp.thumbnail_url || dsp.image || null;
  } catch { /* mockup optional — product still created */ }

  // 4. Create the matching Stripe product so Buy Now works immediately
  //    (the checkout re-prices from Stripe by exact name — same pattern as
  //    /api/store/sync-products). Skipped honestly when Stripe isn't set up.
  let stripeReady = false;
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const mod = await import('stripe');
      const Stripe = mod.default || mod.Stripe || mod;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const productName = sp.name || `Unisex Hoodie - Custom: ${safeName}`;
      await stripe.products.create({
        name: productName,
        images: mockupUrl ? [mockupUrl] : undefined,
        metadata: { surface: 'store', printful_id: String(productId), custom: 'true' },
        default_price_data: { unit_amount: 9500, currency: 'cad' },
      }, { idempotencyKey: `store_custom_${productId}` });
      stripeReady = true;
    } catch { /* Stripe sync failed — product exists, checkout may need a manual sync */ }
  }

  return NextResponse.json({
    ok: true,
    productId,
    productName: sp.name || `Unisex Hoodie - Custom: ${safeName}`,
    mockupUrl,
    stripeReady,
  });
});
