// lib/oracle/constants.js
// ORACLE — the program-request system. Merlin renames everything;
// the program name lives in exactly one constant: ORACLE_NAME.
//
// Model: users petition for new pocket-universe programs with the price
// THEY set (their bounty). Merlin reviews the queue. Approved programs get
// built; every transaction on a requested program carries a flat $1.00
// platform fee to Merlin, settled through the in-house wallet ledger.

export const ORACLE_NAME = 'ORACLE';
export const ORACLE_TAGLINE = 'Ask for a world. Name your price.';

// The nine god-categories a request can be filed under.
export const ORACLE_GOD_CATEGORIES = [
  'ZEUS',
  'HERA',
  'POSEIDON',
  'HADES',
  'ATHENA',
  'APOLLO',
  'ARTEMIS',
  'ARES',
  'HERMES',
];

// Where a request came from: the site form, or filed by Muse from chat.
export const ORACLE_ORIGINS = ['web', 'muse-chat'];

// Request lifecycle.
export const ORACLE_STATUSES = ['pending', 'approved', 'declined', 'built'];

// Flat platform fee per transaction on a requested program, in cents.
export const ORACLE_FEE_CENTS = 100;

// Bounty bounds (cents). $0 = a free idea; cap keeps fat-fingers honest.
export const ORACLE_BOUNTY_MIN_CENTS = 0;
export const ORACLE_BOUNTY_MAX_CENTS = 1000000; // $10,000

// Submission bounds.
export const ORACLE_TITLE_MIN = 3;
export const ORACLE_TITLE_MAX = 120;
export const ORACLE_DESC_MAX = 5000;

/**
 * The $1.00 fee for a transaction of transactionCents.
 * Edge case: on sub-$1.00 transactions the fee is CAPPED at the transaction
 * amount — the fee can never exceed what the transaction was worth.
 * Returns 0 for invalid/non-positive amounts (caller should reject those).
 */
export function oracleFeeCents(transactionCents) {
  const n = Math.round(Number(transactionCents));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(ORACLE_FEE_CENTS, n);
}

/** Idempotency reference for a fee credit: one fee per transaction, ever. */
export function oracleFeeReference(program, transactionRef) {
  const p = String(program || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const r = String(transactionRef || '').trim();
  return `oracle:fee:${p}:${r}`;
}

/**
 * Validate a submission body. Returns { ok, error?, value? } with the
 * cleaned value (title trimmed, bounty in whole cents).
 */
export function validateOracleRequest(body) {
  const title = String(body?.title || '').trim();
  const description = String(body?.description || '').trim();
  const god = String(body?.god_category || 'ATHENA').trim().toUpperCase();
  const bounty = Math.round(Number(body?.bounty_cents));

  if (title.length < ORACLE_TITLE_MIN) return { ok: false, error: `Give it a title (${ORACLE_TITLE_MIN}+ characters).` };
  if (title.length > ORACLE_TITLE_MAX) return { ok: false, error: `Keep the title under ${ORACLE_TITLE_MAX} characters.` };
  if (description.length > ORACLE_DESC_MAX) return { ok: false, error: `Keep the description under ${ORACLE_DESC_MAX} characters.` };
  if (!ORACLE_GOD_CATEGORIES.includes(god)) return { ok: false, error: 'Pick a god-category for your program.' };
  if (!Number.isFinite(bounty) || bounty < ORACLE_BOUNTY_MIN_CENTS) return { ok: false, error: 'The bounty must be zero or more.' };
  if (bounty > ORACLE_BOUNTY_MAX_CENTS) return { ok: false, error: 'The bounty tops out at $10,000 — talk to Merlin directly for more.' };

  return { ok: true, value: { title, description, god_category: god, bounty_cents: bounty } };
}

/** Human label for a status. */
export function oracleStatusLabel(status) {
  switch (status) {
    case 'pending': return 'Under review';
    case 'approved': return 'Approved — queued to build';
    case 'declined': return 'Declined';
    case 'built': return 'Built — live';
    default: return String(status || '');
  }
}

/** Human label for a request origin. */
export function oracleOriginLabel(origin) {
  return origin === 'muse-chat' ? 'via Muse' : 'web form';
}
