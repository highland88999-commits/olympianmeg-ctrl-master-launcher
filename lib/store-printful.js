// lib/store-printful.js
// Server-only Printful catalog source for /store.
//
// Merlin's real catalog lives in Printful ("Omega Store", 368 published
// products). /api/store/products reads it here — never from the client:
// PRINTFUL_API_KEY is a server env var and must never be logged, printed,
// or exposed. Import this module only from server route handlers.
//
// ARTEMIS PORT (from highland88999-commits/Olympus — Merlin's proven setup,
// a year in the making): the catalog is built from the Printful STORE LIST
// endpoint ONLY — GET /store/products?store_id=17419146&offset=X&limit=100
// with Bearer auth. No per-product detail calls. The old site's harvest
// (artemis-1.js) ran this hourly into a static manifest and served that
// (artemis-2.js); here the same list-only fetch runs behind a 10-minute
// server cache, which gives the same "serve static, refresh quietly"
// behavior without extra infrastructure.
//
// READ-ONLY: only the GET list endpoint is ever called. No order is ever
// placed from this module. Cards carry checkoutReady:false as the safe
// default; GET /api/store/products upgrades it to true when Stripe is
// configured server-side, which enables the real checkout flow.

const PF_BASE = 'https://api.printful.com';
// Merlin's Printful store id (Omega Store). The Artemis harvest always
// passed this explicitly — the token alone is not enough to scope the list.
const STORE_ID = '17419146';
const PAGE_LIMIT = 100; // Printful max per page
const REQUEST_TIMEOUT_MS = 20000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10-minute server-side cache
// Printful rate-limits the API (~120 req/min). 429s are retried with backoff
// instead of dropping products into a partial, cached catalog.
const MAX_ATTEMPTS = 4;
// Merlin's catalog: every hoodie retails at C$95 — the Artemis manifest
// carried price:95 for all 368 products, verified across a year of syncs.
const HOODIE_PRICE_CENTS = 9500;
const HOODIE_CURRENCY = 'cad';

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

// Paginate the whole store catalog, exactly like the Artemis harvest:
// fixed 100-item pages at increasing offsets until a page comes back
// empty. No short-page break, no paging.total trust — Printful has
// returned short pages mid-list before, and trusting them truncated the
// catalog to 218/368. The harvest keeps going until the well runs dry,
// which is what produced a complete manifest every hour for a year.
async function listAllProducts() {
  const all = [];
  for (let page = 0; page < 20; page++) {
    const offset = page * PAGE_LIMIT;
    const body = await pfGet(
      `/store/products?store_id=${STORE_ID}&limit=${PAGE_LIMIT}&offset=${offset}`
    );
    const items = (body && body.result) || [];
    if (items.length === 0) break;
    all.push(...items);
  }
  return all;
}

function kindOf(name) {
  return APPAREL_RE.test(name || '') ? 'apparel' : 'other';
}

// Product-type categories for the storefront (Merlin, 2026-10-11: group the
// store by product type). Name-based, evaluated in order — first match wins.
// `kind` above stays untouched (the page uses it for the size selector).
const CATEGORY_RES = [
  [/mug/i, 'Mugs'],
  [/hoodie/i, 'Hoodies'],
  [/sweatshirt|crewneck/i, 'Sweatshirts'],
  [/t-?shirt|\btee\b/i, 'Tees'],
  [/jacket/i, 'Jackets'],
  [/jogger|track pants|\bpants\b/i, 'Pants'],
  [/poster|\bprint\b/i, 'Posters'],
  [/cap|beanie|\bhat\b/i, 'Headwear'],
  [/sticker/i, 'Stickers'],
  [/socks/i, 'Socks'],
];

export function categoryOf(name) {
  const n = name || '';
  for (const [re, cat] of CATEGORY_RES) {
    if (re.test(n)) return cat;
  }
  return 'More';
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

// Pure: a Printful store-product LIST item -> a store product card.
// Mirrors the Artemis manifest shape (id, name, images:[thumbnail_url],
// price:95) mapped onto the card fields /store renders. Exported for
// headless tests. The card keeps the exact field shape the /store page
// already renders (id, name, description, priceCents, currency,
// priceLabel, image, kind) plus priceId:null and checkoutReady:false as
// the safe default — GET /api/store/products flips it to true when
// STRIPE_SECRET_KEY is set, enabling the real checkout.
export function mapListItemToCard(item) {
  const name = (item && item.name) || 'Untitled product';
  const variantCount =
    item && typeof item.variants === 'number' ? item.variants : 0;
  return {
    id: `pf_${item && item.id != null ? item.id : 'unknown'}`,
    name,
    description: '',
    priceCents: HOODIE_PRICE_CENTS,
    currency: HOODIE_CURRENCY,
    priceLabel: formatMoney(HOODIE_PRICE_CENTS, HOODIE_CURRENCY),
    image: (item && item.thumbnail_url) || null,
    kind: kindOf(name),
    category: categoryOf(name),
    priceId: null,
    checkoutReady: false,
    variantCount,
  };
}

function normName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Pure: dedupe cards by Printful product ID — the only key guaranteed
// unique. The old name-based dedupe silently dropped every product sharing
// a normalized name, a candidate contributor to the 218-vs-368 catalog gap.
// Cards with id 'pf_unknown' carry no real Printful id and are never
// deduped against each other (there is no key to dedupe on).
export function dedupeById(cards) {
  const seen = new Set();
  return (cards || []).filter((c) => {
    const key = c && c.id;
    if (!key || key === 'pf_unknown') return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Pure: name-collapse survives ONLY as a logged secondary signal — it never
// drops products. Returns [{ name, ids[] }] for normalized names shared by
// two or more different product ids, so dashboard duplicates stay visible
// in the server log without eating catalog entries.
export function findNameCollisions(cards) {
  const byName = new Map();
  for (const c of cards || []) {
    if (!c || !c.id || c.id === 'pf_unknown') continue;
    const key = normName(c.name);
    if (!byName.has(key)) byName.set(key, { name: c.name, ids: [] });
    const entry = byName.get(key);
    if (!entry.ids.includes(c.id)) entry.ids.push(c.id);
  }
  return [...byName.values()].filter((e) => e.ids.length > 1);
}

// Pure: list items -> final card list (mapped + ID-deduped). Falsy entries dropped.
export function buildCards(items) {
  return dedupeById((items || []).filter(Boolean).map(mapListItemToCard));
}

// Pure: user-facing notice for a catalog failure. Honest and generic —
// never leaks auth details, never invents products.
export function noticeForError(status) {
  if (status === 401 || status === 403) {
    return 'The store is temporarily unavailable. Please try again later.';
  }
  return 'Could not reach the store right now. Please try again later.';
}

async function fetchFullCatalog() {
  const listed = await listAllProducts();
  const cards = buildCards(listed);
  // Server-side count log: raw items listed from Printful vs final cards
  // after ID-dedupe. Any future count gap is diagnosable here in one look;
  // name collisions are reported as a signal, never used to drop products.
  const collisions = findNameCollisions(cards);
  console.log(
    `[store-printful] catalog: listed=${listed.length} final=${cards.length}` +
      (collisions.length
        ? ` nameCollisions=${collisions.length} ` +
          collisions
            .map((c) => `${JSON.stringify(c.name)}:[${c.ids.join(',')}]`)
            .join(' ')
        : '')
  );
  return cards;
}

// 10-minute in-memory cache. When the cache is stale the refresh is
// BLOCKING (awaited): fire-and-forget background refreshes do not survive
// Vercel serverless freeze after the response is sent, which left the
// catalog permanently stale (stale-while-revalidate never revalidated).
// One request per 10-minute window waits for the Printful fetch; the 9-min
// warming cron keeps it fresh so shoppers never wait.
let cache = { at: 0, products: null };

async function refreshCache() {
  const products = await fetchFullCatalog();
  cache = { at: Date.now(), products };
  return products;
}

export async function getCatalog() {
  const now = Date.now();
  if (cache.products && now - cache.at < CACHE_TTL_MS) return cache.products;
  return refreshCache();
}

// Pure: a Printful sync variant (from GET /store/products/{id}) -> the
// shape the store routes consume ({ variantId, syncVariantId, size,
// available }). variantId is the CATALOG variant id (the sync variant's
// `variant_id`) — the same id lib/affiliates/costs.js prices against —
// never the sync row id. `available` follows Printful's own sellability
// signals: a variant the store ignores, or whose availability Printful
// reports as discontinued / out of stock / inactive, must not be offered
// or sold. Response order is preserved: Printful returns variants in
// size order and the /api/store/variants contract depends on it.
const UNAVAILABLE_STATUSES = new Set(['discontinued', 'out_of_stock', 'inactive']);

export function mapSyncVariant(v) {
  const status =
    v && typeof v.availability_status === 'string' ? v.availability_status : null;
  return {
    variantId: v ? v.variant_id : null,
    syncVariantId: v ? v.id : null,
    size: (v && v.size) || '',
    available: !!v && !v.is_ignored && !(status && UNAVAILABLE_STATUSES.has(status)),
  };
}

// Live variant list for one sync product. The catalog LIST endpoint only
// carries a variant count, so sizes/availability need the per-product
// detail call. Cached like the catalog (same TTL, blocking refresh —
// fire-and-forget refreshes do not survive serverless freeze) so a store
// page full of size pickers cannot burn Printful's ~120 req/min budget.
// Throws PrintfulError on failure: /api/store/variants degrades to an
// empty size list, checkout fails the line closed.
const variantCache = new Map(); // syncId -> { at, variants }

export async function getProductVariants(syncId) {
  const id = String(syncId || '').trim();
  if (!/^\d+$/.test(id)) {
    throw new PrintfulError('Invalid product id', 400);
  }
  const now = Date.now();
  const hit = variantCache.get(id);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.variants;
  const body = await pfGet(`/store/products/${id}?store_id=${STORE_ID}`);
  const syncVariants = (body && body.result && body.result.sync_variants) || [];
  const variants = syncVariants.filter(Boolean).map(mapSyncVariant);
  variantCache.set(id, { at: now, variants });
  return variants;
}

// Test-only: reset the in-memory cache between headless tests.
export function __resetCache() {
  cache = { at: 0, products: null };
  variantCache.clear();
}
