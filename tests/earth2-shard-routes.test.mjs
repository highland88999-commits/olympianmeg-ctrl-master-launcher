// Shard server state: the ledger-backed helpers + route wiring.
// The routes use the @/ alias, which node can't resolve, so the
// handlers are covered by source-level assertions (the repo's
// established route-test pattern) while the helpers run against a
// fake service client.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  listCollectedShardKeys, getRolloverRow, resolveHouseUserId,
} from '../lib/earth2/shard-server.js';

// --- a fake Supabase service client (query-builder shaped) --------
function fakeAdmin({ ledger = [], users = [] } = {}) {
  const calls = [];
  const table = (name) => {
    const state = { name, filters: [] };
    const api = {
      select: (...cols) => { state.cols = cols; return api; },
      like: (col, pattern) => { state.filters.push(['like', col, pattern]); return api; },
      eq: (col, val) => { state.filters.push(['eq', col, val]); return api; },
      maybeSingle: async () => {
        calls.push({ table: name, op: 'maybeSingle', filters: state.filters });
        let rows = ledger.filter((r) => r.table === name || name === 'aether_ledger');
        for (const [kind, col, val] of state.filters) {
          if (kind === 'eq') rows = rows.filter((r) => r[col] === val);
        }
        return { data: rows[0] || null, error: null };
      },
      then: (resolve) => {
        // `await query` (no maybeSingle): the collected-keys list.
        calls.push({ table: name, op: 'list', filters: state.filters });
        let rows = ledger.filter((r) => r.table === name || name === 'aether_ledger');
        for (const [kind, col, val] of state.filters) {
          if (kind === 'like') {
            const re = new RegExp('^' + String(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$');
            rows = rows.filter((r) => re.test(String(r[col] || '')));
          }
          if (kind === 'eq') rows = rows.filter((r) => r[col] === val);
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return api;
  };
  return {
    calls,
    from: (name) => table(name),
    auth: {
      admin: {
        listUsers: async () => ({ data: { users }, error: null }),
      },
    },
  };
}

describe('shard-server helpers', () => {
  it('lists the collected shard keys for a month (all users)', async () => {
    const admin = fakeAdmin({
      ledger: [
        { table: 'aether_ledger', reason: 'earth2-shard:2026-11:e049-eiffel-tower:aether-shard:0' },
        { table: 'aether_ledger', reason: 'earth2-shard:2026-11:e050-statue-of-liberty:aether-shard:2' },
        { table: 'aether_ledger', reason: 'earth2-shard:2026-10:e049-eiffel-tower:aether-shard:0' },
        { table: 'aether_ledger', reason: 'earth2-shard-rollover:2026-10' },
      ],
    });
    const keys = await listCollectedShardKeys(admin, '2026-11');
    assert.deepEqual(keys.sort(), [
      'e049-eiffel-tower:aether-shard:0',
      'e050-statue-of-liberty:aether-shard:2',
    ]);
  });

  it('finds the rollover row for a month, or null when it has not run', async () => {
    const row = { table: 'aether_ledger', reason: 'earth2-shard-rollover:2026-11', meta: { paidAether: 33 }, created_at: '2026-12-01T00:00:00Z' };
    const admin = fakeAdmin({ ledger: [row] });
    const found = await getRolloverRow(admin, '2026-11');
    assert.equal(found.meta.paidAether, 33);
    const missing = await getRolloverRow(admin, '2026-12');
    assert.equal(missing, null);
  });

  it('resolves the house wallet by email', async () => {
    const admin = fakeAdmin({
      users: [
        { id: 'u-1', email: 'someone@example.com' },
        { id: 'u-house', email: 'olympiannexus@gmail.com' },
      ],
    });
    assert.equal(await resolveHouseUserId(admin), 'u-house');
  });

  it('fails honestly when the house account is missing', async () => {
    const admin = fakeAdmin({ users: [{ id: 'u-1', email: 'someone@example.com' }] });
    await assert.rejects(() => resolveHouseUserId(admin), /House wallet account not found/);
  });
});

describe('shard routes (source wiring)', () => {
  const collectSrc = readFileSync(new URL('../app/api/earth2/shard-collect/route.js', import.meta.url), 'utf8');
  const rolloverSrc = readFileSync(new URL('../app/api/earth2/shard-rollover/route.js', import.meta.url), 'utf8');
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

  it('collect route credits through the real aether ledger, +1 per shard', () => {
    assert.ok(collectSrc.includes('creditAether'), 'uses creditAether');
    assert.ok(collectSrc.includes('SHARD_VALUE_AETHER'), 'uses the shard value constant');
    assert.ok(collectSrc.includes("capGroup: 'earth2-shard'"), 'caps under the shard group');
    assert.ok(collectSrc.includes('wasDuplicate'), 'handles an already-collected shard');
    assert.ok(collectSrc.includes('alreadyCollected'), 'reports already-collected honestly');
    assert.ok(collectSrc.includes('getUserFromRequest'), 'authenticates the walker');
    assert.ok(collectSrc.includes('setupRequired'), 'answers 503 until the aether SQL runs');
  });

  it('rollover route is cron-only, idempotent and auditable', () => {
    assert.ok(rolloverSrc.includes('CRON_SECRET'), 'guarded by CRON_SECRET');
    assert.ok(rolloverSrc.includes('Bearer ${secret}'), 'Bearer check');
    assert.ok(rolloverSrc.includes('already-done'), 'second run in a month is a no-op');
    assert.ok(rolloverSrc.includes('resolveHouseUserId'), 'pays the house wallet');
    assert.ok(rolloverSrc.includes('rolloverIdemKey'), 'house payment is idempotent');
    assert.ok(rolloverSrc.includes('positions'), 'new coordinates are recorded with the payment');
    assert.ok(rolloverSrc.includes('prevMonthKey'), 'rolls over the month that just ended');
  });

  it('vercel.json runs the rollover on the 1st of each month', () => {
    const cron = (vercel.crons || []).find((c) => c.path === '/api/earth2/shard-rollover');
    assert.ok(cron, 'cron entry exists');
    assert.equal(cron.schedule, '0 0 1 * *');
  });
});
