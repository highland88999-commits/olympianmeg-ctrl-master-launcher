# Gold Economy — in-house credit across every paid surface

**Date:** 2026-09-29 UTC · **Branch:** `economy-gold-redemption` · **Status:** tested, built, merged to `main`

Merlin's request: users can mine gold **and** earn a small amount for staying in and using the app. Gold is in-house credit — dollars off the bill at checkout, wired across Stripe and every paid surface.

## What "gold" is

- User-facing name: **gold** (Merlin's word).
- Earned two ways:
  1. **Liquid Gold** — the pour → refine → mint → sell loop. Claims are **server-replayed through the real game engine**; the client sends only an action log, never a number.
  2. **Engagement** — 1 gold per active minute (tab visible, throttled heartbeat), capped at **60 gold/day**.
- Spent **only** as dollars-off at checkout: up to 100% of a bill, never more, never negative, no change.
- **Cannot** be bought, cashed out, transferred, converted to crypto, or bridged. No purchase flow exists and none is planned.

## The rules, enforced server-side

- **Append-only ledger** (`gold_ledger` + `gold_balances`), one row per idempotency key. Double-submits return the existing row — never double-credit, never double-debit.
- **Every mutation goes through a server API route.** The client never sends gold amounts — it sends intent ("use my gold"); the server computes everything from its own balance read.
- **Debit happens BEFORE/AT charge creation** (Merlin's explicit requirement): card-path gold is debited first, then the Stripe session is created for the discounted remainder.
- **100% cover = no Stripe call.** Paid-by-gold checkouts fulfill directly as `paid_by_gold`.
- Every credit/debit requires a **reason** and an **idempotency key**.
- **Rate-limited:** engagement (60/day) and mining (2,000/day default) caps enforced inside the `gold_apply()` SQL function, per UTC day.
- Whole cents only — fractional remainder stays gold.
- Stripe minimum charge ($0.50) honored: if gold would leave a sub-$0.50 remainder, gold is dialed back so the card is charged exactly $0.50.
- Supabase unconfigured → honest **503** ("gold service is not connected yet"), never a fake balance.

## Paid surfaces wired

| Surface | Bill | Gold path |
|---|---|---|
| World Engine Aether packs (`/world-engine/credits`) | 3 tiers | Partial → discounted Stripe session; full → Aether granted as paid-by-gold |
| Luge Arsenal (`/luge`) | $129 | Same split; full cover unlocks the pack without Stripe |
| Olympus goods (`/olympus`) | cart total | Same split; partial uses a one-time Stripe coupon (idempotent via `coupon_olympus_<key>`) |
| Hermes listings (`/hermes`) | $2 | Same split; full cover activates the listing immediately |

Hermes stays guest-friendly for card checkout; **sign-in is required only when applying gold** (the ledger is per-user).

## New files

- `lib/economy/config.js` — tunables + checkout math (`computeGoldDiscount`, `centsForGold`, `goldForCents`, `formatGold`).
- `lib/economy/supabase.js` — lazy service-role client, test injection.
- `lib/economy/auth.js` — bearer-token Supabase session verification.
- `lib/economy/ledger.js` — `applyLedger`/`creditGold`/`debitGold`/`getBalance`; typed errors (503/409/429/400).
- `lib/economy/checkout.js` — shared gold checkout: discount math → debit → Stripe session (idempotent) **or** paid-by-gold fulfillment; compensating credit if Stripe session creation fails after debit.
- `lib/economy/mining.js` — server replay of Liquid Gold action logs through the real engine; prefix-hash idempotency per sell.
- `lib/economy/heartbeat.js` — engagement idempotency-key derivation.
- `supabase/gold.sql` — `gold_ledger`, `gold_balances`, owner-read RLS only (no client writes), transactional `gold_apply()` with row locking, idempotency, daily caps, non-negative enforcement. **Folds into the final consolidated SQL; run it in Merlin's Supabase dashboard.**
- `app/api/economy/balance/route.js`, `app/api/economy/heartbeat/route.js`, `app/api/economy/mine/claim/route.js`
- `components/economy/EconomyHeartbeat.jsx` (global, 60s, pauses when tab hidden), `GoldCheckoutOption.jsx` (checkbox + live balance + estimate), `GoldBalance.jsx`.

## Changed

- `app/layout.jsx` — mounts the global heartbeat.
- `app/liquid-gold/page.jsx` — stamps action log with completed tick counts, submits sells for server verification, in-game credits clearly labeled as game credits (not gold); shows gold balance + verify notices.
- All four checkout server routes + their UIs (World Engine, Luge, Olympus, Hermes).

## Tests — 54/54 pass (`tests/economy.test.mjs`)

- Discount math: partial, full, exact, zero balance, sub-$0.50 remainder → exactly 50¢, discount never exceeds bill.
- Ledger: double-credit and double-debit no-ops, overdraft → 409 with no row, engagement daily cap → 429 at 60, mining cap group independent, missing Supabase → 503, zero delta → 400.
- Heartbeat keys: same minute → same key; next minute → different key.
- Mining: an honestly-played session validates with exactly the engine-proven bars; a fabricated instant sell proves **0** bars; oversized/past-end/unknown actions rejected; two sells get distinct prefix hashes.
- Checkout: partial (debit first, discounted Stripe session, Stripe idempotency key), retry reuses the same session with no second debit, full cover makes **zero** Stripe calls, balance-race → 409 with Stripe untouched, Stripe failure after debit → compensating credit refunds gold as a separate ledger row, plain no-gold path unchanged, gold without idemKey → 400.

Full suite: all 32 headless test files pass, zero failures. `npm run build` passed.

## Tunables for Merlin to confirm (my defaults, his call)

- `100 gold = $1` (his spec)
- `1 gold / active minute`, `60/day` engagement cap (his spec)
- `25 gold per bar` (my recommendation — matches the game's own in-game values, so real gold feels consistent with what players see)
- `2,000 gold / day` mining cap (my recommendation — generous enough for grinders, bounded against bots)
- Client tick cap `36,000` (~1 hour of continuous play per claim)

## Honest caveats

1. **`supabase/gold.sql` is NOT live yet.** It folds into the final consolidated SQL freeze — until Merlin runs it (or I run it in his dashboard when the freeze lifts), all gold endpoints return 503 and checkouts behave exactly as before. Nothing breaks; gold just doesn't exist yet.
2. **Card cancellation after successful payment:** if a customer pays the discounted remainder by card and later the payment is refunded/cancelled, the spent gold stays spent. Reversing it needs cancellation/refund webhook handling — queued with the other webhook work at end of project.
3. **Paid-by-gold fulfillment failure:** if fulfillment throws *after* the debit, the code now issues a compensating credit, but a crash *between* debit and compensation (process death) would need reconciliation. The ledger is append-only so nothing is ever lost or double-applied — a sweeper can refund orphaned debits later.
4. **World Engine Aether grant** is read-then-upsert (not atomic). Double-submits are safe (duplicate claim returns early before any Aether change), but concurrent *different* claims could interleave — acceptable at this scale, worth an RPC later.
5. **Mining rate (25/bar) and 2,000/day cap are my recommendations, not Merlin-confirmed.** Flagged above.
6. **Heartbeat + no-session:** if a signed-out user signs in mid-session without reload, earning starts on the next 60s tick (fixed from an earlier version that stopped permanently).
7. **Hephaestus commissions** remain localStorage-only per the existing plan — no gold there yet.
8. The **in-game credits** in Liquid Gold (the numbers flying around while you play) are game credits, not gold — the UI now says so explicitly. Real gold only lands after server verification.

## Merlin-only actions

- Run `supabase/gold.sql` (or the final consolidated SQL when the Takeout freeze lifts) in the Supabase dashboard.
- Confirm the tunables above (especially 25/bar and 2,000/day).
