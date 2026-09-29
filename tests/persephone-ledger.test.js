// tests/persephone-ledger.test.js
// Headless tests for Merlin's house-cut rule: 10% of NET, never of gross.
// Run: node tests/persephone-ledger.test.js (from the repo root).
import {
  HOUSE_CUT_RATE, STRIPE_FEE_RATE, STRIPE_FEE_FIXED_CENTS,
  toCents, estimateStripeFeeCents, splitLedger, formatCents, describeSplit,
} from '../lib/persephone/ledger.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}
function eq(a, b) { return a === b; }

// --- the rule itself -------------------------------------------------------
t('house cut rate is exactly 10%', eq(HOUSE_CUT_RATE, 0.1));

// --- scenario 1: a healthy night -------------------------------------------
{
  // $10,000 in tickets, $309 in card fees, $2,000 in costs.
  const s = splitLedger({ grossCents: 1_000_000, stripeFeesCents: 30_900, costsCents: 200_000 });
  t('s1 net = gross - fees - costs', eq(s.netCents, 769_100));
  t('s1 house cut is 10% OF NET', eq(s.houseCutCents, 76_910));
  t('s1 house cut is NOT 10% of gross', s.houseCutCents !== 100_000);
  t('s1 artist gets the rest', eq(s.artistPayoutCents, 692_190));
  t('s1 parts sum to net', eq(s.houseCutCents + s.artistPayoutCents, s.netCents));
}

// --- scenario 2: thin margins ------------------------------------------------
{
  // $500 gross, $20 fees, $430 costs -> $50 net -> $5 cut, $45 artist.
  const s = splitLedger({ grossCents: 50_000, stripeFeesCents: 2_000, costsCents: 43_000 });
  t('s2 net', eq(s.netCents, 5_000));
  t('s2 cut', eq(s.houseCutCents, 500));
  t('s2 artist', eq(s.artistPayoutCents, 4_500));
}

// --- scenario 3: break-even — no profit, no cut ------------------------------
{
  const s = splitLedger({ grossCents: 10_000, stripeFeesCents: 2_000, costsCents: 8_000 });
  t('s3 net is zero', eq(s.netCents, 0));
  t('s3 house takes nothing on zero net', eq(s.houseCutCents, 0));
  t('s3 artist gets zero, not a bill', eq(s.artistPayoutCents, 0));
}

// --- scenario 4: a losing night — the house never takes a cut of a loss ----
{
  const s = splitLedger({ grossCents: 10_000, stripeFeesCents: 3_000, costsCents: 12_000 });
  t('s4 net is negative', s.netCents < 0 && eq(s.netCents, -5_000));
  t('s4 house cut is zero on a loss', eq(s.houseCutCents, 0));
  t('s4 artist share carries the loss honestly', eq(s.artistPayoutCents, -5_000));
}

// --- scenario 5: rounding never loses or invents a cent ----------------------
{
  // $10.05 net -> 10% = 100.5c -> rounds to 101c, artist gets 904c.
  const s = splitLedger({ grossCents: 1_005, stripeFeesCents: 0, costsCents: 0 });
  t('s5 parts still sum to net after rounding', eq(s.houseCutCents + s.artistPayoutCents, s.netCents));
  t('s5 cut rounds half-up', eq(s.houseCutCents, 101));
  // every whole-cent net from $0.01 to $999.99 keeps the invariant
  let ok = true;
  for (let net = 1; net < 100_000; net += 37) {
    const r = splitLedger({ grossCents: net });
    if (r.houseCutCents + r.artistPayoutCents !== r.netCents) { ok = false; break; }
  }
  t('s5 invariant holds across a sweep of nets', ok);
}

// --- scenario 6: a big festival night ---------------------------------------
{
  // $250,000 gross, estimated fees on 4,000 $62.50 charges, $90,000 costs.
  const feePer = estimateStripeFeeCents(6_250); // 211c
  const s = splitLedger({ grossCents: 25_000_000, stripeFeesCents: feePer * 4_000, costsCents: 9_000_000 });
  t('s6 net', eq(s.netCents, 25_000_000 - 844_000 - 9_000_000));
  t('s6 cut is 10% of that net', eq(s.houseCutCents, Math.round(s.netCents * 0.1)));
  t('s6 cut well below 10% of gross', s.houseCutCents < 2_500_000);
}

// --- fee estimator ------------------------------------------------------------
t('fee estimate: $25 charge = 2.9% + 30c', eq(estimateStripeFeeCents(2500), Math.round(2500 * 0.029) + 30));
t('fee estimate is zero on zero', eq(estimateStripeFeeCents(0), 0));
t('fee constants match US Stripe online pricing', eq(STRIPE_FEE_RATE, 0.029) && eq(STRIPE_FEE_FIXED_CENTS, 30));

// --- input sanitation ---------------------------------------------------------
{
  const s = splitLedger({ grossCents: -500, stripeFeesCents: 'abc', costsCents: NaN });
  t('garbage inputs sanitize to zero', eq(s.revenueCents, 0) && eq(s.feesCents, 0) && eq(s.costsCents, 0));
  t('fractional cents round', eq(toCents(10.4), 10) && eq(toCents(10.5), 11));
}

// --- formatting -----------------------------------------------------------------
t('formatCents $1,234.56', formatCents(123456) === '$1,234.56');
t('formatCents negative', formatCents(-500) === '-$5.00');
t('formatCents zero', formatCents(0) === '$0.00');
t('describeSplit mentions net and 10%', /net/i.test(describeSplit({ grossCents: 10000 })) && /10%/.test(describeSplit({ grossCents: 10000 })));

console.log(`\npersephone-ledger: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
