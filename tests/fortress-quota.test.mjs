// Fortress of Solitude: used_bytes accounting.
//
// Verifies lib/fortress/quota-store.js against an in-memory fake of the
// Supabase client — the rules that matter:
//   - a missing row is created with the 1 GB free allowance (seeded from
//     the crystal matrix for legacy files);
//   - used_bytes rises on every store and falls on every delete, never
//     below zero;
//   - a purchase changes the allowance (tier, quota_bytes, Stripe ids) and
//     NEVER resets used_bytes;
//   - a cancelled subscription returns the vault to free, keeping used_bytes.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getQuotaRow,
  ensureQuotaRow,
  addUsedBytes,
  removeUsedBytes,
  applyPurchase,
  applyCancellation,
  applyStackPurchase,
  applyStackCancellation,
  ensureQuotaFromMatrix,
} from '../lib/fortress/quota-store.js';
import { FREE_QUOTA_BYTES } from '../lib/fortress/tiers.js';

// Minimal in-memory stand-in for the Supabase query builder.
function makeFakeDb(seed = {}) {
  const tables = {
    fortress_quotas: [],
    fortresses_: [],
    ...JSON.parse(JSON.stringify(seed)),
  };

  function from(table) {
    const rows = tables[table] || (tables[table] = []);
    const state = { op: null, filters: [], payload: null, wantCount: false, upsertConflict: null };

    const builder = {
      select(_cols, opts) {
        if (opts && opts.count === 'exact') state.wantCount = true;
        if (!state.op) state.op = 'select';
        return builder;
      },
      eq(col, val) { state.filters.push([col, val]); return builder; },
      insert(vals) { state.op = 'insert'; state.payload = vals; return builder; },
      update(patch) { state.op = 'update'; state.payload = patch; return builder; },
      upsert(vals, opts) { state.op = 'upsert'; state.payload = vals; state.upsertConflict = opts?.onConflict; return builder; },
      delete(opts) { state.op = 'delete'; state.wantCount = !!(opts && opts.count === 'exact'); return builder; },
      maybeSingle() { return run('maybeSingle'); },
      single() { return run('single'); },
    };

    function filtered() {
      return rows.filter((r) => state.filters.every(([c, v]) => r[c] === v));
    }

    async function run(mode) {
      const found = filtered();
      if (!state.op || state.op === 'select') {
        if (mode === 'single') {
          if (found.length !== 1) return { data: null, error: new Error('expected one row') };
          return { data: found[0], error: null };
        }
        if (mode === 'maybeSingle') {
          if (found.length > 1) return { data: null, error: new Error('multiple rows') };
          return { data: found[0] || null, error: null };
        }
        return { data: found, error: null };
      }
      if (state.op === 'insert') {
        const inserted = state.payload.map((v) => ({ ...v }));
        rows.push(...inserted);
        return { data: mode === 'single' ? inserted[0] || null : inserted, error: null };
      }
      if (state.op === 'update') {
        found.forEach((r) => Object.assign(r, state.payload));
        return { data: mode === 'single' ? found[0] || null : found, error: null };
      }
      if (state.op === 'upsert') {
        const out = [];
        for (const v of state.payload) {
          let target = state.upsertConflict === 'user_id'
            ? rows.find((r) => r.user_id === v.user_id)
            : null;
          if (target) Object.assign(target, v); // merge: untouched columns survive
          else {
            // Mirror the SQL schema defaults for a brand-new row.
            target = { used_bytes: 0, ...v };
            rows.push(target);
          }
          out.push(target);
        }
        return { data: mode === 'single' ? out[0] || null : out, error: null };
      }
      if (state.op === 'delete') {
        const kept = rows.filter((r) => !state.filters.every(([c, v]) => r[c] === v));
        const count = rows.length - kept.length;
        tables[table] = kept;
        return { data: null, error: null, count };
      }
      return { data: null, error: new Error('unknown op') };
    }

    return builder;
  }

  return { from, _tables: tables };
}

const UID = 'user-123';

test('a missing row is created with the 1 GB free allowance', async () => {
  const db = makeFakeDb();
  assert.equal(await getQuotaRow(db, UID), null);
  const { row, created } = await ensureQuotaRow(db, UID);
  assert.equal(created, true);
  assert.equal(row.user_id, UID);
  assert.equal(row.tier, 'free');
  assert.equal(row.quota_bytes, FREE_QUOTA_BYTES);
  assert.equal(row.used_bytes, 0);
});

test('ensureQuotaRow never overwrites an existing row', async () => {
  const db = makeFakeDb({ fortress_quotas: [{ user_id: UID, tier: '50gb', quota_bytes: 50e9, used_bytes: 123 }] });
  const { row, created } = await ensureQuotaRow(db, UID, 999999);
  assert.equal(created, false);
  assert.equal(row.used_bytes, 123);
  assert.equal(row.tier, '50gb');
});

test('used_bytes rises on store and falls on delete, never below zero', async () => {
  const db = makeFakeDb();
  let row = await addUsedBytes(db, UID, 500_000_000);
  assert.equal(row.used_bytes, 500_000_000);
  row = await addUsedBytes(db, UID, 250_000_000);
  assert.equal(row.used_bytes, 750_000_000);
  row = await removeUsedBytes(db, UID, 300_000_000);
  assert.equal(row.used_bytes, 450_000_000);
  row = await removeUsedBytes(db, UID, 999_999_999_999); // clamp at zero
  assert.equal(row.used_bytes, 0);
});

test('a purchase sets the allowance and Stripe ids but never resets used_bytes', async () => {
  const db = makeFakeDb({ fortress_quotas: [{ user_id: UID, tier: 'free', quota_bytes: 1e9, used_bytes: 777_000 }] });
  const row = await applyPurchase(db, {
    userId: UID,
    tierId: '250gb',
    quotaBytes: 250_000_000_000,
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: 'sub_456',
  });
  assert.equal(row.tier, '250gb');
  assert.equal(row.quota_bytes, 250_000_000_000);
  assert.equal(row.stripe_customer_id, 'cus_123');
  assert.equal(row.stripe_subscription_id, 'sub_456');
  assert.equal(row.used_bytes, 777_000, 'used_bytes must survive a purchase');
});

test('a purchase for a brand-new user starts used_bytes at zero', async () => {
  const db = makeFakeDb();
  const row = await applyPurchase(db, {
    userId: UID, tierId: '50gb', quotaBytes: 50_000_000_000,
    stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1',
  });
  assert.equal(row.tier, '50gb');
  assert.equal(row.used_bytes, 0);
});

test('a cancelled subscription returns the vault to free, keeping used_bytes', async () => {
  const db = makeFakeDb({
    fortress_quotas: [{
      user_id: UID, tier: '1tb', quota_bytes: 1e12, used_bytes: 5_000_000_000,
      stripe_customer_id: 'cus_9', stripe_subscription_id: 'sub_9',
    }],
  });
  const row = await applyCancellation(db, UID);
  assert.equal(row.tier, 'free');
  assert.equal(row.quota_bytes, FREE_QUOTA_BYTES);
  assert.equal(row.stripe_subscription_id, null);
  assert.equal(row.used_bytes, 5_000_000_000, 'stored files are never touched by a tier change');
});

test('ensureQuotaFromMatrix seeds used_bytes from legacy stored files', async () => {
  const db = makeFakeDb({
    fortresses_: [{ id: UID, crystal_matrix: [{ rawSize: 1000 }, { rawSize: 2500 }, { rawSize: 0 }] }],
  });
  const { row, created } = await ensureQuotaFromMatrix(db, UID);
  assert.equal(created, true);
  assert.equal(row.used_bytes, 3500);
  assert.equal(row.quota_bytes, FREE_QUOTA_BYTES);
});

// ---- Custom tiers + stacking (2026-10-26) ----

test('a custom purchase ADDS to the allowance and never touches tier or used_bytes', async () => {
  const db = makeFakeDb({ fortress_quotas: [{ user_id: UID, tier: 'free', quota_bytes: 1e9, used_bytes: 42_000 }] });
  const row = await applyStackPurchase(db, { userId: UID, addedBytes: 100_000_000_000 });
  assert.equal(row.quota_bytes, 101_000_000_000);
  assert.equal(row.tier, 'free', 'a custom purchase never changes the base tier');
  assert.equal(row.used_bytes, 42_000, 'used_bytes never moves on a purchase');
});

test('buying twice doubles the added room (genuinely additive stacking)', async () => {
  const db = makeFakeDb({ fortress_quotas: [{ user_id: UID, tier: 'free', quota_bytes: 1e9, used_bytes: 0 }] });
  let row = await applyStackPurchase(db, { userId: UID, addedBytes: 50_000_000_000 });
  assert.equal(row.quota_bytes, 51_000_000_000);
  row = await applyStackPurchase(db, { userId: UID, addedBytes: 50_000_000_000 });
  assert.equal(row.quota_bytes, 101_000_000_000, 'twice the same purchase doubles the added room');
});

test('a cancelled custom purchase removes only its own room, never below free', async () => {
  const db = makeFakeDb({ fortress_quotas: [{ user_id: UID, tier: 'free', quota_bytes: 101_000_000_000, used_bytes: 7_000 }] });
  let row = await applyStackCancellation(db, { userId: UID, removedBytes: 50_000_000_000 });
  assert.equal(row.quota_bytes, 51_000_000_000);
  row = await applyStackCancellation(db, { userId: UID, removedBytes: 50_000_000_000 });
  assert.equal(row.quota_bytes, FREE_QUOTA_BYTES, 'free allowance is the floor');
  assert.equal(row.used_bytes, 7_000, 'stored files are never touched by a cancellation');
});

test('stacked room survives a fixed-tier change', async () => {
  const db = makeFakeDb({ fortress_quotas: [{ user_id: UID, tier: 'free', quota_bytes: 101_000_000_000, used_bytes: 0 }] });
  const row = await applyPurchase(db, {
    userId: UID, tierId: '50gb', quotaBytes: 50_000_000_000,
    stripeCustomerId: 'cus_x', stripeSubscriptionId: 'sub_x',
  });
  assert.equal(row.tier, '50gb');
  assert.equal(row.quota_bytes, 150_000_000_000, '50 GB tier + 100 GB stacked room carried over');
});

test('stacked room survives a base-tier cancellation', async () => {
  const db = makeFakeDb({
    fortress_quotas: [{ user_id: UID, tier: '50gb', quota_bytes: 150_000_000_000, used_bytes: 0, stripe_subscription_id: 'sub_x' }],
  });
  const row = await applyCancellation(db, UID);
  assert.equal(row.tier, 'free');
  assert.equal(row.quota_bytes, 101_000_000_000, 'free allowance + 100 GB stacked room');
});
