// Fortress of Solitude: first-load vault ensure + per-file cap rules.
//
// Verifies lib/fortress/vault-storage.js against a fake Storage client:
//   - a missing bucket is created private with the 500 MB per-file cap;
//   - an existing bucket with the current cap is left alone (no calls);
//   - an existing bucket with a LOWER cap is raised to the current value
//     and the alignment is REPORTED (capAligned + previous value);
//   - an existing bucket with a HIGHER cap is NEVER silently reduced;
//   - a failed alignment never blocks the vault (old cap reported);
//   - a failed creation throws the prepare error WITH the limit in plain
//     words, while an "already exists" creation error is ignored;
//   - the string form keeps the shape existing callers use.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureUserBucket,
  ensureUserBucketDetailed,
  vaultBucketName,
} from '../lib/fortress/vault-storage.js';
import { VAULT_PER_FILE_LIMIT_BYTES, formatBytes } from '../lib/fortress/tiers.js';

const MB = 1_000_000;

function makeAdmin({ bucket = null, getError = null, createError = null, updateThrows = false, withUpdate = true } = {}) {
  const calls = { get: [], create: [], update: [] };
  const storage = {
    async getBucket(name) {
      calls.get.push(name);
      if (getError) return { data: null, error: getError };
      return { data: bucket, error: null };
    },
    async createBucket(name, opts) {
      calls.create.push([name, opts]);
      if (createError) return { data: null, error: createError };
      return { data: { name }, error: null };
    },
  };
  if (withUpdate) {
    storage.updateBucket = async (name, opts) => {
      calls.update.push([name, opts]);
      if (updateThrows) throw new Error('update unavailable');
      return { data: {}, error: null };
    };
  }
  return { calls, storage };
}

test('the per-file cap constant is 500 MB and formats as "500 MB"', () => {
  assert.equal(VAULT_PER_FILE_LIMIT_BYTES, 500 * MB);
  assert.equal(formatBytes(VAULT_PER_FILE_LIMIT_BYTES), '500 MB');
});

test('missing bucket: created private with the 500 MB cap', async () => {
  const admin = makeAdmin({ getError: { message: 'not found' } });
  const out = await ensureUserBucketDetailed(admin, 'user-1');
  assert.equal(out.bucket, 'fortress-user-1');
  assert.equal(out.capAligned, false);
  assert.equal(out.fileSizeLimitBytes, 500 * MB);
  assert.equal(admin.calls.create.length, 1);
  assert.equal(admin.calls.create[0][0], 'fortress-user-1');
  assert.equal(admin.calls.create[0][1].public, false);
  assert.equal(admin.calls.create[0][1].fileSizeLimit, 500 * MB);
  assert.equal(admin.calls.update.length, 0);
});

test('existing bucket at the current cap: left alone, no calls', async () => {
  const admin = makeAdmin({ bucket: { file_size_limit: 500 * MB } });
  const out = await ensureUserBucketDetailed(admin, 'user-1');
  assert.equal(out.bucket, 'fortress-user-1');
  assert.equal(out.capAligned, false);
  assert.equal(out.fileSizeLimitBytes, 500 * MB);
  assert.equal(admin.calls.create.length, 0);
  assert.equal(admin.calls.update.length, 0);
});

test('existing bucket below the cap: raised AND the alignment is reported', async () => {
  const admin = makeAdmin({ bucket: { file_size_limit: 100 * MB } });
  const out = await ensureUserBucketDetailed(admin, 'user-1');
  assert.equal(out.capAligned, true);
  assert.equal(out.previousFileSizeLimitBytes, 100 * MB);
  assert.equal(out.fileSizeLimitBytes, 500 * MB);
  assert.equal(admin.calls.update.length, 1);
  assert.equal(admin.calls.update[0][0], 'fortress-user-1');
  assert.equal(admin.calls.update[0][1].fileSizeLimit, 500 * MB);
});

test('existing bucket above the cap: never silently reduced', async () => {
  const admin = makeAdmin({ bucket: { file_size_limit: 1024 * MB } });
  const out = await ensureUserBucketDetailed(admin, 'user-1');
  assert.equal(out.capAligned, false);
  assert.equal(out.fileSizeLimitBytes, 1024 * MB);
  assert.equal(admin.calls.update.length, 0);
});

test('failed alignment never blocks the vault; the old cap is reported', async () => {
  const admin = makeAdmin({ bucket: { file_size_limit: 100 * MB }, updateThrows: true });
  const out = await ensureUserBucketDetailed(admin, 'user-1');
  assert.equal(out.bucket, 'fortress-user-1');
  assert.equal(out.capAligned, false);
  assert.equal(out.fileSizeLimitBytes, 100 * MB);
});

test('older client without updateBucket: no crash, bucket returned', async () => {
  const admin = makeAdmin({ bucket: { file_size_limit: 100 * MB }, withUpdate: false });
  const out = await ensureUserBucketDetailed(admin, 'user-1');
  assert.equal(out.bucket, 'fortress-user-1');
  assert.equal(out.capAligned, false);
  assert.equal(out.fileSizeLimitBytes, 100 * MB);
});

test('failed creation throws the prepare error WITH the limit in plain words', async () => {
  const admin = makeAdmin({ getError: { message: 'not found' }, createError: { message: 'The object exceeded the maximum allowed size' } });
  await assert.rejects(
    () => ensureUserBucketDetailed(admin, 'user-1'),
    (err) => {
      assert.match(err.message, /Could not prepare your vault/);
      assert.match(err.message, /500 MB/);
      return true;
    }
  );
});

test('creation racing an existing bucket ("already exists") is ignored', async () => {
  const admin = makeAdmin({ getError: { message: 'not found' }, createError: { message: 'Bucket already exists' } });
  const out = await ensureUserBucketDetailed(admin, 'user-1');
  assert.equal(out.bucket, 'fortress-user-1');
});

test('string form keeps the shape existing callers use', async () => {
  const admin = makeAdmin({ bucket: { file_size_limit: 500 * MB } });
  assert.equal(await ensureUserBucket(admin, 'user-1'), 'fortress-user-1');
  assert.equal(vaultBucketName('user-1'), 'fortress-user-1');
});
