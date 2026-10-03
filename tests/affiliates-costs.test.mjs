// tests/affiliates-costs.test.mjs
// Headless tests for true-COGS cost resolution, the pending_cost flow,
// wallet finalization, and the Merlin-only owner gate.
// Run: node --test tests/affiliates-costs.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  storeProductKey,
  computeVariantItemCost,
  usedPlacementsFromFiles,
} from '../lib/affiliates/costs.js';
import {
  accrueAffiliateCommission,
  finalizePendingCosts,
  isAffiliateOwner,
  AFF_OWNER_EMAIL,
} from '../lib/affiliates/server.js';

// In-memory mock of the supabase admin client surface used by server.js:
// aff_referrals (select/eq/maybeSingle), aff_commissions (upsert/select/update),
// aff_product_costs (select/eq/maybeSingle, upsert).
function mockAdmin({ referrals = [], commissions = [], costs = [] } = {}) {
  const store = {
    aff_referrals: referrals.map((r) => ({ ...r })),
    aff_commissions: commissions.map((c) => ({ ...c })),
    aff_product_costs: costs.map((c) => ({ ...c })),
  };
  return {
    _store: store,
    from(table) {
      const rows = store[table] || (store[table] = []);
      const q = {
        _filters: [],
        select() { return q; },
        eq(col, val) { q._filters.push([col, val]); return q; },
        order() { return q; },
        limit() {
          const hit = rows.filter((r) => q._filters.every(([c, v]) => r[c] === v));
          return { data: hit, error: null };
        },
        async maybeSingle() {
          const hit = rows.find((r) => q._filters.every(([c, v]) => r[c] === v));
          return { data: hit || null, error: null };
        },
        async upsert(row, { onConflict, ignoreDuplicates } = {}) {
          const keys = String(onConflict || '').split(',').filter(Boolean);
          const dup = rows.find((r) => keys.every((k) => String(r[k]) === String(row[k])));
          if (dup) {
            if (ignoreDuplicates) return { error: null };
            Object.assign(dup, row);
          } else {
            rows.push({ ...row });
          }
          return { error: null };
        },
        update(patch) {
          const first = q._filters.slice();
          return {
            eq(colA, valA) {
              const both = [...first, [colA, valA]];
              return {
                eq(colB, valB) {
                  let n = 0;
                  for (const r of rows) {
                    if (both.every(([c, v]) => r[c] === v) && r[colB] === valB) {
                      Object.assign(r, patch);
                      n++;
                    }
                  }
                  return Promise.resolve({ error: null, _updated: n });
                },
              };
            },
          };
        },
      };
      return q;
    },
  };
}

describe('storeProductKey', () => {
  it('builds pf:{sync_id}:{SIZE}', () => {
    assert.equal(storeProductKey({ product_id: 'pf_474601990', size: 'l' }), 'pf:474601990:L');
    assert.equal(storeProductKey({ product_id: 'pf_474601990', size: ' 2xs ' }), 'pf:474601990:2XS');
  });

  it('returns null when unusable', () => {
    assert.equal(storeProductKey({ product_id: 'nope', size: 'L' }), null);
    assert.equal(storeProductKey({ product_id: 'pf_474601990', size: '' }), null);
    assert.equal(storeProductKey({}), null);
  });
});

describe('computeVariantItemCost', () => {
  const aopPrices = {
    data: {
      currency: 'CAD',
      variant: { id: 18730, techniques: [{ key: 'cut-sew', price: '64.50', discounted_price: '64.50' }] },
      product: {
        placements: [
          { id: 'front', price: '0.00', discounted_price: '0.00' },
          { id: 'back', price: '0.00', discounted_price: '0.00' },
        ],
      },
    },
  };

  it('prices an AOP hoodie at the technique price', () => {
    const c = computeVariantItemCost(aopPrices, ['front', 'back']);
    assert.deepEqual(c, { cost_cents: 6450, currency: 'CAD' });
  });

  it('charges first used placement at discounted_price, rest at price', () => {
    const prices = {
      data: {
        currency: 'CAD',
        variant: { techniques: [{ price: '20.00' }] },
        product: {
          placements: [
            { id: 'front', price: '5.00', discounted_price: '3.00' },
            { id: 'back', price: '5.00', discounted_price: '3.00' },
          ],
        },
      },
    };
    // front only
    assert.equal(computeVariantItemCost(prices, ['front']).cost_cents, 2300);
    // front + back
    assert.equal(computeVariantItemCost(prices, ['front', 'back']).cost_cents, 2800);
    // unused placements are never charged
    assert.equal(computeVariantItemCost(prices, []).cost_cents, 2000);
  });

  it('returns null when unparseable', () => {
    assert.equal(computeVariantItemCost(null), null);
    assert.equal(computeVariantItemCost({ data: { variant: { techniques: [] } } }), null);
  });
});

describe('usedPlacementsFromFiles', () => {
  it('maps file types to placement ids in product order', () => {
    const sv = { files: [{ type: 'back' }, { type: 'default' }] };
    const placements = [{ id: 'front' }, { id: 'back' }, { id: 'sleeve_left' }];
    assert.deepEqual(usedPlacementsFromFiles(sv, placements), ['front', 'back']);
  });

  it('ignores unknown file types', () => {
    const sv = { files: [{ type: 'mystery' }] };
    assert.deepEqual(usedPlacementsFromFiles(sv, [{ id: 'front' }]), []);
  });
});

describe('pending_cost flow', () => {
  const base = {
    source: 'store',
    source_id: 'cs_test_1',
    buyer_user_id: 'buyer-1',
    buyer_email: 'buyer@example.com',
    gross_cents: 9500,
    stripe_fee_cents: 306,
    product_key: 'pf:474601990:L',
  };
  const referrals = [{ affiliate_user_id: 'aff-1', referred_user_id: 'buyer-1', referred_email: 'buyer@example.com' }];

  it('parks as pending_cost when the cost is unknowable', async () => {
    const admin = mockAdmin({ referrals });
    const r = await accrueAffiliateCommission(admin, {
      ...base,
      resolve_cogs: async () => null,
    });
    assert.equal(r.accrued, false);
    assert.equal(r.reason, 'pending_cost');
    const row = admin._store.aff_commissions[0];
    assert.equal(row.status, 'pending_cost');
    assert.equal(row.commission_cents, 0);
    assert.equal(row.product_key, 'pf:474601990:L');
    // provisional net = gross - fees (cost unknown)
    assert.equal(row.purchase_net_cents, 9194);
  });

  it('never double-parks on webhook redelivery', async () => {
    const admin = mockAdmin({ referrals });
    const args = { ...base, resolve_cogs: async () => null };
    await accrueAffiliateCommission(admin, args);
    await accrueAffiliateCommission(admin, args);
    assert.equal(admin._store.aff_commissions.length, 1);
  });

  it('accrues on the true net when the cost resolves', async () => {
    const admin = mockAdmin({ referrals });
    const r = await accrueAffiliateCommission(admin, {
      ...base,
      source_id: 'cs_test_2',
      resolve_cogs: async () => 6450,
    });
    assert.equal(r.accrued, true);
    const row = admin._store.aff_commissions[0];
    assert.equal(row.status, 'accrued');
    // net = 9500 - 306 - 6450 = 2744; store house 100% -> 10% = 274.4 -> 274
    assert.equal(row.purchase_net_cents, 2744);
    assert.equal(row.commission_cents, 274);
    assert.equal(row.product_key, 'pf:474601990:L');
  });

  it('finalizes pending rows when the cost lands', async () => {
    const admin = mockAdmin({
      referrals,
      commissions: [{
        id: 'c1',
        affiliate_user_id: 'aff-1',
        source: 'store',
        source_id: 'cs_test_3',
        product_key: 'pf:474601990:L',
        purchase_net_cents: 9194, // provisional gross - fees
        house_margin_cents: 0,
        commission_cents: 0,
        status: 'pending_cost',
      }],
    });
    const r = await finalizePendingCosts(admin, {
      product_key: 'pf:474601990:L',
      getCost: async () => 6450,
    });
    assert.equal(r.finalized, 1);
    const row = admin._store.aff_commissions[0];
    assert.equal(row.status, 'accrued');
    assert.equal(row.purchase_net_cents, 2744);
    assert.equal(row.commission_cents, 274);
  });

  it('finalize is a no-op when the cost is still unknown', async () => {
    const admin = mockAdmin({
      referrals,
      commissions: [{
        id: 'c1', affiliate_user_id: 'aff-1', source: 'store', source_id: 'cs_x',
        product_key: 'pf:1:X', purchase_net_cents: 9194,
        house_margin_cents: 0, commission_cents: 0, status: 'pending_cost',
      }],
    });
    const r = await finalizePendingCosts(admin, {
      product_key: 'pf:1:X',
      getCost: async () => null,
    });
    assert.equal(r.finalized, 0);
    assert.equal(admin._store.aff_commissions[0].status, 'pending_cost');
  });
});

describe('owner gate', () => {
  it('recognizes the owner email', () => {
    assert.ok(AFF_OWNER_EMAIL.length > 0);
    assert.equal(isAffiliateOwner({ email: 'olympiannexus@gmail.com' }), true);
    assert.equal(isAffiliateOwner({ email: 'OlympianNexus@Gmail.Com' }), true);
  });

  it('denies everyone else', () => {
    assert.equal(isAffiliateOwner({ email: 'someone@else.com' }), false);
    assert.equal(isAffiliateOwner({}), false);
    assert.equal(isAffiliateOwner(null), false);
  });
});
