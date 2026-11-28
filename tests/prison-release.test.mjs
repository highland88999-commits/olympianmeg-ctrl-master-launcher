// tests/prison-release.test.mjs
// Prison release policy (Merlin, Nov 27 ~03:39): release on request
// with the agent's ID and the promise not to send it back; the cutoff
// when a duplicate or linked agent is in the prison.
//
// Run: node --test tests/prison-release.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  RELEASE_PROMISE_TEXT,
  buildReleaseRecord,
  cutoffLatchRow,
  findLinkedPrisoners,
  isAgentId,
  releaseCutoffActive,
  validateReleaseRequest,
} from '../lib/ares/prison-release.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function row(hash, overrides = {}) {
  return {
    ip_hash: hash,
    reason: 'Extra-malicious attack',
    score: 80,
    hits: 3,
    user_agent: 'sqlmap/1.0',
    last_path: '/.env',
    reasons: ['honeypot_hit'],
    trap_status: 'trapped',
    ...overrides,
  };
}

describe('release request validation: ID + requester + promise, all mandatory', () => {
  it('accepts a complete request: the agent ID is its ip_hash', () => {
    assert.deepEqual(
      validateReleaseRequest({ ipHash: HASH_A, agentId: HASH_A, requestedBy: 'Devan', promise: true }),
      { ok: true, error: null }
    );
  });

  it('refuses with no agent ID — no ID, no release', () => {
    assert.equal(validateReleaseRequest({ ipHash: HASH_A, agentId: '', requestedBy: 'Devan', promise: true }).error, 'missing-agent-id');
    assert.equal(validateReleaseRequest({ ipHash: '', agentId: '', requestedBy: 'Devan', promise: true }).error, 'missing-agent-id');
  });

  it('refuses when the agent ID names a different prisoner', () => {
    assert.equal(validateReleaseRequest({ ipHash: HASH_A, agentId: HASH_B, requestedBy: 'Devan', promise: true }).error, 'agent-id-mismatch');
  });

  it('refuses with no requester and with no promise', () => {
    assert.equal(validateReleaseRequest({ ipHash: HASH_A, agentId: HASH_A, requestedBy: '  ', promise: true }).error, 'missing-requester');
    assert.equal(validateReleaseRequest({ ipHash: HASH_A, agentId: HASH_A, requestedBy: 'Devan', promise: false }).error, 'promise-required');
    assert.equal(validateReleaseRequest({ ipHash: HASH_A, agentId: HASH_A, requestedBy: 'Devan' }).error, 'promise-required');
  });

  it('an agent ID is a 64-char hex hash', () => {
    assert.equal(isAgentId(HASH_A), true);
    assert.equal(isAgentId('abc'), false);
    assert.equal(isAgentId(''), false);
  });
});

describe('duplicate / linked detection', () => {
  it('finds a duplicate: the same agent under another hash (same UA and path)', () => {
    const rows = [row(HASH_A), row(HASH_B)];
    const found = findLinkedPrisoners(rows, HASH_A);
    assert.equal(found.duplicate.length, 1);
    assert.equal(found.duplicate[0].ip_hash, HASH_B);
    assert.ok(found.duplicate[0].matched.includes('user_agent'));
    assert.ok(found.duplicate[0].matched.includes('last_path'));
  });

  it('finds a linked agent: shared identifiable information (a reason) with another', () => {
    const rows = [
      row(HASH_A),
      row(HASH_B, { user_agent: 'curl/8.0', last_path: '/wp-login.php', reasons: ['scanner_path'] }),
      row(HASH_C, { user_agent: 'Wget/1.0', last_path: '/admin', reasons: ['honeypot_hit'] }),
    ];
    const found = findLinkedPrisoners(rows, HASH_A);
    assert.equal(found.duplicate.length, 0);
    assert.equal(found.linked.length, 1);
    assert.equal(found.linked[0].ip_hash, HASH_C);
    assert.ok(found.linked[0].matched.includes('reasons'));
  });

  it('finds nothing when the prisoner stands alone, and never lists the target itself', () => {
    const rows = [row(HASH_A), row(HASH_B, { user_agent: 'curl/8.0', last_path: '/x', reasons: ['scanner_path'] })];
    const found = findLinkedPrisoners(rows, HASH_A);
    assert.deepEqual(found, { duplicate: [], linked: [] });
  });

  it('ignores rows already released', () => {
    const rows = [row(HASH_A), row(HASH_B, { trap_status: 'released' })];
    assert.deepEqual(findLinkedPrisoners(rows, HASH_A), { duplicate: [], linked: [] });
  });
});

describe('cutoff enforcement', () => {
  it('is latched only when the setting row says so; missing row means open', () => {
    assert.equal(releaseCutoffActive([]), false);
    assert.equal(releaseCutoffActive([{ key: 'sentinel_enabled', value: true }]), false);
    assert.equal(releaseCutoffActive([{ key: 'prison_release_cutoff', value: true }]), true);
    assert.equal(releaseCutoffActive([{ key: 'prison_release_cutoff', value: 'true' }]), true);
    assert.equal(releaseCutoffActive([{ key: 'prison_release_cutoff', value: false }]), false);
  });

  it('the latch row names the setting and the reason', () => {
    const latched = cutoffLatchRow({ reason: 'duplicate agent found' });
    assert.equal(latched.key, 'prison_release_cutoff');
    assert.equal(latched.value, true);
    assert.match(latched.details.reason, /duplicate/);
  });
});

describe('the prison record for a release', () => {
  it('records who asked, which agent, and the promise itself', () => {
    const record = buildReleaseRecord({
      ipHash: HASH_A, agentId: HASH_A, requestedBy: 'Devan', releasedBy: 'owner',
    });
    assert.equal(record.ip_hash, HASH_A);
    assert.equal(record.agent_id, HASH_A);
    assert.equal(record.requested_by, 'Devan');
    assert.equal(record.promise, RELEASE_PROMISE_TEXT);
    assert.equal(record.promise, 'will not send it back');
    assert.equal(record.cutoff_at_release, false);
    assert.ok(record.released_at);
  });
});
