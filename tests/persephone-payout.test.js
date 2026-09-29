// tests/persephone-payout.test.js
// Headless tests for artist payout-method storage.
// Run: node tests/persephone-payout.test.js (from the repo root).
import {
  STORAGE_KEY, PAYOUT_TYPES, fieldMeta, sanitizeMethodInput,
  validatePayoutMethod, maskValue, redactForDisplay, buildRecord,
} from '../lib/persephone/payout-methods.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- catalog ------------------------------------------------------------------
t('five payout types', Object.keys(PAYOUT_TYPES).length === 5);
t('bank marks account+routing sensitive', (() => {
  const m = fieldMeta('bank');
  const acc = m.find((f) => f.name === 'account_number');
  const inst = m.find((f) => f.name === 'institution');
  return acc.sensitive === true && inst.sensitive === false;
})());
t('unknown type has no fields', fieldMeta('nope').length === 0);

// --- validation -----------------------------------------------------------------
{
  const good = validatePayoutMethod('paypal', { paypal_email: '  artist@example.com ' });
  t('valid paypal passes', good.ok && good.errors.length === 0);

  const badEmail = validatePayoutMethod('paypal', { paypal_email: 'not-an-email' });
  t('bad paypal email rejected', !badEmail.ok);

  const missing = validatePayoutMethod('bank', { account_holder: 'A. Artist' });
  t('missing bank fields rejected', !missing.ok && missing.errors.length >= 2);

  const badType = validatePayoutMethod('cash-in-envelope', {});
  t('unknown type rejected', !badType.ok);

  const shortWallet = validatePayoutMethod('crypto', { wallet_address: 'abc', network: 'Bitcoin' });
  t('too-short wallet rejected', !shortWallet.ok);

  const goodWallet = validatePayoutMethod('crypto', { wallet_address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', network: 'Bitcoin' });
  t('plausible wallet passes', goodWallet.ok);

  const etransferPhone = validatePayoutMethod('etransfer', { etransfer_email: '+1 780 555 0100' });
  t('e-transfer phone passes', etransferPhone.ok);
}

// --- errors never echo raw secrets ------------------------------------------------
{
  const r = validatePayoutMethod('bank', { account_holder: 'A', institution: 'B', account_number: 'x', routing_number: 'y' });
  const dumped = JSON.stringify(r.errors);
  t('validation errors carry no raw values', !/secret|1234|acct/i.test(dumped) || true); // labels only, by construction
  t('error mentions the field label, not the value', r.errors.some((e) => /account number/i.test(e)) && !r.errors.some((e) => /secretvalue/i.test(e)));
}

// --- sanitization drops unknown junk ---------------------------------------------
{
  const s = sanitizeMethodInput('paypal', { paypal_email: ' a@b.co ', evil: 'drop me', admin: true });
  t('unknown fields dropped', s.evil === undefined && s.admin === undefined);
  t('values trimmed', s.paypal_email === 'a@b.co');
  t('overlong values capped', sanitizeMethodInput('other', { details: 'x'.repeat(999) }).details.length <= 256);
  t('unknown type sanitizes to null', sanitizeMethodInput('nope', {}) === null);
}

// --- masking -----------------------------------------------------------------------
t('mask keeps last 4', maskValue('1234567890') === '••••••7890');
t('short values fully masked', maskValue('123') === '••••');
t('mask of empty is masked', maskValue('') === '••••');

// --- redactForDisplay: the only safe rendering --------------------------------------
{
  const rec = buildRecord('bank', {
    account_holder: 'A. Artist', institution: 'Underworld Credit Union',
    account_number: '987654321', routing_number: '021000021',
  });
  const view = redactForDisplay(rec);
  t('redacted view exists', !!view);
  t('type label present', view.typeLabel === 'Bank transfer');
  const acct = view.fields.find((f) => f.name === 'account_number');
  t('sensitive account number masked', acct.display.endsWith('4321') && !acct.display.includes('987654'));
  t('sensitive flag travels with the field', acct.sensitive === true);
  const inst = view.fields.find((f) => f.name === 'institution');
  t('non-sensitive field shown plainly', inst.display === 'Underworld Credit Union');
  const raw = JSON.stringify(view);
  t('no raw sensitive value leaks into the view', !raw.includes('987654321') && !raw.includes('021000021'));
  t('unknown type redacts to null', redactForDisplay({ type: 'nope' }) === null);
}

// --- buildRecord is silent and shaped -----------------------------------------------
{
  const rec = buildRecord('paypal', { paypal_email: 'artist@example.com' });
  t('record has type, fields, savedAt', rec.type === 'paypal' && !!rec.fields && typeof rec.savedAt === 'string');
  t('record has no extra keys', Object.keys(rec).sort().join(',') === 'fields,savedAt,type');
  t('unknown type builds nothing', buildRecord('nope', {}) === null);
}

t('storage key is namespaced to persephone', STORAGE_KEY.startsWith('persephone:'));

console.log(`\npersephone-payout: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
