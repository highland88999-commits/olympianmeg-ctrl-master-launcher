// Headless tests for lib/babel/crypto.js — run with: node test-crypto.mjs
import {
  encryptBytes,
  decryptBytes,
  encryptText,
  decryptText,
  u8ToB64,
  b64ToU8,
  generateSalt,
  generateIv,
  CRYPTO_PARAMS,
} from './crypto.js';

let passed = 0;
let failed = 0;
function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
const te = new TextEncoder();

async function main() {
  // params sanity
  ok('params: AES-GCM-256', CRYPTO_PARAMS.algorithm === 'AES-GCM-256');
  ok('params: 600k iterations', CRYPTO_PARAMS.iterations === 600000);
  ok('params: 16-byte salt', CRYPTO_PARAMS.saltBytes === 16);
  ok('params: 12-byte IV', CRYPTO_PARAMS.ivBytes === 12);

  // salt/iv randomness + length
  const s1 = generateSalt(), s2 = generateSalt();
  ok('salt length 16', s1.length === 16);
  ok('salts differ', Buffer.from(s1).toString('hex') !== Buffer.from(s2).toString('hex'));
  const v1 = generateIv(), v2 = generateIv();
  ok('iv length 12', v1.length === 12);
  ok('ivs differ', Buffer.from(v1).toString('hex') !== Buffer.from(v2).toString('hex'));

  // text round-trip
  const msg = 'For Miles — the lake house keys are with Aunt June. Love, Dad.';
  const enc = await encryptText(msg, 'correct-horse-battery-staple-99');
  ok('ciphertext is base64 text', typeof enc.ciphertextB64 === 'string' && enc.ciphertextB64.length > 0);
  ok('ciphertext differs from plaintext', !enc.ciphertextB64.includes('Miles'));
  const dec = await decryptText(enc.ciphertextB64, 'correct-horse-battery-staple-99', enc.ivB64, enc.saltB64);
  ok('text round-trip', dec === msg);

  // same plaintext + passphrase -> different ciphertext (random salt/iv)
  const enc2 = await encryptText(msg, 'correct-horse-battery-staple-99');
  ok('randomized encryption', enc.ciphertextB64 !== enc2.ciphertextB64);

  // wrong passphrase fails
  let wrongFailed = false;
  try {
    await decryptText(enc.ciphertextB64, 'wrong-passphrase-12345', enc.ivB64, enc.saltB64);
  } catch { wrongFailed = true; }
  ok('wrong passphrase rejected', wrongFailed);

  // tampered ciphertext fails (GCM auth)
  const tampered = b64ToU8(enc.ciphertextB64);
  tampered[10] ^= 0xff;
  let tamperFailed = false;
  try {
    await decryptBytes(tampered, 'correct-horse-battery-staple-99', b64ToU8(enc.ivB64), b64ToU8(enc.saltB64));
  } catch { tamperFailed = true; }
  ok('tampered ciphertext rejected', tamperFailed);

  // tampered IV fails
  const badIv = b64ToU8(enc.ivB64);
  badIv[0] ^= 0x01;
  let ivFailed = false;
  try {
    await decryptBytes(b64ToU8(enc.ciphertextB64), 'correct-horse-battery-staple-99', badIv, b64ToU8(enc.saltB64));
  } catch { ivFailed = true; }
  ok('tampered IV rejected', ivFailed);

  // binary round-trip (photo bytes incl. 0x00 and 0xFF)
  const bin = new Uint8Array([0, 1, 2, 255, 254, 13, 10, 0, 200]);
  const ebin = await encryptBytes(bin, 'photo-passphrase-1');
  const dbin = await decryptBytes(ebin.ciphertext, 'photo-passphrase-1', ebin.iv, ebin.salt);
  ok('binary round-trip', dbin.length === bin.length && dbin.every((b, i) => b === bin[i]));

  // empty string round-trip
  const eEmpty = await encryptText('', 'some-passphrase-12');
  ok('empty string round-trip', (await decryptText(eEmpty.ciphertextB64, 'some-passphrase-12', eEmpty.ivB64, eEmpty.saltB64)) === '');

  // unicode round-trip
  const uni = 'Miles — 你好 — 🏔️ — café';
  const eUni = await encryptText(uni, 'unicode-pass-1234');
  ok('unicode round-trip', (await decryptText(eUni.ciphertextB64, 'unicode-pass-1234', eUni.ivB64, eUni.saltB64)) === uni);

  // base64 helpers round-trip
  const raw = te.encode('hello bytes');
  ok('b64 helpers', b64ToU8(u8ToB64(raw)).every((b, i) => b === raw[i]));

  // missing passphrase rejected
  let noPw = false;
  try { await encryptText('x', ''); } catch { noPw = true; }
  ok('empty passphrase rejected', noPw);

  console.log(`crypto: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
