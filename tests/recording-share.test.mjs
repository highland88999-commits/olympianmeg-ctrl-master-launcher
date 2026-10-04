// tests/recording-share.test.mjs
// Headless tests for the Live Recordings share/attribution feature (Parts 3+4).
//
// - lib/live-recordings-queue.js: the tiktok_post_queue payload builder,
//   validation, missing-table detection. (Runnbale standalone.)
// - lib/tiktok-attribution (sibling-owned): share-text/URL contract. These
//   tests SKIP until the sibling's module lands in the worktree.
// Run: node --test tests/recording-share.test.mjs  (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFeaturePayload,
  validateFeaturePayload,
  isMissingTableError,
  TIKTOK_POST_QUEUE_TABLE,
  TIKTOK_QUEUE_STATUS_QUEUED,
} from '../lib/live-recordings-queue.js';

// --- sibling lib: dynamic import so the file runs before/after delivery -----
async function loadAttribution(t) {
  for (const p of [
    '../lib/tiktok-attribution.js',
    '../lib/tiktok-attribution.ts',
  ]) {
    try {
      return await import(p);
    } catch {
      /* try next */
    }
  }
  t.skip("sibling module lib/tiktok-attribution not yet in the worktree");
  return null;
}

describe('feature payload builder (tiktok_post_queue insert)', () => {
  it('builds the queued payload with recording id and requesting user', () => {
    const payload = buildFeaturePayload(
      { id: 'rec-123', title: 'Night drive', tiktok_handle: '@merlin' },
      'user-abc'
    );
    assert.deepEqual(payload, {
      recording_id: 'rec-123',
      requested_by: 'user-abc',
      status: 'queued',
    });
  });

  it('uses the queued status constant', () => {
    assert.equal(TIKTOK_QUEUE_STATUS_QUEUED, 'queued');
    assert.equal(TIKTOK_POST_QUEUE_TABLE, 'tiktok_post_queue');
  });

  it('handles a missing recording without throwing', () => {
    const payload = buildFeaturePayload(null, 'user-abc');
    assert.equal(payload.recording_id, null);
    assert.equal(payload.requested_by, 'user-abc');
    assert.equal(payload.status, 'queued');
  });

  it('flags a signed-out user as a validation problem', () => {
    const payload = buildFeaturePayload({ id: 'rec-123' }, null);
    const problems = validateFeaturePayload(payload);
    assert.ok(
      problems.some((p) => p.includes('requested_by')),
      `expected requested_by problem, got: ${JSON.stringify(problems)}`
    );
  });

  it('flags a missing recording id as a validation problem', () => {
    const problems = validateFeaturePayload(
      buildFeaturePayload(null, 'user-abc')
    );
    assert.ok(
      problems.some((p) => p.includes('recording_id')),
      `expected recording_id problem, got: ${JSON.stringify(problems)}`
    );
  });

  it('validates a complete payload with no problems', () => {
    assert.deepEqual(
      validateFeaturePayload(buildFeaturePayload({ id: 'rec-1' }, 'user-1')),
      []
    );
  });
});

describe('missing-table detection (migration not yet run)', () => {
  it('recognizes the PostgreSQL undefined_table code', () => {
    assert.equal(
      isMissingTableError({ code: '42P01', message: 'relation "tiktok_post_queue" does not exist' }),
      true
    );
  });

  it('recognizes PostgREST "could not find the table" wording', () => {
    assert.equal(
      isMissingTableError({
        code: 'PGRST205',
        message: "Could not find the table 'public.tiktok_post_queue' in the schema cache",
      }),
      true
    );
  });

  it('does not mistake a real insert failure for a missing table', () => {
    assert.equal(
      isMissingTableError({ code: '23505', message: 'duplicate key value violates unique constraint' }),
      false
    );
    assert.equal(isMissingTableError(null), false);
    assert.equal(isMissingTableError({}), false);
  });
});

describe('attribution lib contract (sibling-owned)', () => {
  it('share text with a handle includes the handle and the title', async (t) => {
    const lib = await loadAttribution(t);
    if (!lib) return;
    const text = lib.buildShareText({ title: 'Night drive', tiktokHandle: '@merlin' });
    assert.ok(typeof text === 'string' && text.length > 0, 'share text must be non-empty');
    assert.ok(text.includes('Night drive'), `title missing: ${text}`);
    assert.ok(
      text.includes('@merlin') || text.includes('merlin'),
      `handle missing: ${text}`
    );
  });

  it('share text without a handle still works', async (t) => {
    const lib = await loadAttribution(t);
    if (!lib) return;
    const text = lib.buildShareText({ title: 'Night drive', tiktokHandle: null });
    assert.ok(typeof text === 'string' && text.length > 0);
    assert.ok(text.includes('Night drive'), `title missing: ${text}`);
  });

  it('empty title edge case does not throw and stays non-empty', async (t) => {
    const lib = await loadAttribution(t);
    if (!lib) return;
    const text = lib.buildShareText({ title: '', tiktokHandle: null });
    assert.ok(typeof text === 'string' && text.length > 0, 'must fall back to something readable');
  });

  it('recordingShareUrl starts with the origin and carries the id', async (t) => {
    const lib = await loadAttribution(t);
    if (!lib) return;
    const url = lib.recordingShareUrl('https://olympusverse.com', 'rec-123');
    assert.ok(typeof url === 'string' && url.length > 0);
    assert.ok(url.startsWith('https://olympusverse.com'), `origin missing: ${url}`);
    assert.ok(url.includes('rec-123'), `recording id missing: ${url}`);
  });
});
