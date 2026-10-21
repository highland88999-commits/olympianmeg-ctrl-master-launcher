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
  getProductImage,
  isRealImageUrl,
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

// --- categories: VERIFIED TYPE always wins (Merlin, 2026-10-21) --------
// Every rollout family is filed by its Printful catalog TYPE, verified
// live: for each first segment below, two independent sync products
// were fetched and their first variant's catalog product matched 1:1.
// Prices are Merlin's percentage rule: each family's entry-variant
// Printful cost x the hoodie markup factor (9500/5795 — the C$95
// hoodie over its C$57.95 cost), rounded to the nearest cent. Graphic
// names NEVER file a product: a blanket whose graphic is a hoodie
// design is a BLANKET (the old keyword rules put Blankets under
// Hoodies and Pillows & Pillow Cases under Pants/Mugs — the exact
// symptoms from Merlin's 2026-10-21 store walkthrough).
const TYPE_CASES = [
  ['Unisex Hoodie', 'Hoodies', 9500],
  ['Classic T-Shirt', 'T-Shirts', 4180],
  ['Framed Poster', 'Framed Posters', 5566],
  ['Tank Top', 'Tank Tops', 4139],
  ['Tote Bag', 'Tote Bags', 4139],
  ['Apron', 'Aprons', 5369],
  ['Baby Bodysuits', 'Baby Bodysuits', 2705],
  ['Backpacks', 'Backpacks', 10697],
  ['Beach Towel', 'Beach Towels', 6844],
  ['Blankets', 'Blankets', 5730],
  ['Calendars', 'Calendars', 4508],
  ['Canvas', 'Canvas', 3926],
  ['Crossbody, Fanny & Sling Bags', 'Crossbody Bags', 5615],
  ['Die-Cut Stickers', 'Stickers', 902],
  ['Drawstring Bag', 'Drawstring Bags', 3648],
  ['Dresses', 'Dresses', 8770],
  ['Flags & Pennants', 'Flags & Pennants', 5451],
  ['Gift Wrap & Paper Bags', 'Gift Wrap & Bags', 1393],
  ['Glassware', 'Glassware', 2910],
  ['Headwear', 'Headwear', 3156],
  ['Jackets', 'Jackets', 9959],
  ['Joggers', 'Joggers', 9664],
  ['Knit Sweater', 'Sweaters', 11189],
  ['Leggings', 'Leggings', 8934],
  ['Mouse Pads & Desk Mats', 'Mouse Pads & Desk Mats', 2336],
  ['Notebooks & Journals', 'Notebooks & Journals', 3156],
  ['Ornaments', 'Ornaments', 1959],
  ['Pajamas', 'Pajamas', 7369],
  ['Pet Accessories', 'Pet Accessories', 4180],
  ['Phone Case', 'Phone Cases', 3811],
  ['Pillows & Pillow Cases', 'Pillows & Pillow Cases', 3197],
  ['Polo Shirts', 'Polo Shirts', 5328],
  ['Postcards', 'Postcards', 369],
  ['Poster', 'Posters', 2541],
  ['Puzzle', 'Puzzles', 3566],
  ['Shoes', 'Shoes', 10205],
  ['Shorts', 'Shorts', 7746],
  ['Sports Bras', 'Sports Bras', 6270],
  ['Sports Jerseys', 'Sports Jerseys', 7746],
  ['Sweatshirts', 'Sweatshirts', 8238],
  ['Swimwear', 'Swimwear', 10410],
  ['Table Linens', 'Table Linens', 9426],
  ['Tumbler', 'Tumblers', 2418],
  ['Water Bottle', 'Water Bottles', 6385],
  ['Zip-Up Hoodie', 'Hoodies', 12582],
  ['Candles', 'Candles', 2705],
  ['Unisex zip hoodie', 'Hoodies', 12123],
  ['Unisex track pants', 'Pants', 7131],
  ['Galaga x Arcade', 'Hoodies', 9500],
  ['Olympian Unisex Hoodie', 'Hoodies', 9500],
  ['The Architect; Unisex Hoodie', 'Hoodies', 9500],
  ['Wide-leg joggers', 'Joggers', 9262],
];
for (const [type, cat, cents] of TYPE_CASES) {
  t(`type prefix: ${type} -> ${cat}`, categoryOf(`${type} - Some Graphic`) === cat);
  t(`type price: ${type} -> ${cents}`, priceCentsOf(`${type} - Some Graphic`) === cents);
  t(`type card: ${type} price+category`, (() => {
    const card = mapListItemToCard({ id: 42, name: `${type} - Some Graphic`, variants: 1 });
    return card.category === cat && card.priceCents === cents;
  })());
}
// The misfiled regressions from Merlin's walkthrough + the live
// census: the graphic name names another product; the TYPE decides.
t('misfiled: water bottle with mug graphic', categoryOf('Water Bottle - Frosty Diamond Face Mug') === 'Water Bottles');
t('misfiled: beach towel with mug graphic', categoryOf('Beach Towel - Galaxy Portal Mug') === 'Beach Towels');
t('misfiled: tote with mug graphic', categoryOf('Tote Bag - Neon Tiger Mug') === 'Tote Bags');
t('misfiled: t-shirt with hoodie graphic', categoryOf('Classic T-Shirt - Unisex Hoodie - You Sunk My Battleship') === 'T-Shirts');
t('misfiled: stickers with hoodie graphic price', priceCentsOf('Die-Cut Stickers - Unisex Hoodie - Prompt: YIN/YEN') === 902);
t('misfiled: framed poster is not Posters', categoryOf('Framed Poster - X') === 'Framed Posters');
t('misfiled: zip-up with mug graphic stays Hoodies', categoryOf('Zip-Up Hoodie - Frosty Mug') === 'Hoodies');
t('misfiled: blanket with hoodie graphic is a Blanket', categoryOf('Blankets - Unisex Hoodie - You Sunk My Battleship') === 'Blankets');
t('misfiled: pillow with pants graphic is a Pillow', categoryOf('Pillows & Pillow Cases - Unisex track pants - Y') === 'Pillows & Pillow Cases');
// Legacy shapes: pre-rollout dashboard names END in the type word —
// structure, verified against the catalog (all 88 live "* Mug"
// products are catalog 19). Everything else unrecognized is 'More'
// at the C$95 anchor: name-keyword filing is GONE (it was the bug).
t('legacy: mug suffix beats hoodie words', categoryOf('Olympian Hoodies X Maps Mug') === 'Mugs');
t('legacy: mug batch price = cost x hoodie factor', priceCentsOf('Neon Tiger Mug') === 1434);
t('legacy: bare title defaults to C$95', priceCentsOf('Glitch') === 9500);
t('legacy: track pants entry price', priceCentsOf('Unisex track pants - Artemis Hunting Gear') === 7131);
t('legacy: wide-leg joggers price', (() => {
  const card = mapListItemToCard({ id: 43, name: 'Wide-leg joggers - Camo', variants: 3 });
  return card.category === 'Joggers' && card.priceCents === 9262;
})());
t('legacy: keyword filing removed (sweater words in a title)', categoryOf('Cozy Knit Sweater') === 'More');
t('legacy: keyword filing removed (sweatshirt words in a title)', categoryOf('Classic Crewneck Sweatshirt') === 'More');
// Verified per-product types: graphic-titled legacy products carry no
// type in their name; the audit typed them by detail fetch, keyed by
// Printful id (Glitch the product, id 474601990, IS a hoodie — the
// bare NAME 'Glitch' above still resolves 'More' without its id).
t('verified id: Glitch the product is a Hoodie', (() => {
  const card = mapListItemToCard({ id: 474601990, name: 'Glitch', variants: 11 });
  return card.category === 'Hoodies' && card.priceCents === 9500 && card.kind === 'apparel';
})());
t('verified id: Grafitti Wear the pants', (() => {
  const card = mapListItemToCard({ id: 428063212, name: 'Grafitti Wear', variants: 11 });
  return card.category === 'Pants' && card.priceCents === 7746;
})());

// --- images: the degenerate thumbnail must never reach a card --------
t('image url: bare CDN root is not a real image', isRealImageUrl('https://files.cdn.printful.com/') === false);
t('image url: real preview file is a real image', isRealImageUrl('https://files.cdn.printful.com/files/0c0/0c0ae57c5b6a7822f2ed3229c23b338a_preview.png') === true);
t('image url: null is not a real image', isRealImageUrl(null) === false);
const degen = mapListItemToCard({ id: 77, name: 'Blankets - X', thumbnail_url: 'https://files.cdn.printful.com/', variants: 1 });
t('degenerate thumbnail: image null + pending resolution', degen.image === null && degen.imagePending === true);
const realThumb = mapListItemToCard({ id: 78, name: 'Blankets - X', thumbnail_url: 'https://files.cdn.printful.com/files/abc/preview.png', variants: 1 });
t('real thumbnail: image set, nothing pending', realThumb.image === 'https://files.cdn.printful.com/files/abc/preview.png' && realThumb.imagePending === false);

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

// --- mockup resolution: the detail payload's preview file wins -----
// The list thumbnail for most products is the bare CDN root; the real
// mockup is the first sync variant's 'preview' file in the DETAIL
// payload. getProductImage reads exactly that (its own call — the
// catalog build above stays list-only, as the mocks there assert).
globalThis.fetch = async (url) => {
  if (String(url).includes('/store/products/555?')) {
    return {
      ok: true, status: 200,
      json: async () => ({
        code: 200,
        result: {
          sync_product: { id: 555, thumbnail_url: 'https://files.cdn.printful.com/' },
          sync_variants: [{
            id: 9001, variant_id: 22609,
            files: [
              { type: 'default', preview_url: 'https://files.cdn.printful.com/files/aaa/design_preview.png' },
              { type: 'preview', preview_url: 'https://files.cdn.printful.com/files/bbb/mockup_preview.png' },
            ],
          }],
        },
      }),
    };
  }
  throw new Error('unexpected fetch: ' + url);
};
process.env.PRINTFUL_API_KEY = 'test-key-never-real';
__resetCache();
const resolved = await getProductImage('555');
t('mockup resolution: preview file beats design file + degenerate thumb',
  resolved === 'https://files.cdn.printful.com/files/bbb/mockup_preview.png');
const resolvedPf = await getProductImage('pf_555'.replace(/^pf_/, ''));
t('mockup resolution: cached per product', resolvedPf === resolved);
const noImage = await getProductImage('not-a-number');
t('mockup resolution: bad id -> null, never a crash', noImage === null);

globalThis.fetch = realFetch;
__resetCache();
if (savedKey === undefined) delete process.env.PRINTFUL_API_KEY;
else process.env.PRINTFUL_API_KEY = savedKey;

console.log(`\nstore-products: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
