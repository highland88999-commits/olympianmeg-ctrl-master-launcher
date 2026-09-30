// lib/gallery.js
// Pay-per-download commerce logic for the Museum gallery.
// Pure logic: constants, the reuse license, and signed expiring download
// tokens (WebCrypto HMAC — works in Node and the browser). No DOM, no
// network. Headless-testable.
//
// The commerce model: Stripe's minimum one-time charge is ~$0.50, so a
// literal $0.10 charge per image is impossible. Instead the gallery sells
// DOWNLOAD CREDITS: C$1.00 = 10 credits, 1 credit = 1 download. Merlin's
// $0.10-per-image price is preserved exactly.

export const CREDITS_PER_PACK = 10;
export const PACK_PRICE_CENTS = 100; // C$1.00
export const PACK_PRICE_LABEL = '$1.00';
export const CREDITS_PER_DOWNLOAD = 1;
export const PRICE_PER_DOWNLOAD_CENTS = PACK_PRICE_CENTS / CREDITS_PER_PACK; // 10 — $0.10
export const STRIPE_PRODUCT_NAME = 'Olympus Gallery Download Credits';
export const DOWNLOAD_TOKEN_TTL_MS = 15 * 60 * 1000; // signed URLs live 15 minutes

export const LICENSE_TITLE = 'Olympus Gallery — Download License';
export const LICENSE_TEXT =
  'Your purchase grants you a non-exclusive, perpetual, worldwide, royalty-free ' +
  'license to download and reuse the purchased image for any purpose, including ' +
  'commercial use and modification. Credit "Merlin Ambros / Olympus Gallery" is ' +
  'appreciated but not required. You may not resell the unmodified image as a ' +
  'standalone stock file.';

// Gallery item ids are short slugs (matches lib/museum.js ids like "g001").
export function isValidItemId(id) {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(id);
}

function b64urlEncode(bytes) {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/**
 * Mint a signed, expiring download token. `now` is injectable for tests.
 * Token format: base64url(payload).base64url(signature)
 */
export async function signDownloadToken({ userId, itemId, secret, ttlMs = DOWNLOAD_TOKEN_TTL_MS, now = Date.now() }) {
  if (!userId || !isValidItemId(itemId) || !secret) throw new Error('Invalid token inputs.');
  const payload = { uid: userId, item: itemId, exp: now + ttlMs };
  const enc = new TextEncoder();
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${b64urlEncode(sig)}`;
}

/**
 * Verify a download token. Returns { userId, itemId } or null.
 */
export async function verifyDownloadToken(token, secret, now = Date.now()) {
  try {
    if (typeof token !== 'string' || typeof secret !== 'string' || !token || !secret) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const key = await hmacKey(secret);
    const enc = new TextEncoder();
    const expected = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    const given = b64urlDecode(sig);
    const a = new Uint8Array(expected);
    if (a.length !== given.length) return null;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ given[i];
    if (diff !== 0) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (!payload || typeof payload.uid !== 'string' || !isValidItemId(payload.item)) return null;
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
    return { userId: payload.uid, itemId: payload.item };
  } catch {
    return null;
  }
}

/** Human label for a credit balance, e.g. 12 -> "12 downloads". */
export function creditsLabel(n) {
  const c = Math.max(0, Math.floor(Number(n) || 0));
  return `${c} download${c === 1 ? '' : 's'}`;
}

/**
 * Idempotency key for a gallery redemption.
 *
 * A client-supplied key (one per download attempt) is preferred: a retried
 * request or a double-tap reuses the key and can never spend two credits.
 * When the client sends none, the key is deterministic per user and item —
 * a repeat redemption of an already-licensed item returns a fresh download
 * link without spending another credit (the reuse license).
 */
export function redeemIdempotencyKey(userId, itemId, clientKey) {
  const clean = typeof clientKey === 'string' && clientKey.length > 0 && clientKey.length <= 80
    ? clientKey
    : `${userId}:${itemId}`;
  return `redeem:${clean}`;
}
