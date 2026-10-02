// tests/economy-gold.test.mjs — Worker D (economy-skins), Tron batch
// Run: node tests/economy-gold.test.mjs   (no browser, no network, no DB)
// Covers:
//   1. monthKey boundaries (month rollover, UTC)
//   2. collect idempotency logic (gate, key stability, ledger-unit bridge)
//   3. store hoodie discount cap math ($15/hoodie, multi-hoodie, never-negative)

import {
  monthKey,
  collectIdempotencyKey,
  isKnownMonthlySource,
  sourceCreditLiquid,
  availableThisMonth,
  alreadyCollected,
  ledgerUnitsForLiquid,
  LIQUID_PER_DOLLAR,
  dollarsToLiquid,
  liquidToDollars,
} from '../lib/gold/monthly.js';

import {
  HOODIE_GOLD_DISCOUNT_CAP_CENTS,
  MAX_QTY_PER_LINE,
  isHoodieProduct,
  hoodieLineCapCents,
  hoodieDiscountCapForOrder,
} from '../lib/gold/store-discount.js';

import { computeGoldDiscount, ECONOMY } from '../lib/economy/config.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const U = 'user-1';

// ---------------------------------------------------------------- 1. monthKey
t('monthKey: Oct 2026', monthKey('2026-10-02T09:46:12-06:00') === '2026-10');
t('monthKey: rollover boundary (Oct 31 23:59:59Z)', monthKey('2026-10-31T23:59:59Z') === '2026-10');
t('monthKey: rollover boundary (Nov 1 00:00:00Z)', monthKey('2026-11-01T00:00:00Z') === '2026-11');
t('monthKey: UTC is authoritative (Oct 31 18:30 MDT is Nov 1 UTC)',
  monthKey('2026-10-31T18:30:00-06:00') === '2026-11');
t('monthKey: year boundary (Dec 31 -> Jan)', monthKey('2026-12-31T23:00:00Z') === '2026-12'
  && monthKey('2027-01-01T00:00:00Z') === '2027-01');
t('monthKey: zero-pads months', monthKey('2026-03-05T12:00:00Z') === '2026-03');
t('monthKey: Date object input', monthKey(new Date('2026-10-02T00:00:00Z')) === '2026-10');
t('monthKey: epoch ms input', monthKey(1791043200000) === monthKey(new Date(1791043200000)));
let threw = false;
try { monthKey('not-a-date'); } catch { threw = true; }
t('monthKey: invalid date throws', threw);

// ---------------------------------------------------------------- 2. collect idempotency
t('registry includes guillotine-gold-piece', isKnownMonthlySource('guillotine-gold-piece'));
t('unknown source rejected', !isKnownMonthlySource('nope'));
let threwUnknown = false;
try { sourceCreditLiquid('nope'); } catch { threwUnknown = true; }
t('sourceCreditLiquid throws on unknown source', threwUnknown);

t('collectIdempotencyKey is stable for same user+source+month',
  collectIdempotencyKey(U, 'guillotine-gold-piece', '2026-10') ===
  collectIdempotencyKey(U, 'guillotine-gold-piece', '2026-10'));
t('collectIdempotencyKey differs across months',
  collectIdempotencyKey(U, 'guillotine-gold-piece', '2026-10') !==
  collectIdempotencyKey(U, 'guillotine-gold-piece', '2026-11'));
t('collectIdempotencyKey differs across users',
  collectIdempotencyKey(U, 'guillotine-gold-piece', '2026-10') !==
  collectIdempotencyKey('user-2', 'guillotine-gold-piece', '2026-10'));

const rows = [
  { source_id: 'guillotine-gold-piece', month: '2026-09' }, // last month: gone
  { source_id: 'olympus-cache', month: '2026-10' },
];
t('availableThisMonth excludes already-collected source this month',
  !availableThisMonth(rows, '2026-10').some((s) => s.id === 'olympus-cache'));
t('availableThisMonth restores last-month source this month',
  availableThisMonth(rows, '2026-10').some((s) => s.id === 'guillotine-gold-piece'));
t('alreadyCollected true for same month', alreadyCollected(rows, 'olympus-cache', '2026-10'));
t('alreadyCollected false for a fresh month', !alreadyCollected(rows, 'olympus-cache', '2026-11'));

t('LIQUID_PER_DOLLAR is 100000 (v2)', LIQUID_PER_DOLLAR === 100_000);
t('dollarsToLiquid($15) is 1,500,000', dollarsToLiquid(15) === 1_500_000);
t('liquidToDollars(1,500,000) is $15', liquidToDollars(1_500_000) === 15);
t('ledgerUnitsForLiquid bridges v1 ledger units (x100)', ledgerUnitsForLiquid(100_000) === 1000);
t('ledgerUnitsForLiquid(25,000 liquid guillotine piece) = 250 units',
  ledgerUnitsForLiquid(sourceCreditLiquid('guillotine-gold-piece')) === 250);
t('ledgerUnitsForLiquid floors, never negative', ledgerUnitsForLiquid(0) === 0 && ledgerUnitsForLiquid(-5) === 0);

// ---------------------------------------------------------------- 3. store discount cap math
t('cap constant is 1500 cents ($15)', HOODIE_GOLD_DISCOUNT_CAP_CENTS === 1500);

t('isHoodieProduct detects hoodie names',
  isHoodieProduct('Omega Store - Premium Unisex Hoodie') &&
  isHoodieProduct('HOODIE') && isHoodieProduct('Track Hoodie (L)'));
t('isHoodieProduct rejects non-hoodies',
  !isHoodieProduct('Premium T-Shirt') && !isHoodieProduct('') && !isHoodieProduct(null));

t('hoodieLineCapCents: $95 line -> $15', hoodieLineCapCents(9500, 1) === 1500);
t('hoodieLineCapCents: $12 line -> capped at line total', hoodieLineCapCents(1200, 1) === 1200);
t('hoodieLineCapCents: never negative', hoodieLineCapCents(-100, 1) === 0 && hoodieLineCapCents(9500, 0) === 0);

const oneHoodie = hoodieDiscountCapForOrder([{ name: 'Premium Hoodie', unitCents: 9500, qty: 1 }]);
t('order: 1 hoodie -> 1 unit, $15 cap', oneHoodie.hoodieUnits === 1 && oneHoodie.maxDiscountCents === 1500);
t('order: 1 hoodie totals $95', oneHoodie.totalCents === 9500);

const twoHoodies = hoodieDiscountCapForOrder([
  { name: 'Premium Hoodie', unitCents: 9500, qty: 1 },
  { name: 'Camouflage Hoodie', unitCents: 9500, qty: 1 },
]);
t('order: 2 hoodies -> $30 cap ($15 each)', twoHoodies.hoodieUnits === 2 && twoHoodies.maxDiscountCents === 3000);
t('order: 2 hoodies totals $190', twoHoodies.totalCents === 19000);

const mixed = hoodieDiscountCapForOrder([
  { name: 'Premium Hoodie', unitCents: 9500, qty: 1 },
  { name: 'Sticker Pack', unitCents: 500, qty: 2 },
]);
t('order: mixed cart caps hoodie line only', mixed.hoodieUnits === 1 && mixed.maxDiscountCents === 1500 + 1000);
t('order: cap never exceeds order total', mixed.maxDiscountCents <= mixed.totalCents);

const cheapHoodie = hoodieDiscountCapForOrder([{ name: 'Kid Hoodie', unitCents: 1200, qty: 2 }]);
t('order: cheap hoodies cap at line totals', cheapHoodie.maxDiscountCents === 2400);

const clamped = hoodieDiscountCapForOrder([{ name: 'Premium Hoodie', unitCents: 9500, qty: 999 }]);
t('order: qty clamped to MAX_QTY_PER_LINE', clamped.hoodieUnits === MAX_QTY_PER_LINE
  && clamped.maxDiscountCents === 1500 * MAX_QTY_PER_LINE);

t('order: junk lines ignored', (() => {
  const r = hoodieDiscountCapForOrder([
    { name: 'Premium Hoodie', unitCents: 9500, qty: 1 },
    { name: 'Bad', unitCents: 0, qty: 1 },
    { name: 'Bad', unitCents: 500, qty: -2 },
    null,
  ]);
  return r.hoodieUnits === 1 && r.maxDiscountCents === 1500 && r.totalCents === 9500;
})());

// computeGoldDiscount with the server cap (modified lib/economy/config.js)
const rich = 50_000_000; // plenty of gold (v1 units: 50k gold = $50 at 1000/$1)
const oneCap = computeGoldDiscount(rich, 9500, { maxDiscountCents: 1500 });
t('checkout: $15 cap holds on one $95 hoodie', oneCap.discountCents === 1500 && oneCap.chargeCents === 8000);

const twoCap = computeGoldDiscount(rich, 19000, { maxDiscountCents: 3000 });
t('checkout: $30 cap holds on two $95 hoodies', twoCap.discountCents === 3000 && twoCap.chargeCents === 16000);

const poorBalance = computeGoldDiscount(5000 /* $5 of gold */, 9500, { maxDiscountCents: 1500 });
t('checkout: low balance caps below $15', poorBalance.discountCents === 500 && poorBalance.chargeCents === 9000);

const noCap = computeGoldDiscount(rich, 9500);
t('checkout: no cap = uncapped legacy behavior', noCap.discountCents === 9500 && noCap.paidByGold);

const zeroCap = computeGoldDiscount(rich, 9500, { maxDiscountCents: 0 });
t('checkout: non-positive cap treated as uncapped', zeroCap.discountCents === 9500);

t('checkout: totals never negative', (() => {
  const r = computeGoldDiscount(rich, 9500, { maxDiscountCents: 1500 });
  return r.chargeCents >= 0 && r.discountCents >= 0 && r.discountCents + r.chargeCents === 9500;
})());

t('checkout: discount never exceeds order total', (() => {
  const r = computeGoldDiscount(rich, 1200, { maxDiscountCents: 1500 });
  return r.discountCents <= 1200 && r.chargeCents >= 0;
})());

// backward-compat: two-arg call still works (other surfaces)
t('checkout: legacy 2-arg signature intact',
  computeGoldDiscount(20000, 1000).discountCents === 1000); // 20000 gold = $20 (v1 units)

console.log(`\neconomy-gold: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
