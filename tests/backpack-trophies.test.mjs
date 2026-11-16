// tests/backpack-trophies.test.mjs
// THE BACKPACK'S TROPHY HEALS (Merlin, 2026-11-15): Medusa's head
// and the Ghost Rider's flaming chain are earned in the realms,
// but the SERVER is the authority — when it says owned and the
// pack lacks the handle, the pack gains it. Idempotent, never
// duplicating, never adding what was not earned. The rows show
// the server's level/uses honestly.
//
// Run: node --test tests/backpack-trophies.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { countItem, emptyBackpackRecord, itemsOfKind } from '../lib/backpack/backpack.js';
import { healTrophies, trophyDetailFor } from '../lib/backpack/trophies.js';

function recordWithHead() {
  return healTrophies(emptyBackpackRecord(), { headOwned: true, headEarnedAt: '2026-11-15T04:17:00.000Z' });
}

function recordWithChain() {
  return healTrophies(emptyBackpackRecord(), { chainOwned: true });
}

describe('healTrophies', () => {
  it('adds the head when the server says owned and the pack lacks it', () => {
    const rec = recordWithHead();
    assert.equal(countItem(rec, 'medusa-head'), 1);
    const head = itemsOfKind(rec, 'medusa-head')[0];
    assert.equal(head.kind, 'medusa-head');
    assert.equal(head.qty, 1);
    assert.equal(head.meta.source, 'medusa-lair');
    assert.equal(head.meta.reusable, true);
    assert.equal(head.meta.earnedAt, '2026-11-15T04:17:00.000Z');
  });

  it('adds the chain when the server says owned and the pack lacks it', () => {
    const rec = recordWithChain();
    assert.equal(countItem(rec, 'flaming-chain'), 1);
    const chain = itemsOfKind(rec, 'flaming-chain')[0];
    assert.equal(chain.kind, 'flaming-chain');
    assert.equal(chain.qty, 1);
    assert.equal(chain.meta.chain.charges, 3);
  });

  it('never duplicates: a second heal changes nothing', () => {
    const once = recordWithHead();
    const twice = healTrophies(once, { headOwned: true });
    assert.equal(countItem(twice, 'medusa-head'), 1);
    assert.deepEqual(twice, once);
    const chained = recordWithChain();
    assert.deepEqual(healTrophies(chained, { chainOwned: true }), chained);
  });

  it('adds nothing when the server says not owned', () => {
    const rec = healTrophies(emptyBackpackRecord(), { headOwned: false, chainOwned: false });
    assert.deepEqual(rec, emptyBackpackRecord());
    assert.deepEqual(healTrophies(emptyBackpackRecord(), {}), emptyBackpackRecord());
  });

  it('heals both trophies at once', () => {
    const rec = healTrophies(emptyBackpackRecord(), { headOwned: true, chainOwned: true });
    assert.equal(countItem(rec, 'medusa-head'), 1);
    assert.equal(countItem(rec, 'flaming-chain'), 1);
  });
});

describe('trophyDetailFor', () => {
  it('shows the head honestly from the server level and uses', () => {
    const rec = recordWithHead();
    const head = itemsOfKind(rec, 'medusa-head')[0];
    const line = trophyDetailFor(head, { head: { level: 2, uses: 7, serverLive: true }, chain: { level: null, serverLive: null } });
    assert.ok(line.includes('Level 2'));
    assert.ok(line.includes('7 uses banked'));
    assert.ok(line.includes('petrifies 3 per use'));
    assert.ok(line.includes('reusable'));
  });

  it('says so when the head server has not answered', () => {
    const rec = recordWithHead();
    const head = itemsOfKind(rec, 'medusa-head')[0];
    const line = trophyDetailFor(head, { head: { level: null, uses: null, serverLive: false }, chain: { level: null, serverLive: null } });
    assert.ok(line.includes('Server status unknown'));
    const pending = trophyDetailFor(head, { head: { level: null, uses: null, serverLive: null }, chain: { level: null, serverLive: null } });
    assert.ok(pending.includes("Medusa's lair"));
  });

  it('shows the chain charges and chains per throw', () => {
    const rec = recordWithChain();
    const chain = itemsOfKind(rec, 'flaming-chain')[0];
    const line = trophyDetailFor(chain, { head: { level: null, uses: null, serverLive: null }, chain: { level: 1, serverLive: true } });
    assert.ok(line.includes('Level 1'));
    assert.ok(line.includes('3/3 charges'));
    assert.ok(line.includes('2 chains per throw'));
    assert.ok(line.includes('ready'));
  });

  it('names the peach honestly: a collectible with no effect yet', () => {
    const peach = { id: 'peach', kind: 'other', name: 'Peach of Long Life', qty: 1, meta: { source: 'tiangong-peach-gardens' } };
    const line = trophyDetailFor(peach, { head: { level: null, uses: null, serverLive: null }, chain: { level: null, serverLive: null } });
    assert.ok(line.includes("Tiangong's Peach Gardens"));
    assert.ok(line.includes('no effect yet'));
  });

  it('returns nothing for kinds without a detail', () => {
    const shard = { id: 'orc-shard', kind: 'material', name: 'Orc Shard', qty: 5, meta: {} };
    assert.equal(trophyDetailFor(shard, {}), '');
    assert.equal(trophyDetailFor(null, {}), '');
  });
});
