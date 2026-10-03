// tests/affiliates.test.mjs
// Headless tests for the in-house affiliate program:
// - codes: format, unambiguous alphabet, uniqueness, normalization
// - commission math: 10% of the HOUSE's margin per surface
//   (tickets -> 1% of net; store/hermes/etc -> 10% of net; art -> 0)
// - anti-abuse: self-referral rejected, zero commission rejected
// - payout threshold progress
// Run: node --test tests/affiliates.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeAffiliateCode,
  normalizeAffiliateCode,
  isWellFormedAffiliateCode,
  computeAffiliateCommission,
  purchaseNet,
  shouldAccrueCommission,
  payoutProgress,
  AFFILIATE_RATE,
  HOUSE_MARGIN_RATE,
  AFF_MIN_PAYOUT_CENTS,
} from '../lib/affiliates.js';

describe('affiliate codes', () => {
  it('matches AFF-XXXXXX format', () => {
    assert.match(makeAffiliateCode(), /^AFF-[A-Z2-9]{6}$/);
  });

  it('uses the unambiguous alphabet (no 0/O/1/I/L)', () => {
    for (let i = 0; i < 200; i++) {
      const code = makeAffiliateCode();
      assert.ok(!/[01OIL]/.test(code.replace('AFF-', '')), code);
    }
  });

  it('mints unique codes', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const c = makeAffiliateCode();
      assert.ok(!seen.has(c), `duplicate: ${c}`);
      seen.add(c);
    }
  });

  it('normalizes messy input', () => {
    assert.equal(normalizeAffiliateCode('aff-7kq2m9'), 'AFF-7KQ2M9');
    assert.equal(normalizeAffiliateCode('AFF7KQ2M9'), 'AFF-7KQ2M9');
    assert.equal(normalizeAffiliateCode('aff 7kq2m9'), 'AFF-7KQ2M9');
  });

  it('validates well-formed codes', () => {
    assert.ok(isWellFormedAffiliateCode('AFF-7KQ2M9'));
    assert.ok(isWellFormedAffiliateCode('aff7kq2m9'));
    assert.ok(!isWellFormedAffiliateCode('AFF-7KQ2M')); // too short
    assert.ok(!isWellFormedAffiliateCode('AFF-7KQ2M90')); // too long
    assert.ok(!isWellFormedAffiliateCode('PS-7KQ2M9XD')); // ticket, not affiliate
    assert.ok(!isWellFormedAffiliateCode(''));
  });
});

describe('commission math (10% of house margin)', () => {
  it('affiliate rate is 10%', () => {
    assert.equal(AFFILIATE_RATE, 0.10);
  });

  it('tickets: house 10% of net -> affiliate 1% of net (90/9/1)', () => {
    // $10.00 ticket, $0.59 Stripe fee -> net 941c
    const s = computeAffiliateCommission({ net_cents: 941, surface: 'tickets' });
    assert.equal(s.house_margin_rate, 0.10);
    assert.equal(s.house_margin_cents, 94); // round(941 * 0.10)
    assert.equal(s.commission_cents, 9); // round(94 * 0.10)
    assert.equal(s.house_keeps_cents, 85);
    // performer 90% = 847; 847 + 85 + 9 = 941 = net
    assert.equal(847 + s.house_keeps_cents + s.commission_cents, 941);
  });

  it('store: house 100% of net -> affiliate 10% of net', () => {
    const s = computeAffiliateCommission({ net_cents: 5000, surface: 'store' });
    assert.equal(s.house_margin_cents, 5000);
    assert.equal(s.commission_cents, 500);
    assert.equal(s.house_keeps_cents, 4500);
  });

  it('hermes $2.00 listing: affiliate earns 10% of (200 - fee)', () => {
    const net = purchaseNet({ gross_cents: 200, stripe_fee_cents: 12 });
    const s = computeAffiliateCommission({ net_cents: net, surface: 'hermes' });
    assert.equal(net, 188);
    assert.equal(s.commission_cents, 19); // round(188 * 0.10)
    assert.equal(s.house_keeps_cents, 169);
  });

  it('art: house takes no cut -> zero commission', () => {
    const s = computeAffiliateCommission({ net_cents: 10000, surface: 'art' });
    assert.equal(s.house_margin_cents, 0);
    assert.equal(s.commission_cents, 0);
  });

  it('digital surfaces accrue 10% of net', () => {
    for (const surface of ['luge', 'gallery', 'fortress', 'world-engine', 'persephone']) {
      const s = computeAffiliateCommission({ net_cents: 1000, surface });
      assert.equal(s.commission_cents, 100, surface);
      assert.equal(s.house_keeps_cents, 900, surface);
    }
  });

  it('unknown surfaces default to full house margin', () => {
    const s = computeAffiliateCommission({ net_cents: 1000, surface: 'future-surface' });
    assert.equal(s.commission_cents, 100);
  });

  it('rounding never exceeds the house margin', () => {
    for (let net = 0; net < 500; net++) {
      for (const surface of Object.keys(HOUSE_MARGIN_RATE)) {
        const s = computeAffiliateCommission({ net_cents: net, surface });
        assert.ok(s.commission_cents + s.house_keeps_cents === s.house_margin_cents,
          `${surface} net=${net}`);
        assert.ok(s.house_margin_cents <= s.net_cents, `${surface} net=${net}`);
      }
    }
  });

  it('purchaseNet subtracts fees and COGS, floored at zero', () => {
    assert.equal(purchaseNet({ gross_cents: 1000, stripe_fee_cents: 59, cogs_cents: 300 }), 641);
    assert.equal(purchaseNet({ gross_cents: 100, stripe_fee_cents: 200 }), 0);
  });
});

describe('anti-abuse', () => {
  it('rejects self-referral', () => {
    assert.equal(
      shouldAccrueCommission({ affiliate_user_id: 'u1', buyer_user_id: 'u1', commission_cents: 50 }),
      false
    );
  });

  it('rejects missing affiliate', () => {
    assert.equal(
      shouldAccrueCommission({ affiliate_user_id: null, buyer_user_id: 'u2', commission_cents: 50 }),
      false
    );
  });

  it('rejects zero commission', () => {
    assert.equal(
      shouldAccrueCommission({ affiliate_user_id: 'u1', buyer_user_id: 'u2', commission_cents: 0 }),
      false
    );
  });

  it('accrues for a genuine referred purchase', () => {
    assert.equal(
      shouldAccrueCommission({ affiliate_user_id: 'u1', buyer_user_id: 'u2', commission_cents: 50 }),
      true
    );
  });

  it('accrues for logged-out buyers (email fallback, no buyer_user_id)', () => {
    assert.equal(
      shouldAccrueCommission({ affiliate_user_id: 'u1', buyer_user_id: null, commission_cents: 50 }),
      true
    );
  });
});

describe('payout threshold', () => {
  it('is $20', () => {
    assert.equal(AFF_MIN_PAYOUT_CENTS, 2000);
  });

  it('tracks progress', () => {
    const p = payoutProgress({ balance_cents: 500 });
    assert.equal(p.percent, 25);
    assert.equal(p.reached, false);
    const q = payoutProgress({ balance_cents: 2000 });
    assert.equal(q.percent, 100);
    assert.equal(q.reached, true);
  });
});
