// Fortress of Solitude — storage tier catalog + quota math.
//
// REAL Stripe products (collected read-only from the Stripe dashboard,
// all Active, created May 2026 — recurring MONTHLY subscriptions in CAD).
// Price IDs are read from env vars at runtime (FORTRESS_PRICE_*); the
// dashboard IDs below are the fallback ONLY when an env var is unset.
// Display prices are the real dashboard amounts — never invented.
//
// The fifth card, "Secure Pipeline", is not storage at all: it describes the
// real encrypted upload pipeline (client-side AES-GCM-256 via
// lib/fortress/vault-crypto.js). Its button shows pipeline status, never a
// purchase.

export const FREE_TIER_ID = 'free';

// Merlin's call: everyone starts with a 1 GB free allowance, applied when
// their fortress_quotas row is first created.
export const FREE_QUOTA_BYTES = 1_000_000_000;

const GB = 1_000_000_000;
const TB = 1_000_000_000_000;

export const FORTRESS_TIERS = {
  [FREE_TIER_ID]: {
    id: FREE_TIER_ID,
    label: 'Free Vault',
    bytes: FREE_QUOTA_BYTES,
    priceEnv: null, // included — nothing to buy
    priceId: null,
    priceLabel: null,
    productName: null,
    blurb: 'Every vault starts here. 1 GB of encrypted crystal storage, free.',
  },
  '50gb': {
    id: '50gb',
    label: '50 GB',
    bytes: 50 * GB,
    productName: 'Fortress Acolyte',
    priceEnv: 'FORTRESS_PRICE_50GB',
    priceId: 'price_1TbAUzC6BMYhx5j9ZzBPyCyX',
    priceLabel: '$2.00 CAD/month',
    blurb: 'Room for a lifetime of photos, documents, and keepsakes.',
  },
  '250gb': {
    id: '250gb',
    label: '250 GB',
    bytes: 250 * GB,
    productName: 'Fortress Kryptonian',
    priceEnv: 'FORTRESS_PRICE_250GB',
    priceId: 'price_1TbAWHC6BMYhx5j9ZzBPyCyX',
    priceLabel: '$5.00 CAD/month',
    blurb: 'A serious archive — years of video and raw media.',
  },
  '1tb': {
    id: '1tb',
    label: '1 TB',
    bytes: 1 * TB,
    productName: 'Fortress Elder',
    priceEnv: 'FORTRESS_PRICE_1TB',
    priceId: 'price_1TbAXJC6BMYhx5j997KqUX4F',
    priceLabel: '$10.00 CAD/month',
    blurb: 'A full terabyte of encrypted vault space.',
  },
  '5tb': {
    id: '5tb',
    label: '5 TB',
    bytes: 5 * TB,
    productName: 'Fortress God',
    priceEnv: 'FORTRESS_PRICE_5TB',
    priceId: 'price_1TbAYBC6BMYhx5j918mHps5L',
    priceLabel: '$25.00 CAD/month',
    blurb: 'The deep archive — everything, kept forever.',
  },
};

// Ordered card list for the UI (paid tiers ascending).
export const PAID_TIER_IDS = ['50gb', '250gb', '1tb', '5tb'];

/** Look up a tier by id; null for anything unknown (never throw on bad input). */
export function getTier(tierId) {
  return FORTRESS_TIERS[tierId] || null;
}

/** True only for tiers that can actually be purchased. */
export function isPurchasableTier(tierId) {
  const t = getTier(tierId);
  return !!t && t.id !== FREE_TIER_ID;
}

/**
 * Resolve the Stripe Price ID for a tier: env var first, dashboard fallback.
 * Returns null when neither exists (checkout then answers honestly).
 */
export function resolvePriceId(tierId, env = process.env) {
  const t = getTier(tierId);
  if (!t || !isPurchasableTier(tierId)) return null;
  return env[t.priceEnv] || t.priceId || null;
}

/** Human-readable size: 1 GB, 4.2 GB, 50 GB, 1 TB. */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '0 B';
  if (n >= TB) return `${trimNum(n / TB)} TB`;
  if (n >= GB) return `${trimNum(n / GB)} GB`;
  if (n >= 1_000_000) return `${trimNum(n / 1_000_000)} MB`;
  if (n >= 1_000) return `${trimNum(n / 1_000)} KB`;
  return `${n} B`;
}

function trimNum(x) {
  return Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Hard quota gate for the upload path.
 * `usedBytes` = bytes already stored; `incomingBytes` = the new file.
 * Returns { ok, message } — the message is honest UI copy, human-readable.
 */
export function checkQuota({ usedBytes, quotaBytes, incomingBytes }) {
  const used = Math.max(0, Number(usedBytes) || 0);
  const quota = Math.max(0, Number(quotaBytes) || 0);
  const incoming = Math.max(0, Number(incomingBytes) || 0);
  if (used + incoming <= quota) return { ok: true, message: '' };
  return {
    ok: false,
    message: `You've used ${formatBytes(used)} of ${formatBytes(quota)} — upgrade to store more.`,
  };
}

/** Sum of rawSize across a crystal matrix (used to seed used_bytes for legacy files). */
export function sumMatrixBytes(matrix) {
  if (!Array.isArray(matrix)) return 0;
  return matrix.reduce((acc, node) => acc + (Number(node?.rawSize) || 0), 0);
}
