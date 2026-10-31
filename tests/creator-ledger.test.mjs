// tests/creator-ledger.test.mjs
// Creator monetization: pricing validation, revenue split, sale parsing.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CREATOR_PLATFORM_FEE_CENTS,
  MIN_LISTING_PRICE_CENTS,
  creatorSaleReference,
  validateListingPrice,
  splitCreatorSale,
  parseCreatorSale,
} from '../lib/creator/ledger.js';

describe('creator ledger', () => {
  it('validates listing prices', () => {
    assert.deepEqual(validateListingPrice(100), { ok: true, priceCents: 100, error: null });
    assert.deepEqual(validateListingPrice(9999), { ok: true, priceCents: 9999, error: null });
    // Below $1.00 floor
    const low = validateListingPrice(99);
    assert.equal(low.ok, false);
    assert.ok(low.error.includes('$1.00'));
    // Zero / negative / garbage
    assert.equal(validateListingPrice(0).ok, false);
    assert.equal(validateListingPrice(-500).ok, false);
    assert.equal(validateListingPrice('abc').ok, false);
    assert.equal(validateListingPrice(null).ok, false);
    // Above ceiling
    assert.equal(validateListingPrice(100000001).ok, false);
    // Floats round to whole cents
    assert.equal(validateListingPrice(199.6).priceCents, 200);
  });

  it('splits a sale: net = gross - stripe fee - $1 platform fee', () => {
    // $25.00 sale, $1.02 Stripe fee
    const s = splitCreatorSale(2500, 102);
    assert.equal(s.grossCents, 2500);
    assert.equal(s.stripeFeeCents, 102);
    assert.equal(s.platformFeeCents, CREATOR_PLATFORM_FEE_CENTS);
    assert.equal(s.platformFeeCents, 100);
    assert.equal(s.netCents, 2500 - 102 - 100); // 2298
  });

  it('never credits negative: fees eating the price floor at zero', () => {
    const s = splitCreatorSale(100, 50); // $1.00 - $0.50 stripe - $1.00 platform
    assert.equal(s.netCents, 0);
    assert.ok(s.netCents >= 0);
  });

  it('builds idempotency references from session id', () => {
    const r1 = creatorSaleReference('cs_test_123');
    const r2 = creatorSaleReference('cs_test_123');
    assert.equal(r1, r2);
    assert.ok(r1.includes('cs_test_123'));
    assert.notEqual(creatorSaleReference('a'), creatorSaleReference('b'));
  });

  it('parses creator sale metadata (server-stamped only)', () => {
    const good = parseCreatorSale({
      creator_sale: 'true',
      creator_listing_id: 'listing-1',
      creator_seller_user_id: 'user-abc',
      creator_price_cents: '2500',
    });
    assert.deepEqual(good, {
      listingId: 'listing-1',
      sellerUserId: 'user-abc',
      priceCents: 2500,
    });
    // Missing the creator_sale flag
    assert.equal(parseCreatorSale({ creator_listing_id: 'x' }), null);
    // Missing fields
    assert.equal(parseCreatorSale({ creator_sale: 'true' }), null);
    // Bad price
    assert.equal(
      parseCreatorSale({
        creator_sale: 'true',
        creator_listing_id: 'x',
        creator_seller_user_id: 'y',
        creator_price_cents: '0',
      }),
      null
    );
    // Null / garbage
    assert.equal(parseCreatorSale(null), null);
    assert.equal(parseCreatorSale('nope'), null);
  });

  it('minimum price constant is $1.00', () => {
    assert.equal(MIN_LISTING_PRICE_CENTS, 100);
  });
});
