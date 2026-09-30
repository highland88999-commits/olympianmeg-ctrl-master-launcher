// tests/referral-inquiry.test.mjs — pure inquiry helpers for /referral-system.
// Run: node tests/referral-inquiry.test.mjs (from the repo root).
// Covers: validation, field cleaning/limits, the on-device queue fallback,
// and the mailto fallback. No browser, no network.
import {
  validateInquiry, buildInquiryRow, cleanField,
  queueInquiry, queuedInquiryCount,
  buildInquiryMailto, INQUIRY_EMAIL, INQUIRY_QUEUE_KEY,
  MAX_NAME, MAX_EMAIL, MAX_COMPANY, MAX_MESSAGE, MAX_QUEUE,
} from '../app/referral-system/inquiry.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

const good = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  company: 'Acme Corp',
  message: 'We have 200 affiliates and want a referral program.',
};

// --- validation ------------------------------------------------------------
{
  const r = validateInquiry(good);
  t('valid inquiry passes', r.valid && r.errors.length === 0);
  t('cleaned values are trimmed + lowercased email',
    r.cleaned.name === 'Jane Doe' && r.cleaned.email === 'jane@example.com');
}
t('missing name fails', !validateInquiry({ ...good, name: '  ' }).valid);
t('missing name names the field', validateInquiry({ ...good, name: '' }).errors.includes('name'));
t('bad email fails', !validateInquiry({ ...good, email: 'not-an-email' }).valid);
t('email without domain fails', !validateInquiry({ ...good, email: 'jane@' }).valid);
t('missing message fails', validateInquiry({ ...good, message: '' }).errors.includes('message'));
{
  const r = validateInquiry({ ...good, company: '' });
  t('company is optional', r.valid && r.cleaned.company === '');
}
{
  const r = validateInquiry({ ...good, email: '  JANE@Example.COM ' });
  t('email is trimmed and lowercased', r.valid && r.cleaned.email === 'jane@example.com');
}

// --- cleaning / limits -------------------------------------------------------
t('cleanField collapses whitespace', cleanField('a  b\nc', 50) === 'a b c');
t('cleanField enforces max length', cleanField('x'.repeat(500), MAX_NAME).length === MAX_NAME);
t('cleanField tolerates null/undefined', cleanField(null, 10) === '' && cleanField(undefined, 10) === '');
{
  const row = buildInquiryRow({ ...good, name: 'y'.repeat(500), message: 'z'.repeat(9000) });
  t('row name is capped', row.name.length === MAX_NAME);
  t('row message is capped', row.message.length === MAX_MESSAGE);
  t('row email is capped', buildInquiryRow({ ...good, email: 'e'.repeat(400) + '@x.com' }).email.length === MAX_EMAIL);
  t('row company is capped', buildInquiryRow({ ...good, company: 'c'.repeat(500) }).company.length === MAX_COMPANY);
  t('empty company becomes null', buildInquiryRow({ ...good, company: '' }).company === null);
  t('row carries the pricing context', row.pricing_context === 'example-model-3500-cad');
}

// --- on-device queue (offline fallback) --------------------------------------
{
  const s = memStorage();
  t('queue starts empty', queuedInquiryCount(s) === 0);
  const n = queueInquiry(s, buildInquiryRow(good));
  t('queueInquiry returns the count', n === 1);
  t('queued entry is readable', queuedInquiryCount(s) === 1);
  queueInquiry(s, buildInquiryRow({ ...good, email: 'b@example.com' }));
  t('second entry appends', queuedInquiryCount(s) === 2);
  const raw = JSON.parse(s.getItem(INQUIRY_QUEUE_KEY));
  t('queued entries carry a timestamp', typeof raw[0].queued_at === 'string');
  t('queued entries keep the email', raw[1].email === 'b@example.com');
}
{
  const s = memStorage();
  for (let i = 0; i < MAX_QUEUE + 20; i++) queueInquiry(s, buildInquiryRow(good));
  t('queue is capped', queuedInquiryCount(s) === MAX_QUEUE);
}
{
  const s = memStorage();
  s.setItem(INQUIRY_QUEUE_KEY, 'not-json{{{');
  t('corrupt queue reads as empty', queuedInquiryCount(s) === 0);
  t('queueInquiry recovers from corrupt storage', queueInquiry(s, buildInquiryRow(good)) === 1);
}
{
  // Storage that throws on write — must never throw.
  const s = { getItem: () => null, setItem: () => { throw new Error('denied'); } };
  t('queueInquiry tolerates unwritable storage', (() => { queueInquiry(s, buildInquiryRow(good)); return true; })());
}

// --- mailto fallback ----------------------------------------------------------
{
  const link = buildInquiryMailto(good);
  t('mailto targets the program inbox', link.startsWith('mailto:' + INQUIRY_EMAIL + '?'));
  t('mailto carries a subject', link.includes('subject='));
  t('mailto carries the message', link.includes(encodeURIComponent('We have 200 affiliates')));
  t('inquiry email is the program contact', INQUIRY_EMAIL === 'olympiannexus@gmail.com');
}

console.log(`referral-inquiry: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
