// lib/store-printful.js
// Server-only Printful catalog source for /store.
//
// Merlin's real catalog lives in Printful ("Omega Store", 14,975 published
// products at the 2026-10-21 census). /api/store/products reads it here —
// never from the client: PRINTFUL_API_KEY is a server env var and must
// never be logged, printed, or exposed. Import this module only from
// server route handlers.
//
// ARTEMIS PORT (from highland88999-commits/Olympus — Merlin's proven setup,
// a year in the making): the catalog is built from the Printful STORE LIST
// endpoint ONLY — GET /store/products?store_id=17419146&offset=X&limit=100
// with Bearer auth. The old site's harvest (artemis-1.js) ran this hourly
// into a static manifest and served that (artemis-2.js); here the same
// list-only fetch runs behind a 10-minute server cache, which gives the
// same "serve static, refresh quietly" behavior without extra
// infrastructure. Pagination runs until an empty page (the original
// harvest pattern): the 2026-10-21 catalog is ~150 pages, and the old
// 20-page cap silently truncated the storefront to the first 2,000
// products. Per-product DETAIL calls happen only in getProductVariants
// (sizes) and getProductImage (mockup resolution), both separately cached.
//
// READ-ONLY: only GET endpoints are ever called. No order is ever placed
// from this module. Cards carry checkoutReady:false as the safe default;
// GET /api/store/products upgrades it to true when Stripe is configured
// server-side, which enables the real checkout flow.

const PF_BASE = 'https://api.printful.com';
// Merlin's Printful store id (Omega Store). The Artemis harvest always
// passed this explicitly — the token alone is not enough to scope the list.
const STORE_ID = '17419146';
const PAGE_LIMIT = 100; // Printful max per page
const MAX_PAGES = 400; // runaway guard only — the harvest stops at an empty page
const PAGE_DELAY_MS = 150; // pace under Printful's ~120 req/min budget
const REQUEST_TIMEOUT_MS = 20000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10-minute server-side cache
const IMAGE_CACHE_TTL_MS = 30 * 60 * 1000; // resolved mockups
const IMAGE_NULL_TTL_MS = 5 * 60 * 1000; // "no mockup yet" — recheck sooner
// Printful rate-limits the API (~120 req/min). 429s are retried with backoff
// instead of dropping products into a partial, cached catalog.
const MAX_ATTEMPTS = 4;

// ---------------------------------------------------------------------------
// PRICING — Merlin's percentage rule (2026-10-21, verbatim): "hoodie base
// prices are $95. Markup other products to the same percentage, not the
// same price."
//
// The hoodie's store price is C$95.00. Its Printful cost basis is the
// first sync variant's catalog cost: catalog product 388 (All-Over Print
// Recycled Unisex Hoodie), variant 18730 (2XS) = C$57.95 — verified live
// 2026-10-21 via GET /products/388 (store currency CAD). The markup
// factor is therefore 9500/5795 ≈ 1.6393 (a 63.93% markup over cost), and
// EVERY product's store price is its own entry-variant cost × that same
// factor, rounded to the nearest cent:
//
//     priceCents = round(costCents × 9500 / 5795)
//
// Prices are display-only — checkout re-prices server-side from Stripe,
// and /api/store/sync-products reports (never overwrites) mismatches.
const HOODIE_PRICE_CENTS = 9500;
const HOODIE_COST_CENTS = 5795;
const HOODIE_CURRENCY = 'cad';

export function priceFromCostCents(costCents) {
  return Math.round((costCents * HOODIE_PRICE_CENTS) / HOODIE_COST_CENTS);
}

// ---------------------------------------------------------------------------
// TYPE RESOLUTION — by verified Printful catalog TYPE, never by keywords
// in the graphic's name (Merlin, 2026-10-21: products were filed by words
// in their display names — "Blankets - Unisex Hoodie" landed under
// Hoodies — instead of by what they ARE; and there are no "hoodies, not
// blankets": the Blankets family IS catalog 395, Throw Blanket).
//
// How this table was built (2026-10-21, live Printful audit): every one
// of the 14,975 live Omega product names was censused. Rollout names are
// "<Type> - <Graphic>", and the first segment is the marketplace family
// the rollout applied. For each of the 52 distinct first segments, TWO
// independent sync products were fetched and their first sync variant's
// catalog product id compared — all 52 segments resolved 1:1 to a single
// catalog product, zero exceptions. The cost below is that family's
// entry-variant catalog cost (the sampled first sync variant, CAD), and
// the category is the store-facing name for the catalog product type.
//
// Resolution order in resolveType():
//   1. VERIFIED_PRODUCT_TYPES — individual legacy products whose names
//      carry no type signal at all (graphic titles only); each was typed
//      by a per-product detail fetch in the same audit.
//   2. The segment table above ("<Type> - ..." rollout names).
//   3. LEGACY_SUFFIX_TYPES — pre-rollout dashboard names END in the type
//      word ("<Title> Mug", "<Title> Hoodie"); verified: all 88 live
//      "* Mug" products are catalog 19 (White Glossy Mug, entry variant
//      1320, cost C$8.75) and the "* Hoodie" names are catalog 388.
//   4. Honest fallback: category 'More', price at the C$95 anchor —
//      only for names outside every verified family.
// [first segment (lowercase), category, entry cost cents, catalog id]
const TYPE_SEGMENTS = new Map(
  [
    ['unisex hoodie', 'Hoodies', 5795, 388],
    ['classic t-shirt', 'T-Shirts', 2550, 1589],
    ['framed poster', 'Framed Posters', 3395, 2],
    ['tank top', 'Tank Tops', 2525, 539],
    ['tote bag', 'Tote Bags', 2525, 84],
    ['apron', 'Aprons', 3275, 894],
    ['baby bodysuits', 'Baby Bodysuits', 1650, 843],
    ['backpacks', 'Backpacks', 6525, 963],
    ['beach towel', 'Beach Towels', 4175, 259],
    ['blankets', 'Blankets', 3495, 395],
    ['calendars', 'Calendars', 2750, 1643],
    ['canvas', 'Canvas', 2395, 3],
    ['crossbody, fanny & sling bags', 'Crossbody Bags', 3425, 350],
    ['die-cut stickers', 'Stickers', 550, 957],
    ['drawstring bag', 'Drawstring Bags', 2225, 262],
    ['dresses', 'Dresses', 5350, 896],
    ['flags & pennants', 'Flags & Pennants', 3325, 490],
    ['gift wrap & paper bags', 'Gift Wrap & Bags', 850, 1466],
    ['glassware', 'Glassware', 1775, 690],
    ['headwear', 'Headwear', 1925, 458],
    ['jackets', 'Jackets', 6075, 615],
    ['joggers', 'Joggers', 5895, 400],
    ['knit sweater', 'Sweaters', 6825, 769],
    ['leggings', 'Leggings', 5450, 558],
    ['mouse pads & desk mats', 'Mouse Pads & Desk Mats', 1425, 853],
    ['notebooks & journals', 'Notebooks & Journals', 1925, 682],
    ['ornaments', 'Ornaments', 1195, 634],
    ['pajamas', 'Pajamas', 4495, 827],
    ['pet accessories', 'Pet Accessories', 2550, 902],
    ['phone case', 'Phone Cases', 2325, 798],
    ['pillows & pillow cases', 'Pillows & Pillow Cases', 1950, 83],
    ['polo shirts', 'Polo Shirts', 3250, 340],
    ['postcards', 'Postcards', 225, 433],
    ['poster', 'Posters', 1550, 1],
    ['puzzle', 'Puzzles', 2175, 534],
    ['shoes', 'Shoes', 6225, 513],
    ['shorts', 'Shorts', 4725, 332],
    ['sports bras', 'Sports Bras', 3825, 282],
    ['sports jerseys', 'Sports Jerseys', 4725, 644],
    ['sweatshirts', 'Sweatshirts', 5025, 320],
    ['swimwear', 'Swimwear', 6350, 1483],
    ['table linens', 'Table Linens', 5750, 1435],
    ['tumbler', 'Tumblers', 1475, 751],
    ['water bottle', 'Water Bottles', 3895, 848],
    ['zip-up hoodie', 'Hoodies', 7675, 717],
    ['candles', 'Candles', 1650, 861],
    ['unisex zip hoodie', 'Hoodies', 7395, 717],
    ['unisex track pants', 'Pants', 4350, 618],
    ['galaga x arcade', 'Hoodies', 5795, 388],
    ['olympian unisex hoodie', 'Hoodies', 5795, 388],
    ['the architect; unisex hoodie', 'Hoodies', 5795, 388],
    ['wide-leg joggers', 'Joggers', 5650, 784],
  ].map(([segment, category, costCents, catalogId]) => [
    segment,
    { category, priceCents: priceFromCostCents(costCents), catalogId },
  ])
);

// Pre-rollout legacy names end in the type word. [suffix, category, cost, catalogId]
const LEGACY_SUFFIX_TYPES = [
  [' mug', { category: 'Mugs', priceCents: priceFromCostCents(875), catalogId: 19 }],
  [' hoodie', { category: 'Hoodies', priceCents: HOODIE_PRICE_CENTS, catalogId: 388 }],
];

// Individual legacy products typed by per-product detail fetch in the
// 2026-10-21 audit (their names are graphic titles with no type signal).
// Printful product id -> verified type. 29 are catalog 388 hoodies; the
// three exceptions are noted inline.
const HOODIE_TYPE = { category: 'Hoodies', priceCents: HOODIE_PRICE_CENTS, catalogId: 388 };
const VERIFIED_PRODUCT_TYPES = new Map([
  [474601990, HOODIE_TYPE], // Glitch
  [474599857, HOODIE_TYPE], // Sandstone
  [474599166, HOODIE_TYPE], // Bookworm
  [474598563, HOODIE_TYPE], // Stone Cold Steve Austin
  [474598147, HOODIE_TYPE], // Supes
  [474597401, HOODIE_TYPE],
  [474596902, HOODIE_TYPE],
  [474596422, HOODIE_TYPE],
  [428063267, HOODIE_TYPE], // Grafitti Wear (trailing space in the name)
  [428063177, HOODIE_TYPE], // Mud Camo
  [417466509, HOODIE_TYPE], // Sparks Fly
  [417465806, HOODIE_TYPE], // The Power of the Universe…
  [417465552, HOODIE_TYPE], // Break The Chains
  [417464860, HOODIE_TYPE], // Hi
  [417463430, HOODIE_TYPE], // Portals Worldwide
  [417463025, HOODIE_TYPE], // Pac-Man
  [417462843, HOODIE_TYPE], // Hey Zeus!!
  [417462348, HOODIE_TYPE], // Tsunami; Jump!
  [417462035, HOODIE_TYPE], // See Through Fog
  [417461729, HOODIE_TYPE], // Sonic Speed x Portals Worldwide
  [417461480, HOODIE_TYPE], // Date Night in Paris
  [417461298, HOODIE_TYPE], // Sonic Speed x Maximum Power
  [417461054, HOODIE_TYPE], // Witch Doctor x The Writing…
  [417460805, HOODIE_TYPE], // The Lightning Thief
  [417460589, HOODIE_TYPE], // Human Centipede
  [417460362, HOODIE_TYPE], // The Butterfly Effect
  [417459676, HOODIE_TYPE], // Jewel of The North
  [417459015, HOODIE_TYPE], // Lepidopterology; You Give Me Butterflies!
  [417455886, HOODIE_TYPE], // Demons Get Your Hands Off Of My Heart
  // The three non-hoodie exceptions in the graphic-title batch:
  [428063212, { category: 'Pants', priceCents: priceFromCostCents(4725), catalogId: 604 }], // Grafitti Wear — wide-leg pants
  [428063142, { category: 'Joggers', priceCents: priceFromCostCents(5650), catalogId: 784 }], // Mud Camo — wide-leg joggers
  [414243543, { category: 'Hoodies', priceCents: priceFromCostCents(7395), catalogId: 717 }], // Unisex zip hoodie, Monsterverse — zip hoodie
]);

// Categories that take a size selector on the product page.
const APPAREL_CATEGORIES = new Set([
  'Hoodies', 'T-Shirts', 'Sweatshirts', 'Sweaters', 'Jackets', 'Tank Tops',
  'Joggers', 'Pants', 'Leggings', 'Shorts', 'Dresses', 'Swimwear',
  'Sports Bras', 'Sports Jerseys', 'Pajamas', 'Polo Shirts', 'Headwear',
  'Baby Bodysuits', 'Shoes',
]);
const APPAREL_RE = /hoodie|sweatshirt|t-?shirt|shirt|jacket|cap|beanie|socks|sweater|apparel|crewneck/i;

function resolveType(name, id) {
  if (id != null) {
    const byId = VERIFIED_PRODUCT_TYPES.get(Number(id));
    if (byId) return byId;
  }
  const n = name || '';
  const segment = n.split(' - ')[0].trim().toLowerCase();
  const hit = TYPE_SEGMENTS.get(segment);
  if (hit) return hit;
  const lower = n.trim().toLowerCase();
  for (const [suffix, type] of LEGACY_SUFFIX_TYPES) {
    if (lower.endsWith(suffix)) return type;
  }
  return { category: 'More', priceCents: HOODIE_PRICE_CENTS, catalogId: null };
}

export function categoryOf(name, id) {
  return resolveType(name, id).category;
}

// Pure: the card display price for a product, resolved with the same
// verified type rules as categoryOf (see resolveType). Display only —
// checkout re-prices server-side from Stripe.
export function priceCentsOf(name, id) {
  return resolveType(name, id).priceCents;
}

function kindOf(name, id) {
  const { category } = resolveType(name, id);
  if (APPAREL_CATEGORIES.has(category)) return 'apparel';
  if (category === 'More') return APPAREL_RE.test(name || '') ? 'apparel' : 'other';
  return 'other';
}

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
// Pages are paced (PAGE_DELAY_MS) so a full ~150-page harvest stays
// under Printful's rate limit instead of leaning on 429 retries.
async function listAllProducts() {
  const all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
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

// The LIST payload's thumbnail_url is DEGENERATE for most of the catalog:
// 14,140 of 14,975 products carry the bare CDN root
// "https://files.cdn.printful.com/" (verified 2026-10-21), which 403s and
// rendered as a broken-image glyph on every card. A URL only counts as a
// real image when it points at an actual file — the degenerate root is
// 31 chars; every real Printful file URL is far longer.
const CDN_ROOT = 'https://files.cdn.printful.com/';
export function isRealImageUrl(url) {
  return (
    typeof url === 'string' &&
    url.length > CDN_ROOT.length + 8 &&
    /^https:\/\//.test(url)
  );
}

// Pure: a Printful store-product LIST item -> a store product card.
// Mirrors the Artemis manifest shape mapped onto the card fields /store
// renders. Exported for headless tests. The card keeps the exact field
// shape the /store page already renders (id, name, description,
// priceCents, currency, priceLabel, image, kind) plus priceId:null and
// checkoutReady:false as the safe default — GET /api/store/products
// flips it to true when STRIPE_SECRET_KEY is set, enabling the real
// checkout. The LIST payload carries no price, so priceCents comes from
// the verified type table (priceCentsOf). When the list thumbnail is the
// degenerate CDN root, image is null and imagePending is true: the card
// asks /api/store/product-image to resolve the product's real mockup
// (see getProductImage) instead of rendering a broken image.
export function mapListItemToCard(item) {
  const name = (item && item.name) || 'Untitled product';
  const itemId = item && item.id != null ? item.id : null;
  const variantCount =
    item && typeof item.variants === 'number' ? item.variants : 0;
  const priceCents = priceCentsOf(name, itemId);
  const rawThumb = (item && item.thumbnail_url) || null;
  const image = isRealImageUrl(rawThumb) ? rawThumb : null;
  return {
    id: `pf_${itemId != null ? itemId : 'unknown'}`,
    name,
    description: '',
    priceCents,
    currency: HOODIE_CURRENCY,
    priceLabel: formatMoney(priceCents, HOODIE_CURRENCY),
    image,
    imagePending: !image && itemId != null,
    kind: kindOf(name, itemId),
    category: categoryOf(name, itemId),
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

// ---------------------------------------------------------------------------
// MOCKUP RESOLUTION (Workstream C, 2026-10-21). The store list's
// thumbnail_url is degenerate for 94% of the catalog, but every sampled
// product's DETAIL payload carries the real generated mockup: the first
// sync variant's file of type 'preview' (Printful's on-product mockup
// render), whose preview_url is a live CDN file. Cards resolve it lazily
// through GET /api/store/product-image so the catalog build stays
// list-only; results are cached per product (30 min; a "no mockup yet"
// answer only 5 min, because Printful generates mockups asynchronously
// and a fresh listing's preview can land minutes after creation).
const imageCache = new Map(); // syncId -> { at, url }

export async function getProductImage(syncId) {
  const id = String(syncId || '').trim();
  if (!/^\d+$/.test(id)) return null;
  const now = Date.now();
  const hit = imageCache.get(id);
  if (hit && now - hit.at < (hit.url ? IMAGE_CACHE_TTL_MS : IMAGE_NULL_TTL_MS)) {
    return hit.url;
  }
  let url = null;
  try {
    const body = await pfGet(`/store/products/${id}?store_id=${STORE_ID}`);
    const result = (body && body.result) || {};
    const variants = result.sync_variants || [];
    for (const v of variants) {
      const files = (v && v.files) || [];
      const preview = files.find((f) => f && f.type === 'preview');
      if (preview && isRealImageUrl(preview.preview_url)) {
        url = preview.preview_url;
        break;
      }
    }
    if (!url) {
      const thumb = result.sync_product && result.sync_product.thumbnail_url;
      if (isRealImageUrl(thumb)) url = thumb;
    }
    if (!url) {
      for (const v of variants) {
        const files = (v && v.files) || [];
        const anyFile = files.find((f) => f && isRealImageUrl(f.preview_url));
        if (anyFile) {
          url = anyFile.preview_url;
          break;
        }
      }
    }
  } catch {
    url = null; // honest null — the card falls back to its placeholder
  }
  if (imageCache.size > 2000) imageCache.clear();
  imageCache.set(id, { at: now, url });
  return url;
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

// Test-only: reset the in-memory caches between headless tests.
export function __resetCache() {
  cache = { at: 0, products: null };
  variantCache.clear();
  imageCache.clear();
}
