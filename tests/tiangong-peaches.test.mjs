// tests/tiangong-peaches.test.mjs
// TIANGONG PEACHES (Merlin, 2026-11-15): pickable peaches in the
// Peach Gardens land in the backpack under Other (kind 'other').
// Three peaches stand in the garden; a picked one regrows after
// 24 hours. The peach has no effect beyond pickup + inventory.
//
// Run: node --test tests/tiangong-peaches.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PEACH_COUNT,
  PEACH_GARDEN,
  PEACH_ITEM_ID,
  PEACH_ITEM_KIND,
  PEACH_PICK_RANGE_M,
  PEACH_REGROW_MS,
  availablePeaches,
  emptyPeachState,
  nearestPeach,
  peachItem,
  peachSpots,
  pickPeach,
  sanitizePeachState,
} from '../lib/tiangong/peaches.js';
import { addItem, countItem, createItem, emptyBackpackRecord, itemsOfKind } from '../lib/backpack/backpack.js';

const DAY = 24 * 60 * 60 * 1000;

describe('the peach item', () => {
  it('is a kind "other" collectible that lands under Other', () => {
    const item = peachItem(1);
    assert.equal(item.id, PEACH_ITEM_ID);
    assert.equal(item.kind, PEACH_ITEM_KIND);
    assert.equal(item.kind, 'other');
    assert.equal(item.name, 'Peach of Long Life');
    assert.equal(item.meta.source, 'tiangong-peach-gardens');
    const entry = createItem(item);
    assert.ok(entry);
    assert.equal(entry.kind, 'other');
    let rec = emptyBackpackRecord();
    rec = addItem(rec, peachItem(1));
    rec = addItem(rec, peachItem(1));
    assert.equal(countItem(rec, 'peach'), 2);
    assert.equal(itemsOfKind(rec, 'other').length, 1);
  });
});

describe('the garden', () => {
  it('holds three peaches, all inside the garden circle', () => {
    assert.equal(PEACH_COUNT, 3);
    const spots = peachSpots();
    assert.equal(spots.length, 3);
    const ids = new Set(spots.map((s) => s.id));
    assert.equal(ids.size, 3);
    for (const s of spots) {
      const d = Math.hypot(s.x - PEACH_GARDEN.x, s.z - PEACH_GARDEN.z);
      assert.ok(d <= PEACH_GARDEN.r, `spot ${s.id} sits outside the garden`);
    }
  });

  it('all three stand at first, and the pick range is 6 m', () => {
    assert.equal(PEACH_PICK_RANGE_M, 6);
    assert.equal(availablePeaches(emptyPeachState()).length, 3);
  });
});

describe('picking and regrowing', () => {
  it('a picked peach leaves the garden; picking it again fails', () => {
    const now = 1000000000000;
    const first = pickPeach(emptyPeachState(), 'peach-1', now);
    assert.equal(first.ok, true);
    assert.equal(availablePeaches(first.state, now).length, 2);
    assert.equal(availablePeaches(first.state, now).some((s) => s.id === 'peach-1'), false);
    const again = pickPeach(first.state, 'peach-1', now);
    assert.equal(again.ok, false);
    assert.deepEqual(again.state, first.state);
  });

  it('a picked peach regrows after 24 hours, not before', () => {
    assert.equal(PEACH_REGROW_MS, DAY);
    const now = 1000000000000;
    const { state } = pickPeach(emptyPeachState(), 'peach-2', now);
    assert.equal(availablePeaches(state, now + DAY - 1).some((s) => s.id === 'peach-2'), false);
    assert.equal(availablePeaches(state, now + DAY).some((s) => s.id === 'peach-2'), true);
  });

  it('each peach regrows on its own clock', () => {
    const now = 1000000000000;
    let state = emptyPeachState();
    state = pickPeach(state, 'peach-1', now).state;
    state = pickPeach(state, 'peach-3', now + DAY).state;
    // peach-1 is back (a day passed); peach-3 is still gone.
    const standing = availablePeaches(state, now + DAY).map((s) => s.id);
    assert.ok(standing.includes('peach-1'));
    assert.ok(!standing.includes('peach-3'));
    assert.ok(standing.includes('peach-2'));
  });
});

describe('finding a peach to pick', () => {
  it('nearestPeach finds the closest standing peach within 6 m', () => {
    const spots = peachSpots();
    const near = nearestPeach(emptyPeachState(), spots[0].x + 2, spots[0].z);
    assert.ok(near);
    assert.equal(near.id, spots[0].id);
  });

  it('nearestPeach returns null beyond 6 m', () => {
    assert.equal(nearestPeach(emptyPeachState(), 0, 0), null);
  });

  it('a picked peach is never the nearest', () => {
    const now = 1000000000000;
    const spots = peachSpots();
    const { state } = pickPeach(emptyPeachState(), spots[0].id, now);
    const found = nearestPeach(state, spots[0].x, spots[0].z, now);
    assert.equal(found, null);
  });
});

describe('peach state hygiene', () => {
  it('sanitize drops junk and bad timestamps', () => {
    assert.deepEqual(sanitizePeachState(null), { pickedAt: {} });
    assert.deepEqual(sanitizePeachState({ pickedAt: { 'peach-1': 'soon', 'peach-2': 123 } }), { pickedAt: { 'peach-2': 123 } });
    assert.deepEqual(sanitizePeachState({ pickedAt: [] }), { pickedAt: {} });
  });
});
