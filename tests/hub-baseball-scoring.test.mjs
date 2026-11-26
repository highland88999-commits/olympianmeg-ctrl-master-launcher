// tests/hub-baseball-scoring.test.mjs
// Headless tests for lib/hub-baseball/scoring.js — the isolated score rule.
// Run: node --test tests/hub-baseball-scoring.test.mjs (from the repo root).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SERVER_DISTANCE_CAP, formatDistance, scoreFlight } from '../lib/hub-baseball/scoring.js';

describe('scoreFlight', () => {
  it('scores the max distance from the plate in whole metres', () => {
    assert.equal(scoreFlight({ maxDistanceM: 1234.4 }), 1234);
    assert.equal(scoreFlight({ maxDistanceM: 1234.5 }), 1235);
    assert.equal(scoreFlight({ maxDistanceM: 0 }), 0);
    assert.equal(scoreFlight({ maxDistanceM: 1800 }), 1800);
  });

  it('non-finite or negative input scores 0, never NaN', () => {
    assert.equal(scoreFlight({ maxDistanceM: NaN }), 0);
    assert.equal(scoreFlight({ maxDistanceM: Infinity }), 0);
    assert.equal(scoreFlight({ maxDistanceM: -50 }), 0);
    assert.equal(scoreFlight({}), 0);
    assert.equal(scoreFlight(), 0);
  });
});

describe('formatDistance', () => {
  it('formats whole metres with commas + " m"', () => {
    assert.equal(formatDistance(0), '0 m');
    assert.equal(formatDistance(999), '999 m');
    assert.equal(formatDistance(1234), '1,234 m');
    assert.equal(formatDistance(123456), '123,456 m');
  });

  it('rounds before formatting', () => {
    assert.equal(formatDistance(1234.6), '1,235 m');
  });
});

describe('SERVER_DISTANCE_CAP', () => {
  it('is 100000 m', () => {
    assert.equal(SERVER_DISTANCE_CAP, 100000);
  });
});
