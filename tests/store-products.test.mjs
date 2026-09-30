// tests/store-products.test.mjs
// Honesty tests for the Printful-backed store catalog. Run: node tests/store-products.test.mjs
// (from the repo root). No browser, no real network — fixtures plus a mocked
// fetch for the integration paths.
//
// The store must NEVER invent products, fake a checkout, or leak the
// Printful key: mapping is 1:1 from Printful payloads, every card carries
// checkoutReady:false until Merlin approves wiring checkout, and failures
// surface as honest notices, never crashes or fake listings.
import {
  mapDetailToCard,
  dedupeByName,
  buildCards,
  noticeForError,
  isPrintfulConfigured,
  getCatalog,
  __resetCache,
} from '../lib/store-printful.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- fixtures: Printful API payload shapes ---------------------------------
const HOODIE_DETAIL = {
  id: 123456,
  name: 'Hocus Locusts Hoodie',
  thumbnail_url: 'https://files.printful.com/o/thumb/hoodie.jpg',
  variants: [
    { id: 1, name: 'Hocus Locusts Hoodie - 2XS', retail_price: '95.00', currency: 'CAD', is_ignored: false },
    { id: 2, name: 'Hocus Locusts Hoodie - M', retail_price: '95.00', currency: 'CAD', is_ignored: false },
    { id: 3, name: 'Hocus Locusts Hoodie - 6XL', retail_price: '99.00', currency: 'CAD', is_ignored: true },
  ],
};
const MULTI_PRICE_DETAIL = {
  id: 7,
  name: 'Sticker Pack',
  thumbnail_url: 'https://files.printful.com/o/thumb/stickers.jpg',
  variants: [
    { id: 11, name: 'Sticker Pack - 3x3', retail_price: '4.50', currency: 'CAD', is_ignored: false },
    { id: 12, name: 'Sticker Pack - 5x5', retail_price: '6.00', currency: 'CAD', is_ignored: false },
  ],
};
const NO_PRICE_DETAIL = {
  id: 9,
  name: 'Mystery Tee',
  thumbnail_url: null,
  variants: [
    { id: 21, name: 'Mystery Tee - M', retail_price: '', currency: 'CAD', is_ignored: false },
  ],
};

// --- mapping: Printful detail -> store card --------------------------------
const hoodie = mapDetailToCard(HOODIE_DETAIL);
t('hoodie: id prefixed pf_', hoodie.id === 'pf_123456');
t('hoodie: name preserved verbatim', hoodie.name === 'Hocus Locusts Hoodie');
t('hoodie: image from thumbnail_url', hoodie.image === 'https://files.printful.com/o/thumb/hoodie.jpg');
t('hoodie: priceCents from retail_price', hoodie.priceCents === 9500);
t('hoodie: currency lowercased', hoodie.currency === 'cad');
t('hoodie: priceLabel formatted', hoodie.priceLabel === '$95.00');
t('hoodie: kind apparel', hoodie.kind === 'apparel');
t('hoodie: ignored variant excluded from count', hoodie.variantCount === 2);
t('hoodie: no Stripe price id', hoodie.priceId === null);
t('hoodie: checkout NOT ready (honest disabled CTA)', hoodie.checkoutReady === false);

const multi = mapDetailToCard(MULTI_PRICE_DETAIL);
t('multi-price: takes the minimum', multi.priceCents === 450);
t('multi-price: label says From', multi.priceLabel.startsWith('From ') && multi.priceLabel.includes('4.50'));
t('multi-price: kind other', multi.kind === 'other');

const noprice = mapDetailToCard(NO_PRICE_DETAIL);
t('no-price: priceCents null', noprice.priceCents === null);
t('no-price: honest label', noprice.priceLabel === 'Price on request');
t('no-price: missing thumbnail -> null image (page shows fallback)', noprice.image === null);

// --- dedupe: Merlin's rule, each product listed exactly once ---------------
const dupes = dedupeByName([
  mapDetailToCard(HOODIE_DETAIL),
  mapDetailToCard({ ...HOODIE_DETAIL, id: 999, name: 'hocus   locusts hoodie' }),
  mapDetailToCard(MULTI_PRICE_DETAIL),
]);
t('dedupe: case/whitespace dupes collapse', dupes.length === 2);
t('dedupe: keeps the first occurrence', dupes[0].id === 'pf_123456');

// --- buildCards: empty + nulls ----------------------------------------------
t('buildCards([]) is honestly empty', buildCards([]).length === 0);
t('buildCards drops nulls', buildCards([null, HOODIE_DETAIL, undefined]).length === 1);
t('buildCards never marks checkout ready', buildCards([HOODIE_DETAIL, MULTI_PRICE_DETAIL]).every((c) => c.checkoutReady === false));

// --- error notices: honest, generic, no credential leaks ---------------------
for (const status of [401, 403, 500, 0, undefined]) {
  const n = noticeForError(status);
  t(`noticeForError(${status}): non-empty string`, typeof n === 'string' && n.length > 10);
  t(`noticeForError(${status}): leaks no credential`, !/api[_-]?key|token|secret|bearer/i.test(n));
  t(`noticeForError(${status}): invents no products`, !/free|discount|sale/i.test(n));
}

// --- configuration gate ------------------------------------------------------
const savedKey = process.env.PRINTFUL_API_KEY;
delete process.env.PRINTFUL_API_KEY;
t('unconfigured without PRINTFUL_API_KEY', isPrintfulConfigured() === false);
process.env.PRINTFUL_API_KEY = 'test-key-never-real';
t('configured with PRINTFUL_API_KEY', isPrintfulConfigured() === true);
if (savedKey === undefined) delete process.env.PRINTFUL_API_KEY;
else process.env.PRINTFUL_API_KEY = savedKey;

// --- integration with mocked fetch (no real network) --------------------------
const realFetch = globalThis.fetch;
const LIST_ITEM = { id: 123456, name: 'Hocus Locusts Hoodie', variants: 11, synced: 11 };

globalThis.fetch = async (url) => {
  if (String(url).includes('/store/products?')) {
    return {
      ok: true, status: 200,
      json: async () => ({ code: 200, result: [LIST_ITEM], paging: { total: 1, offset: 0, limit: 100 } }),
    };
  }
  return {
    ok: true, status: 200,
    json: async () => ({ code: 200, result: HOODIE_DETAIL }),
  };
};
process.env.PRINTFUL_API_KEY = 'test-key-never-real';
__resetCache();
const catalog = await getCatalog();
t('mocked fetch: catalog has the one product', catalog.length === 1);
t('mocked fetch: card mapped end to end', catalog[0].id === 'pf_123456' && catalog[0].priceCents === 9500);

// Cache: a second call must not touch the network again.
let calls = 0;
globalThis.fetch = async () => { calls++; throw new Error('network should not be hit'); };
const cached = await getCatalog();
t('10-min cache serves without network', calls === 0 && cached.length === 1 && cached[0].id === 'pf_123456');

// Rate limit: a 429 on a detail call is retried (backoff) and the product
// survives — a cold catalog fetch must complete, not cache a partial list.
let detailCalls = 0;
globalThis.fetch = async (url) => {
  const headers = { get: () => null };
  if (String(url).includes('/store/products?')) {
    return {
      ok: true, status: 200, headers,
      json: async () => ({ code: 200, result: [LIST_ITEM], paging: { total: 1, offset: 0, limit: 100 } }),
    };
  }
  detailCalls++;
  if (detailCalls === 1) {
    return {
      ok: false, status: 429, headers,
      json: async () => ({ code: 429, result: 'Rate limit exceeded' }),
    };
  }
  return {
    ok: true, status: 200, headers,
    json: async () => ({ code: 200, result: HOODIE_DETAIL }),
  };
};
__resetCache();
const catalog429 = await getCatalog();
t('429: retried and the product survives', catalog429.length === 1 && catalog429[0].id === 'pf_123456');
t('429: detail was attempted twice (one retry)', detailCalls === 2);

// Auth failure: 401 -> throws with status, route maps it to an honest notice.
globalThis.fetch = async () => ({
  ok: false, status: 401,
  json: async () => ({ code: 401, result: 'Unauthorized' }),
});
__resetCache();
let threw = null;
try {
  await getCatalog();
} catch (e) { threw = e; }
t('bad key: getCatalog throws', !!threw);
t('bad key: status 401 preserved', threw && threw.status === 401);
t('bad key: honest notice, no fake products', typeof noticeForError(threw && threw.status) === 'string');

// API down: network throw -> status 0, honest notice.
globalThis.fetch = async () => { throw new Error('socket hangup'); };
__resetCache();
let threw2 = null;
try {
  await getCatalog();
} catch (e) { threw2 = e; }
t('api down: getCatalog throws, never returns fake products', !!threw2);
t('api down: notice is honest', noticeForError(threw2 && threw2.status).includes('try again later'));

globalThis.fetch = realFetch;
__resetCache();
if (savedKey === undefined) delete process.env.PRINTFUL_API_KEY;
else process.env.PRINTFUL_API_KEY = savedKey;

console.log(`\nstore-products: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
