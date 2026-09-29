// lib/persephone/payout-methods.js
// Artist payout-method storage for PERSEPHONE.
//
// SCOPE: ledger + method selection ONLY. Real money movement (actual
// payouts) is out of scope — Stripe Connect is the future payout path.
// See the module report for the Stripe Connect note.
//
// Rules enforced here:
// - Store only what's needed per method type (see PAYOUT_TYPES).
// - Every sensitive field is flagged in the UI; the UI must render the
//   "sensitive" flag as a lock warning. `fieldMeta()` gives the flags.
// - `redactForDisplay()` is the ONLY thing the UI may render for a saved
//   method — raw values never go on screen.
// - This module NEVER logs field values. `validatePayoutMethod` and
//   `sanitizeMethodInput` are pure and silent.
// - In this pass methods persist to the artist's own browser localStorage
//   only (key below). They are never sent to any server, never committed,
//   never logged.

export const STORAGE_KEY = 'persephone:payout-method';

export const PAYOUT_TYPES = {
  bank: {
    label: 'Bank transfer',
    fields: [
      { name: 'account_holder', label: 'Account holder name', sensitive: true },
      { name: 'institution', label: 'Bank / institution', sensitive: false },
      { name: 'account_number', label: 'Account number', sensitive: true },
      { name: 'routing_number', label: 'Routing / transit number', sensitive: true },
    ],
  },
  etransfer: {
    label: 'Interac e-Transfer',
    fields: [{ name: 'etransfer_email', label: 'Email or phone for e-Transfer', sensitive: true }],
  },
  paypal: {
    label: 'PayPal',
    fields: [{ name: 'paypal_email', label: 'PayPal email', sensitive: true }],
  },
  crypto: {
    label: 'Crypto wallet',
    fields: [
      { name: 'wallet_address', label: 'Wallet address', sensitive: true },
      { name: 'network', label: 'Network (e.g. Bitcoin, Ethereum)', sensitive: false },
    ],
  },
  other: {
    label: 'Something else',
    fields: [{ name: 'details', label: 'How should we pay you?', sensitive: true }],
  },
};

const MAX_FIELD_LEN = 256;

/** Field metadata for a method type: [{ name, label, sensitive }]. */
export function fieldMeta(type) {
  const def = PAYOUT_TYPES[type];
  return def ? def.fields.map((f) => ({ ...f })) : [];
}

/** Keep only known fields, trimmed, capped. Unknown junk is dropped. */
export function sanitizeMethodInput(type, rawFields) {
  const def = PAYOUT_TYPES[type];
  if (!def) return null;
  const raw = rawFields && typeof rawFields === 'object' ? rawFields : {};
  const out = {};
  for (const f of def.fields) {
    const v = raw[f.name];
    out[f.name] = typeof v === 'string' ? v.trim().slice(0, MAX_FIELD_LEN) : '';
  }
  return out;
}

/**
 * Validate a payout method. Returns { ok, errors[] }.
 * Never includes raw field values in errors — only field labels.
 */
export function validatePayoutMethod(type, rawFields) {
  const errors = [];
  if (!PAYOUT_TYPES[type]) {
    return { ok: false, errors: ['Pick a payout method type.'] };
  }
  const fields = sanitizeMethodInput(type, rawFields);
  for (const f of PAYOUT_TYPES[type].fields) {
    const v = fields[f.name];
    if (!v) {
      errors.push(`${f.label} is required.`);
      continue;
    }
    if (type === 'paypal' && f.name === 'paypal_email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      errors.push('That PayPal email doesn\u2019t look like an email address.');
    }
    if (type === 'etransfer' && f.name === 'etransfer_email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !/^\+?[0-9 ()-]{7,}$/.test(v)) {
      errors.push('That doesn\u2019t look like an email or phone number.');
    }
    if (type === 'crypto' && f.name === 'wallet_address' && v.length < 20) {
      errors.push('That wallet address looks too short to be real.');
    }
    if (type === 'bank' && f.name === 'account_number' && v.replace(/\D/g, '').length < 4) {
      errors.push('The account number looks too short.');
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Mask a value: keep the last 4 characters, mask the rest. */
export function maskValue(value) {
  const v = String(value || '');
  if (v.length <= 4) return '••••';
  return '•'.repeat(Math.min(v.length - 4, 24)) + v.slice(-4);
}

/**
 * The ONLY safe rendering of a saved method.
 * Returns { type, typeLabel, fields: [{ name, label, sensitive, display }] }.
 * Raw values never leave this module except inside the masked display.
 */
export function redactForDisplay(record) {
  if (!record || !PAYOUT_TYPES[record.type]) return null;
  const def = PAYOUT_TYPES[record.type];
  const fields = sanitizeMethodInput(record.type, record.fields || {});
  return {
    type: record.type,
    typeLabel: def.label,
    savedAt: typeof record.savedAt === 'string' ? record.savedAt : null,
    fields: def.fields.map((f) => ({
      name: f.name,
      label: f.label,
      sensitive: f.sensitive,
      display: f.sensitive ? maskValue(fields[f.name]) : fields[f.name] || '—',
    })),
  };
}

/** Build the stored record. Pure, silent — logs nothing. */
export function buildRecord(type, rawFields) {
  const fields = sanitizeMethodInput(type, rawFields);
  if (!fields) return null;
  return { type, fields, savedAt: new Date().toISOString() };
}
