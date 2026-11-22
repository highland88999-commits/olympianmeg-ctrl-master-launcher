// tests/alexandria-wallet-nudge.test.mjs
// Pins for lib/alexandria/wallet-nudge.js — the Studio's payout-address
// nudge at mint time.
//
// Why this exists: a priced book minted without a wallet address leaves the
// author's 97% with nowhere to go when payouts begin, so the Studio asks
// once, gently — but publishing is never blocked. These tests pin the
// decision: priced + no wallet prompts; free books and books with a wallet
// never prompt. "Priced" mirrors the Library's isFree logic
// (app/alexandria/page.tsx): empty, '0', or containing 'free' = free.
import test from 'node:test';
import assert from 'node:assert/strict';
import { needsWalletNudge } from '../lib/alexandria/wallet-nudge.js';

test('priced book with no wallet address prompts', () => {
  assert.equal(needsWalletNudge('0.001', ''), true);
  assert.equal(needsWalletNudge('0.00020', null), true);
  assert.equal(needsWalletNudge('0.001', undefined), true);
});

test('priced book with a whitespace-only wallet still prompts', () => {
  assert.equal(needsWalletNudge('0.001', '   '), true);
});

test('free book with no wallet never prompts', () => {
  assert.equal(needsWalletNudge('', ''), false);
  assert.equal(needsWalletNudge(null, ''), false);
  assert.equal(needsWalletNudge(undefined, undefined), false);
});

test('price "0" never prompts', () => {
  assert.equal(needsWalletNudge('0', ''), false);
});

test('price containing "free" never prompts', () => {
  assert.equal(needsWalletNudge('Free', ''), false);
  assert.equal(needsWalletNudge('free to read', ''), false);
  assert.equal(needsWalletNudge('FREE', ''), false);
});

test('priced book with a wallet address never prompts', () => {
  assert.equal(needsWalletNudge('0.001', 'bc1qexample'), false);
  assert.equal(needsWalletNudge('2', '  bc1qexample  '), false);
});
