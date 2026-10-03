// Pure helpers for the password-reset / email-verification UX in
// components/Auth.jsx. No React, no network — safe for node --test.
//
// Background (verified live 2026-10-02): the mail pipeline works — Resend
// sends signup confirmations and password resets from
// Olympus <noreply@olympusverse.com>. GoTrue answers resetPasswordForEmail
// with success even when the address has no account (anti-enumeration), so
// the UI must never claim "link sent" as a guarantee. Recovery links expire
// after 1 hour and each new request invalidates the previous one; an
// expired/used link lands back with error_code=otp_expired in the URL.

export const RESEND_COOLDOWN_S = 60;

// Honest reset messaging: never confirms or denies account existence.
export const RESET_REQUEST_MESSAGE =
  'IF AN ACCOUNT EXISTS FOR THIS EMAIL, A RESET LINK IS ON ITS WAY.';

export const EXPIRED_LINK_MESSAGE =
  'THIS SECURE LINK HAS EXPIRED. REQUEST A NEW ONE.';

export const VERIFY_RESENT_MESSAGE =
  'VERIFICATION MATRIX RE-SENT. CHECK INBOX AND SPAM FOLDER.';

// Countdown label for a resend button. Returns null when the button is ready.
export function cooldownLabel(secondsLeft) {
  const n = Math.max(0, Math.ceil(Number(secondsLeft) || 0));
  return n > 0 ? `RESEND IN ${n}S` : null;
}

// Inspects the URL for a recovery-link round trip.
// Returns { attempt, expired }:
//   attempt — the URL carries a recovery attempt (valid or dead).
//   expired — the attempt is dead (expired/used/invalid link).
// Supabase puts error_code=otp_expired in the hash (implicit flow) or the
// query string (PKCE code flow) when the link is dead.
export function detectRecoveryLink(hash = '', search = '') {
  const hp = new URLSearchParams(String(hash).replace(/^#/, ''));
  const sp = new URLSearchParams(String(search).replace(/^\?/, ''));
  const type = hp.get('type') || sp.get('type') || '';
  const errorCode = `${hp.get('error_code') || ''} ${sp.get('error_code') || ''}`;
  const hasError = Boolean(hp.get('error') || sp.get('error'));
  const hasToken = Boolean(hp.get('access_token') || sp.get('code'));
  const recoveryContext = type === 'recovery' || /otp_expired/i.test(errorCode);
  const attempt = recoveryContext || (hasError && !hasToken && type !== '');
  const expired = /otp_expired/i.test(errorCode) || (hasError && !hasToken && recoveryContext);
  return { attempt, expired };
}
