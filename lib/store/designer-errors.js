// lib/store/designer-errors.js
// Human error copy for the Custom Product Designer (2026-10-15, from
// Merlin's demo screenshot: a raw Safari system string — "The string did
// not match the expected pattern." — reached the customer and blocked
// the Design step).
//
// Pure helpers (no React, no browser APIs) so they stay headless-testable
// in tests/store-design-upload.test.mjs.
//
// The rule: only messages THIS codebase wrote may be shown to a customer
// verbatim. Server responses carry our copy in `error`; client code marks
// its own messages with ourError(). Anything else a browser throws —
// DOMExceptions, JSON SyntaxErrors, network TypeErrors — is mapped to
// plain copy that says what happened and what to do next.

// Browser-thrown messages that must never be displayed as-is. The first
// entry is the exact string iOS Safari throws when a fetch/JSON payload
// breaks its string machinery (the 2026-10-15 designer failure).
const RAW_SYSTEM_RE =
  /did not match the expected pattern|unexpected token|unexpected end of|syntaxerror|failed to fetch|networkerror|load failed|network request failed|operation was aborted/i;

export function ourError(message) {
  const err = new Error(message);
  err.ours = true;
  return err;
}

// Map any thrown value to customer-safe copy. `fallback` is the copy for
// failures we did not anticipate; transport failures (the large print
// file could not be sent) get the specific copy below.
export function friendlyDesignerError(err, fallback) {
  if (err && err.ours && err.message) return String(err.message);
  const msg = err && err.message ? String(err.message) : '';
  const name = err && err.name ? String(err.name) : '';
  if (RAW_SYSTEM_RE.test(msg) || name === 'DOMException' || name === 'TypeError') {
    return 'That could not be sent — the print file is large and the connection dropped it. Check your connection and try again.';
  }
  return fallback;
}

// res.json() that never throws: a platform error page or an empty body
// (the other way Safari's raw SyntaxError reached the banner) reads as
// null, and the caller answers with its own human copy instead.
export async function jsonOrNull(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
