// Fortress of Solitude: share-link helpers.
//
// Verifies lib/fortress/shares.js — expiry clamping, expiry checks, share
// URL building, and the honest passphrase note.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SHARE_HOURS,
  MIN_SHARE_HOURS,
  MAX_SHARE_HOURS,
  sanitizeExpiryHours,
  isShareExpired,
  buildShareUrl,
  SHARE_PASSPHRASE_NOTE,
} from '../lib/fortress/shares.js';

test('sanitizeExpiryHours defaults to 24h and clamps to 1h..30d', () => {
  assert.equal(DEFAULT_SHARE_HOURS, 24);
  assert.equal(MIN_SHARE_HOURS, 1);
  assert.equal(MAX_SHARE_HOURS, 720);
  assert.equal(sanitizeExpiryHours(undefined), 24);
  assert.equal(sanitizeExpiryHours('nope'), 24);
  assert.equal(sanitizeExpiryHours(0), 1);
  assert.equal(sanitizeExpiryHours(-5), 1);
  assert.equal(sanitizeExpiryHours(48), 48);
  assert.equal(sanitizeExpiryHours(1.9), 1);
  assert.equal(sanitizeExpiryHours(100000), 720);
});

test('isShareExpired treats the past (and garbage) as expired', () => {
  assert.equal(isShareExpired(new Date(Date.now() - 1000).toISOString()), true);
  assert.equal(isShareExpired(new Date(Date.now() + 3600_000).toISOString()), false);
  assert.equal(isShareExpired(new Date(Date.now() + 3600_000)), false);
  assert.equal(isShareExpired('not a date'), true);
  assert.equal(isShareExpired(null), true);
});

test('buildShareUrl makes a clean public link with no user data in it', () => {
  const url = buildShareUrl('https://olympusverse.com/', 'abc-123');
  assert.equal(url, 'https://olympusverse.com/api/fortress/shared/abc-123');
  assert.ok(!url.includes('?') && !url.includes('user'));
});

test('the passphrase note is honest about encrypted files', () => {
  assert.ok(SHARE_PASSPHRASE_NOTE.toLowerCase().includes('passphrase'));
  assert.ok(SHARE_PASSPHRASE_NOTE.toLowerCase().includes('separately'));
});
