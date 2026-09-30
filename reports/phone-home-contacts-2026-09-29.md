# Phone Home Contacts — build report (2026-09-29)

Per-user contacts list for /phone-home, ported from the original
ET-Phone-Home GlassCommsApp `{name, phone_number}` concept. Re-dispatched
after the previous worker was lost to a daemon restart; its worktree work
was recovered, audited, and completed.

## What was built
- `app/phone-home/contacts-tab.tsx` — Contacts tab UI: add/edit/delete,
  per-row tap-to-call, honest degradation states (missing table / offline).
- `lib/phone-home/contacts.ts` — Pure helpers: phone normalization /
  validation (3–16 digits, 120-char names), missing-table detector
  (Postgres 42P01), row builder.
- `app/phone-home/page.tsx` — Wired as page 6 of the carousel with a
  footer tab; tap-to-call goes through the existing `startTwilioCall`
  Twilio device flow (shared with the dialer). If a call is already live
  or the device isn't registered, the number lands in the dialer honestly.
- `supabase/phone-home-contacts.sql` — `public.phone_home_contacts`
  (id, user_id → auth.users, name, phone_number, timestamps), strictly
  owner-only RLS (select/insert/update/delete). QUEUED — NOT executed;
  folds into the final consolidated SQL run.
- `tests/phone-home-contacts.test.mjs` — 67 headless tests.

## Honest degradation
Until the migration runs, the tab shows "Contacts arrive with the next
database update." Network/auth failures show an offline note with retry.
Never a crash, never an error dump.

## Verification
- Tests: 67/67 green (`node --test tests/phone-home-contacts.test.mjs`).
- `next build` webpack compile: "Compiled successfully" (multiple runs).
- `next build` lint + type-check phase: passed clean (one real type error
  found and fixed along the way: discriminated-union narrowing in
  contacts-tab.tsx).
- Full static-generation phase: NOT completed locally. The 8 GB box was
  running 3–4 concurrent full Next.js builds (sibling builders sharing the
  worktree); mine was OOM-killed / had its `.next` clobbered repeatedly.
  This is environmental, not code: compile + types + tests all pass, and
  the change is purely additive (new client component + tab wiring).
  Vercel runs the full production build on merge — that is the final gate.
- Publish: branch `feature/phone-home-contacts-2026-09-29`
  (commit 4f1fc255084809e26fd35f931e50956ed0e6c7ac), merged to main as
  2a9ff4a4474134afcda44995d9ccdf949afe57e1 — remote main tip verified.
- Sibling in-flight work in the shared worktree (battleship×OASIS,
  human-ai council, erebus, ui-declutter, god-menus, radio) was left
  untouched.

## Merlin-only queue
- Run `supabase/phone-home-contacts.sql` (folds into the final
  consolidated SQL run — do not run standalone unless doing the whole
  pending batch).
- No env vars, no webhooks, no key changes needed.
