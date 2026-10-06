// tests/auction-routes.test.js
// Headless tests for the Forge -> Profile -> Auction House -> Backpack
// pure helpers (lib/auction/helpers.js).
// Run: node tests/auction-routes.test.js (from the repo root).
// No browser, no network.
import {
  AUCTION_CATEGORIES,
  ASSET_LISTING_TYPES,
  LISTING_TYPES,
  normalizeCategory,
  isValidCategory,
  isValidAssetListingType,
  isValidListingType,
  minBidIncrementCents,
  bidIdempotencyRef,
  saleBuyerRef,
  saleSellerRef,
  clampInt,
  formatUsdCents,
  validateAssetPatch,
  validateListInput,
  validateBidAmount,
  publicAssetFields,
} from '../lib/auction/helpers.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- Categories: the 8 known values ---
t('8 known categories', AUCTION_CATEGORIES.length === 8);
for (const c of ['world', 'weather', 'character', 'creature', 'vehicle', 'object', 'weapon', 'asset_link']) {
  t(`category valid: ${c}`, isValidCategory(c));
}
t('category case-insensitive', isValidCategory('Weapon'));
t('category trims', isValidCategory('  vehicle '));
t('unknown category rejected', !isValidCategory('spaceship'));
t('normalizeCategory', normalizeCategory(' WEAPON ') === 'weapon');
t('ASSET_LISTING_TYPES includes none', ASSET_LISTING_TYPES.includes('none'));
t('LISTING_TYPES excludes none', !LISTING_TYPES.includes('none'));
t('isValidAssetListingType none', isValidAssetListingType('none'));
t('isValidListingType both', isValidListingType('both'));
t('bad listing type rejected', !isValidListingType('rental'));

// --- Min bid increment: $1 or 5%, whichever is larger ---
t('increment on 0 -> 100', minBidIncrementCents(0) === 100);
t('increment on 100 -> 100 (5% = 5, floor wins)', minBidIncrementCents(100) === 100);
t('increment on 1999 -> 100 (5% = 99.95)', minBidIncrementCents(1999) === 100);
t('increment on 2000 -> 100 (5% = 100, tie goes to $1)', minBidIncrementCents(2000) === 100);
t('increment on 10000 -> 500', minBidIncrementCents(10000) === 500);
t('increment on 2101 -> 106 (rounds up)', minBidIncrementCents(2101) === 106);
t('increment on negative -> 100', minBidIncrementCents(-50) === 100);

// --- Idempotency reference builders ---
t('bid ref', bidIdempotencyRef('L1', 'U2', 500) === 'auction:bid:L1:U2:500');
t('sale buyer ref', saleBuyerRef('L1') === 'auction:sale:L1:buyer');
t('sale seller ref', saleSellerRef('L1') === 'auction:sale:L1:seller');

// --- clampInt / formatUsdCents ---
t('clampInt within', clampInt('12', 1, 100, 24) === 12);
t('clampInt clamps high', clampInt(500, 1, 100, 24) === 100);
t('clampInt clamps low', clampInt(-5, 1, 100, 24) === 1);
t('clampInt fallback', clampInt('abc', 1, 100, 24) === 24);
t('formatUsdCents', formatUsdCents(1234) === '$12.34');
t('formatUsdCents zero', formatUsdCents(0) === '$0.00');

// --- validateAssetPatch ---
{
  const r = validateAssetPatch({});
  t('patch: empty body rejected', !r.ok);
}
{
  const r = validateAssetPatch({ display_name: '  My Sword  ' });
  t('patch: display name trims', r.ok && r.patch.display_name === 'My Sword');
}
{
  const r = validateAssetPatch({ display_name: '   ' });
  t('patch: blank name rejected', !r.ok);
}
{
  const r = validateAssetPatch({ listing_type: 'auction' });
  t('patch: listing_type accepted', r.ok && r.patch.listing_type === 'auction');
}
{
  const r = validateAssetPatch({ listing_type: 'rental' });
  t('patch: bad listing_type rejected', !r.ok);
}
{
  const r = validateAssetPatch({ starting_bid_cents: -5 });
  t('patch: negative price rejected', !r.ok);
}
{
  const r = validateAssetPatch({ starting_bid_cents: '250', buy_now_price_cents: 0 });
  t('patch: prices coerce to int', r.ok && r.patch.starting_bid_cents === 250 && r.patch.buy_now_price_cents === 0);
}

// --- validateListInput ---
{
  const r = validateListInput({});
  t('list: missing asset_id rejected', !r.ok);
}
{
  const r = validateListInput({ asset_id: 'A1', listing_type: 'auction' });
  t('list: auction without start bid rejected', !r.ok);
}
{
  const r = validateListInput({ asset_id: 'A1', listing_type: 'auction', starting_bid_cents: 500 });
  t('list: auction ok', r.ok && r.listing_type === 'auction' && r.starting_bid_cents === 500 && r.buy_now_price_cents === null);
}
{
  const r = validateListInput({ asset_id: 'A1', listing_type: 'fixed', buy_now_price_cents: 0 });
  t('list: fixed with 0 price rejected', !r.ok);
}
{
  const r = validateListInput({ asset_id: 'A1', listing_type: 'both', starting_bid_cents: 100, buy_now_price_cents: 5000 });
  t('list: both ok', r.ok && r.starting_bid_cents === 100 && r.buy_now_price_cents === 5000);
}
{
  const r = validateListInput({ asset_id: 'A1', listing_type: 'fixed', buy_now_price_cents: 999, ends_at: '2020-01-01' });
  t('list: past ends_at rejected', !r.ok);
}
{
  const r = validateListInput({ asset_id: 'A1', listing_type: 'fixed', buy_now_price_cents: 999, ends_at: new Date(Date.now() + 86400000).toISOString(), title: '  Cool  ' });
  t('list: future ends_at ok, title trims', r.ok && r.title === 'Cool' && !!r.ends_at);
}
{
  const r = validateListInput({ asset_id: 'A1', listing_type: 'rental' });
  t('list: bad listing_type rejected', !r.ok);
}

// --- validateBidAmount ---
const liveListing = {
  id: 'L1', status: 'live', listing_type: 'auction', seller_id: 'SELLER',
  starting_bid_cents: 500, current_bid_cents: 0, current_bidder_id: null,
  ends_at: new Date(Date.now() + 3600000).toISOString(),
};
{
  const r = validateBidAmount(null, 100, 'U1');
  t('bid: missing listing -> 404', !r.ok && r.status === 404);
}
{
  const r = validateBidAmount({ ...liveListing, status: 'sold' }, 600, 'U1');
  t('bid: not live -> 409', !r.ok && r.status === 409);
}
{
  const r = validateBidAmount({ ...liveListing, listing_type: 'fixed' }, 600, 'U1');
  t('bid: fixed-only rejects bids', !r.ok);
}
{
  const r = validateBidAmount({ ...liveListing, ends_at: new Date(Date.now() - 1000).toISOString() }, 600, 'U1');
  t('bid: ended auction rejected', !r.ok && r.status === 409);
}
{
  const r = validateBidAmount(liveListing, 600, 'SELLER');
  t('bid: seller cannot bid', !r.ok);
}
{
  const r = validateBidAmount(liveListing, 499, 'U1');
  t('bid: below starting bid rejected', !r.ok);
}
{
  const r = validateBidAmount(liveListing, 500, 'U1');
  t('bid: opening bid at start ok', r.ok);
}
{
  const withBid = { ...liveListing, current_bid_cents: 1000, current_bidder_id: 'U9' };
  const r = validateBidAmount(withBid, 1050, 'U1');
  t('bid: below min increment rejected', !r.ok && /1\.00|11\.00/.test(r.error));
}
{
  const withBid = { ...liveListing, current_bid_cents: 1000, current_bidder_id: 'U9' };
  const r = validateBidAmount(withBid, 1100, 'U1');
  t('bid: current + $1 increment ok', r.ok);
}
{
  const withBid = { ...liveListing, current_bid_cents: 10000, current_bidder_id: 'U9' };
  const r = validateBidAmount(withBid, 10499, 'U1');
  t('bid: below 5% increment rejected', !r.ok);
}
{
  const withBid = { ...liveListing, current_bid_cents: 10000, current_bidder_id: 'U9' };
  const r = validateBidAmount(withBid, 10500, 'U1');
  t('bid: 5% increment ok', r.ok);
}
{
  const r = validateBidAmount(liveListing, 0, 'U1');
  t('bid: zero rejected', !r.ok);
}

// --- publicAssetFields: never leaks user_id ---
{
  const out = publicAssetFields({
    id: 'A1', user_id: 'SECRET', display_name: 'Sword', category: 'weapon',
    asset_url: 'https://x', generation_params: { a: 1 }, created_at: 't',
    is_listed: true, listing_type: 'auction', starting_bid_cents: 100, buy_now_price_cents: 500,
    extra_secret: 'nope',
  });
  t('public fields keep display fields', out.display_name === 'Sword' && out.category === 'weapon');
  t('public fields drop user_id', !('user_id' in out));
  t('public fields drop unknown keys', !('extra_secret' in out));
}

console.log(`\nauction-routes: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
