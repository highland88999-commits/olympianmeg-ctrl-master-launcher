// Fortress of Solitude — share-link helpers (pure, UI- and node-safe).
//
// Share links are bearer tokens into the owner's vault file. They are
// verified server-side by app/api/fortress/shared/[token] (token + expiry,
// then a fresh GCS signed URL). Tokens are random UUIDs — unguessable —
// and they expire.
//
// Honest note baked into the UI copy: encrypted (FENC1) files stay locked.
// The recipient needs the passphrase too, shared separately by the owner.

export const DEFAULT_SHARE_HOURS = 24;
export const MIN_SHARE_HOURS = 1;
export const MAX_SHARE_HOURS = 24 * 30; // 30 days

/** Clamp an expiry-hours input to the allowed range; default 24h. */
export function sanitizeExpiryHours(input) {
  const n = Number(input);
  if (!Number.isFinite(n)) return DEFAULT_SHARE_HOURS;
  return Math.min(MAX_SHARE_HOURS, Math.max(MIN_SHARE_HOURS, Math.floor(n)));
}

/** True when a share row's expires_at is in the past (or missing/invalid). */
export function isShareExpired(expiresAt) {
  const t = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  if (!Number.isFinite(t)) return true;
  return t <= Date.now();
}

/** The public URL an owner hands out. No query params, no user data in it. */
export function buildShareUrl(origin, token) {
  const base = String(origin || '').replace(/\/+$/, '');
  return `${base}/api/fortress/shared/${encodeURIComponent(token)}`;
}

/** Owner-facing copy: encrypted files need the passphrase shared separately. */
export const SHARE_PASSPHRASE_NOTE =
  'This file is encrypted — the link alone will not open it. Share your passphrase separately.';
