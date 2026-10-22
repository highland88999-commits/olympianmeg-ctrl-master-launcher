// app/api/store/custom/create/route.js
// POST /api/store/custom/create — Custom Product Designer backend.
//
// Takes user-designed print files (PNGs already composited at each
// placement's print resolution by the /store/custom designer canvas;
// current clients stage them in Supabase Storage as binary uploads —
// see lib/store/design-upload.js — older clients send base64) and:
//   1. Uploads each distinct graphic to Printful Files (POST /files).
//      Staged files go by signed URL, never as a base64 `data` body:
//      Printful rejects the base64 request with a bare HTTP 500 once
//      the PNG passes ~30MB, which a detailed hoodie graphic
//      composited at 4500x5400 routinely does (verified live
//      2026-10-22 — 28.5MB accepted, 34.2MB and 43.6MB rejected as
//      data, both accepted by URL). That was the "Create My Hoodie
//      doesn't work" report of 2026-10-13: the Oct 15 transport fix
//      repaired the browser→server leg but left this leg broken.
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
  signedDesignDownloadUrl,
  printfulFilePayload,
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
function pngDimensions(buf) {
  try {
    if (!buf || buf.length < 24) return null;
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } catch { return null; }
}

// Header bytes of a base64 PNG submission (legacy clients), for
// pngDimensions — only the first bytes are decoded, never the whole
// multi-MB string.
function pngHeaderFromBase64(base64) {
  try { return Buffer.from(String(base64).slice(0, 64), 'base64'); } catch { return null; }
}

// Poll a Printful file until Printful has fetched/processed it
// (status leaves 'waiting'). URL-submitted files are fetched
// asynchronously by Printful; in live checks that took ~5-10s even
// at 43.6MB. Returns 'ok' | 'failed' | 'waiting' (still pending when
// the poll budget ran out — the caller decides; attaching a pending
// file is the pre-2026-10-22 behaviour for base64 submissions, whose
// status also starts at 'waiting', so proceeding is safe, but the
// staged source file must then be left in place for Printful's
// fetch). A failed poll read counts as 'waiting', never as failure.
async function waitForPrintfulFile(fileId, attempts = 8, delayMs = 4000) {
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
    let status = null;
    try {
      const f = await pf('GET', `/files/${fileId}`);
      status = f && f.status;
    } catch { /* unreadable — treat as still waiting */ }
    if (status === 'ok') return 'ok';
    if (status === 'failed') return 'failed';
  }
  return 'waiting';
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

  // Pull any staged print files down now that the plan is known-good —
  // for validation only (PNG + exact print size, from the raw bytes).
  // The bytes themselves are NOT what Printful receives: staged files
  // are handed over by signed URL (step 1), because the base64 `data`
  // body dies at Printful past ~30MB of PNG (see the header). Buffers
  // are kept per placement key so the URL mint has a base64 fallback
  // for a file small enough that the fallback can actually work.
  const stagedPaths = [...storageByKey.values()];
  const bufferByKey = new Map();
  if (stagedPaths.length) {
    try {
      for (const [k, p] of storageByKey) {
        bufferByKey.set(k, await downloadDesignUpload(p));
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
  //    Staged files (the current designer) are handed over by signed
  //    URL — Printful fetches the bytes itself — because the base64
  //    `data` body is rejected by Printful with a bare HTTP 500 once
  //    the PNG passes ~30MB (see the header). Legacy base64
  //    submissions keep the `data` body: their bytes arrive inline, so
  //    there is no staged file to point Printful at.
  const fileIdBySource = {};
  // Staged paths Printful has confirmed fetched (safe to clean up).
  // A path whose file is still 'waiting' when the poll budget runs
  // out is deliberately LEFT in storage on the success path —
  // deleting it first would starve Printful's pending fetch and
  // break the product's print file. It sits in a private bucket,
  // inert; the failure paths below still remove everything.
  const fetchedOkPaths = new Set();
  let step1Done = false;
  // Largest staged PNG (bytes) the base64 fallback may carry when a
  // signed URL cannot be minted. Proven accepted by Printful as a
  // `data` body at 28.5MB (2026-10-22); the cap keeps a margin.
  const BASE64_FALLBACK_MAX_BYTES = 25 * 1024 * 1024;
  try {
    for (let i = 0; i < plan.uploads.length; i++) {
      const sourceKey = plan.uploads[i];
      const stagedPath = hasImages ? storageByKey.get(sourceKey) : undefined;
      const stagedBuf = stagedPath ? bufferByKey.get(sourceKey) : undefined;
      const raw = hasImages ? payloadByKey.get(sourceKey) : imageBase64;
      if (!stagedBuf && !raw) {
        return NextResponse.json({ ok: false, error: 'Invalid design images.' }, { status: 400 });
      }
      const placement = placementByKey.get(sourceKey);
      const spec = (placement && placement.print) || product.print;
      const dims = stagedBuf
        ? pngDimensions(stagedBuf)
        : pngDimensions(pngHeaderFromBase64(String(raw).replace(/^data:image\/\w+;base64,/, '')));
      if (dims && (dims.w !== spec.w || dims.h !== spec.h)) {
        return NextResponse.json(
          { ok: false, error: 'Design image has the wrong print size for this product.' },
          { status: 400 }
        );
      }
      const fileName = fileNameFor(sourceKey, i);
      let payload;
      if (stagedBuf) {
        let signedUrl = null;
        try { signedUrl = await signedDesignDownloadUrl(stagedPath); } catch { signedUrl = null; }
        if (signedUrl) {
          payload = printfulFilePayload({ fileName, signedUrl });
        } else if (stagedBuf.length <= BASE64_FALLBACK_MAX_BYTES) {
          payload = printfulFilePayload({ fileName, dataBase64: stagedBuf.toString('base64') });
        } else {
          return NextResponse.json(
            { ok: false, error: 'We could not hand your design to the printer — please try creating it again.' },
            { status: 502 }
          );
        }
      } else {
        const stripped = String(raw).replace(/^data:image\/\w+;base64,/, '');
        payload = printfulFilePayload({ fileName, dataBase64: stripped });
      }
      const file = await pf('POST', '/files', payload);
      const fileId = file && file.id;
      if (!fileId) throw new Error('Printful file upload failed.');
      fileIdBySource[sourceKey] = fileId;
      if (stagedBuf && payload.url) {
        // Printful fetches URL submissions asynchronously — wait
        // until it actually has the file before the staged copy may
        // be cleaned up, and fail honestly if it cannot process it.
        const fetchState = await waitForPrintfulFile(fileId);
        if (fetchState === 'failed') {
          return NextResponse.json(
            { ok: false, error: 'The printer could not process your design file — please try creating it again.' },
            { status: 502 }
          );
        }
        if (fetchState === 'ok') fetchedOkPaths.add(stagedPath);
      }
    }
    step1Done = true;
  } finally {
    if (stagedPaths.length) {
      // Aborted (validation error, Printful failure): the creation is
      // not continuing, so every staged copy can go. Completed: only
      // the copies Printful confirmed it fetched — a still-pending
      // fetch keeps its source (see fetchedOkPaths above).
      const toDelete = step1Done
        ? stagedPaths.filter((p) => fetchedOkPaths.has(p))
        : stagedPaths;
      if (toDelete.length) await deleteDesignUploads(toDelete);
    }
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
