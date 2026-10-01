// lib/store-printful.js
// Server-only Printful catalog source for /store.
//
// Merlin's real catalog lives in Printful ("Omega Store", 368 published
// products). /api/store/products reads it here — never from the client:
// PRINTFUL_API_KEY is a server env var and must never be logged, printed,
// or exposed. Import this module only from server route handlers.
//
// READ-ONLY: only GET endpoints are ever called (product list + product
// detail). No order is ever placed from this module — checkout stays
// unwired until Merlin explicitly approves it, so every mapped card
// carries checkoutReady:false and the page keeps its CTA honestly disabled.

const PF_BASE = 'https://api.printful.com';
const PAGE_LIMIT = 100; // Printful max per page
const DETAIL_CONCURRENCY = 4; // gentle: the full catalog is ~370 detail calls
const REQUEST_TIMEOUT_MS = 20000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10-minute server-side cache
// Printful rate-limits the API (~120 req/min). A cold catalog fetch bursts
// past that, so 429s are retried with backoff instead of dropping products.
const MAX_ATTEMPTS = 4;

const APPAREL_RE = /hoodie|sweatshirt|t-?shirt|shirt|jacket|cap|beanie|socks|sweater|apparel|crewneck/i;

export function isPrintfulConfigured() {
  return !!process.env.PRINTFUL_API_KEY;
}

function authHeader() {
  // Printful private tokens (created at developers.printful.com) authenticate
  // with a Bearer token — the legacy per-store keys that used HTTP Basic auth
  // are deprecated and no longer issued. The key value is never logged.
  const key = process.env.PRINTFUL_API_KEY || '';
  return 'Bearer ' + key;
}

export class PrintfulError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'PrintfulError';
    this.status = status;
  }
}

async function pfGet(path, attempt = 0) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(PF_BASE + path, {
      headers: {
        Authorization: authHeader(),
        'User-Agent': 'olympusverse-store/1.0',
      },
      signal: ctrl.signal,
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const code = body && typeof body.code === 'number' ? body.code : res.status;
    // Rate-limited: honor Retry-After, otherwise exponential backoff with
    // jitter. Retried here so a cold catalog fetch completes instead of
    // silently dropping products into a partial, cached catalog.
    if (code === 429 && attempt + 1 < MAX_ATTEMPTS) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '', 10);
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 60000)
        : Math.min(15000, 1000 * 2 ** attempt) + Math.random() * 500;
      clearTimeout(timer);
      await new Promise((r) => setTimeout(r, waitMs));
      return pfGet(path, attempt + 1);
    }
    if (!res.ok || code >= 400) {
      throw new PrintfulError('Printful request failed', code || res.status || 0);
    }
    return body;
  } catch (err) {
    if (err instanceof PrintfulError) throw err;
    throw new PrintfulError('Printful request failed', 0);
  } finally {
    clearTimeout(timer);
  }
}

// Paginate the whole store catalog (368 products at limit=100 → 4 pages).
async function listAllProducts() {
  const all = [];
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const body = await pfGet(`/store/products?limit=${PAGE_LIMIT}&offset=${offset}`);
    const items = (body && body.result) || [];
    all.push(...items);
    const total = body && body.paging && body.paging.total;
    if (typeof total === 'number' && all.length >= total) break;
    if (items.length < PAGE_LIMIT) break;
    offset += items.length;
  }
  return all;
}

async function fetchDetail(id) {
  const body = await pfGet(`/store/products/${id}`);
  return (body && body.result) || null;
}

function kindOf(name) {
  return APPAREL_RE.test(name || '') ? 'apparel' : 'other';
}

export function formatMoney(cents, currency) {
  try {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: (currency || 'cad').toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)} ${(currency || 'cad').toUpperCase()}`;
  }
}

// Pure: a Printful store-product detail payload -> a store product card.
// Exported for headless tests. The card keeps the exact field shape the
// /store page already renders (id, name, description, priceCents, currency,
// priceLabel, image, kind) plus priceId:null and checkoutReady:false —
// checkout is not wired to Printful yet, so the CTA stays honestly disabled.
export function mapDetailToCard(detail) {
  const variants = (detail && detail.variants ? detail.variants : []).filter(
    (v) => v && !v.is_ignored
  );
  const priced = variants
    .map((v) => ({
      cents: Math.round(parseFloat(v.retail_price) * 100),
      currency: String(v.currency || 'cad').toLowerCase(),
    }))
    .filter((p) => Number.isFinite(p.cents) && p.cents > 0);
  const currency = priced.length ? priced[0].currency : 'cad';
  const minCents = priced.length ? Math.min(...priced.map((p) => p.cents)) : null;
  const distinctPrices = new Set(priced.map((p) => p.cents)).size;
  return {
    id: `pf_${detail && detail.id != null ? detail.id : 'unknown'}`,
    name: (detail && detail.name) || 'Untitled product',
    description: '',
    priceCents: minCents,
    currency,
    priceLabel:
      minCents != null
        ? distinctPrices > 1
          ? `From ${formatMoney(minCents, currency)}`
          : formatMoney(minCents, currency)
        : 'Price on request',
    image: (detail && detail.thumbnail_url) || null,
    kind: kindOf(detail && detail.name),
    priceId: null,
    checkoutReady: false,
    variantCount: variants.length,
  };
}

function normName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Pure: Merlin's catalog rule — each product listed exactly once.
export function dedupeByName(cards) {
  const seen = new Set();
  return (cards || []).filter((c) => {
    const key = normName(c && c.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Pure: details -> final card list (mapped + deduped). Falsy entries dropped.
export function buildCards(details) {
  return dedupeByName((details || []).filter(Boolean).map(mapDetailToCard));
}

// Pure: user-facing notice for a catalog failure. Honest and generic —
// never leaks auth details, never invents products.
export function noticeForError(status) {
  if (status === 401 || status === 403) {
    return 'The store is temporarily unavailable. Please try again later.';
  }
  return 'Could not reach the store right now. Please try again later.';
}

// Bounded worker pool: enrich every listed product with its detail payload
// (thumbnail + variant retail prices). Transient 429s are retried inside
// pfGet; a product that still fails is skipped and retried on the next
// refresh — one bad product never kills the catalog.
async function mapPool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      try {
        results[idx] = await fn(items[idx]);
      } catch {
        results[idx] = null;
      }
    }
  });
  await Promise.all(workers);
  return results.filter(Boolean);
}

async function fetchFullCatalog() {
  const listed = await listAllProducts();
  const ids = listed.map((p) => p && p.id).filter((id) => id != null);
  const details = await mapPool(ids, DETAIL_CONCURRENCY, fetchDetail);
  return buildCards(details);
}

// 10-minute in-memory cache with stale-while-revalidate: the store page
// stays fast, and a slow Printful cold start never blocks a repeat visitor.
let cache = { at: 0, products: null, refreshing: false };

async function refreshCache() {
  const products = await fetchFullCatalog();
  cache = { at: Date.now(), products, refreshing: false };
  return products;
}

export async function getCatalog() {
  const now = Date.now();
  if (cache.products && now - cache.at < CACHE_TTL_MS) return cache.products;
  if (cache.products) {
    if (!cache.refreshing) {
      cache.refreshing = true;
      refreshCache().catch(() => {
        cache.refreshing = false;
      });
    }
    return cache.products;
  }
  return refreshCache();
}

// Test-only: reset the in-memory cache between headless tests.
export function __resetCache() {
  cache = { at: 0, products: null, refreshing: false };
}
