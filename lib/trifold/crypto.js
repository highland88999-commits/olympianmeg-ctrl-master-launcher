// lib/trifold/crypto.js
// AES-256-GCM encryption for the buddy's AI API key.
// Server-only: never import from client components.
//
// The key lives ONLY in TRIFOLD_KEY_SECRET (Vercel env). Ciphertext is
// stored in trifold_settings.ai_api_key_enc. Plaintext is never logged,
// never returned by any API route, and only decrypted in-memory at the
// moment of an AI call.

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

let _crypto = null;
async function getCrypto() {
  // Node runtime (API routes). Cached; lazy so the module also loads where
  // node:crypto is unavailable (never called there).
  if (!_crypto) {
    const mod = await import('node:crypto');
    _crypto = mod.default || mod;
  }
  return _crypto;
}

function keyBytes(crypto, secret) {
  // Derive a fixed 32-byte key from the env secret via SHA-256.
  // (Not a KDF arms race: the threat model is DB-read exfiltration, and
  // the secret itself never leaves the server environment.)
  return crypto.createHash('sha256').update(String(secret), 'utf8').digest();
}

function requireSecret() {
  const secret = process.env.TRIFOLD_KEY_SECRET;
  if (!secret) throw new Error('TRIFOLD_KEY_SECRET is not configured.');
  return secret;
}

export async function encryptApiKey(plaintext) {
  const crypto = await getCrypto();
  const secret = requireSecret();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, keyBytes(crypto, secret), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export async function decryptApiKey(payload) {
  const crypto = await getCrypto();
  const secret = requireSecret();
  const parts = String(payload || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'gcm1') throw new Error('Bad key payload.');
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const enc = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv(ALGO, keyBytes(crypto, secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// Test seams: pure encrypt/decrypt with an explicit secret (no env needed).
export async function _encryptForTests(secret, plaintext) {
  const crypto = await getCrypto();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, keyBytes(crypto, secret), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export async function _decryptForTests(secret, payload) {
  const crypto = await getCrypto();
  const parts = String(payload || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'gcm1') throw new Error('Bad key payload.');
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const enc = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv(ALGO, keyBytes(crypto, secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export async function _roundTripForTests(secret, plaintext) {
  return _decryptForTests(secret, await _encryptForTests(secret, plaintext));
}
