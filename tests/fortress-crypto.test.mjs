// Fortress of Solitude: real client-side encryption round-trip.
//
// Verifies the FENC1 vault blob format (magic + salt + iv + AES-GCM-256
// ciphertext) from lib/fortress/vault-crypto.js: encrypt -> wrap -> unwrap ->
// decrypt restores the exact bytes, wrong passphrases fail, and the salt/IV
// are random per file (two encryptions of the same bytes differ).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FENC_MAGIC,
  FENC_SALT_LEN,
  FENC_IV_LEN,
  FENC_HEADER_LEN,
  lockBlob,
  unlockBlob,
  isLockedNode,
} from '../lib/fortress/vault-crypto.js';

const PASS = 'correct horse battery staple';

test('round trip restores exact bytes', async () => {
  const plain = new TextEncoder().encode('the quick brown fox jumps over the lazy dog'.repeat(20));
  const enc = await lockBlob(plain, PASS);
  assert.ok(enc instanceof Uint8Array);
  assert.equal(new TextDecoder().decode(enc.slice(0, 5)), FENC_MAGIC);
  assert.equal(enc.length, FENC_HEADER_LEN + plain.length + 16); // +16 GCM tag
  const back = await unlockBlob(enc, PASS);
  assert.deepEqual(new Uint8Array(back), plain);
});

test('salt and IV are random per file', async () => {
  const plain = new TextEncoder().encode('same bytes');
  const a = await lockBlob(plain, PASS);
  const b = await lockBlob(plain, PASS);
  assert.notDeepEqual(a.slice(0, FENC_HEADER_LEN), b.slice(0, FENC_HEADER_LEN));
  assert.notDeepEqual(a.slice(FENC_HEADER_LEN), b.slice(FENC_HEADER_LEN));
});

test('wrong passphrase throws', async () => {
  const enc = await lockBlob(new TextEncoder().encode('secret'), PASS);
  await assert.rejects(() => unlockBlob(enc, 'wrong passphrase'));
});

test('tampered ciphertext throws', async () => {
  const enc = await lockBlob(new TextEncoder().encode('secret'), PASS);
  const tampered = new Uint8Array(enc);
  tampered[tampered.length - 1] ^= 0xff;
  await assert.rejects(() => unlockBlob(tampered, PASS));
});

test('tampered magic is rejected with a clear error', async () => {
  const enc = await lockBlob(new TextEncoder().encode('secret'), PASS);
  const fake = new Uint8Array(enc);
  fake.set(new TextEncoder().encode('XXXXX'), 0);
  await assert.rejects(() => unlockBlob(fake, PASS), /stored before encryption/);
});

test('truncated blob is rejected', async () => {
  await assert.rejects(() => unlockBlob(new Uint8Array(10), PASS), /damaged/);
});

test('isLockedNode detects encrypted nodes and legacy zips', () => {
  assert.equal(isLockedNode({ encrypted: true, fileStorageKey: 'vaults/u/n_core.enc' }), true);
  assert.equal(isLockedNode({ fileStorageKey: 'vaults/u/n_core.enc' }), true);
  assert.equal(isLockedNode({ fileStorageKey: 'vaults/u/n_core.zip' }), false);
  assert.equal(isLockedNode({}), false);
  assert.equal(isLockedNode(null), false);
});
