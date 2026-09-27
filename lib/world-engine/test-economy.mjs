// Headless tests: credit economy (cost map, tiers, monthly free-tier billing).
import assert from 'node:assert/strict';
import {
  COST_MAP, DEFAULT_COST, costFor, CREDIT_TIERS, tierById,
  FREE_GENERATIONS_PER_MONTH, monthKey, computeBilling, formatBalance,
} from './economy.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`ok - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${e.message}`); process.exitCode = 1; }
};

const JAN = new Date(2026, 0, 15);
const FEB = new Date(2026, 1, 3);

// --- cost map ---
test('keeps the original cost map values', () => {
  assert.equal(COST_MAP.world, 500);
  assert.equal(COST_MAP.weather, 300);
  assert.equal(COST_MAP.character, 200);
  assert.equal(COST_MAP.creature, 200);
  assert.equal(COST_MAP.vehicle, 200);
  assert.equal(COST_MAP.object, 100);
  assert.equal(COST_MAP.weapon, 100);
  assert.equal(COST_MAP.asset_link, 50);
});
test('costFor normalizes case and falls back for unknown categories', () => {
  assert.equal(costFor('WORLD'), 500);
  assert.equal(costFor('Asset_Link'), 50);
  assert.equal(costFor('spaceship'), DEFAULT_COST);
  assert.equal(costFor(undefined), DEFAULT_COST);
  assert.equal(costFor(''), DEFAULT_COST);
});

// --- tiers ---
test('tiers are server-defined with exact token amounts and cent prices', () => {
  assert.equal(CREDIT_TIERS.length, 2);
  assert.deepEqual(tierById('aether-100'), { id: 'aether-100', tokens: 100, cents: 499, label: '100 Aether', price: '$4.99' });
  assert.equal(tierById('aether-1000').tokens, 1000);
  assert.equal(tierById('aether-1000').cents, 1999);
  assert.equal(tierById('nope'), undefined);
});

// --- billing ---
test('brand-new user gets a free generation and starts the month counter', () => {
  const r = computeBilling(null, 500, JAN);
  assert.equal(r.ok, true);
  assert.equal(r.isFree, true);
  assert.equal(r.cost, 0);
  assert.deepEqual(r.updates, { free_used: 1, free_reset_month: monthKey(JAN) });
  assert.equal(r.freeRemaining, FREE_GENERATIONS_PER_MONTH - 1);
});
test('user with free generations left stays free and increments', () => {
  const r = computeBilling({ tokens: 0, free_used: 5, free_reset_month: monthKey(JAN) }, 500, JAN);
  assert.equal(r.ok, true);
  assert.equal(r.isFree, true);
  assert.deepEqual(r.updates, { free_used: 6 });
  assert.equal(r.freeRemaining, FREE_GENERATIONS_PER_MONTH - 6);
});
test('20th free generation leaves zero remaining', () => {
  const r = computeBilling({ tokens: 0, free_used: 19, free_reset_month: monthKey(JAN) }, 100, JAN);
  assert.equal(r.ok, true);
  assert.equal(r.freeRemaining, 0);
  assert.deepEqual(r.updates, { free_used: 20 });
});
test('exhausted free tier with enough tokens deducts the cost', () => {
  const r = computeBilling({ tokens: 600, free_used: 20, free_reset_month: monthKey(JAN) }, 500, JAN);
  assert.equal(r.ok, true);
  assert.equal(r.isFree, false);
  assert.equal(r.cost, 500);
  assert.deepEqual(r.updates, { tokens: 100 });
  assert.equal(r.tokensRemaining, 100);
});
test('exhausted free tier with too few tokens returns 402 data', () => {
  const r = computeBilling({ tokens: 499, free_used: 20, free_reset_month: monthKey(JAN) }, 500, JAN);
  assert.equal(r.ok, false);
  assert.equal(r.required, 500);
  assert.equal(r.available, 499);
});
test('a new calendar month resets the free tier even mid-count', () => {
  const r = computeBilling({ tokens: 10, free_used: 20, free_reset_month: monthKey(JAN) }, 500, FEB);
  assert.equal(r.ok, true);
  assert.equal(r.isFree, true);
  assert.deepEqual(r.updates, { free_used: 1, free_reset_month: monthKey(FEB) });
  assert.equal(r.tokensRemaining, 10); // tokens untouched on free generations
});
test('exact balance can pay the exact cost', () => {
  const r = computeBilling({ tokens: 200, free_used: 20, free_reset_month: monthKey(JAN) }, 200, JAN);
  assert.equal(r.ok, true);
  assert.equal(r.tokensRemaining, 0);
});

// --- misc ---
test('monthKey is stable within a month and differs across months', () => {
  assert.equal(monthKey(new Date(2026, 0, 1)), monthKey(new Date(2026, 0, 31)));
  assert.notEqual(monthKey(new Date(2026, 0, 31)), monthKey(new Date(2026, 1, 1)));
});
test('formatBalance renders a readable credit line', () => {
  assert.equal(formatBalance(1000), '1,000 Aether');
  assert.equal(formatBalance(0), '0 Aether');
  assert.equal(formatBalance(undefined), '0 Aether');
});

console.log(`\n${passed} economy tests passed.`);
