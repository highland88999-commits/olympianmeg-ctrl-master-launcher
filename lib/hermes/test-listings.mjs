// lib/hermes/test-listings.mjs
// Headless tests for the Hermes directory logic. Run: node lib/hermes/test-listings.mjs
import {
  normalizeUrl,
  extractRootDomain,
  validateSubmission,
  isDuplicateDomain,
  scrubCutoffIso,
  isStalePending,
  listingExpiryIso,
  buildLineItem,
  CATEGORIES,
  CATEGORY_SLUGS,
  LISTING_FEE_CENTS,
  LISTING_TERM_MONTHS,
  MAX_NAME_LENGTH,
  LISTING_TERMS,
} from './listings.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- normalizeUrl ---
t('normalizeUrl: adds https:// when missing', normalizeUrl('example.com').ok === true && normalizeUrl('example.com').url.startsWith('https://'));
t('normalizeUrl: accepts full https url', normalizeUrl('https://example.com/path?q=1').ok === true);
t('normalizeUrl: rejects empty', normalizeUrl('').ok === false);
t('normalizeUrl: rejects non-string', normalizeUrl(null).ok === false);
t('normalizeUrl: rejects garbage', normalizeUrl('not a url at all !!!').ok === false);
t('normalizeUrl: rejects non-web protocol', normalizeUrl('ftp://example.com').ok === false);
t('normalizeUrl: trims whitespace', normalizeUrl('  https://example.com  ').ok === true);

// --- extractRootDomain ---
t('extractRootDomain: strips www', extractRootDomain('https://www.example.com') === 'example.com');
t('extractRootDomain: lowercases', extractRootDomain('https://WWW.EXAMPLE.COM') === 'example.com');
t('extractRootDomain: keeps subdomain', extractRootDomain('https://shop.example.com') === 'shop.example.com');
t('extractRootDomain: invalid -> null', extractRootDomain('not a url !!!') === null);

// --- validateSubmission ---
const good = validateSubmission({ name: 'My Shop', url: 'https://myshop.com', category: 'food' });
t('validateSubmission: happy path', good.ok === true && good.data.rootDomain === 'myshop.com' && good.data.category === 'food');
t('validateSubmission: missing name', validateSubmission({ name: '', url: 'https://a.com', category: 'food' }).ok === false);
t('validateSubmission: bad url', validateSubmission({ name: 'x', url: 'not a url !!!', category: 'food' }).ok === false);
t('validateSubmission: unknown category', validateSubmission({ name: 'x', url: 'https://a.com', category: 'nope' }).ok === false);
t('validateSubmission: long name rejected', validateSubmission({ name: 'x'.repeat(MAX_NAME_LENGTH + 1), url: 'https://a.com', category: 'food' }).ok === false);
t('validateSubmission: name exactly at limit ok', validateSubmission({ name: 'x'.repeat(MAX_NAME_LENGTH), url: 'https://a.com', category: 'food' }).ok === true);
t('validateSubmission: trims fields', validateSubmission({ name: '  Shop  ', url: '  shop.com ', category: 'food' }).data.name === 'Shop');

// --- isDuplicateDomain ---
t('isDuplicateDomain: match', isDuplicateDomain('example.com', ['other.com', 'example.com']) === true);
t('isDuplicateDomain: case-insensitive', isDuplicateDomain('EXAMPLE.com', ['example.com']) === true);
t('isDuplicateDomain: no match', isDuplicateDomain('new.com', ['example.com']) === false);
t('isDuplicateDomain: empty list', isDuplicateDomain('new.com', []) === false);
t('isDuplicateDomain: bad input safe', isDuplicateDomain(null, ['a.com']) === false);

// --- scrub helpers ---
const now = Date.UTC(2026, 8, 27, 12, 0, 0);
t('scrubCutoffIso: 24h back', scrubCutoffIso(now) === new Date(now - 24 * 3600 * 1000).toISOString());
t('isStalePending: old -> true', isStalePending(new Date(now - 25 * 3600 * 1000).toISOString(), now) === true);
t('isStalePending: fresh -> false', isStalePending(new Date(now - 1 * 3600 * 1000).toISOString(), now) === false);
t('isStalePending: invalid date -> false', isStalePending('not-a-date', now) === false);

// --- expiry ---
const exp = new Date(listingExpiryIso(now));
t('listingExpiryIso: 12 months out', exp.getUTCFullYear() === 2027 && exp.getUTCMonth() === 8);

// --- line item ---
const item = buildLineItem(good.data);
t('buildLineItem: server-priced 200 cents', item.unit_amount === LISTING_FEE_CENTS && item.currency === 'usd');
t('buildLineItem: mentions domain', item.description.includes('myshop.com'));

// --- constants ---
t('fee: $2.00', LISTING_FEE_CENTS === 200 && LISTING_TERM_MONTHS === 12);
t('terms summary mentions fee and term', LISTING_TERMS.summary.includes('$2.00') && LISTING_TERMS.summary.includes('12 months'));
t('categories: non-empty plain labels', CATEGORY_SLUGS.length > 10 && Object.values(CATEGORIES).every((l) => typeof l === 'string' && l.length > 0));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
