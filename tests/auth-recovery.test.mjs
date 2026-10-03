// Tests for the password-reset / email-verification UX helpers.
// Pure logic in lib/auth/recovery-ux.js — no React, no network.
// Run: node --test tests/auth-recovery.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RESEND_COOLDOWN_S,
  RESET_REQUEST_MESSAGE,
  EXPIRED_LINK_MESSAGE,
  cooldownLabel,
  detectRecoveryLink,
} from '../lib/auth/recovery-ux.js';

test('cooldown is 60 seconds', () => {
  assert.equal(RESEND_COOLDOWN_S, 60);
});

test('reset message is honest: never claims a link was definitely sent', () => {
  assert.match(RESET_REQUEST_MESSAGE, /IF AN ACCOUNT EXISTS/i);
  assert.doesNotMatch(RESET_REQUEST_MESSAGE, /LINK SENT/i);
  assert.doesNotMatch(RESET_REQUEST_MESSAGE, /CHECK COMMS FOR LINK/i);
});

test('expired-link message tells the user to request a new one', () => {
  assert.match(EXPIRED_LINK_MESSAGE, /EXPIRED/i);
  assert.match(EXPIRED_LINK_MESSAGE, /REQUEST A NEW ONE/i);
});

test('cooldownLabel counts down, null when ready', () => {
  assert.equal(cooldownLabel(60), 'RESEND IN 60S');
  assert.equal(cooldownLabel(45), 'RESEND IN 45S');
  assert.equal(cooldownLabel(1), 'RESEND IN 1S');
  assert.equal(cooldownLabel(0), null);
  assert.equal(cooldownLabel(-5), null);
  assert.equal(cooldownLabel(NaN), null);
});

test('valid recovery hash: attempt, not expired', () => {
  const r = detectRecoveryLink('#access_token=abc&refresh_token=def&type=recovery', '');
  assert.deepEqual(r, { attempt: true, expired: false });
});

test('expired recovery hash (implicit flow): attempt + expired', () => {
  const r = detectRecoveryLink(
    '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    ''
  );
  assert.deepEqual(r, { attempt: true, expired: true });
});

test('expired recovery link (PKCE query flow): attempt + expired', () => {
  const r = detectRecoveryLink('', '?error=access_denied&error_code=otp_expired');
  assert.deepEqual(r, { attempt: true, expired: true });
});

test('unrelated hash: no attempt', () => {
  assert.deepEqual(detectRecoveryLink('#foo=bar', ''), { attempt: false, expired: false });
});

test('empty URL: no attempt', () => {
  assert.deepEqual(detectRecoveryLink('', ''), { attempt: false, expired: false });
  assert.deepEqual(detectRecoveryLink(), { attempt: false, expired: false });
});

test('non-recovery error without recovery context is not an attempt', () => {
  const r = detectRecoveryLink('#error=server_error&error_code=unexpected_failure', '');
  assert.equal(r.attempt, false);
});

test('Auth.jsx wires the new UX (static checks)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../components/Auth.jsx', import.meta.url), 'utf8');
  // Honest reset messaging replaces the old guarantee.
  assert.ok(src.includes('RESET_REQUEST_MESSAGE'), 'uses the honest reset message');
  assert.ok(!src.includes('CHECK COMMS FOR LINK'), 'old misleading message is gone');
  // Resend affordance exists in reset mode with cooldown.
  assert.ok(src.includes('handleResendReset'), 'reset resend handler exists');
  assert.ok(src.includes('RESEND RESET LINK'), 'reset resend button label exists');
  assert.ok(src.includes('RESEND_COOLDOWN_S'), 'cooldown constant is used');
  // Expired-link detection on mount.
  assert.ok(src.includes('detectRecoveryLink'), 'mount detects dead recovery links');
  assert.ok(src.includes('EXPIRED_LINK_MESSAGE'), 'expired-link message is shown');
  assert.ok(src.includes('replaceState'), 'dead link is scrubbed from the URL');
  // Signup verification resend also respects the cooldown now.
  assert.ok(src.includes("DIDN'T GET IT? RESEND VERIFICATION"), 'signup resend label kept');
});
