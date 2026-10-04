// tests/tiktok-handle.test.mjs
// Headless tests for the TikTok identity contract (Live Recordings, Part 1).
// Run: node tests/tiktok-handle.test.mjs (from the repo root). No browser, no network.
import {
  TIKTOK_HANDLE_RE,
  normalizeTikTokHandle,
  isValidTikTokHandle,
  displayTikTokHandle,
  tiktokProfileUrl,
  buildShareText,
  recordingShareUrl,
} from '../lib/tiktok-attribution.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- Regex contract ---------------------------------------------------------
t('regex accepts simple handle', TIKTOK_HANDLE_RE.test('merlin'));
t('regex accepts dots/underscores/digits', TIKTOK_HANDLE_RE.test('Merlin_Ambros.99'));
t('regex is case-insensitive by class', TIKTOK_HANDLE_RE.test('MERLIN'));
t('regex rejects @', !TIKTOK_HANDLE_RE.test('@merlin'));
t('regex rejects 25 chars', !TIKTOK_HANDLE_RE.test('a'.repeat(25)));
t('regex accepts exactly 24 chars', TIKTOK_HANDLE_RE.test('a'.repeat(24)));
t('regex rejects hyphen', !TIKTOK_HANDLE_RE.test('merlin-ambros'));
t('regex rejects spaces', !TIKTOK_HANDLE_RE.test('mer lin'));

// --- normalizeTikTokHandle ---------------------------------------------------
t('normalize: bare handle passes through', normalizeTikTokHandle('merlin') === 'merlin');
t('normalize: leading @ stripped', normalizeTikTokHandle('@merlin') === 'merlin');
t('normalize: surrounding whitespace trimmed', normalizeTikTokHandle('  @merlin  ') === 'merlin');
t('normalize: case preserved', normalizeTikTokHandle('Merlin_99') === 'Merlin_99');
t('normalize: dots and underscores kept', normalizeTikTokHandle('merlin.ambros_99') === 'merlin.ambros_99');
t('normalize: single char handle valid', normalizeTikTokHandle('x') === 'x');
t('normalize: empty string -> null', normalizeTikTokHandle('') === null);
t('normalize: whitespace-only -> null', normalizeTikTokHandle('   ') === null);
t('normalize: lone @ -> null', normalizeTikTokHandle('@') === null);
t('normalize: double @@ -> null (one strip leaves @)', normalizeTikTokHandle('@@merlin') === null);
t('normalize: too long -> null', normalizeTikTokHandle('a'.repeat(25)) === null);
t('normalize: hyphen -> null', normalizeTikTokHandle('merlin-x') === null);
t('normalize: inner space -> null', normalizeTikTokHandle('mer lin') === null);
t('normalize: non-string null -> null', normalizeTikTokHandle(null) === null);
t('normalize: non-string undefined -> null', normalizeTikTokHandle(undefined) === null);
t('normalize: non-string number -> null', normalizeTikTokHandle(123) === null);
t('normalize: unicode rejected -> null', normalizeTikTokHandle('mërliñ') === null);
t('normalize: @ with trailing space stripped', normalizeTikTokHandle('@merlin ') === 'merlin');

// --- isValidTikTokHandle -----------------------------------------------------
t('valid: true for good handle', isValidTikTokHandle('merlin') === true);
t('valid: true for @-prefixed', isValidTikTokHandle('@merlin_99') === true);
t('valid: false for junk', isValidTikTokHandle('mer lin!') === false);
t('valid: false for empty', isValidTikTokHandle('') === false);

// --- displayTikTokHandle -----------------------------------------------------
t('display: prefixes @', displayTikTokHandle('merlin') === '@merlin');
t('display: tolerates stray @', displayTikTokHandle('@merlin') === '@merlin');
t('display: empty input -> empty string', displayTikTokHandle('') === '');
t('display: null -> empty string', displayTikTokHandle(null) === '');
t('display: invalid -> empty string', displayTikTokHandle('no good!') === '');

// --- tiktokProfileUrl --------------------------------------------------------
t('url: builds profile URL', tiktokProfileUrl('merlin') === 'https://www.tiktok.com/@merlin');
t('url: normalizes @-prefixed input', tiktokProfileUrl('@merlin') === 'https://www.tiktok.com/@merlin');
t('url: null for invalid handle', tiktokProfileUrl('bad handle!') === null);
t('url: null for empty', tiktokProfileUrl('') === null);

// --- buildShareText ----------------------------------------------------------
t('share: with handle', buildShareText({ title: 'Olympus Live', tiktokHandle: 'merlin' }) === '"Olympus Live" — via @merlin on Olympus');
t('share: with @-prefixed handle', buildShareText({ title: 'Clip', tiktokHandle: '@merlin' }) === '"Clip" — via @merlin on Olympus');
t('share: no handle -> plain Olympus', buildShareText({ title: 'Olympus Live' }) === '"Olympus Live" — on Olympus');
t('share: empty handle -> plain Olympus', buildShareText({ title: 'Clip', tiktokHandle: '' }) === '"Clip" — on Olympus');
t('share: invalid handle -> plain Olympus', buildShareText({ title: 'Clip', tiktokHandle: 'no!' }) === '"Clip" — on Olympus');
t('share: null handle -> plain Olympus', buildShareText({ title: 'Clip', tiktokHandle: null }) === '"Clip" — on Olympus');
t('share: title trimmed', buildShareText({ title: '  Clip  ', tiktokHandle: 'merlin' }) === '"Clip" — via @merlin on Olympus');
t('share: missing title degrades', buildShareText({ tiktokHandle: 'merlin' }) === '"" — via @merlin on Olympus');

// --- recordingShareUrl -------------------------------------------------------
t('recording url: builds full URL', recordingShareUrl('https://olympusverse.com', 'abc123') === 'https://olympusverse.com/live-recordings?recording=abc123');
t('recording url: trailing slash trimmed', recordingShareUrl('https://olympusverse.com/', 'abc123') === 'https://olympusverse.com/live-recordings?recording=abc123');
t('recording url: id encoded', recordingShareUrl('https://olympusverse.com', 'a b/c') === 'https://olympusverse.com/live-recordings?recording=a%20b%2Fc');
t('recording url: numeric id ok', recordingShareUrl('https://olympusverse.com', 42) === 'https://olympusverse.com/live-recordings?recording=42');
t('recording url: null for missing id', recordingShareUrl('https://olympusverse.com', '') === null);
t('recording url: null for missing origin', recordingShareUrl('', 'abc123') === null);

console.log(`\ntiktok-handle: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
