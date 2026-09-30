// Referral System — inquiry helpers (pure, no network, no DOM).
//
// The inquiry form on slide 3 tries a Supabase insert first
// (public.referral_inquiries — see supabase/referral-inquiries.sql, queued,
// not yet run). When the table is missing or the network is down, the entry
// is queued on this device instead of being lost. Nothing is ever claimed
// as sent when it was only saved locally.

export const INQUIRY_QUEUE_KEY = 'referral-inquiries-queue';
export const MAX_QUEUE = 50;

export const MAX_NAME = 120;
export const MAX_EMAIL = 320;
export const MAX_COMPANY = 160;
export const MAX_MESSAGE = 4000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanField(value, max) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);
}

export function validateInquiry({ name, email, company, message }) {
  const cleaned = {
    name: cleanField(name, MAX_NAME),
    email: cleanField(email, MAX_EMAIL).toLowerCase(),
    company: cleanField(company, MAX_COMPANY),
    message: cleanField(message, MAX_MESSAGE),
  };
  const errors = [];
  if (!cleaned.name) errors.push('name');
  if (!cleaned.email || !EMAIL_RE.test(cleaned.email)) errors.push('email');
  if (!cleaned.message) errors.push('message');
  return { valid: errors.length === 0, errors, cleaned };
}

export function buildInquiryRow({ name, email, company, message }) {
  return {
    name: cleanField(name, MAX_NAME),
    email: cleanField(email, MAX_EMAIL).toLowerCase(),
    company: cleanField(company, MAX_COMPANY) || null,
    message: cleanField(message, MAX_MESSAGE),
    pricing_context: 'example-model-3500-cad',
  };
}

function readQueue(storage) {
  try {
    const raw = storage.getItem(INQUIRY_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(storage, queue) {
  try {
    storage.setItem(INQUIRY_QUEUE_KEY, JSON.stringify(queue.slice(0, MAX_QUEUE)));
  } catch {
    /* storage unavailable — the caller already reported the failure */
  }
}

// Save an inquiry on this device. Returns the number of queued entries.
// Used only as a fallback when the cloud insert fails — the UI must say
// "saved on this device", never "sent".
export function queueInquiry(storage, entry) {
  const queue = readQueue(storage);
  queue.push({ ...entry, queued_at: new Date().toISOString() });
  writeQueue(storage, queue);
  return Math.min(queue.length, MAX_QUEUE);
}

export function queuedInquiryCount(storage) {
  return readQueue(storage).length;
}

// mailto fallback so an inquiry can still reach a human when the cloud
// table is not live yet. Kept honest: the page says it opens the visitor's
// own email app.
export const INQUIRY_EMAIL = 'olympiannexus@gmail.com';

export function buildInquiryMailto({ name, email, company, message }) {
  const c = buildInquiryRow({ name, email, company, message });
  const subject = encodeURIComponent('Referral program inquiry — ' + c.name);
  const body = encodeURIComponent(
    'Name: ' + c.name + '\n' +
    'Email: ' + c.email + '\n' +
    'Company: ' + (c.company || '—') + '\n' +
    'Pricing context: $3,500 CAD example model\n\n' +
    c.message
  );
  return `mailto:${INQUIRY_EMAIL}?subject=${subject}&body=${body}`;
}
