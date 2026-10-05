// tests/oracle.test.js — Headless tests for the ORACLE program-request system.
// Run: node tests/oracle.test.js (from the repo root). No browser, no network.
import {
  ORACLE_NAME,
  ORACLE_FEE_CENTS,
  ORACLE_GOD_CATEGORIES,
  ORACLE_STATUSES,
  ORACLE_ORIGINS,
  oracleFeeCents,
  oracleFeeReference,
  validateOracleRequest,
  oracleStatusLabel,
  oracleOriginLabel,
} from '../lib/oracle/constants.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- constants ---
t('name is ORACLE', ORACLE_NAME === 'ORACLE');
t('fee is exactly $1.00', ORACLE_FEE_CENTS === 100);
t('nine god categories', ORACLE_GOD_CATEGORIES.length === 9);
t('ATHENA among categories', ORACLE_GOD_CATEGORIES.includes('ATHENA'));
t('statuses cover the lifecycle',
  JSON.stringify(ORACLE_STATUSES) === JSON.stringify(['pending', 'approved', 'declined', 'built']));

// --- fee math ---
t('fee on $5.99 sale is $1.00', oracleFeeCents(599) === 100);
t('fee on $100 sale is $1.00', oracleFeeCents(10000) === 100);
t('fee on exactly $1.00 sale is $1.00', oracleFeeCents(100) === 100);
t('sub-$1: fee capped at transaction amount ($0.50 -> $0.50)', oracleFeeCents(50) === 50);
t('sub-$1: one cent sale -> one cent fee', oracleFeeCents(1) === 1);
t('zero amount -> no fee', oracleFeeCents(0) === 0);
t('negative amount -> no fee', oracleFeeCents(-50) === 0);
t('garbage input -> no fee', oracleFeeCents('abc') === 0);
t('fee rounds fractional cents', oracleFeeCents(99.6) === 100);

// --- idempotency references ---
t('fee reference is namespaced', oracleFeeReference('neon-garden', 'in_123') === 'oracle:fee:neon-garden:in_123');
t('fee reference differs per transaction', oracleFeeReference('p', 'a') !== oracleFeeReference('p', 'b'));
t('fee reference differs per program', oracleFeeReference('a', 'x') !== oracleFeeReference('b', 'x'));
t('fee reference sanitizes program slug', oracleFeeReference('Neon Garden!', 'in_1').startsWith('oracle:fee:neon-garden-'));

// --- submission validation ---
const good = { title: 'Zero-gravity gardening', description: 'Plants in space.', god_category: 'artemis', bounty_cents: 2500 };
t('valid submission passes', validateOracleRequest(good).ok === true);
t('god category normalized to uppercase', validateOracleRequest(good).value.god_category === 'ARTEMIS');
t('short title rejected', validateOracleRequest({ ...good, title: 'ab' }).ok === false);
t('long title rejected', validateOracleRequest({ ...good, title: 'x'.repeat(121) }).ok === false);
t('bad category rejected', validateOracleRequest({ ...good, god_category: 'LOKI' }).ok === false);
t('negative bounty rejected', validateOracleRequest({ ...good, bounty_cents: -5 }).ok === false);
t('zero bounty allowed (free idea)', validateOracleRequest({ ...good, bounty_cents: 0 }).ok === true);
t('huge bounty rejected', validateOracleRequest({ ...good, bounty_cents: 1000001 }).ok === false);
t('oversize description rejected', validateOracleRequest({ ...good, description: 'x'.repeat(5001) }).ok === false);

// --- labels ---
t('pending label', oracleStatusLabel('pending') === 'Under review');
t('built label mentions live', oracleStatusLabel('built').toLowerCase().includes('live'));

// --- origins ---
t('origins are web + muse-chat', JSON.stringify(ORACLE_ORIGINS) === JSON.stringify(['web', 'muse-chat']));
t('muse-chat label', oracleOriginLabel('muse-chat') === 'via Muse');
t('web label', oracleOriginLabel('web') === 'web form');

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
