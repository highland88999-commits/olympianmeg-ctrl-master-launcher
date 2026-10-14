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
// The catalog's historical default price: hoodies and the legacy
// (pre-rollout) catalog retail at C$95 — the Artemis manifest carried
// price:95 for all 368 original products, verified across a year of
// syncs and re-sampled live on 2026-10-13. Per-type prices for the
// rollout families live in the type resolver below (resolveType).
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

// Product-type resolution for the storefront (Merlin, 2026-10-11: group
// the store by product type; expanded 2026-10-13 for the full-catalog
// rollout). Pure and name-based, in two stages. `kind` above stays
// untouched (the page uses it for the size selector).
//
// 1. TYPE PREFIX. Rollout products are named "<Type> - <Graphic>", so
//    the segment before the first " - " IS the product type and always
//    wins. This matters because graphic names carry the names of the
//    products they were first drawn for: a water bottle whose graphic
//    is called "Frosty Diamond Face Mug" is a WATER BOTTLE, never a
//    mug. The old keyword-first rules filed 5,339 of 5,694 rollout
//    products under the wrong category (live census, 2026-10-13).
// 2. KEYWORD FALLBACK for legacy names with no type prefix (the
//    pre-rollout catalog). The mug rule anchors to the END of the name
//    ("<Title> Mug" is the Oct-11 mug batch's shape) so it still beats
//    "hoodie" inside a name like "Olympian Hoodies X Maps Mug".
//
// Each type also carries its real retail price: the rollout set one
// uniform price per type, verified against live sync-variant prices on
// 2026-10-13 (one sampled product per type, all uniform). Card prices
// are display-only — checkout re-prices server-side from Stripe.
const TYPE_PREFIXES = new Map([
  // [name prefix (lowercase), category, priceCents]
  ['framed poster', ['Framed Posters', 7500]],
  ['classic t-shirt', ['T-Shirts', 9500]],
  ['zip-up hoodie', ['Hoodies', 9500]],
  ['unisex hoodie', ['Hoodies', 9500]],
  ['drawstring bag', ['Drawstring Bags', 9500]],
  ['knit sweater', ['Sweaters', 9500]],
  ['die-cut stickers', ['Stickers', 1500]],
  ['water bottle', ['Water Bottles', 4500]],
  ['beach towel', ['Beach Towels', 5500]],
  ['phone case', ['Phone Cases', 4500]],
  ['tank top', ['Tank Tops', 6500]],
  ['tote bag', ['Tote Bags', 3500]],
  ['postcards', ['Postcards', 1500]],
  ['joggers', ['Joggers', 9500]],
  ['tumbler', ['Tumblers', 4500]],
  ['poster', ['Posters', 3500]],
  ['canvas', ['Canvas', 8500]],
  ['puzzle', ['Puzzles', 3500]],
  ['apron', ['Aprons', 3500]],
  // Legacy one-off families (sampled live 2026-10-13): the track
  // pants' variants run C$60.50/64.50/68.50 by size — the card carries
  // the entry price; the wide-leg joggers are a flat C$80.
  ['unisex track pants', ['Pants', 6050]],
  ['wide-leg joggers', ['Joggers', 8000]],
]);

// Keyword fallback: first match wins, evaluated in order.
const CATEGORY_RES = [
  [/\bmug\s*$/i, 'Mugs'],
  [/hoodie/i, 'Hoodies'],
  [/sweatshirt|crewneck/i, 'Sweatshirts'],
  [/sweater|\bknit\b/i, 'Sweaters'],
  [/tank top/i, 'Tank Tops'],
  [/t-?shirt|\btee\b/i, 'T-Shirts'],
  [/jacket/i, 'Jackets'],
  [/jogger/i, 'Joggers'],
  [/track pants|\bpants\b/i, 'Pants'],
  [/framed poster/i, 'Framed Posters'],
  [/poster|\bprint\b/i, 'Posters'],
  [/canvas/i, 'Canvas'],
  [/tote/i, 'Tote Bags'],
  [/drawstring/i, 'Drawstring Bags'],
  [/tumbler/i, 'Tumblers'],
  [/water bottle/i, 'Water Bottles'],
  [/beach towel|\btowel\b/i, 'Beach Towels'],
  [/phone case/i, 'Phone Cases'],
  [/\bpuzzle\b/i, 'Puzzles'],
  [/postcard/i, 'Postcards'],
  [/apron/i, 'Aprons'],
  [/sticker/i, 'Stickers'],
  [/\bcap\b|beanie|\bhat\b/i, 'Headwear'],
  [/socks/i, 'Socks'],
];

// Card price per fallback category where it differs from the C$95
// default: the Oct-11 mug batch retails at C$24.99, and the remaining
// entries are the rollout families' uniform prices, so a legacy name
// that classifies into one of those families prices like the family.
const CATEGORY_PRICE_CENTS = {
  Mugs: 2499,
  'Tank Tops': 6500,
  'Tote Bags': 3500,
  Tumblers: 4500,
  'Water Bottles': 4500,
  Posters: 3500,
  'Framed Posters': 7500,
  Canvas: 8500,
  Stickers: 1500,
  'Phone Cases': 4500,
  Puzzles: 3500,
  Postcards: 1500,
  Aprons: 3500,
  'Beach Towels': 5500,
};

function resolveType(name) {
  const n = name || '';
  const prefix = n.split(' - ')[0].trim().toLowerCase();
  const hit = TYPE_PREFIXES.get(prefix);
  if (hit) return { category: hit[0], priceCents: hit[1] };
  for (const [re, cat] of CATEGORY_RES) {
    if (re.test(n)) {
      return {
        category: cat,
        priceCents:
          CATEGORY_PRICE_CENTS[cat] != null
            ? CATEGORY_PRICE_CENTS[cat]
            : HOODIE_PRICE_CENTS,
      };
    }
  }
  return { category: 'More', priceCents: HOODIE_PRICE_CENTS };
}

export function categoryOf(name) {
  return resolveType(name).category;
}

// Pure: the card display price for a product name, resolved with the
// same type rules as categoryOf (see resolveType). Display only —
// checkout re-prices server-side from Stripe.
export function priceCentsOf(name) {
  return resolveType(name).priceCents;
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
// price) mapped onto the card fields /store renders. Exported for
// headless tests. The card keeps the exact field shape the /store page
// already renders (id, name, description, priceCents, currency,
// priceLabel, image, kind) plus priceId:null and checkoutReady:false as
// the safe default — GET /api/store/products flips it to true when
// STRIPE_SECRET_KEY is set, enabling the real checkout. The LIST
// payload carries no price, so priceCents is resolved from the product
// name's type (priceCentsOf) — the rollout's per-type uniform prices,
// sampled live; the C$95 default covers hoodies and legacy products.
export function mapListItemToCard(item) {
  const name = (item && item.name) || 'Untitled product';
  const variantCount =
    item && typeof item.variants === 'number' ? item.variants : 0;
  const priceCents = priceCentsOf(name);
  return {
    id: `pf_${item && item.id != null ? item.id : 'unknown'}`,
    name,
    description: '',
    priceCents,
    currency: HOODIE_CURRENCY,
    priceLabel: formatMoney(priceCents, HOODIE_CURRENCY),
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
