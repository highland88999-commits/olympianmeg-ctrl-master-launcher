// tests/trifold.test.js — Headless tests for the TRIFOLD newsletter.
// Run: node tests/trifold.test.js (from the repo root). No browser, no network.
import {
  TRIFOLD_NAME,
  TRIFOLD_PRICE_CENTS,
  TRIFOLD_TRIAL_DAYS,
  TRIFOLD_LENSES,
  TRIFOLD_NEWSPAPERS,
  TRIFOLD_APPLICATION_FEE_PERCENT,
  TRIFOLD_PLATFORM_FEE_CENTS,
  trifoldPlatformFeeCents,
  nextNewspaper,
} from '../lib/trifold/constants.js';
import { _roundTripForTests, _encryptForTests, _decryptForTests } from '../lib/trifold/crypto.js';
import { TRIFOLD_AI_PROVIDERS } from '../lib/trifold/ai.js';
import {
  edmontonParts,
  pipelineStepFor,
  normalizeFiction,
  FICTION_CLOSING_LINE,
} from '../lib/trifold/pipeline.js';

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

// --- revenue split: 16.69% of $5.99 -> exactly $1.00 for the platform ---
t('application fee percent is 16.69', TRIFOLD_APPLICATION_FEE_PERCENT === 16.69);
t('platform fee constant is 100 cents', TRIFOLD_PLATFORM_FEE_CENTS === 100);
t('16.69% of 599 cents rounds to 100', trifoldPlatformFeeCents(599) === 100);
t('helper agrees with the constant', trifoldPlatformFeeCents(TRIFOLD_PRICE_CENTS) === TRIFOLD_PLATFORM_FEE_CENTS);
t('Devan keeps $4.99 of $5.99', TRIFOLD_PRICE_CENTS - TRIFOLD_PLATFORM_FEE_CENTS === 499);

// --- Edmonton wall-clock helper ---
// 2026-10-05 is a Monday; 18:59 UTC = 12:59 MDT (UTC-6).
{
  const mon1259 = edmontonParts(new Date(Date.UTC(2026, 9, 5, 18, 59, 0)));
  t('Mon 18:59 UTC is Monday in Edmonton', mon1259.weekday === 1);
  t('Mon 18:59 UTC is 12:59 Edmonton', mon1259.hour === 12 && mon1259.minute === 59);
  // Tue 09:00 UTC = Tue 03:00 MDT; Tue 12:00 UTC = Tue 06:00 MDT.
  const tue0300 = edmontonParts(new Date(Date.UTC(2026, 9, 6, 9, 0, 0)));
  t('Tue 09:00 UTC is Tuesday 03:00 Edmonton', tue0300.weekday === 2 && tue0300.hour === 3 && tue0300.minute === 0);
  const tue0600 = edmontonParts(new Date(Date.UTC(2026, 9, 6, 12, 0, 0)));
  t('Tue 12:00 UTC is Tuesday 06:00 Edmonton', tue0600.weekday === 2 && tue0600.hour === 6 && tue0600.minute === 0);
  // A minute before the Monday deadline.
  const mon1258 = edmontonParts(new Date(Date.UTC(2026, 9, 5, 18, 58, 0)));
  t('totalMinutes is 779 at 12:59', mon1258.totalMinutes === 12 * 60 + 58);
}

// --- pipeline step dispatch (Edmonton wall-clock x status) ---
t('Mon 12:59 + draft -> ai_generate', pipelineStepFor(1, 12 * 60 + 59, 'draft') === 'ai_generate');
t('Mon 12:59 + review -> ai_generate', pipelineStepFor(1, 12 * 60 + 59, 'review') === 'ai_generate');
t('Mon 12:58 + draft -> nothing yet', pipelineStepFor(1, 12 * 60 + 58, 'draft') === null);
t('Mon 13:00 + devan_submitted -> nothing (his version is safe)', pipelineStepFor(1, 13 * 60, 'devan_submitted') === null);
t('Mon 13:00 + ai_generated -> nothing (already generated)', pipelineStepFor(1, 13 * 60, 'ai_generated') === null);
t('Tue 03:00 + devan_submitted -> decide', pipelineStepFor(2, 3 * 60, 'devan_submitted') === 'decide');
t('Tue 03:00 + ai_generated -> decide', pipelineStepFor(2, 3 * 60, 'ai_generated') === 'decide');
t('Tue 03:00 + stale draft -> decide', pipelineStepFor(2, 3 * 60, 'draft') === 'decide');
t('Tue 05:59 + review -> decide', pipelineStepFor(2, 5 * 60 + 59, 'review') === 'decide');
t('Tue 06:00 + ready -> publish', pipelineStepFor(2, 6 * 60, 'ready') === 'publish');
t('Tue 06:00 + draft -> decide first, not publish', pipelineStepFor(2, 6 * 60, 'draft') === 'decide');
t('Tue 02:59 + draft -> nothing yet', pipelineStepFor(2, 2 * 60 + 59, 'draft') === null);
t('Tue 06:00 + published -> nothing', pipelineStepFor(2, 6 * 60, 'published') === null);
t('Wed + ready -> nothing (wrong day)', pipelineStepFor(3, 6 * 60, 'ready') === null);
t('Sun + draft -> nothing (wrong day)', pipelineStepFor(7, 12 * 60, 'draft') === null);

// --- fiction closing-line enforcement ---
t('empty fiction stays empty', normalizeFiction('') === '');
t('whitespace-only stays empty', normalizeFiction('   \n  ') === '');
t('plain text gets trimmed + closed', normalizeFiction('  hello world  ') === 'hello world\n\n' + FICTION_CLOSING_LINE);
t('already-closed text is untouched', normalizeFiction('some story\n\n' + FICTION_CLOSING_LINE) === 'some story\n\n' + FICTION_CLOSING_LINE);
t('closing line constant is exact', FICTION_CLOSING_LINE === '— This edition is 100% FICTION.');

console.log(`\ntrifold: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
