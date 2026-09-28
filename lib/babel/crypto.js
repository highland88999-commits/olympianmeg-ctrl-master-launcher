// Miles' vault — client-side encryption primitives (WebCrypto).
//
// Design: AES-GCM-256, per-item random 16-byte salt + 12-byte IV,
// PBKDF2-SHA256 with 600,000 iterations deriving the key from the item's
// passphrase. The server/Supabase NEVER sees plaintext or passphrases —
// only ciphertext, salt, and IV.
//
// Works in the browser and in Node 18+ (globalThis.crypto).

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function getCrypto() {
  const c = globalThis.crypto;
  if (!c || !c.subtle || !c.getRandomValues) {
    throw new Error('WebCrypto is not available in this environment.');
  }
  return c;
}

export function randomBytes(n) {
  const c = getCrypto();
  const b = new Uint8Array(n);
  c.getRandomValues(b);
  return b;
}

export function generateSalt() {
  return randomBytes(SALT_BYTES);
}

export function generateIv() {
  return randomBytes(IV_BYTES);
}

const _enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const _dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

export function u8ToB64(bytes) {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  // btoa exists in browsers; Node 18+ also exposes it globally.
  if (typeof btoa !== 'undefined') return btoa(s);
  return Buffer.from(s, 'binary').toString('base64');
}

export function b64ToU8(b64) {
  let bin;
  if (typeof atob !== 'undefined') bin = atob(b64);
  else bin = Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase, salt) {
  if (!passphrase || typeof passphrase !== 'string') {
    throw new Error('A passphrase is required.');
  }
  const c = getCrypto();
  const baseKey = await c.subtle.importKey(
    'raw',
    _enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return c.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt raw bytes. Returns { ciphertext: Uint8Array, iv: Uint8Array, salt: Uint8Array }.
 */
export async function encryptBytes(plaintextBytes, passphrase) {
  const c = getCrypto();
  const salt = generateSalt();
  const iv = generateIv();
  const key = await deriveKey(passphrase, salt);
  const ct = await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintextBytes);
  return { ciphertext: new Uint8Array(ct), iv, salt };
}

/**
 * Decrypt raw bytes. Throws if the passphrase is wrong or data was tampered with.
 */
export async function decryptBytes(ciphertextBytes, passphrase, iv, salt) {
  const c = getCrypto();
  const key = await deriveKey(passphrase, salt);
  const pt = await c.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertextBytes);
  return new Uint8Array(pt);
}

/**
 * Encrypt a string. Returns { ciphertextB64, ivB64, saltB64 } — safe to store as text.
 */
export async function encryptText(plaintext, passphrase) {
  if (typeof plaintext !== 'string') throw new Error('Plaintext must be a string.');
  const { ciphertext, iv, salt } = await encryptBytes(_enc.encode(plaintext), passphrase);
  return { ciphertextB64: u8ToB64(ciphertext), ivB64: u8ToB64(iv), saltB64: u8ToB64(salt) };
}

/**
 * Decrypt a string bundle. Throws on wrong passphrase / tampering.
 */
export async function decryptText(ciphertextB64, passphrase, ivB64, saltB64) {
  const pt = await decryptBytes(
    b64ToU8(ciphertextB64),
    passphrase,
    b64ToU8(ivB64),
    b64ToU8(saltB64)
  );
  return _dec.decode(pt);
}

export const CRYPTO_PARAMS = Object.freeze({
  algorithm: 'AES-GCM-256',
  kdf: 'PBKDF2-SHA256',
  iterations: PBKDF2_ITERATIONS,
  saltBytes: SALT_BYTES,
  ivBytes: IV_BYTES,
});
