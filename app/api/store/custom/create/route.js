// app/api/store/custom/create/route.js
// POST /api/store/custom/create — Custom Product Designer backend.
//
// Takes a user-designed print file (base64 PNG, already composited at the
// chosen product's print resolution by the /store/custom designer canvas)
// and:
//   1. Uploads it to Printful Files (POST /files)
//   2. Creates a real sync product in Omega Store (POST /store/products)
//      on the blank template the user picked — see
//      lib/store/custom-products.js for the templates (the original
//      All-Over Print Recycled Unisex Hoodie, White, 2XS-6XL, CA$95,
//      remains the default when no productKey is sent)
//   3. Sets the sync product thumbnail explicitly from Printful's
//      generated mockup/preview (standing store rule)
//   4. Returns the product id + mockup so the designer can show the
//      official render and hand off to the existing checkout flow.
//
// Server-side only: PRINTFUL_API_KEY never leaves the server. The product
// template (variants, price, placements) is read from the server-side
// config — never from the client.
// Writes are real (a real Printful product is created) — the designer UI
// makes that explicit before the user confirms.
//
// Creator markup (2026-10-13): the client may submit a markup in CAD
// dollars; the store price (baseline + markup) is computed HERE from
// the template config and stamped on both the Printful variants and the
// Stripe product. The creation is recorded with its creator + full
// pricing breakdown (lib/store/custom-creations.js) for the creator
// pages and wallet-crediting steps.
import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import {
  getCustomProduct,
  DEFAULT_PRODUCT_KEY,
  parseMarkupToCents,
  finalPriceCents,
  centsToCadString,
} from '@/lib/store/custom-products';
import {
  optionalUserFromRequest,
  insertCreationRecord,
  stripeMetadataForRecord,
} from '@/lib/store/custom-creations';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const PF_BASE = 'https://api.printful.com';
const STORE_ID = '17419146';
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

// Width/height from a PNG's IHDR header (bytes 16-24), or null when the
// payload isn't a PNG. Used to confirm the client exported at the chosen
// product's print resolution before anything is created.
function pngDimensions(base64) {
  try {
    const buf = Buffer.from(base64.slice(0, 64), 'base64');
    if (buf.length < 24) return null;
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } catch { return null; }
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

  const { imageBase64, fileName, designName, productKey, markup } = body || {};
  if (!imageBase64 || typeof imageBase64 !== 'string' || imageBase64.length < 100) {
    return NextResponse.json({ ok: false, error: 'No design image received.' }, { status: 400 });
  }
  if (imageBase64.length > 25 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: 'Design image too large.' }, { status: 400 });
  }

  // Template selection is server-authoritative. A missing productKey
  // (older clients) means the original hoodie; an unknown one is an error.
  const product = getCustomProduct(productKey || DEFAULT_PRODUCT_KEY);
  if (!product) {
    return NextResponse.json({ ok: false, error: 'Unknown product template.' }, { status: 400 });
  }

  // Creator markup (Merlin's creator marketplace): the client submits
  // ONLY the markup amount in CAD dollars; the store price is recomputed
  // here from the template baseline — a client-supplied final price is
  // never trusted (payment law). An absent markup means 0 (older
  // clients, the plain purchase path). Invalid markup creates nothing.
  const parsedMarkup = parseMarkupToCents(markup, product.priceCents);
  if (!parsedMarkup.ok) {
    return NextResponse.json({ ok: false, error: parsedMarkup.error }, { status: 400 });
  }
  const markupCents = parsedMarkup.markupCents;
  const finalCents = finalPriceCents(product.priceCents, markupCents);
  const finalCad = centsToCadString(finalCents);

  // Creator identity: a verified Supabase user when the client sent its
  // session token; guests may still create (attribution stays empty and
  // no baseline offer attaches — see lib/store/custom-creations.js).
  const creator = await optionalUserFromRequest(req);

  const stripPrefix = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const dims = pngDimensions(stripPrefix);
  if (dims && (dims.w !== product.print.w || dims.h !== product.print.h)) {
    return NextResponse.json(
      { ok: false, error: 'Design image has the wrong print size for this product.' },
      { status: 400 }
    );
  }

  const safeName = (designName || `Custom ${product.name}`).toString().slice(0, 80) || `Custom ${product.name}`;
  const safeFile = (fileName || `custom-${product.key}.png`).toString().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);

  // 1. Upload the print file to Printful.
  const file = await pf('POST', '/files', { file_name: safeFile, data: stripPrefix });
  const fileId = file && file.id;
  if (!fileId) throw new Error('Printful file upload failed.');

  // 2. Create the sync product with the template's variants. The design
  //    file attaches to the template's placement(s) — the hoodie keeps
  //    its original type-less attachment (the product's default
  //    placement); joggers attach to both leg placements.
  const files = product.fileTypes.length
    ? product.fileTypes.map((type) => ({ type, id: fileId }))
    : [{ id: fileId }];
  const created = await pf('POST', '/store/products', {
    sync_product: { name: `${product.name} - Custom: ${safeName}` },
    sync_variants: product.variants.map((v) => ({
      variant_id: v.id,
      retail_price: finalCad,
      currency: CURRENCY,
      files,
    })),
  });
  const sp = (created && (created.sync_product || created)) || {};
  const productId = sp.id;
  if (!productId) throw new Error('Printful product creation failed.');

  // 3. Fetch the product to get Printful's official mockup image, then
  //    set the thumbnail explicitly from it (standing store rule).
  //    Best-effort: the product exists either way.
  let mockupUrl = null;
  try {
    const detail = await pf('GET', `/store/products/${productId}`);
    const dsp = (detail && (detail.sync_product || detail)) || {};
    mockupUrl = dsp.thumbnail_url || dsp.image || null;
    if (mockupUrl) {
      try {
        await pf('PUT', `/store/products/${productId}`, {
          sync_product: { thumbnail: mockupUrl },
        });
      } catch { /* thumbnail set is best-effort */ }
    }
  } catch { /* mockup optional — product still created */ }

  // 4. Create the matching Stripe product so Buy Now works immediately
  //    (same pattern as /api/store/sync-products), priced at the final
  //    store price (baseline + markup). The product's metadata carries
  //    the full creator-attribution record — see step 5. Skipped
  //    honestly when Stripe isn't set up.
  const productName = sp.name || `${product.name} - Custom: ${safeName}`;
  let stripeReady = false;
  let stripeProductId = null;
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const mod = await import('stripe');
      const Stripe = mod.default || mod.Stripe || mod;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const stripeProduct = await stripe.products.create({
        name: productName,
        images: mockupUrl ? [mockupUrl] : undefined,
        metadata: {
          surface: 'store',
          printful_id: String(productId),
          custom: 'true',
          product_key: product.key,
          ...stripeMetadataForRecord({
            creatorUserId: creator ? creator.id : null,
            templateKey: product.key,
            designName: safeName,
            productName,
            baselineCents: product.priceCents,
            markupCents,
            finalCents,
            currency: 'cad',
          }),
        },
        default_price_data: { unit_amount: finalCents, currency: 'cad' },
      }, { idempotencyKey: `store_custom_${productId}` });
      stripeProductId = stripeProduct.id;
      stripeReady = true;
    } catch { /* Stripe sync failed — product exists, checkout may need a manual sync */ }
  }

  // 5. Creator attribution record (lib/store/custom-creations.js). The
  //    Stripe metadata above already carries it; this best-effort insert
  //    lands the same record in Supabase once the prepared migration
  //    (supabase/migrations/20261013_store_custom_creations.sql) runs.
  //    Never fails the creation.
  await insertCreationRecord({
    creatorUserId: creator ? creator.id : null,
    creatorEmail: creator ? creator.email || null : null,
    templateKey: product.key,
    designName: safeName,
    productName,
    printfulProductId: String(productId),
    stripeProductId,
    baselineCents: product.priceCents,
    markupCents,
    finalCents,
    currency: 'cad',
  });

  return NextResponse.json({
    ok: true,
    productId,
    productName,
    mockupUrl,
    stripeReady,
    stripeProductId,
    productKey: product.key,
    // Pricing breakdown — all server-computed from the template config.
    baselineCents: product.priceCents,
    markupCents,
    finalCents,
    baselinePriceCad: product.priceCad,
    markupCad: centsToCadString(markupCents),
    finalPriceCad: finalCad,
    // The creator's one-time baseline offer attaches only to a verified
    // creator; the buy route re-verifies before honouring it.
    creatorAttached: !!creator,
    baselineOfferAvailable: !!creator,
  });
});
