# Phone Home Contacts — build report (2026-09-29)

Per-user contacts list for /phone-home, ported from the original
ET-Phone-Home GlassCommsApp `{name, phone_number}` concept.

## What was built
- `app/phone-home/contacts-tab.tsx` — Contacts tab UI: add/edit/delete,
  per-row tap-to-call, honest degradation states.
- `lib/phone-home/contacts.ts` — Pure helpers: phone normalization /
  validation, missing-table detector (Postgres 42P01), row builder.
- `app/phone-home/page.tsx` — Wired as page 5 of the carousel with a
  footer tab; tap-to-call goes through the existing `startTwilioCall`
  Twilio device flow (shared with the dialer). If a call is already live
  or the device isn't registered, the number lands in the dialer honestly.
- `supabase/phone-home-contacts.sql` — `public.phone_home_contacts`
  (id, user_id → auth.users, name, phone_number, timestamps), strictly
  owner-only RLS (select/insert/update/delete). QUEUED — NOT executed;
  folds into the final consolidated SQL run.
- `tests/phone-home-contacts.test.mjs` — headless tests.

## Honest degradation
Until the migration runs, the tab shows "Contacts arrive with the next
database update." Network/auth failures show an offline note with retry.
Never a crash, never an error dump.

## Verification
- Tests: PENDING (build running)
- Production build: PENDING
- Publish: PENDING
