// tests/store-products.test.mjs
// Honesty tests for the Printful-backed store catalog. Run: node tests/store-products.test.mjs
// (from the repo root). No browser, no real network — fixtures plus a mocked
// fetch for the integration paths.
//
// ARTEMIS PORT (from highland88999-commits/Olympus): the catalog is built
// from the Printful store LIST endpoint only (store_id=17419146, Bearer
// auth) — id/name/thumbnail_url/variants map straight to cards, the way
// Merlin's harvest wrote its manifest. No per-product detail calls.
//
// The store must NEVER invent products, fake a checkout, or leak the
// Printful key: mapping is 1:1 from Printful payloads, every card carries
// checkoutReady:false until Merlin approves wiring checkout, and failures
// surface as honest notices, never crashes or fake listings.
import {
  mapListItemToCard,
  dedupeById,
  findNameCollisions,
  buildCards,
  noticeForError,
  isPrintfulConfigured,
  getCatalog,
  categoryOf,
  priceCentsOf,
  __resetCache,
} from '../lib/store-printful.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- fixtures: Printful LIST payload shapes (Artemis harvest shape) ------------
const HOODIE_ITEM = {
  id: 123456,
  name: 'Hocus Locusts Hoodie',
  thumbnail_url: 'https://files.cdn.printful.com/files/0c0/0c0ae57c5b6a7822f2ed3229c23b338a_preview.png',
  variants: 11,
  synced: 11,
};
const SECOND_ITEM = {
  id: 7,
  name: 'Glitch',
  thumbnail_url: 'https://files.cdn.printful.com/files/abc/preview.png',
  variants: 8,
  synced: 8,
};
const NO_THUMB_ITEM = {
  id: 9,
  name: 'Mystery Hoodie',
  thumbnail_url: null,
  variants: 0,
  synced: 0,
};

// --- mapping: Printful list item -> store card --------------------------------
const hoodie = mapListItemToCard(HOODIE_ITEM);
t('hoodie: id prefixed pf_', hoodie.id === 'pf_123456');
t('hoodie: name preserved verbatim', hoodie.name === 'Hocus Locusts Hoodie');
t('hoodie: image from thumbnail_url', hoodie.image === 'https://files.cdn.printful.com/files/0c0/0c0ae57c5b6a7822f2ed3229c23b338a_preview.png');
t('hoodie: priceCents is the catalog C$95', hoodie.priceCents === 9500);
t('hoodie: currency cad', hoodie.currency === 'cad');
t('hoodie: priceLabel formatted', typeof hoodie.priceLabel === 'string' && hoodie.priceLabel.includes('95'));
t('hoodie: variantCount from list', hoodie.variantCount === 11);
t('hoodie: kind apparel', hoodie.kind === 'apparel');
t('hoodie: category Hoodies', hoodie.category === 'Hoodies');
t('hoodie: checkout not ready', hoodie.checkoutReady === false);
t('hoodie: priceId null', hoodie.priceId === null);

// --- categories: product-type grouping (Merlin 2026-10-11) -------------------
t('category: mug name -> Mugs', categoryOf('Neon Tiger Mug') === 'Mugs');
t('category: hoodie name -> Hoodies', categoryOf('Unisex Hoodie - X') === 'Hoodies');
t('category: track pants -> Pants', categoryOf('Unisex track pants - Y') === 'Pants');
t('category: unknown -> More', categoryOf('Glitch') === 'More');
t('category: empty -> More', categoryOf('') === 'More');

// --- categories: rollout type prefixes always win (Merlin 2026-10-13) --------
// Every rollout family gets its OWN category from the "<Type> - " prefix,
// even when the graphic name contains another family's keyword — the old
// keyword-first rules filed 5,339 of 5,694 rollout products wrong.
const TYPE_CASES = [
  ['Classic T-Shirt', 'T-Shirts', 9500],
  ['Zip-Up Hoodie', 'Hoodies', 9500],
  ['Drawstring Bag', 'Drawstring Bags', 9500],
  ['Knit Sweater', 'Sweaters', 9500],
  ['Joggers', 'Joggers', 9500],
  ['Tank Top', 'Tank Tops', 6500],
  ['Tote Bag', 'Tote Bags', 3500],
  ['Tumbler', 'Tumblers', 4500],
  ['Poster', 'Posters', 3500],
  ['Framed Poster', 'Framed Posters', 7500],
  ['Canvas', 'Canvas', 8500],
  ['Die-Cut Stickers', 'Stickers', 1500],
  ['Phone Case', 'Phone Cases', 4500],
  ['Puzzle', 'Puzzles', 3500],
  ['Postcards', 'Postcards', 1500],
  ['Apron', 'Aprons', 3500],
  ['Water Bottle', 'Water Bottles', 4500],
  ['Beach Towel', 'Beach Towels', 5500],
];
for (const [type, cat, cents] of TYPE_CASES) {
  t(`type prefix: ${type} -> ${cat}`, categoryOf(`${type} - Some Graphic`) === cat);
  t(`type price: ${type} -> ${cents}`, priceCentsOf(`${type} - Some Graphic`) === cents);
  t(`type card: ${type} price+category`, (() => {
    const card = mapListItemToCard({ id: 42, name: `${type} - Some Graphic`, variants: 1 });
    return card.category === cat && card.priceCents === cents;
  })());
}
// The misfiled-Mug regressions from the live census: the graphic name is
// a mug/hoodie name, the product is NOT — the type prefix decides.
t('misfiled: water bottle with mug graphic', categoryOf('Water Bottle - Frosty Diamond Face Mug') === 'Water Bottles');
t('misfiled: beach towel with mug graphic', categoryOf('Beach Towel - Galaxy Portal Mug') === 'Beach Towels');
t('misfiled: tote with mug graphic', categoryOf('Tote Bag - Neon Tiger Mug') === 'Tote Bags');
t('misfiled: t-shirt with hoodie graphic', categoryOf('Classic T-Shirt - Unisex Hoodie - You Sunk My Battleship') === 'T-Shirts');
t('misfiled: stickers with hoodie graphic price', priceCentsOf('Die-Cut Stickers - Unisex Hoodie - Prompt: YIN/YEN') === 1500);
t('misfiled: framed poster is not Posters', categoryOf('Framed Poster - X') === 'Framed Posters');
t('misfiled: zip-up with mug graphic stays Hoodies', categoryOf('Zip-Up Hoodie - Frosty Mug') === 'Hoodies');
// Legacy shapes keep working through the keyword fallback.
t('legacy: mug suffix beats hoodie words', categoryOf('Olympian Hoodies X Maps Mug') === 'Mugs');
t('legacy: mug batch price C$24.99', priceCentsOf('Neon Tiger Mug') === 2499);
t('legacy: bare title defaults to C$95', priceCentsOf('Glitch') === 9500);
t('legacy: track pants entry price', priceCentsOf('Unisex track pants - Artemis Hunting Gear') === 6050);
t('legacy: wide-leg joggers price', (() => {
  const card = mapListItemToCard({ id: 43, name: 'Wide-leg joggers - Camo', variants: 3 });
  return card.category === 'Joggers' && card.priceCents === 8000;
})());
t('legacy: sweater keyword -> Sweaters', categoryOf('Cozy Knit Sweater') === 'Sweaters');
t('legacy: sweatshirt keyword -> Sweatshirts', categoryOf('Classic Crewneck Sweatshirt') === 'Sweatshirts');

const second = mapListItemToCard(SECOND_ITEM);
t('second: id mapped', second.id === 'pf_7');
t('second: same catalog price', second.priceCents === 9500);

const nothumb = mapListItemToCard(NO_THUMB_ITEM);
t('no-thumb: image null, not a crash', nothumb.image === null && nothumb.id === 'pf_9');

const nameless = mapListItemToCard({ id: 5 });
t('nameless: honest Untitled product', nameless.name === 'Untitled product' && nameless.id === 'pf_5');

// --- dedupe: ID-based — each Printful product listed exactly once ---------
// Same name on DIFFERENT product ids is KEPT: the old name-dedupe silently
// ate these, a candidate contributor to the 218-vs-368 catalog gap.
const deduped = dedupeById([
  mapListItemToCard(HOODIE_ITEM),
  mapListItemToCard({ ...HOODIE_ITEM }), // identical product id: duplicate payload, collapses
  mapListItemToCard({ ...HOODIE_ITEM, id: 999, name: 'hocus   locusts hoodie' }), // same name, different id: kept
  mapListItemToCard(SECOND_ITEM),
]);
t('dedupe: same product id collapses', deduped.length === 3);
t('dedupe: keeps first occurrence', deduped[0].id === 'pf_123456');
t('dedupe: same name, different id is kept', deduped.some((c) => c.id === 'pf_999'));

// Name-collapse survives only as a logged signal — it never drops products.
const collisions = findNameCollisions(deduped);
t('name collisions: reported as a signal, not a drop',
  collisions.length === 1
  && collisions[0].ids.includes('pf_123456')
  && collisions[0].ids.includes('pf_999'));
t('name collisions: clean input reports none',
  findNameCollisions([mapListItemToCard(HOODIE_ITEM), mapListItemToCard(SECOND_ITEM)]).length === 0);

// Cards with no Printful id carry no key — they are never collapsed.
const unknowns = dedupeById([mapListItemToCard({ name: 'A' }), mapListItemToCard({ name: 'B' })]);
t('dedupe: id-less cards are never collapsed',
  unknowns.length === 2 && unknowns.every((c) => c.id === 'pf_unknown'));

// --- buildCards: empty + nulls ----------------------------------------------
t('buildCards([]) is honestly empty', buildCards([]).length === 0);
t('buildCards drops nulls', buildCards([null, HOODIE_ITEM, undefined]).length === 1);
t('buildCards never marks checkout ready', buildCards([HOODIE_ITEM, SECOND_ITEM]).every((c) => c.checkoutReady === false));

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
// Artemis shape: the list endpoint carries everything the card needs —
// the mock asserts the store_id scope param is present, like the harvest.
const realFetch = globalThis.fetch;
const LIST_ITEM = { id: 123456, name: 'Hocus Locusts Hoodie', thumbnail_url: 'https://files.cdn.printful.com/x.png', variants: 11, synced: 11 };
let sawStoreId = false;

globalThis.fetch = async (url) => {
  if (String(url).includes('/store/products?')) {
    sawStoreId = String(url).includes('store_id=17419146');
    const m = String(url).match(/offset=(\d+)/);
    const offset = m ? parseInt(m[1], 10) : 0;
    const items = offset === 0 ? [LIST_ITEM] : [];
    return {
      ok: true, status: 200,
      json: async () => ({ code: 200, result: items, paging: { total: 1, offset, limit: 100 } }),
    };
  }
  throw new Error('no detail calls in the Artemis port: ' + url);
};
process.env.PRINTFUL_API_KEY = 'test-key-never-real';
__resetCache();
const catalog = await getCatalog();
t('mocked fetch: catalog has the one product', catalog.length === 1);
t('mocked fetch: card mapped end to end', catalog[0].id === 'pf_123456' && catalog[0].priceCents === 9500);
t('mocked fetch: store_id scope param sent', sawStoreId === true);

// Cache: a second call must not touch the network again.
let calls = 0;
globalThis.fetch = async () => { calls++; throw new Error('network should not be hit'); };
const cached = await getCatalog();
t('10-min cache serves without network', calls === 0 && cached.length === 1 && cached[0].id === 'pf_123456');

// Rate limit: a 429 on the list call is retried (backoff) and the catalog
// still completes — a cold fetch must not cache a partial list.
let listCalls = 0;
globalThis.fetch = async (url) => {
  const headers = { get: () => null };
  const m = String(url).match(/offset=(\d+)/);
  const offset = m ? parseInt(m[1], 10) : 0;
  listCalls++;
  if (listCalls === 1) {
    return {
      ok: false, status: 429, headers,
      json: async () => ({ code: 429, result: 'Rate limit exceeded' }),
    };
  }
  // harvest pages until empty: only offset=0 has the product
  const items = offset === 0 ? [LIST_ITEM] : [];
  return {
    ok: true, status: 200, headers,
    json: async () => ({ code: 200, result: items, paging: { total: 1, offset, limit: 100 } }),
  };
};
__resetCache();
const catalog429 = await getCatalog();
t('429: retried and the product survives', catalog429.length === 1 && catalog429[0].id === 'pf_123456');
t('429: one 429 retry, then the empty-page check', listCalls === 3);

// Short page mid-list: Printful sometimes returns fewer items than the
// limit even though more remain. The harvest must keep going until a page
// comes back EMPTY (this once truncated production to 218/368) — exactly
// like the Artemis harvest, which never trusted short pages.
const TOTAL = 250;
const pageItems = (from, n) =>
  Array.from({ length: n }, (_, i) => ({
    id: 5000 + from + i,
    name: 'Hoodie ' + (from + i),
    thumbnail_url: 'https://files.cdn.printful.com/x.png',
    variants: 8,
    synced: 8,
  }));
globalThis.fetch = async (url) => {
  const m = String(url).match(/offset=(\d+)/);
  const offset = m ? parseInt(m[1], 10) : 0;
  // pages: 100, 100, then a transient short page of 18, then 32, then empty
  const sizes = [100, 100, 18, 32, 0];
  const pageIdx = Math.min(offset / 100, 4);
  const n = sizes[pageIdx];
  return {
    ok: true, status: 200, headers: { get: () => null },
    json: async () => ({
      code: 200,
      result: pageItems(offset, n),
      paging: { total: TOTAL, offset, limit: 100 },
    }),
  };
};
__resetCache();
const full = await getCatalog();
t('short page mid-list: harvest continues to an empty page', full.length === TOTAL);
t('short page mid-list: no unknowns', full.every((c) => c.id !== 'pf_unknown'));

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
