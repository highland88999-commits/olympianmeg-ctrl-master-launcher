// lib/auth/google-errors.js
//
// Plain-English error mapping for the "Continue with Google" sign-in.
// Pure functions (no React, no supabase-js) so they run under node --test.
//
// The launcher's identity system is Supabase: Google sign-in goes through
// supabase.auth.signInWithOAuth({ provider: 'google' }), which returns a
// real Supabase session. A Google user therefore lands in the exact same
// session/bootstrap flow as an email user — one system, not two.
// (Firebase in this app is Storage-only via REST; there is no Firebase
// Auth SDK, so a Firebase Google sign-in would leave the user with no
// Supabase session and break RLS, the gold ledger, profiles, and vault.)

/** The OAuth provider id passed to supabase.auth.signInWithOAuth. */
export const GOOGLE_PROVIDER = 'google';

/**
 * mapGoogleSignInError(message) -> plain-English, uppercase UI string.
 * Never returns raw provider/SDK text to the screen.
 */
export function mapGoogleSignInError(message) {
  const msg = String(message || '');
  if (/not enabled|unsupported provider|provider not/i.test(msg)) {
    return 'GOOGLE SIGN-IN IS NOT SWITCHED ON YET. USE EMAIL FOR NOW.';
  }
  if (/already|exists|duplicate|identity/i.test(msg)) {
    // Covers account-exists-with-different-credential: the address is
    // already registered via email/password (or another provider).
    return 'THIS EMAIL ALREADY HAS AN ACCOUNT. SIGN IN WITH EMAIL INSTEAD.';
  }
  if (/cancel|dismiss|closed/i.test(msg)) {
    return 'GOOGLE SIGN-IN WAS CANCELLED. TAP AGAIN WHEN READY.';
  }
  if (/popup|blocked/i.test(msg)) {
    return 'THE SIGN-IN WINDOW WAS BLOCKED. ALLOW POP-UPS AND TRY AGAIN.';
  }
  if (/network|fetch|timeout|offline/i.test(msg)) {
    return 'COULD NOT REACH GOOGLE. CHECK YOUR CONNECTION AND TRY AGAIN.';
  }
  return 'GOOGLE SIGN-IN FAILED. ' + msg.toUpperCase().slice(0, 160);
}
