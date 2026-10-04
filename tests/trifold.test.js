// tests/trifold.test.js — Headless tests for the TRIFOLD newsletter.
// Run: node tests/trifold.test.js (from the repo root). No browser, no network.
import {
  TRIFOLD_NAME,
  TRIFOLD_PRICE_CENTS,
  TRIFOLD_TRIAL_DAYS,
  TRIFOLD_LENSES,
  TRIFOLD_NEWSPAPERS,
  nextNewspaper,
} from '../lib/trifold/constants.js';
import { _roundTripForTests, _encryptForTests, _decryptForTests } from '../lib/trifold/crypto.js';
import { TRIFOLD_AI_PROVIDERS } from '../lib/trifold/ai.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- constants ---
t('name is TRIFOLD', TRIFOLD_NAME === 'TRIFOLD');
t('price is $5.99', TRIFOLD_PRICE_CENTS === 599);
t('trial is 90 days', TRIFOLD_TRIAL_DAYS === 90);
t('three lenses', TRIFOLD_LENSES.length === 3);
t('only fiction lenses are flagged fiction',
  TRIFOLD_LENSES.filter((l) => l.fiction).length === 2 &&
  TRIFOLD_LENSES.find((l) => l.key === 'og').fiction === false);
t('newspaper rotation is non-empty', TRIFOLD_NEWSPAPERS.length >= 8);
t('every paper has name/region/url', TRIFOLD_NEWSPAPERS.every((p) => p.name && p.region && p.url));

// Full rotation visits every paper exactly once (no repeats).
{
  const seen = new Set();
  let idx = 0;
  for (let i = 0; i < TRIFOLD_NEWSPAPERS.length; i++) {
    const { paper, nextIndex } = nextNewspaper(idx);
    seen.add(paper.name);
    idx = nextIndex;
  }
  t('rotation covers every paper once', seen.size === TRIFOLD_NEWSPAPERS.length);
  const wrap = nextNewspaper(idx);
  t('rotation wraps around', wrap.paper.name === TRIFOLD_NEWSPAPERS[0].name);
}

// --- crypto round-trip ---
{
  const secret = 'test-secret-123';
  const plaintext = 'sk-test-buddy-key-abc123';
  const payload = await _encryptForTests(secret, plaintext);
  const back = await _decryptForTests(secret, payload);
  t('AES-GCM round-trips the buddy key', back === plaintext);
  const wrong = await _decryptForTests('other-secret', payload).then(() => 'DECRYPTED').catch(() => 'THREW');
  t('wrong secret does not decrypt', wrong === 'THREW');
  const tampered = await _decryptForTests(secret, payload.replace(/.$/, 'A')).then(() => 'DECRYPTED').catch(() => 'THREW');
  t('tampered payload does not decrypt', tampered === 'THREW');
}

// --- AI providers ---
t('three providers supported', TRIFOLD_AI_PROVIDERS.length === 3);
t('openai supported', TRIFOLD_AI_PROVIDERS.includes('openai'));

console.log(`\ntrifold: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
