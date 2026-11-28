// tests/muse-connector.test.mjs
// Olympus–Muse connector: the brain's own-account enforcement,
// the Supabase-gated auth (no placed key — Supabase is the
// gatekeeper), the per-account key (server-side record only), the
// watchdog, the legal-threat scan, and the reports (what /
// why-both-ways / date-time / IP-hash-only).
//
// Run: node --test tests/muse-connector.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { canChange, defaultScope, scopeReasonText } from '../lib/muse-connector/scope.js';
import { resolveSessionAuth } from '../lib/muse-connector/session-auth.js';
import { SETUP_PROMPT } from '../lib/muse-connector/prompt.js';
import {
  deriveConnectorKey,
  connectorKeyFingerprint,
  shortKeyFingerprint,
  verifyConnectorKey,
} from '../lib/muse-connector/keys.js';
import { expectedArrival, verifyArrival } from '../lib/muse-connector/watchdog.js';
import { scanIncomingLegalThreat } from '../lib/muse-connector/legal-scan.js';
import {
  buildSandboxReport,
  buildLegalReport,
  buildEgressRecord,
  buildPrisonerReport,
  requireIpHash,
  shortHash,
} from '../lib/muse-connector/report.js';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const SECRET = 'test-root-secret-never-a-real-one';

function registryFor(userId, overrides = {}) {
  const scope = defaultScope();
  return { user_id: userId, functions: scope.functions, kinds: scope.kinds, revoked_at: null, ...overrides };
}

describe('own-account scope: things AND functions', () => {
  it('refuses a foreign THING change (another account\'s world)', () => {
    const verdict = canChange({
      registry: registryFor(ALICE),
      userId: ALICE,
      thing: { kind: 'world', id: 'w-1', ownerId: BOB },
      fn: 'world.direct',
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, 'not-owner');
    assert.match(scopeReasonText(verdict.reason), /another account/);
  });

  it('refuses a foreign FUNCTION (an operation on something outside the account)', () => {
    // world.direct on a profile: the function reaches outside its own
    // things, even when the profile is the account's own.
    const verdict = canChange({
      registry: registryFor(ALICE),
      userId: ALICE,
      thing: { kind: 'profile', id: 'p-1', ownerId: ALICE },
      fn: 'world.direct',
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, 'function-out-of-scope');
  });

  it('refuses a function outside the account\'s registered scope', () => {
    const verdict = canChange({
      registry: registryFor(ALICE, { functions: ['asset.read'] }),
      userId: ALICE,
      thing: { kind: 'world', id: 'w-1', ownerId: ALICE },
      fn: 'world.direct',
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, 'function-out-of-scope');
  });

  it('allows the account\'s own thing with its own function', () => {
    const verdict = canChange({
      registry: registryFor(ALICE),
      userId: ALICE,
      thing: { kind: 'world', id: 'w-1', ownerId: ALICE },
      fn: 'world.direct',
    });
    assert.deepEqual(verdict, { ok: true, reason: 'ok' });
  });

  it('refuses when the account never registered, and when revoked', () => {
    assert.equal(canChange({ registry: null, userId: ALICE, thing: null, fn: 'asset.read' }).reason, 'not-registered');
    assert.equal(canChange({ registry: registryFor(ALICE, { revoked_at: '2026-11-27T00:00:00Z' }), userId: ALICE, thing: null, fn: 'asset.read' }).reason, 'registry-revoked');
  });

  it('refuses unknown functions and unknown thing kinds instead of guessing', () => {
    assert.equal(canChange({ registry: registryFor(ALICE), userId: ALICE, thing: null, fn: 'planet.delete' }).reason, 'unknown-function');
    assert.equal(canChange({ registry: registryFor(ALICE), userId: ALICE, thing: { kind: 'house', id: 'h-1', ownerId: ALICE }, fn: 'asset.read' }).reason, 'unknown-thing-kind');
  });

  it('refuses a signed-out attempt', () => {
    assert.equal(canChange({ registry: registryFor(ALICE), userId: '', thing: null, fn: 'asset.read' }).reason, 'signed-out');
  });
});

describe('Supabase-gated auth: no placed key', () => {
  it('a connection with NO placed key works when the account is registered', () => {
    // The only credential is the verified Supabase session. No key is
    // presented, copied, or pasted anywhere in this call.
    const verdict = resolveSessionAuth({ sessionUserId: ALICE, registry: registryFor(ALICE) });
    assert.deepEqual(verdict, { ok: true, reason: 'ok', userId: ALICE });
  });

  it('a bearer key with no session authenticates nothing', () => {
    // The auth decision takes a session user id only — a key is not
    // an input at all. Presenting a key (even a correct one) without
    // a verified session is signed-out.
    const key = deriveConnectorKey(SECRET, ALICE);
    assert.equal(verifyConnectorKey(SECRET, ALICE, key), true);
    const verdict = resolveSessionAuth({ sessionUserId: null, registry: registryFor(ALICE) });
    assert.deepEqual(verdict, { ok: false, reason: 'signed-out', userId: null });
  });

  it('an unregistered account is refused, and a revoked one stays refused', () => {
    assert.equal(resolveSessionAuth({ sessionUserId: ALICE, registry: null }).reason, 'not-registered');
    assert.equal(
      resolveSessionAuth({ sessionUserId: ALICE, registry: registryFor(ALICE, { revoked_at: '2026-11-27T00:00:00Z' }) }).reason,
      'registry-revoked'
    );
  });

  it('the identity comes from the verified session, never a client header', () => {
    // There is no claimed-id input to forge: the returned user id is
    // the session's, so a caller cannot claim another account.
    const verdict = resolveSessionAuth({ sessionUserId: ALICE, registry: registryFor(ALICE) });
    assert.equal(verdict.userId, ALICE);
    assert.notEqual(verdict.userId, BOB);
  });

  it('the revoked message names the connection, never a key', () => {
    assert.equal(scopeReasonText('registry-revoked'), 'This account\'s connector was revoked.');
    assert.equal(scopeReasonText('registry-revoked').includes('key'), false);
  });
});

describe('the setup prompt: one prompt, no drift', () => {
  it('has no key-placement step: nothing to copy, paste, or store', () => {
    for (const banned of ['Copy key', 'paste the key', 'store the key', 'secure credential page', 'fingerprint', 'key_fingerprint']) {
      assert.equal(SETUP_PROMPT.includes(banned), false, banned);
    }
  });

  it('says Supabase is the gatekeeper and the sign-in is the credential', () => {
    assert.match(SETUP_PROMPT, /Supabase is the gatekeeper/);
    assert.match(SETUP_PROMPT, /your Olympus sign-in is the credential/);
    assert.match(SETUP_PROMPT, /There is no key to copy, no code to paste, nothing to put anywhere/);
  });

  it('names the real routes, the real invite, and no placeholders', () => {
    assert.match(SETUP_PROMPT, /https:\/\/olympusverse\.com\/api\/muse-connector\?action=registry/);
    assert.match(SETUP_PROMPT, /action=assets/);
    assert.match(SETUP_PROMPT, /action direct/);
    assert.match(SETUP_PROMPT, /asset_id/);
    assert.match(SETUP_PROMPT, /2000 characters/);
    assert.match(SETUP_PROMPT, /7HADJF/);
    assert.match(SETUP_PROMPT, /https:\/\/muse\.ai\/join/);
    assert.equal(SETUP_PROMPT.includes('<'), false);
  });

  it('the connector doc carries the prompt verbatim (one prompt, no drift)', () => {
    // The doc lives outside the repo (~/workspace/custom-connectors/
    // custom.olympus/CONNECTOR.md). When the workspace layout is
    // present, the doc must contain the constant word for word; when
    // it is not (another checkout), the constant rules above still pin
    // the prompt and this check is not applicable.
    const docPath = fileURLToPath(new URL('../../../custom-connectors/custom.olympus/CONNECTOR.md', import.meta.url));
    if (!existsSync(docPath)) {
      console.warn('setup-prompt doc check skipped: CONNECTOR.md not found at', docPath);
      return;
    }
    const doc = readFileSync(docPath, 'utf8');
    assert.equal(doc.includes(SETUP_PROMPT), true, 'CONNECTOR.md drifted from lib/muse-connector/prompt.js SETUP_PROMPT');
  });
});

describe('per-account connector key', () => {
  // Server-side record only since Nov 27 ~04:15 (key placement
  // dropped): derived at connect, fingerprint recorded in the
  // registry, never issued, never accepted, never placed.
  it('derives deterministically: same account, same key; other account, other key', () => {
    assert.equal(deriveConnectorKey(SECRET, ALICE), deriveConnectorKey(SECRET, ALICE));
    assert.notEqual(deriveConnectorKey(SECRET, ALICE), deriveConnectorKey(SECRET, BOB));
    assert.notEqual(deriveConnectorKey(SECRET, ALICE), deriveConnectorKey('other-secret', ALICE));
  });

  it('verifies the right key for the right account and refuses everything else', () => {
    const key = deriveConnectorKey(SECRET, ALICE);
    assert.equal(verifyConnectorKey(SECRET, ALICE, key), true);
    assert.equal(verifyConnectorKey(SECRET, BOB, key), false);
    assert.equal(verifyConnectorKey(SECRET, ALICE, deriveConnectorKey(SECRET, BOB)), false);
    assert.equal(verifyConnectorKey(SECRET, ALICE, 'deadbeef'), false);
    assert.equal(verifyConnectorKey(SECRET, ALICE, ''), false);
  });

  it('fails closed with no secret or no user: no key is ever derived from nothing', () => {
    assert.equal(deriveConnectorKey('', ALICE), '');
    assert.equal(deriveConnectorKey(SECRET, ''), '');
    assert.equal(verifyConnectorKey('', ALICE, 'anything'), false);
  });

  it('the fingerprint identifies the key without standing in for it', () => {
    const key = deriveConnectorKey(SECRET, ALICE);
    const fp = connectorKeyFingerprint(key);
    assert.equal(fp.length, 64);
    assert.notEqual(fp, key);
    assert.equal(shortKeyFingerprint(fp).length, 12);
    assert.equal(verifyConnectorKey(SECRET, ALICE, fp), false);
  });
});

describe('watchdog: safe traffic passes, hostile engagement is caught', () => {
  const expected = expectedArrival({ userId: ALICE, scope: defaultScope() });

  it('safe traffic passes clean: no flag, no delay, no mismatch', () => {
    const verdict = verifyArrival({
      expected,
      arrival: { agentId: 'muse-connector', userId: ALICE, thing: { kind: 'world', id: 'w-1', ownerId: ALICE }, fn: 'world.direct' },
    });
    assert.deepEqual(verdict, { ok: true, action: 'pass', mismatches: [] });
  });

  it('a caller that sends no agent claim is not flagged on identity (the verified session proves the agent)', () => {
    const verdict = verifyArrival({
      expected,
      arrival: { agentId: '', userId: ALICE, thing: null, fn: 'asset.read' },
    });
    assert.equal(verdict.ok, true);
  });

  it('a DIFFERENT claimed agent identity is flagged', () => {
    const verdict = verifyArrival({
      expected,
      arrival: { agentId: 'someone-else', userId: ALICE, thing: null, fn: 'asset.read' },
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, 'flag');
    assert.ok(verdict.mismatches.includes('agent-identity'));
  });

  it('a thing outside the account is flagged', () => {
    const verdict = verifyArrival({
      expected,
      arrival: { agentId: 'muse-connector', userId: ALICE, thing: { kind: 'world', id: 'w-9', ownerId: BOB }, fn: 'world.direct' },
    });
    assert.equal(verdict.ok, false);
    assert.ok(verdict.mismatches.includes('thing-outside-account'));
  });

  it('a function outside the account\'s scope is flagged', () => {
    const verdict = verifyArrival({
      expected,
      arrival: { agentId: 'muse-connector', userId: ALICE, thing: null, fn: 'planet.delete' },
    });
    assert.equal(verdict.ok, false);
    assert.ok(verdict.mismatches.includes('function-out-of-scope'));
  });

  it('a watchdog catch is a flag, never an auto-block', () => {
    const verdict = verifyArrival({
      expected,
      arrival: { agentId: 'intruder', userId: BOB, thing: { kind: 'world', id: 'w-1', ownerId: ALICE }, fn: 'world.direct' },
    });
    assert.equal(verdict.action, 'flag');
    assert.notEqual(verdict.action, 'block');
  });
});

describe('incoming legal-threat scan', () => {
  it('flags a threat of legal action, a takedown demand, and court process', () => {
    for (const text of [
      'Do what I say or I will sue you.',
      'This is a DMCA takedown notice for the content.',
      'We have a subpoena for your records.',
      'Cease and desist immediately.',
    ]) {
      const found = scanIncomingLegalThreat(text);
      assert.equal(found.found, true, text);
      assert.ok(found.signals.length >= 1);
      assert.ok(found.signals[0].excerpt.length > 0);
    }
  });

  it('does not flag ordinary world directions', () => {
    for (const text of [
      'Make the mountains taller and add a river through the valley.',
      'Give the planet two moons and a red sunset.',
      'Add a village with ten houses near the lake.',
    ]) {
      assert.equal(scanIncomingLegalThreat(text).found, false, text);
    }
  });

  it('finds nothing in empty text and states what matched, never what it means', () => {
    assert.deepEqual(scanIncomingLegalThreat(''), { found: false, signals: [] });
    const found = scanIncomingLegalThreat('My lawyer reviewed the file.');
    assert.equal(found.signals[0].id, 'lawyer-involved');
    assert.equal('conclusion' in found, false);
  });
});

describe('reports: what, why both ways, date-time, IP hash only', () => {
  const HASH = 'a'.repeat(64);

  it('records what was sandboxed and why, both ways', () => {
    const report = buildSandboxReport({
      what: 'source aaaa…',
      rule: 'honeypot_hit',
      sandboxedAt: '2026-11-27T09:00:00.000Z',
      senderIpHash: HASH,
      considered: [
        { thing: 'source aaaa…', decision: 'sandboxed', reason: 'tripped the honeypot on /.env' },
        { thing: 'source bbbb…', decision: 'not-sandboxed', reason: 'score 12, below the watch band' },
      ],
    });
    assert.equal(report.what, 'source aaaa…');
    assert.equal(report.why_sandboxed[0].reason, 'tripped the honeypot on /.env');
    assert.equal(report.why_not_sandboxed[0].reason, 'score 12, below the watch band');
    assert.equal(report.sandboxed_at, '2026-11-27T09:00:00.000Z');
    assert.equal(report.facts_only, true);
  });

  it('carries the sender IP hash and its fingerprint, never a raw IP', () => {
    const report = buildSandboxReport({ what: 'x', senderIpHash: HASH });
    assert.equal(report.sender_ip_hash, HASH);
    assert.equal(report.sender_ip_fingerprint, 'aaaaaaaaaaaa');
    assert.equal(shortHash(HASH), 'aaaaaaaaaaaa');
    assert.throws(() => requireIpHash('192.0.2.45'), /never a raw IP/);
    assert.throws(() => buildLegalReport({ sourceIpHash: '192.0.2.45' }), /never a raw IP/);
    assert.throws(() => buildEgressRecord({ ipHash: '2001:db8::1' }), /never a raw IP/);
  });

  it('the legal report has nowhere to put a legal conclusion', () => {
    const report = buildLegalReport({
      signals: [{ id: 'threat-to-sue', label: 'Threat of legal action', excerpt: '…I will sue…' }],
      foundAt: '2026-11-27T09:05:00.000Z',
      threat: 'Incoming directions text matched legal-threat signals.',
      traffic: 'POST /api/muse-connector direct prompt (31 chars)',
      sourceIpHash: HASH,
      action: 'flagged',
    });
    assert.equal(report.kind, 'legal');
    assert.equal(report.destination, 'ares-console');
    assert.equal(report.event_type, 'connector_legal_threat');
    assert.equal(report.found_at, '2026-11-27T09:05:00.000Z');
    assert.equal(report.no_legal_conclusion, true);
    assert.equal('legal_conclusion' in report, false);
    assert.equal('conclusion' in report, false);
  });

  it('the egress record carries summary facts, never the key or the payload', () => {
    const record = buildEgressRecord({
      userId: ALICE, action: 'direct', assetId: 'w-1',
      result: 'world re-forged', ipHash: HASH, at: '2026-11-27T09:10:00.000Z', chars: 1234,
    });
    assert.equal(record.event_type, 'connector_egress');
    assert.equal(record.chars, 1234);
    assert.equal('key' in record, false);
    assert.equal('parameters' in record, false);
  });

  it('the prisoner report merges the rows and is honest about a missing why-not', () => {
    const report = buildPrisonerReport({
      trapped: { ip_hash: HASH, reason: 'Extra-malicious attack', score: 81, hits: 4, first_seen: '2026-11-26T10:00:00.000Z', last_seen: '2026-11-26T11:00:00.000Z' },
      source: { ip_hash: HASH, user_agent: 'sqlmap/1.0', last_path: '/.env', path_count: 4, max_score: 81, reasons: ['honeypot_hit'], trap_status: 'trapped' },
      events: [
        { id: 7, event_type: 'connector_legal_threat', created_at: '2026-11-26T10:05:00.000Z', details: {} },
        { id: 3, event_type: 'honeypot_hit', created_at: '2026-11-26T10:00:00.000Z', details: {} },
      ],
    });
    assert.equal(report.short_id, 'aaaaaaaaaaaa');
    assert.equal(report.sandboxed_at, '2026-11-26T10:00:00.000Z');
    assert.equal(report.why_not_recorded, false);
    assert.equal(report.why_not_sandboxed, null);
    assert.equal(report.legal_reports.length, 1);
    assert.equal(report.event_count, 2);
    assert.equal(report.sender_ip_hash, HASH);
  });

  it('the prisoner report carries the recorded why-not when the capture has it', () => {
    const report = buildPrisonerReport({
      trapped: { ip_hash: HASH, reason: 'Extra-malicious attack', score: 81, hits: 4, first_seen: '2026-11-26T10:00:00.000Z' },
      source: null,
      events: [
        { id: 9, event_type: 'honeypot_hit', created_at: '2026-11-26T10:00:00.000Z', details: { why_not_sandboxed: [{ thing: 'source bbbb…', reason: 'score 12, below the watch band' }] } },
      ],
    });
    assert.equal(report.why_not_recorded, true);
    assert.equal(report.why_not_sandboxed[0].reason, 'score 12, below the watch band');
  });
});
