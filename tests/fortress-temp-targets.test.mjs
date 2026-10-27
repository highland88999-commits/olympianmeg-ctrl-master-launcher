// Fortress of Solitude: temporary upload targets — pure logic.
//
// Verifies lib/fortress/temp-targets.js:
//   - verified caps and retention strings (never invented numbers);
//   - blocked types refused up front (Catbox/Litterbox block list);
//   - right-sized suggestion: smallest lane that fits (small files never
//     default to the 1 GB lane; big files never default to the 200 MB one);
//   - Filegarden is manual-only (no verified cap or endpoint);
//   - FENC1 magic detection for pull-into-vault (only already-locked
//     copies are accepted, never re-encrypted);
//   - expiry math and expired-entry pruning (no polling, prune on open).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LITTERBOX_MAX_BYTES,
  CATBOX_MAX_BYTES,
  TEMP_TARGETS,
  BLOCKED_EXTENSIONS,
  blockedExtensionReason,
  suggestTarget,
  fitsTarget,
  isLockedVaultBlob,
  litterboxExpiresAt,
  minutesLeft,
  pruneExpiredTempEntries,
} from '../lib/fortress/temp-targets.js';

test('verified caps: Litterbox 1 GB, Catbox 200 MB', () => {
  assert.equal(LITTERBOX_MAX_BYTES, 1_000_000_000);
  assert.equal(CATBOX_MAX_BYTES, 200_000_000);
  assert.equal(TEMP_TARGETS.litterbox.capBytes, LITTERBOX_MAX_BYTES);
  assert.equal(TEMP_TARGETS.catbox.capBytes, CATBOX_MAX_BYTES);
});

test('Filegarden ships manual-only with no invented cap', () => {
  assert.equal(TEMP_TARGETS.filegarden.automated, false);
  assert.equal(TEMP_TARGETS.filegarden.capBytes, null);
  assert.match(TEMP_TARGETS.filegarden.capLabel, /not verified/);
});

test('Dropbox is the user\'s own account, not an anonymous host', () => {
  assert.equal(TEMP_TARGETS.dropbox.kind, 'own-account');
  assert.equal(TEMP_TARGETS.litterbox.kind, 'anonymous-temp');
  assert.equal(TEMP_TARGETS.catbox.kind, 'anonymous-temp');
  assert.match(TEMP_TARGETS.dropbox.retention, /your own Dropbox account/);
});

test('blocked types are refused up front with plain wording', () => {
  for (const ext of BLOCKED_EXTENSIONS) {
    assert.match(blockedExtensionReason(`evil.${ext}`), new RegExp(`\\.${ext}`));
  }
  assert.match(blockedExtensionReason('report.docx'), /\.docx/);
  assert.match(blockedExtensionReason('notes.doc'), /\.doc/);
  assert.equal(blockedExtensionReason('photo.png'), null);
  assert.equal(blockedExtensionReason('archive.zip'), null);
  assert.equal(blockedExtensionReason('model.glb'), null);
});

test('right-sized suggestion: smallest lane that fits', () => {
  assert.equal(suggestTarget(1), 'catbox', 'a tiny file never defaults to the 1 GB lane');
  assert.equal(suggestTarget(CATBOX_MAX_BYTES), 'catbox', 'exactly 200 MB still fits Catbox');
  assert.equal(suggestTarget(CATBOX_MAX_BYTES + 1), 'litterbox', 'just over 200 MB moves to Litterbox');
  assert.equal(suggestTarget(LITTERBOX_MAX_BYTES), 'litterbox');
  assert.equal(suggestTarget(LITTERBOX_MAX_BYTES + 1), 'dropbox', 'over 1 GB needs the user\'s own Dropbox');
});

test('fitsTarget honours each cap; uncapped targets always fit', () => {
  assert.equal(fitsTarget('catbox', 200_000_000), true);
  assert.equal(fitsTarget('catbox', 200_000_001), false);
  assert.equal(fitsTarget('litterbox', 1_000_000_000), true);
  assert.equal(fitsTarget('litterbox', 1_000_000_001), false);
  assert.equal(fitsTarget('dropbox', 999_000_000_000), true, 'Dropbox cap is the user\'s own quota');
  assert.equal(fitsTarget('filegarden', 999_000_000_000), true, 'manual target has no enforced cap');
  assert.equal(fitsTarget('nope', 1), false);
});

test('FENC1 magic detection accepts locked blobs only', () => {
  const locked = new Uint8Array([70, 69, 78, 67, 49, 1, 2, 3]); // "FENC1" + bytes
  const plain = new Uint8Array([80, 75, 3, 4, 1, 2]); // a zip header
  assert.equal(isLockedVaultBlob(locked), true);
  assert.equal(isLockedVaultBlob(plain), false);
  assert.equal(isLockedVaultBlob(new Uint8Array(0)), false);
  assert.equal(isLockedVaultBlob(null), false);
});

test('Litterbox expiry math and pruning', () => {
  const now = 1_000_000_000_000;
  assert.equal(litterboxExpiresAt(now, '1h'), now + 3_600_000);
  assert.equal(litterboxExpiresAt(now, '72h'), now + 259_200_000);
  assert.equal(minutesLeft(now + 90_000, now), 2, 'rounds up to whole minutes');
  assert.equal(minutesLeft(now - 1, now), 0, 'expired is zero, never negative');
  const kept = pruneExpiredTempEntries([
    { id: 'a', expiresAtMs: now - 1 },
    { id: 'b', expiresAtMs: now + 60_000 },
    { id: 'c', expiresAtMs: null },
  ], now);
  assert.deepEqual(kept.map((e) => e.id), ['b', 'c'], 'expired entries drop; open-ended entries stay');
});
