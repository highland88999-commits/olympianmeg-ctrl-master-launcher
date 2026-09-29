// Tests for the "Continue with Google" sign-in error mapping.
// Pure logic in lib/auth/google-errors.js — no React, no network.
// Run: node --test tests/auth-google.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { GOOGLE_PROVIDER, mapGoogleSignInError } from '../lib/auth/google-errors.js';

test('google provider id is the supabase OAuth provider string', () => {
  assert.equal(GOOGLE_PROVIDER, 'google');
});

test('provider not enabled -> plain-English "not switched on" message', () => {
  const out = mapGoogleSignInError('Unsupported provider: provider is not enabled');
  assert.equal(out, 'GOOGLE SIGN-IN IS NOT SWITCHED ON YET. USE EMAIL FOR NOW.');
});

test('account-exists-with-different-credential -> tells user to use email', () => {
  for (const raw of [
    'A user with this email address has already been registered',
    'identity already exists for this email',
    'duplicate identity: email already linked to another provider',
    new Error('account-exists-with-different-credential'),
  ]) {
    const out = mapGoogleSignInError(raw);
    assert.equal(
      out,
      'THIS EMAIL ALREADY HAS AN ACCOUNT. SIGN IN WITH EMAIL INSTEAD.',
      `failed for: ${raw}`
    );
  }
});

test('blocked popup -> plain-English guidance', () => {
  const out = mapGoogleSignInError('popup was blocked by the browser');
  assert.match(out, /BLOCKED/);
  assert.match(out, /POP-UPS/);
});

test('network failure -> plain-English guidance', () => {
  const out = mapGoogleSignInError('fetch failed: network timeout');
  assert.match(out, /CONNECTION/);
});

test('user-cancelled sign-in -> plain-English guidance', () => {
  const out = mapGoogleSignInError('user closed the popup');
  assert.match(out, /CANCELLED/);
});

test('unknown error -> prefixed uppercase, capped length, never raw leak of internals', () => {
  const out = mapGoogleSignInError('some_weird_sdk_code_42 exploded');
  assert.ok(out.startsWith('GOOGLE SIGN-IN FAILED. '));
  assert.ok(out.length <= 'GOOGLE SIGN-IN FAILED. '.length + 160);
});

test('empty/undefined input does not crash', () => {
  assert.ok(mapGoogleSignInError('').startsWith('GOOGLE SIGN-IN FAILED.'));
  assert.ok(mapGoogleSignInError(undefined).startsWith('GOOGLE SIGN-IN FAILED.'));
  assert.ok(mapGoogleSignInError(null).startsWith('GOOGLE SIGN-IN FAILED.'));
});
