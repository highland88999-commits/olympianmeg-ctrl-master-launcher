// app/api/store/sync-products/route.js
// MERLIN ONLY (olympiannexus@gmail.com — same gate as the affiliate admin).
//
// Syncs the Printful catalog ("Omega Store") into Stripe products so the
// server-priced checkout (POST /api/store/checkout) can resolve every card
// by exact name. The checkout NEVER trusts client prices — it re-derives
// the bill from Stripe — so each catalog product needs a matching active
// Stripe product with a one-time default price.
//
// GET  -> status: { stripeConfigured, printfulConfigured, catalogCount,
//          stripeMatchCount, synced }
// POST -> sync one batch: { offset?, limit? } (defaults 0/25)
//         returns { created, alreadySynced, priceMismatches, errors,
//                   nextOffset, done, catalogCount }
//         Re-runnable and idempotent: existing products are skipped via the
//         Stripe search API, and creations carry idempotency keys. Call
//         repeatedly with nextOffset until done:true (368 products ≈ 15
//         calls at the default batch size).
//
// Price mismatches are REPORTED, never silently "fixed": if a Stripe
// product exists under the name but its default price differs from the
// catalog, it is left alone and listed in priceMismatches for Merlin.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getUserFromRequest } from '@/lib/economy/auth';
import { isAffiliateOwner } from '@/lib/affiliates/server';
import { getCatalog, isPrintfulConfigured } from '@/lib/store-printful';

function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

async function loadStripe() {
  try {
    const mod = await import('stripe');
    const Stripe = mod.default || mod.Stripe || mod;
    return new Stripe(process.env.STRIPE_SECRET_KEY);
  } catch {
    return null;
  }
}

async function requireMerlin(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error || !isAffiliateOwner(auth.user)) {
    return { error: NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 }) };
  }
  return { user: auth.user };
}

// Exact-name lookup, mirroring app/api/store/checkout/route.js:
// Stripe search API first, list+match fallback.
async function findProductByName(stripe, name) {
  const want = String(name || '').trim();
  if (!want) return null;
  try {
    const res = await stripe.products.search({
      query: `name:'${want.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`,
      expand: ['data.default_price'],
      limit: 10,
    });
    const hit = (res.data || []).find((p) => p.active && p.name === want);
    if (hit) return hit;
  } catch { /* search may be disabled; fall through */ }
  let startingAfter;
  for (let page = 0; page < 5; page++) {
    const res = await stripe.products.list({
      active: true,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
      expand: ['data.default_price'],
    });
    const hit = (res.data || []).find((p) => p.name === want);
    if (hit) return hit;
    if (!res.has_more || !res.data?.length) break;
    startingAfter = res.data[res.data.length - 1].id;
  }
  return null;
}

function activeOneTimePrice(product) {
  const price = product?.default_price && typeof product.default_price === 'object'
    ? product.default_price
    : null;
  if (!product?.active || !price?.active || typeof price.unit_amount !== 'number' || price.recurring) {
    return null;
  }
  return price;
}

export const GET = apiGuard(async function GET(req) {
  const gate = await requireMerlin(req);
  if (gate.error) return gate.error;
  if (!stripeConfigured()) {
    return NextResponse.json({ ok: false, error: 'STRIPE_SECRET_KEY is not set.' }, { status: 503 });
  }
  const stripe = await loadStripe();
  const catalog = isPrintfulConfigured() ? await getCatalog() : [];
  let stripeMatchCount = 0;
  // Lightweight: only check names, one search per product is too slow for
  // a status call — page Stripe products once and match in memory.
  const stripeNames = new Set();
  try {
    let startingAfter;
    for (let page = 0; page < 10; page++) {
      const res = await stripe.products.list({ active: true, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
      for (const p of res.data || []) stripeNames.add(p.name);
      if (!res.has_more || !res.data?.length) break;
      startingAfter = res.data[res.data.length - 1].id;
    }
  } catch { /* report what we have */ }
  for (const c of catalog) if (stripeNames.has(c.name)) stripeMatchCount++;
  return NextResponse.json({
    ok: true,
    stripeConfigured: true,
    printfulConfigured: isPrintfulConfigured(),
    catalogCount: catalog.length,
    stripeMatchCount,
    synced: catalog.length > 0 && stripeMatchCount >= catalog.length,
  });
});

export const POST = apiGuard(async function POST(req) {
  const gate = await requireMerlin(req);
  if (gate.error) return gate.error;
  if (!stripeConfigured()) {
    return NextResponse.json({ ok: false, error: 'STRIPE_SECRET_KEY is not set.' }, { status: 503 });
  }
  if (!isPrintfulConfigured()) {
    return NextResponse.json({ ok: false, error: 'PRINTFUL_API_KEY is not set.' }, { status: 503 });
  }

  let body = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const offset = Math.max(0, parseInt(body.offset, 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(body.limit, 10) || 25));

  const stripe = await loadStripe();
  if (!stripe) {
    return NextResponse.json({ ok: false, error: 'Stripe SDK unavailable.' }, { status: 503 });
  }

  const catalog = await getCatalog();
  const batch = catalog.slice(offset, offset + limit);

  let created = 0;
  let alreadySynced = 0;
  const priceMismatches = [];
  const errors = [];

  for (const card of batch) {
    try {
      const existing = await findProductByName(stripe, card.name);
      const price = activeOneTimePrice(existing);
      if (existing && price) {
        if (price.unit_amount === card.priceCents && (price.currency || '').toLowerCase() === String(card.currency).toLowerCase()) {
          alreadySynced++;
        } else {
          // Exists but priced differently — never silently overwrite live pricing.
          priceMismatches.push({
            name: card.name,
            catalogCents: card.priceCents,
            stripeCents: price.unit_amount,
            stripeCurrency: price.currency,
          });
        }
        continue;
      }
      if (existing && !price) {
        // Product exists but has no usable default price: attach one to the
        // existing product rather than creating a duplicate.
        const newPrice = await stripe.prices.create({
          product: existing.id,
          unit_amount: card.priceCents,
          currency: String(card.currency || 'cad').toLowerCase(),
        }, { idempotencyKey: `store_sync_price_${card.id}` });
        await stripe.products.update(existing.id, { default_price: newPrice.id });
        created++;
        continue;
      }
      // Create product + default one-time price in a single call.
      // Idempotency key makes retries safe; the name check above makes
      // re-runs skip cleanly even if the key expired.
      await stripe.products.create({
        name: card.name,
        description: card.description || undefined,
        images: card.image ? [card.image] : undefined,
        metadata: { surface: 'store', printful_id: card.id },
        default_price_data: {
          unit_amount: card.priceCents,
          currency: String(card.currency || 'cad').toLowerCase(),
        },
      }, { idempotencyKey: `store_sync_${card.id}` });
      created++;
    } catch (err) {
      errors.push({ name: card.name, error: err?.message || 'create failed' });
    }
  }

  const nextOffset = offset + batch.length;
  return NextResponse.json({
    ok: true,
    created,
    alreadySynced,
    priceMismatches,
    errors,
    catalogCount: catalog.length,
    nextOffset,
    done: nextOffset >= catalog.length,
  });
});
