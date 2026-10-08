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
