// tests/store-custom-creations.test.mjs
// Honesty tests for the Custom Product Designer creator markup step.
// Run: node tests/store-custom-creations.test.mjs (from the repo root).
// No browser, no network — pure helpers only.
//
// The laws under test:
//   - The client submits ONLY a markup; the store price is always
//     baseline + markup, recomputed server-side from the template
//     config. Invalid markup (negative, non-numeric, beyond the
//     fraud/typo guard cap) is rejected, never silently coerced.
//   - A $0 markup is legitimate (sells at base, earns nothing).
//   - Creator attribution survives the round trip through Stripe
//     product metadata (the standing store of record until the
//     store_custom_creations migration runs).
//   - The creator's one-time baseline offer fails CLOSED: redeemed is
//     redeemed, an unverifiable claim stays claimed, only an expired
//     claim frees the offer.
import {
  parseMarkupToCents,
  finalPriceCents,
  centsToCadString,
  MAX_MARKUP_MULTIPLE,
} from '../lib/store/custom-products.js';
import {
  recordFromStripeProduct,
  recordFromRow,
  stripeMetadataForRecord,
  baselineOfferState,
} from '../lib/store/custom-creations.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- markup parsing (baseline CA$35.00 tote) ----------------------------------
const BASE = 3500;
t('absent markup is 0', parseMarkupToCents(undefined, BASE).markupCents === 0);
t('null markup is 0', parseMarkupToCents(null, BASE).markupCents === 0);
t('empty string markup is 0', parseMarkupToCents('', BASE).markupCents === 0);
t('zero markup ok', parseMarkupToCents('0', BASE).ok && parseMarkupToCents(0, BASE).markupCents === 0);
t('dollar string parses', parseMarkupToCents('12.50', BASE).markupCents === 1250);
t('number parses', parseMarkupToCents(7, BASE).markupCents === 700);
t('whitespace trims', parseMarkupToCents(' 20 ', BASE).markupCents === 2000);
t('cents round down', parseMarkupToCents('10.004', BASE).markupCents === 1000);
t('cents round up', parseMarkupToCents('10.006', BASE).markupCents === 1001);
t('non-numeric rejected', !parseMarkupToCents('abc', BASE).ok);
t('NaN rejected', !parseMarkupToCents(NaN, BASE).ok);
t('Infinity rejected', !parseMarkupToCents(Infinity, BASE).ok);
t('negative rejected', !parseMarkupToCents(-1, BASE).ok);
t('negative string rejected', !parseMarkupToCents('-0.01', BASE).ok);
t('over guard cap rejected', !parseMarkupToCents('200', BASE).ok);
t('at guard cap allowed',
  parseMarkupToCents(String(MAX_MARKUP_MULTIPLE * BASE / 100), BASE).markupCents === MAX_MARKUP_MULTIPLE * BASE);
t('cap scales with baseline', parseMarkupToCents('200', 9500).ok);

// --- price math ---------------------------------------------------------------
t('final price is baseline + markup', finalPriceCents(9500, 1250) === 10750);
t('final price with zero markup', finalPriceCents(1500, 0) === 1500);
t('cents format', centsToCadString(10750) === '107.50');
t('cents format small', centsToCadString(5) === '0.05');

// --- attribution record: Stripe metadata round trip ---------------------------
const RECORD = {
  creatorUserId: 'user-1',
  templateKey: 'tote-bag',
  designName: 'Wave',
  productName: 'Tote Bag - Custom: Wave',
  baselineCents: 3500,
  markupCents: 1000,
  finalCents: 4500,
  currency: 'cad',
};
const meta = {
  surface: 'store', custom: 'true', printful_id: '555', product_key: 'tote-bag',
  ...stripeMetadataForRecord(RECORD),
};
const back = recordFromStripeProduct({ id: 'prod_123', metadata: meta });
t('round trip keeps creator', back && back.creatorUserId === 'user-1');
t('round trip keeps printful id', back && back.printfulProductId === '555');
t('round trip keeps stripe id', back && back.stripeProductId === 'prod_123');
t('round trip keeps template', back && back.templateKey === 'tote-bag');
t('round trip keeps baseline', back && back.baselineCents === 3500);
t('round trip keeps markup', back && back.markupCents === 1000);
t('round trip keeps final', back && back.finalCents === 4500);
t('round trip: offer unclaimed', back && back.baselineOfferSessionId === null && back.baselineOfferRedeemedAt === null);
t('non-custom product is not a creation', recordFromStripeProduct({ id: 'p', metadata: {} }) === null);
t('missing printful id is not a creation',
  recordFromStripeProduct({ id: 'p', metadata: { custom: 'true' } }) === null);
t('null product safe', recordFromStripeProduct(null) === null);

// --- attribution record: DB row shape -----------------------------------------
const row = recordFromRow({
  creator_user_id: 'user-2', creator_email: 'a@b.c', template_key: 'hoodie',
  design_name: 'Bolt', product_name: 'Unisex Hoodie - Custom: Bolt',
  printful_product_id: 777, stripe_product_id: 'prod_9',
  baseline_cents: 9500, markup_cents: 0, final_cents: 9500, currency: 'cad',
  baseline_offer_session_id: null, baseline_offer_claimed_at: null,
  baseline_offer_redeemed_at: null, created_at: '2026-10-13T00:00:00Z',
});
t('row: numeric printful id stringified', row.printfulProductId === '777');
t('row: zero markup preserved', row.markupCents === 0);
t('row: creator preserved', row.creatorUserId === 'user-2');
t('null row safe', recordFromRow(null) === null);

// --- baseline offer state machine ---------------------------------------------
t('no record unavailable', baselineOfferState(null, null) === 'unavailable');
t('fresh record available', baselineOfferState({}, null) === 'available');
t('redeemed stays redeemed',
  baselineOfferState({ baselineOfferRedeemedAt: '2026-10-13T00:00:00Z' }, null) === 'redeemed');
t('unverifiable claim fails closed',
  baselineOfferState({ baselineOfferSessionId: 'cs_1' }, null) === 'claimed-open');
t('open session resumed',
  baselineOfferState({ baselineOfferSessionId: 'cs_1' }, { status: 'open', payment_status: 'unpaid' }) === 'claimed-open');
t('paid session means redeemed',
  baselineOfferState({ baselineOfferSessionId: 'cs_1' }, { status: 'complete', payment_status: 'paid' }) === 'claimed-paid');
t('expired claim frees the offer',
  baselineOfferState({ baselineOfferSessionId: 'cs_1' }, { status: 'expired', payment_status: 'unpaid' }) === 'claimed-expired');
t('complete-but-unpaid stays claimed',
  baselineOfferState({ baselineOfferSessionId: 'cs_1' }, { status: 'complete', payment_status: 'unpaid' }) === 'claimed-open');

console.log(`store-custom-creations: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
