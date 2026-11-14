// The aether shard monthly cycle: 53 a month, one aether each,
// rollover pays the house and redistributes to new unique spots.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARD_COUNT,
  SHARD_VALUE_AETHER,
  SHARD_PICKUP_RADIUS_M,
  HOUSE_WALLET_EMAIL,
  SHARD_LAUNCH_MONTH,
  monthKey,
  prevMonthKey,
  nextMonthKey,
  shardKeys,
  launchPositions,
  positionsForMonth,
  shardReason,
  shardIdemKey,
  rolloverReason,
  rolloverIdemKey,
  rolloverForMonth,
  withinPickupRadius,
} from '../lib/earth2/shard-cycle.js';

describe('monthly pool', () => {
  it('is exactly 53 shards', () => {
    assert.equal(SHARD_COUNT, 53);
    const keys = shardKeys();
    assert.equal(keys.length, 53);
    assert.equal(new Set(keys).size, 53, 'shard keys are unique');
    for (const k of keys) assert.ok(k.includes(':aether-shard:'), k);
  });

  it('pays 1 aether per shard to the house wallet address on record', () => {
    assert.equal(SHARD_VALUE_AETHER, 1);
    assert.equal(HOUSE_WALLET_EMAIL, 'olympiannexus@gmail.com');
    assert.ok(SHARD_PICKUP_RADIUS_M > 0 && SHARD_PICKUP_RADIUS_M <= 3, 'pickup radius is a short walk-through');
  });

  it('month keys roll over the year boundary', () => {
    assert.equal(monthKey(new Date('2026-11-13T21:19:44Z')), '2026-11');
    assert.equal(prevMonthKey('2027-01'), '2026-12');
    assert.equal(nextMonthKey('2026-12'), '2027-01');
    assert.equal(nextMonthKey('2026-11'), '2026-12');
    assert.equal(prevMonthKey('2026-11'), '2026-10');
  });
});

describe('launch positions (November 2026)', () => {
  it('spreads the 53 shards across the world (no redistribution needed)', () => {
    const pos = launchPositions();
    assert.equal(pos.length, 53);
    assert.equal(new Set(pos.map((p) => p.parcelIndex)).size, 50, '50 distinct parcels');
    const xs = pos.map((p) => p.x);
    const zs = pos.map((p) => p.z);
    assert.ok(Math.min(...xs) < -600 && Math.max(...xs) > 600, 'shards span east-west');
    assert.ok(Math.min(...zs) < -600 && Math.max(...zs) > 600, 'shards span north-south');
    assert.equal(new Set(pos.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`)).size, 53, 'coordinates unique');
  });
});

describe('monthly redistribution', () => {
  it('is deterministic for a month', () => {
    assert.deepEqual(positionsForMonth('2026-12'), positionsForMonth('2026-12'));
    assert.deepEqual(positionsForMonth('2027-03'), positionsForMonth('2027-03'));
  });

  it('gives every shard a new unique coordinate that differs from last month', () => {
    for (const month of ['2026-12', '2027-01', '2027-02', '2027-06']) {
      const pos = positionsForMonth(month);
      assert.equal(pos.length, 53, month);
      assert.equal(new Set(pos.map((p) => p.parcelIndex)).size, 53, `${month}: parcels unique`);
      assert.equal(new Set(pos.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`)).size, 53, `${month}: coordinates unique`);
      const prev = positionsForMonth(prevMonthKey(month));
      const prevByKey = new Map(prev.map((p) => [p.shardKey, p]));
      for (const p of pos) {
        const old = prevByKey.get(p.shardKey);
        assert.ok(old, `${month}: ${p.shardKey} existed last month`);
        assert.notEqual(p.parcelIndex, old.parcelIndex, `${month}: ${p.shardKey} moved parcels`);
        assert.ok(Math.hypot(p.x - old.x, p.z - old.z) > 1, `${month}: ${p.shardKey} moved`);
      }
    }
  });

  it('keeps the same 53 shard keys every month', () => {
    const keys = new Set(shardKeys());
    for (const month of ['2026-12', '2027-01']) {
      assert.deepEqual(new Set(positionsForMonth(month).map((p) => p.shardKey)), keys);
    }
  });
});

describe('rollover computation', () => {
  it('pays the exact remaining count to the house', () => {
    const keys = shardKeys();
    const r = rolloverForMonth('2026-11', keys.slice(0, 20));
    assert.equal(r.month, '2026-11');
    assert.equal(r.nextMonth, '2026-12');
    assert.equal(r.collected, 20);
    assert.equal(r.remaining, 33);
    assert.equal(r.paidAether, 33);
    assert.equal(r.positions.length, 53);
    const none = rolloverForMonth('2026-11', []);
    assert.equal(none.remaining, 53);
    assert.equal(none.paidAether, 53);
    const all = rolloverForMonth('2026-11', keys);
    assert.equal(all.remaining, 0);
    assert.equal(all.paidAether, 0);
  });

  it('names the ledger rows so a second run is a duplicate, not a double-pay', () => {
    assert.equal(shardReason('2026-11', 'e049-eiffel-tower:aether-shard:0'), 'earth2-shard:2026-11:e049-eiffel-tower:aether-shard:0');
    assert.equal(shardIdemKey('2026-11', 'e049-eiffel-tower:aether-shard:0'), shardReason('2026-11', 'e049-eiffel-tower:aether-shard:0'));
    assert.equal(rolloverReason('2026-11'), 'earth2-shard-rollover:2026-11');
    assert.equal(rolloverIdemKey('2026-11'), 'earth2-shard-rollover:2026-11');
    assert.notEqual(rolloverReason('2026-11'), rolloverReason('2026-12'), 'one rollover row per month');
  });
});

describe('pickup', () => {
  it('collects within the radius and not outside it', () => {
    const shard = { x: 100, z: 100 };
    assert.ok(withinPickupRadius(shard, 100, 100));
    assert.ok(withinPickupRadius(shard, 101, 101));
    assert.ok(!withinPickupRadius(shard, 103, 100));
    assert.ok(!withinPickupRadius(shard, 100, 110));
  });
});
