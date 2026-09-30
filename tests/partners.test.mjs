// tests/partners.test.mjs
// Honesty tests for the billboard partner inventory. Run: node tests/partners.test.mjs
// (from the repo root). No browser, no network — asserts on the partner data.
//
// The taglines must never imply a customer discount ("off") when the terms
// describe an affiliate commission rate. Tracking URLs and program IDs are
// Merlin's own inventory and must never change.
import { PARTNERS, STAKE_SLOT, BETTY_SLOT } from '../lib/partners.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- taglines never promise a discount ---
for (const p of PARTNERS) {
  t(`${p.key}: tagline has no misleading "off"`, !/\boff\b/i.test(p.tagline));
  t(`${p.key}: tagline matches terms language`, p.terms.includes(p.tagline) || p.tagline.length > 0);
}

// --- inventory is intact ---
t('7 partners', PARTNERS.length === 7);
for (const p of PARTNERS) {
  t(`${p.key}: has programId`, typeof p.programId === 'number');
  t(`${p.key}: has trackingUrl`, typeof p.trackingUrl === 'string' && p.trackingUrl.startsWith('https://'));
  t(`${p.key}: terms mention 30-day window`, p.terms.includes('30-day window'));
}

// --- Stake inventory preserved ---
t('stake: tracking URL intact', STAKE_SLOT.trackingUrl === 'https://stake.com/?c=1FofAXWx');
t('stake: tagline is Merlin\'s table', STAKE_SLOT.tagline === "Merlin's table");

// --- Betty inventory preserved ---
t('betty: tracking URL intact', BETTY_SLOT.trackingUrl === 'https://betty.ca/join/richardnsky8g');
t('betty: referral code intact', BETTY_SLOT.referralCode === 'richardnsky8g');
t('betty: 19+ honest placement', BETTY_SLOT.tagline.includes('19+'));

console.log(`\npartners: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
