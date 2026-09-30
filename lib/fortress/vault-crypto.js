// Fortress of Solitude — encrypted vault blob format.
//
// Layout: magic(5) + salt(16) + iv(12) + AES-GCM-256 ciphertext.
// Encryption primitives come from lib/babel/crypto.js (the approved Miles'
// vault pattern: PBKDF2-SHA256, 600,000 iterations, per-file random salt/IV).
// The salt and IV ride inside the blob so a stored file is self-describing;
// the passphrase is never stored or sent anywhere.

import { encryptBytes, decryptBytes } from '../babel/crypto.js';

export const FENC_MAGIC = 'FENC1';
export const FENC_SALT_LEN = 16;
export const FENC_IV_LEN = 12;
export const FENC_HEADER_LEN = FENC_MAGIC.length + FENC_SALT_LEN + FENC_IV_LEN;

const _enc = new TextEncoder();
const _dec = new TextDecoder();

/** Wrap raw bytes (the zipped payload) into an encrypted vault blob. */
export async function lockBlob(plainBytes, passphrase) {
  const { ciphertext, iv, salt } = await encryptBytes(plainBytes, passphrase);
  const out = new Uint8Array(FENC_HEADER_LEN + ciphertext.length);
  out.set(_enc.encode(FENC_MAGIC), 0);
  out.set(salt, FENC_MAGIC.length);
  out.set(iv, FENC_MAGIC.length + FENC_SALT_LEN);
  out.set(ciphertext, FENC_HEADER_LEN);
  return out;
}

/** Unwrap an encrypted vault blob back to raw bytes. Throws on wrong passphrase or tampering. */
export async function unlockBlob(encBytes, passphrase) {
  if (!(encBytes instanceof Uint8Array)) encBytes = new Uint8Array(encBytes);
  if (encBytes.length < FENC_HEADER_LEN) throw new Error('File is damaged or not a vault blob.');
  const magic = _dec.decode(encBytes.slice(0, FENC_MAGIC.length));
  if (magic !== FENC_MAGIC) throw new Error('This file was stored before encryption — please re-store it to lock it.');
  const salt = encBytes.slice(FENC_MAGIC.length, FENC_MAGIC.length + FENC_SALT_LEN);
  const iv = encBytes.slice(FENC_MAGIC.length + FENC_SALT_LEN, FENC_HEADER_LEN);
  const ciphertext = encBytes.slice(FENC_HEADER_LEN);
  return decryptBytes(ciphertext, passphrase, iv, salt);
}

/** True when a crystal node holds an encrypted blob (new files). */
export function isLockedNode(node) {
  return node?.encrypted === true || String(node?.fileStorageKey || '').endsWith('.enc');
}
