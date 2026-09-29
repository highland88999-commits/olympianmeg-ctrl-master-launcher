// tests/gallery.test.mjs
// Headless tests for the Museum pay-per-download commerce (lib/gallery.js).
// Run: node tests/gallery.test.mjs  (from the repo root).
// No browser, no network — pure logic + WebCrypto (built into Node 18+).
import {
  CREDITS_PER_PACK, PACK_PRICE_CENTS, PRICE_PER_DOWNLOAD_CENTS,
  STRIPE_PRODUCT_NAME, DOWNLOAD_TOKEN_TTL_MS,
  LICENSE_TEXT, LICENSE_TITLE,
  isValidItemId, creditsLabel,
  signDownloadToken, verifyDownloadToken,
} from '../lib/gallery.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- Commerce constants ---
t('10 credits per $1 pack', CREDITS_PER_PACK === 10);
t('pack is 100 cents CAD', PACK_PRICE_CENTS === 100);
t('$0.10 per download', PRICE_PER_DOWNLOAD_CENTS === 10);
t('product name exact', STRIPE_PRODUCT_NAME === 'Olympus Gallery Download Credits');
t('token TTL is 15 minutes', DOWNLOAD_TOKEN_TTL_MS === 15 * 60 * 1000);

// --- License ---
t('license has a title', typeof LICENSE_TITLE === 'string' && LICENSE_TITLE.length > 0);
t('license grants download + reuse', /download and reuse/i.test(LICENSE_TEXT));
t('license is short', LICENSE_TEXT.length < 600);

// --- Item id validation ---
t('valid ids', isValidItemId('g001') && isValidItemId('gx0001-c5d7b31c'));
t('rejects path traversal', !isValidItemId('../x') && !isValidItemId('g/001'));
t('rejects empty/non-string', !isValidItemId('') && !isValidItemId(null) && !isValidItemId(123));
t('rejects overlong', !isValidItemId('g'.repeat(60)));

// --- Credit labels ---
t('creditsLabel plural', creditsLabel(12) === '12 downloads');
t('creditsLabel singular', creditsLabel(1) === '1 download');
t('creditsLabel zero', creditsLabel(0) === '0 downloads');

// --- Signed tokens (async) ---
const SECRET = 'test-secret-do-not-use';
const tok = await signDownloadToken({ userId: 'user-1', itemId: 'g001', secret: SECRET, now: 1000000 });
t('token has two parts', tok.split('.').length === 2);

const ok = await verifyDownloadToken(tok, SECRET, 1000000 + 1000);
t('valid token verifies', ok && ok.userId === 'user-1' && ok.itemId === 'g001');

t('wrong secret rejects', (await verifyDownloadToken(tok, 'other-secret', 1000000 + 1000)) === null);

const expired = await verifyDownloadToken(tok, SECRET, 1000000 + DOWNLOAD_TOKEN_TTL_MS + 1);
t('expired token rejects', expired === null);

// Tamper with the payload: flip a character in the body segment.
const [body, sig] = tok.split('.');
const tampered = (body[0] === 'A' ? 'B' : 'A') + body.slice(1) + '.' + sig;
t('tampered payload rejects', (await verifyDownloadToken(tampered, SECRET, 1000000 + 1000)) === null);

// Tamper with the signature segment.
const tamperedSig = body + '.' + (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
t('tampered signature rejects', (await verifyDownloadToken(tamperedSig, SECRET, 1000000 + 1000)) === null);

t('garbage rejects', (await verifyDownloadToken('not-a-token', SECRET)) === null);
t('missing secret rejects', (await verifyDownloadToken(tok, '')) === null);

let threw = false;
try { await signDownloadToken({ userId: '', itemId: 'g001', secret: SECRET }); } catch { threw = true; }
t('signing rejects bad inputs', threw);

console.log(`gallery: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
