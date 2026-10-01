/*
 * ARTEMIS mail engine tests — run with: node --test tests/artemis-mail.test.mjs
 *
 * Covers the Resend mail engine ported from engine/core/stewardship/mailer.js
 * in Merlin's original artemis repo:
 *   - lib/artemis/mail.js: email validation, HTML escaping, counsel template
 *   - static audits: RESEND_API_KEY is server-side only (never NEXT_PUBLIC_,
 *     never in client code, never hardcoded), the route only sends to the
 *     architect's own inbox, the Oracle view wires the EMAIL button, and
 *     supabase/artemis.sql carries artemis_mail_log with owner-only RLS.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const { isValidEmail, escapeHtml, buildCounselHtml, mailFrom, architectEmail } =
  await import(join(root, 'lib', 'artemis', 'mail.js'));

const read = (p) => readFileSync(join(root, p), 'utf8');
// Strip comments so audits check code, not documentation.
const codeOnly = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

test('isValidEmail accepts real addresses and rejects junk', () => {
  assert.equal(isValidEmail('olympiannexus@gmail.com'), true);
  assert.equal(isValidEmail('artemis@olympusverse.com'), true);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('missing@dot'), false);
  assert.equal(isValidEmail('has space@x.com'), false);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail(null), false);
  assert.equal(isValidEmail(42), false);
});

test('escapeHtml neutralizes markup', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('a & b "quoted"'), 'a &amp; b &quot;quoted&quot;');
  assert.equal(escapeHtml(null), '');
});

test('buildCounselHtml renders persona + escaped content, no raw script', () => {
  const html = buildCounselHtml({
    persona: 'MIDAS',
    prompt: 'audit <b>this</b>',
    reply: 'Verdict: <script>steal()</script> buy the dip.',
  });
  assert.match(html, /MIDAS/);
  assert.match(html, /audit &lt;b&gt;this&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /olympusverse\.com\/artemis/);
});

test('mail defaults are sane', () => {
  assert.ok(isValidEmail(mailFrom()), `bad default from: ${mailFrom()}`);
  assert.ok(isValidEmail(architectEmail()), `bad default to: ${architectEmail()}`);
});

test('RESEND_API_KEY is server-side only', () => {
  const route = codeOnly(read('app/api/artemis/mail/route.js'));
  assert.match(route, /process\.env\.RESEND_API_KEY/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_/);
  const view = codeOnly(read('app/artemis/oracle/OracleView.jsx'));
  assert.doesNotMatch(view, /RESEND_API_KEY/);
  const lib = codeOnly(read('lib/artemis/mail.js'));
  assert.doesNotMatch(lib, /re_[A-Za-z0-9_-]{10,}/); // no hardcoded key
});

test('mail route only sends to the architect inbox', () => {
  const route = codeOnly(read('app/api/artemis/mail/route.js'));
  assert.match(route, /architectEmail\(\)/);
  // No recipient taken from the request body.
  assert.doesNotMatch(route, /body\.to\b/);
});

test('Oracle view wires the EMAIL button to the mail route', () => {
  const view = codeOnly(read('app/artemis/oracle/OracleView.jsx'));
  assert.match(view, /\/api\/artemis\/mail/);
  assert.match(view, /emailCounsel/);
  assert.match(view, /✉ EMAIL/);
});

test('artemis.sql carries artemis_mail_log with owner-only RLS', () => {
  const sql = read('supabase/artemis.sql');
  assert.match(sql, /create table if not exists public\.artemis_mail_log/);
  assert.match(sql, /alter table public\.artemis_mail_log enable row level security/);
  assert.match(sql, /artemis_mail_log_owner/);
  assert.match(sql, /auth\.uid\(\) = user_id/);
});
