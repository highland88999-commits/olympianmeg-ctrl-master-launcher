// tests/store-creator-pages.test.mjs
// Contract tests for the creator storefronts + creations marketplace.
// Run: node tests/store-creator-pages.test.mjs (from the repo root).
// No browser, no network — pure helpers only.
//
// The laws under test:
//   - Share URLs for creator pages + the marketplace are canonical
//     (absolute on https://olympusverse.com, inside the store family).
//   - Marketplace/storefront cards are PUBLIC-SAFE: they never carry
//     the creator's email or the baseline/markup breakdown; the price
//     shown is the recorded final price (the buy route re-derives it
//     server-side regardless).
//   - A card's image is the record's own mockup first, the live
//     catalog thumbnail second, and null (placeholder) after that —
//     never a fabricated image.
//   - Clicking a product leads to its page within the store: the
//     /store?product=pf_<id> deep link the storefront honours.
//   - Listing merge (DB + Stripe records) dedupes by Printful id with
//     the DB copy winning, orders newest first, and drops records
//     that cannot be keyed.
import {
  creatorPagePath,
  creatorShareUrl,
  marketplaceShareUrl,
  creatorShareTitle,
  creatorShareText,
  marketplaceShareTitle,
  MARKETPLACE_PATH,
} from '../lib/store/share.js';
import {
  publicCreatorLabel,
  templateNameOf,
  creationCardFromRecord,
  creationCardsFromRecords,
} from '../lib/store/creator-pages.js';
import {
  mergeCreationRecords,
  recordFromStripeProduct,
  recordFromRow,
} from '../lib/store/custom-creations.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- canonical URLs -----------------------------------------------------------
t('creator path', creatorPagePath('user-123') === '/store/creator/user-123');
t('creator path encodes', creatorPagePath('a b') === '/store/creator/a%20b');
t('creator path empty id', creatorPagePath('') === '' && creatorPagePath(null) === '');
t('creator share url', creatorShareUrl('user-123') === 'https://olympusverse.com/store/creator/user-123');
t('creator share url falls back to marketplace', creatorShareUrl('') === 'https://olympusverse.com/store/marketplace');
t('marketplace path', MARKETPLACE_PATH === '/store/marketplace');
t('marketplace share url', marketplaceShareUrl() === 'https://olympusverse.com/store/marketplace');
t('creator share title named', creatorShareTitle('Ada') === 'Ada · Creator Storefront');
t('creator share title neutral', creatorShareTitle('Creator') === 'Creator Storefront · Omega Store');
t('creator share text named', creatorShareText('Ada').includes('Ada'));
t('marketplace share title', marketplaceShareTitle().includes('Marketplace'));

// --- public labels ------------------------------------------------------------
t('label passes a real name through', publicCreatorLabel('  Ada Lovelace ') === 'Ada Lovelace');
t('label falls back on blank', publicCreatorLabel('   ') === 'Creator');
t('label falls back on null', publicCreatorLabel(null) === 'Creator');
t('label falls back on non-string', publicCreatorLabel(42) === 'Creator');

// --- template names -------------------------------------------------------------
t('template name from config', templateNameOf('tote-bag') === 'Tote Bag');
t('template name hoodie', templateNameOf('hoodie') === 'Unisex Hoodie');
t('template name unknown key prettified', templateNameOf('mystery-thing') === 'Mystery Thing');
t('template name missing', templateNameOf(null) === 'Custom product');

// --- cards ----------------------------------------------------------------------
const rec = {
  creatorUserId: 'user-123',
  creatorEmail: 'secret@example.com',
  templateKey: 'tote-bag',
  designName: 'Moon Cat',
  productName: 'Tote Bag - Custom: Moon Cat',
  printfulProductId: '555',
  stripeProductId: 'prod_1',
  baselineCents: 3500,
  markupCents: 1000,
  finalCents: 4500,
  currency: 'cad',
  createdAt: '2026-10-13T00:00:00.000Z',
  image: 'https://img.example/mockup.png',
};
const card = creationCardFromRecord(rec, { creatorLabel: 'Ada' });
t('card id is the pf_ key', card.id === 'pf_555');
t('card name', card.name === 'Tote Bag - Custom: Moon Cat');
t('card template', card.templateName === 'Tote Bag');
t('card price is the recorded final price', card.priceCents === 4500 && card.priceLabel.includes('45'));
t('card image is the record mockup', card.image === 'https://img.example/mockup.png');
t('card store url canonical', card.storeUrl === 'https://olympusverse.com/store?product=pf_555');
t('card store path is the in-store deep link', card.storePath === '/store?product=pf_555');
t('card creator path', card.creatorPath === '/store/creator/user-123');
t('card creator label', card.creatorLabel === 'Ada');
t('card leaks no email', !('creatorEmail' in card) && JSON.stringify(card).indexOf('secret@example.com') === -1);
t('card hides the price breakdown', !('baselineCents' in card) && !('markupCents' in card));

const noImg = creationCardFromRecord({ ...rec, image: null }, { catalogImage: 'https://img.example/catalog.png' });
t('card image falls back to catalog', noImg.image === 'https://img.example/catalog.png');
const noImgAtAll = creationCardFromRecord({ ...rec, image: null });
t('card image null -> placeholder upstream', noImgAtAll.image === null);
t('unkeyed record makes no card', creationCardFromRecord({ ...rec, printfulProductId: null }) === null);
t('null record makes no card', creationCardFromRecord(null) === null);
t('guest creation has no creator path', creationCardFromRecord({ ...rec, creatorUserId: null }).creatorPath === '');

const cards = creationCardsFromRecords(
  [rec, { ...rec, printfulProductId: '556', creatorUserId: 'user-9', image: null }],
  {
    catalogById: new Map([['556', 'https://img.example/cat556.png']]),
    creatorLabels: new Map([['user-9', 'Grace']]),
  }
);
t('cards map keeps order + count', cards.length === 2 && cards[0].printfulId === '555' && cards[1].printfulId === '556');
t('cards map applies catalog image', cards[1].image === 'https://img.example/cat556.png');
t('cards map applies creator label', cards[1].creatorLabel === 'Grace');

// --- listing merge ----------------------------------------------------------------
const dbRec = { ...rec, productName: 'DB copy', createdAt: '2026-10-12T00:00:00.000Z' };
const stripeRec = { ...rec, productName: 'Stripe copy', createdAt: '2026-10-12T00:00:00.000Z' };
const newer = { ...rec, printfulProductId: '777', createdAt: '2026-10-13T00:00:00.000Z' };
const merged = mergeCreationRecords([dbRec], [stripeRec, newer]);
t('merge dedupes by printful id', merged.length === 2);
t('merge DB copy wins', merged.find((r) => r.printfulProductId === '555').productName === 'DB copy');
t('merge newest first', merged[0].printfulProductId === '777');
t('merge drops unkeyed', mergeCreationRecords([{ productName: 'x' }], []).length === 0);
t('merge tolerates empty lists', mergeCreationRecords([], []).length === 0 && mergeCreationRecords(null, undefined).length === 0);

// --- stripe record enrichment -------------------------------------------------------
const fromStripe = recordFromStripeProduct({
  id: 'prod_9',
  created: 1791800000,
  images: ['https://img.example/stripe.png'],
  metadata: {
    custom: 'true', printful_id: '888', creator_user_id: 'user-1',
    template_key: 'poster', product_name: 'Poster - Custom: Sun',
    baseline_cents: '3500', markup_cents: '500', final_cents: '4000', currency: 'cad',
  },
});
t('stripe record carries its image', fromStripe.image === 'https://img.example/stripe.png');
t('stripe record carries created time', fromStripe.createdAt === new Date(1791800000 * 1000).toISOString());
const fromRow = recordFromRow({
  creator_user_id: 'user-1', template_key: 'poster', printful_product_id: 888,
  baseline_cents: 3500, markup_cents: 500, final_cents: 4000,
  created_at: '2026-10-13T00:00:00.000Z',
});
t('db record image is null (catalog fills it)', fromRow.image === null);

console.log(`store-creator-pages: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
