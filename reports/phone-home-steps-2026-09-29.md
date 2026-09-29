# Workstream 3 — Step Counter in Phone Home (2026-09-29)

## What was built
A compact "Steps" card on /phone-home as a 5th swipe page (Audio / Video / Dialer / Text / **Steps**), showing three numbers:
- **Today** — today's logged steps (manual entry for now).
- **Your total** — sum of the signed-in user's rows (account-mapped).
- **Everyone's total — universal** — global sum across all users, plus a walker count.

Manual entry = number input + "Log steps" button, upserted on the `user_steps` PK `(user_id, step_date)`, so re-logging a day replaces rather than duplicates. No currency, no tokens, no fake data anywhere.

## Files changed / added
- `app/phone-home/page.tsx` — Steps page (PAGE 4), footer "Steps" tab (Footprints icon), pager widened 4→5 pages, swipe bounds updated, steps state + Supabase load/upsert + offline queue drain on session.
- `lib/phone-home/steps.ts` — NEW. Pure helpers: `todayKey()` (local-timezone YYYY-MM-DD), `clampSteps()` (whole ≥ 0 or null), `totalSteps()`, `findTodayEntry()`, `upsertLocal()`, offline queue (`mergeQueueEntry` latest-wins + cap 50, `readQueue`/`writeQueue` with storage injection for testability).
- `lib/health/sync.ts` — NEW. `HealthSyncProvider` / `StepReadResult` interface + `mobilePhaseHealthSync` stub that always resolves `{ supported: false, reason: 'mobile-phase' }`, with comments that HealthKit / Health Connect wiring lands in the mobile phase. No fake data.
- `supabase/steps.sql` — NEW, **QUEUED, NOT EXECUTED**. `user_steps` (RLS owner-only select/insert/update on `auth.uid() = user_id`) + `global_step_totals` VIEW (aggregate only: `SUM(steps)`, `COUNT(DISTINCT user_id)`; granted SELECT to `authenticated`, revoked from anon/public; privacy property documented in a comment).
- `tests/phone-home-steps.test.mjs` — NEW. 59 headless assertions.
- `reports/phone-home-steps-2026-09-29.md` — this report.

## Offline behavior (honest)
Supabase-first. When the database is unreachable, entries queue in `localStorage` (`phone_home_steps_queue`) and the UI shows "Saved on this device — will sync when the connection returns." The queue drains (upsert per entry) on the next successful load.

## Tests
`tests/phone-home-steps.test.mjs` — **59/59 green** (run after `npx tsc` compile of the two lib files to `/tmp/steps-out`). Covers: today-key formatting, input validation (rejects negatives/NaN/empty), totals math, PK upsert semantics, queue dedupe/cap/corrupt-JSON handling, stub contract `{ supported: false, reason: 'mobile-phase' }`, SQL sanity via string checks (table, PK, CHECK, RLS, three owner policies, view aggregates, grant/revoke, privacy comment), and page source checks (universal label, offline state, safe-area clearance, no currency in the Steps section).
`npx tsc --noEmit` — clean across the whole project.
`npm run build` — NOT run (coordinator runs the one final build per constraints).

## Publish
Branch: `feature/phone-home-steps-2026-09-29` — created via the incremental GitHub API pattern, parented on the remote main tip. **NOT merged** — awaiting coordinator merge after the final green build.

## Queued for Merlin (via coordinator)
- **SQL execution only**: `supabase/steps.sql` must be folded into the frozen consolidated SQL prompt (or run standalone) before the Steps page shows real totals. Until then the page falls back to the honest offline state.
- The sweat-token idea stays parked — nothing currency-adjacent was built.
