// app/api/store/custom/create/route.js
// POST /api/store/custom/create — Custom Product Designer backend.
//
// Takes user-designed print files (base64 PNGs, already composited at
// each placement's print resolution by the /store/custom designer
// canvas) and:
//   1. Uploads each distinct graphic to Printful Files (POST /files)
//   2. Creates a real sync product in Omega Store (POST /store/products)
//      on the blank template the user picked — see
//      lib/store/custom-products.js for the templates (the original
//      All-Over Print Recycled Unisex Hoodie, White, 2XS-6XL, CA$95,
//      remains the default when no productKey is sent)
//
// Placements (Merlin's placement rules, 2026-10-13): the client sends
// one entry per placement in `images` — its own exported PNG, or
// `sameAs` naming another placement whose graphic it reuses (Rule 1:
// multi-placement templates take a different graphic per placement,
// or the same one, the user's choice). Older clients send a single
// `imageBase64` that fills every placement. On the AOP hoodie the
// front and pocket are LINKED (Rule 2, amended 2026-10-21): the
// client sends the front (labelled 'Front + Pocket') and, as its own
// placement, the back; the pocket attachment is added here from the
// same uploaded front file — see planPlacementFiles in
// lib/store/custom-products.js.
//   3. Sets the sync product thumbnail explicitly from Printful's
//      generated mockup — the first sync variant's 'preview' file,
//      polled briefly because mockup generation is asynchronous; the
//      list thumbnail_url is degenerate (bare CDN root) for most
//      products and is never trusted unless it is a real file URL.
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
  placementsFor,
  planPlacementFiles,
  parseMarkupToCents,
  finalPriceCents,
  centsToCadString,
} from '@/lib/store/custom-products';
import {
  optionalUserFromRequest,
  insertCreationRecord,
  stripeMetadataForRecord,
} from '@/lib/store/custom-creations';
import {
  isDesignUploadPath,
  downloadDesignUpload,
  deleteDesignUploads,
} from '@/lib/store/design-upload';
import { isRealImageUrl } from '@/lib/store-printful';

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

  const { imageBase64, images, fileName, designName, productKey, markup } = body || {};
  const hasImages = Array.isArray(images) && images.length > 0;
  if (!hasImages) {
    // Legacy single-image request: one graphic fills every placement.
    if (!imageBase64 || typeof imageBase64 !== 'string' || imageBase64.length < 100) {
      return NextResponse.json({ ok: false, error: 'No design image received.' }, { status: 400 });
    }
    if (imageBase64.length > 25 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: 'Design image too large.' }, { status: 400 });
    }
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

  // Per-placement submissions (Rule 1): each `images` entry carries
  // either its own exported PNG or sameAs naming the placement whose
  // graphic it reuses. Payloads are validated per placement below.
  let submissions = null;
  const payloadByKey = new Map();
  const storageByKey = new Map();
  if (hasImages) {
    submissions = {};
    for (const entry of images) {
      if (!entry || typeof entry.key !== 'string' || !entry.key) {
        return NextResponse.json({ ok: false, error: 'Invalid design images.' }, { status: 400 });
      }
      if (submissions[entry.key]) {
        return NextResponse.json({ ok: false, error: 'Duplicate placement in design.' }, { status: 400 });
      }
      if (typeof entry.sameAs === 'string' && entry.sameAs) {
        submissions[entry.key] = { sameAs: entry.sameAs };
      } else if (typeof entry.storagePath === 'string' && entry.storagePath) {
        // Print file staged directly in storage by the current designer
        // (binary upload — see lib/store/design-upload.js). The path
        // shape is validated here; the bytes are downloaded below and
        // validated (PNG, exact print size) before anything reaches
        // Printful.
        if (!isDesignUploadPath(entry.storagePath)) {
          return NextResponse.json({ ok: false, error: 'Invalid design images.' }, { status: 400 });
        }
        submissions[entry.key] = { image: true };
        storageByKey.set(entry.key, entry.storagePath);
      } else if (typeof entry.imageBase64 === 'string' && entry.imageBase64.length >= 100) {
        if (entry.imageBase64.length > 25 * 1024 * 1024) {
          return NextResponse.json({ ok: false, error: 'Design image too large.' }, { status: 400 });
        }
        submissions[entry.key] = { image: true };
        payloadByKey.set(entry.key, entry.imageBase64);
      } else {
        return NextResponse.json({ ok: false, error: 'Invalid design images.' }, { status: 400 });
      }
    }
  }

  // The plan is computed from the server-side template config — which
  // placements exist, which files they take, and the hoodie's backend
  // pocket attachment (Rule 2) are never the client's call.
  const plan = planPlacementFiles(product, submissions);
  if (!plan.ok) {
    return NextResponse.json({ ok: false, error: plan.error }, { status: 400 });
  }
  const placementByKey = new Map(placementsFor(product).map((p) => [p.key, p]));

  // Pull any staged print files down now that the plan is known-good.
  // From here they flow through the exact same path as a base64
  // submission: PNG + print-size validation, then Printful.
  const stagedPaths = [...storageByKey.values()];
  if (stagedPaths.length) {
    try {
      for (const [k, p] of storageByKey) {
        const buf = await downloadDesignUpload(p);
        payloadByKey.set(k, buf.toString('base64'));
      }
    } catch {
      await deleteDesignUploads(stagedPaths);
      return NextResponse.json(
        { ok: false, error: 'We could not read the uploaded design — please try creating it again.' },
        { status: 502 }
      );
    }
  }

  const safeName = (designName || `Custom ${product.name}`).toString().slice(0, 80) || `Custom ${product.name}`;
  const safeFile = (fileName || `custom-${product.key}.png`).toString().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
  const fileNameFor = (sourceKey, idx) => {
    if (idx === 0) return safeFile;
    const derived = `${safeFile.replace(/\.png$/i, '')}-${sourceKey}.png`;
    return derived.slice(0, 60);
  };

  // 1. Upload each distinct graphic to Printful Files, once. Every
  //    payload is confirmed against its placement's print spec first.
  const fileIdBySource = {};
  try {
    for (let i = 0; i < plan.uploads.length; i++) {
      const sourceKey = plan.uploads[i];
      const raw = hasImages ? payloadByKey.get(sourceKey) : imageBase64;
      if (!raw) {
        return NextResponse.json({ ok: false, error: 'Invalid design images.' }, { status: 400 });
      }
      const stripped = raw.replace(/^data:image\/\w+;base64,/, '');
      const placement = placementByKey.get(sourceKey);
      const spec = (placement && placement.print) || product.print;
      const dims = pngDimensions(stripped);
      if (dims && (dims.w !== spec.w || dims.h !== spec.h)) {
        return NextResponse.json(
          { ok: false, error: 'Design image has the wrong print size for this product.' },
          { status: 400 }
        );
      }
      const file = await pf('POST', '/files', { file_name: fileNameFor(sourceKey, i), data: stripped });
      const fileId = file && file.id;
      if (!fileId) throw new Error('Printful file upload failed.');
      fileIdBySource[sourceKey] = fileId;
    }
  } finally {
    // Printful has the files (or the create failed) — the staged copies
    // in storage have served their purpose either way.
    if (stagedPaths.length) await deleteDesignUploads(stagedPaths);
  }

  // 2. Create the sync product with the template's variants. The
  //    planned attachments map each Printful placement to its file —
  //    the hoodie keeps its original type-less front attachment and
  //    gains the pocket attachment on the same file (Rule 2); joggers
  //    attach each leg's own (or shared) graphic (Rule 1).
  const files = plan.files.map((f) => (f.type
    ? { type: f.type, id: fileIdBySource[f.source] }
    : { id: fileIdBySource[f.source] }));
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

  // 3. Select the product's MOCKUP as its store image (Merlin,
  //    2026-10-21: "ensure mockups are selected when listing so that
  //    they appear in the store"). The mockup is the first sync
  //    variant's file of type 'preview' — Printful's on-product
  //    render. Generation is asynchronous, so poll briefly; the sync
  //    product's thumbnail_url is only a fallback and only when it is
  //    a real file URL (for most products it is the bare CDN root,
  //    which renders as a broken image). The chosen URL is stamped as
  //    the sync product thumbnail explicitly (standing store rule).
  //    Best-effort: the product exists either way, and the storefront
  //    card resolves the preview lazily if this step found none yet.
  let mockupUrl = null;
  try {
    for (let attempt = 0; attempt < 6 && !mockupUrl; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2500));
      const detail = await pf('GET', `/store/products/${productId}`);
      const dsp = (detail && detail.sync_product) || {};
      const svs = (detail && detail.sync_variants) || [];
      for (const v of svs) {
        const preview = ((v && v.files) || []).find((f) => f && f.type === 'preview');
        if (preview && isRealImageUrl(preview.preview_url)) {
          mockupUrl = preview.preview_url;
          break;
        }
      }
      if (!mockupUrl && isRealImageUrl(dsp.thumbnail_url)) {
        mockupUrl = dsp.thumbnail_url;
      }
    }
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
