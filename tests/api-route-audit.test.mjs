// tests/api-route-audit.test.mjs
// Headless tests for fixes from the API route audit:
// - gallery redeem idempotency keys (lib/gallery.js redeemIdempotencyKey)
// - ARES training export row labeling (lib/ares/training.js labeledRows)
// Run: node tests/api-route-audit.test.mjs (from the repo root).
import { redeemIdempotencyKey } from '../lib/gallery.js';
import { labeledRows } from '../lib/ares/training.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- redeemIdempotencyKey ---
t('client key is used when valid',
  redeemIdempotencyKey('u1', 'g001', 'attempt-abc') === 'redeem:attempt-abc');

const k1 = redeemIdempotencyKey('u1', 'g001');
const k2 = redeemIdempotencyKey('u1', 'g001');
t('no client key -> deterministic per user+item', k1 === 'redeem:u1:g001');
t('deterministic key is stable (no Date.now)', k1 === k2);
t('different users get different keys',
  redeemIdempotencyKey('u1', 'g001') !== redeemIdempotencyKey('u2', 'g001'));
t('different items get different keys',
  redeemIdempotencyKey('u1', 'g001') !== redeemIdempotencyKey('u1', 'g002'));
t('empty client key falls back', redeemIdempotencyKey('u1', 'g001', '') === 'redeem:u1:g001');
t('overlong client key falls back', redeemIdempotencyKey('u1', 'g001', 'x'.repeat(81)) === 'redeem:u1:g001');
t('non-string client key falls back', redeemIdempotencyKey('u1', 'g001', 123) === 'redeem:u1:g001');

// --- labeledRows: only labeled events export, unlabeled are skipped ---
{
  const rows = labeledRows([
    { event_type: 'honeypot_hit', details: { ares_ml: { features: [1, 2], feature_version: 3, threat_class: 'scanner', confidence: 0.9 } }, created_at: '2026-09-30T00:00:00Z' },
    { event_type: 'page_view', details: {}, created_at: '2026-09-30T00:01:00Z' },
    { event_type: 'honeypot_hit', details: null, created_at: '2026-09-30T00:02:00Z' },
  ]);
  t('only labeled events become rows', rows.length === 1);
  t('row carries the label', rows[0] && rows[0].threat_class === 'scanner');
}

console.log(`api-route-audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
