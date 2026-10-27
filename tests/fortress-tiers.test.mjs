// Fortress of Solitude: tier catalog, price resolution, and quota math.
//
// Verifies lib/fortress/tiers.js — the real Stripe tier data (dashboard
// values, May 2026), env-first price ID resolution with dashboard fallback,
// human-readable byte formatting, and the hard quota gate message.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FREE_TIER_ID,
  FREE_QUOTA_BYTES,
  FORTRESS_TIERS,
  PAID_TIER_IDS,
  getTier,
  isPurchasableTier,
  resolvePriceId,
  formatBytes,
  checkQuota,
  sumMatrixBytes,
} from '../lib/fortress/tiers.js';

test('free allowance is Merlin\u2019s 1 GB default', () => {
  assert.equal(FREE_TIER_ID, 'free');
  assert.equal(FREE_QUOTA_BYTES, 1_000_000_000);
  assert.equal(getTier('free').bytes, FREE_QUOTA_BYTES);
  assert.equal(isPurchasableTier('free'), false);
});

test('paid tiers ascend in size and carry real dashboard price data', () => {
  assert.deepEqual(PAID_TIER_IDS, ['50gb', '250gb', '1tb', '5tb']);
  const expected = {
    '50gb': { name: 'Fortress Acolyte', price: '$2.00 CAD/month', id: 'price_1TbAUzC6BMYhx5j9ZzBPyCyX', bytes: 50_000_000_000 },
    '250gb': { name: 'Fortress Kryptonian', price: '$5.00 CAD/month', id: 'price_1TbAWHC6BMYhx5j9ZzBPyCyX', bytes: 250_000_000_000 },
    '1tb': { name: 'Fortress Elder', price: '$10.00 CAD/month', id: 'price_1TbAXJC6BMYhx5j997KqUX4F', bytes: 1_000_000_000_000 },
    '5tb': { name: 'Fortress God', price: '$25.00 CAD/month', id: 'price_1TbAYBC6BMYhx5j918mHps5L', bytes: 5_000_000_000_000 },
  };
  let lastBytes = 0;
  for (const id of PAID_TIER_IDS) {
    const t = getTier(id);
    assert.ok(t, id);
    assert.equal(isPurchasableTier(id), true);
    assert.equal(t.productName, expected[id].name);
    assert.equal(t.priceLabel, expected[id].price);
    assert.equal(t.priceId, expected[id].id);
    assert.equal(t.bytes, expected[id].bytes);
    assert.equal(t.priceEnv, { '50gb': 'FORTRESS_PRICE_50GB', '250gb': 'FORTRESS_PRICE_250GB', '1tb': 'FORTRESS_PRICE_1TB', '5tb': 'FORTRESS_PRICE_5TB' }[id]);
    assert.ok(t.bytes > lastBytes, 'tiers must ascend');
    lastBytes = t.bytes;
  }
});

test('unknown tiers are never purchasable', () => {
  assert.equal(getTier('nope'), null);
  assert.equal(isPurchasableTier('nope'), false);
  assert.equal(isPurchasableTier(undefined), false);
});

test('resolvePriceId prefers the env var, falls back to the dashboard ID', () => {
  assert.equal(resolvePriceId('50gb', {}), 'price_1TbAUzC6BMYhx5j9ZzBPyCyX');
  assert.equal(
    resolvePriceId('50gb', { FORTRESS_PRICE_50GB: 'price_env_override' }),
    'price_env_override'
  );
  assert.equal(resolvePriceId('free', {}), null);
  assert.equal(resolvePriceId('nope', {}), null);
});

test('formatBytes is human-readable', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1_000_000_000), '1 GB');
  assert.equal(formatBytes(4_200_000_000), '4.2 GB');
  assert.equal(formatBytes(50_000_000_000), '50 GB');
  assert.equal(formatBytes(1_000_000_000_000), '1 TB');
  assert.equal(formatBytes(5_000_000_000_000), '5 TB');
  assert.equal(formatBytes(2_500_000), '2.5 MB');
  assert.equal(formatBytes(-5), '0 B');
  assert.equal(formatBytes(NaN), '0 B');
});

test('checkQuota allows room and hard-rejects with an honest message', () => {
  const ok = checkQuota({ usedBytes: 1_000_000_000, quotaBytes: 50_000_000_000, incomingBytes: 500_000_000 });
  assert.equal(ok.ok, true);
  assert.equal(ok.message, '');

  const exact = checkQuota({ usedBytes: 49_000_000_000, quotaBytes: 50_000_000_000, incomingBytes: 1_000_000_000 });
  assert.equal(exact.ok, true);

  const over = checkQuota({ usedBytes: 4_200_000_000, quotaBytes: 50_000_000_000, incomingBytes: 46_000_000_000 });
  assert.equal(over.ok, false);
  assert.equal(over.message, "You've used 4.2 GB of 50 GB \u2014 upgrade to store more.");
});

test('sumMatrixBytes totals rawSize for seeding legacy files', () => {
  assert.equal(sumMatrixBytes([{ rawSize: 100 }, { rawSize: 200 }, {}]), 300);
  assert.equal(sumMatrixBytes(null), 0);
  assert.equal(sumMatrixBytes([]), 0);
});

// ---- Custom tiers (2026-10-26) ----
// The custom per-GB rate defaults to the 50 GB tier's rate ($2 / 50 GB =
// $0.04/GB CAD). Merlin has NOT set the custom rate yet — these tests pin
// the default so any change is deliberate and visible, not silent drift.

import {
  CUSTOM_TIER_RATE_CENTS_PER_GB,
  CUSTOM_TIER_MIN_GB,
  CUSTOM_TIER_MAX_GB,
  customTierPriceCents,
  customTierBytes,
  isValidCustomGb,
  stackedBytesForRow,
} from '../lib/fortress/tiers.js';

test('custom rate defaults to the 50 GB tier rate ($0.04/GB CAD)', () => {
  assert.equal(CUSTOM_TIER_RATE_CENTS_PER_GB, 4);
  assert.equal(customTierPriceCents(50), 200, '50 GB custom costs what the 50 GB fixed tier costs');
  assert.equal(customTierPriceCents(100), 400);
  assert.equal(customTierPriceCents(1), 4, "1 GB costs $0.04 at the default rate");
});

test('custom amounts validate as whole GB within 1–5000', () => {
  assert.equal(isValidCustomGb(1), true);
  assert.equal(isValidCustomGb(5000), true);
  assert.equal(isValidCustomGb(0), false);
  assert.equal(isValidCustomGb(5001), false);
  assert.equal(isValidCustomGb(12.5), false, 'no fractional GB');
  assert.equal(isValidCustomGb('100'), false, 'strings are not valid amounts');
  assert.equal(CUSTOM_TIER_MIN_GB, 1);
  assert.equal(CUSTOM_TIER_MAX_GB, 5000);
});

test('custom tier bytes use the same GB as the fixed tiers', () => {
  assert.equal(customTierBytes(1), 1_000_000_000);
  assert.equal(customTierBytes(250), 250_000_000_000);
});

test('stacked room is the allowance above the base tier, never negative', () => {
  assert.equal(stackedBytesForRow({ quota_bytes: 101_000_000_000 }, { bytes: 1_000_000_000 }), 100_000_000_000);
  assert.equal(stackedBytesForRow({ quota_bytes: 50_000_000_000 }, { bytes: 50_000_000_000 }), 0);
  assert.equal(stackedBytesForRow({ quota_bytes: 500 }, { bytes: 1_000_000_000 }), 0, 'a shortfall is never negative stacked room');
  assert.equal(stackedBytesForRow(null, null), 0);
});
