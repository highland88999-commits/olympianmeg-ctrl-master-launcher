# Phone Home travel/emergency advisory banner — 2026-09-29

Temporary, dismissible advisory banner on `/phone-home` ("Phone Home is not a 911
or emergency service…" plus the data-connection / roaming note). Dismissal is
persisted per user in Supabase; the keyed design makes the advisory temporary
without code changes.

## What changed

- **`lib/advisory.js`** (new) — dismissal logic, headless-testable. The Supabase
  client is passed in, never hard-coded; every function degrades instead of
  throwing.
  - `ADVISORY_KEY = 'phone-home-travel-2026-09'` — the advisory identity. This
    key IS the "temporary" mechanism: an admin retires/replaces the advisory by
    deleting that key's rows from `advisory_dismissals` or shipping a new key —
    no code change required.
  - `ADVISORY_COPY` — the exact banner text.
  - `loadDismissal(supabase, userId, key)` → `'cloud' | 'local' | null`.
  - `recordDismissal(supabase, userId, key)` — cloud upsert on the
    `(user_id, advisory_key)` primary key first; on ANY failure falls back to a
    per-advisory `localStorage` flag. Never throws. Honest tradeoff kept in the
    code comments: an offline dismissal lives on this device only, so the banner
    may reappear on another device until the cloud record lands.
- **`app/phone-home/advisory-banner.tsx`** (new) — client component rendering the
  banner near the top of the page, below the header. Clear "Dismiss" text button
  (plus `X` icon, `aria-label="Dismiss advisory"`), `role="note"`. Styling matches
  the app (black/40 glass card, white/15 border, slate text); no animation, so
  there is nothing to fight `prefers-reduced-motion`. In normal flow — does not
  affect scrolling or the footer's safe-area bottom clearance.
- **`app/phone-home/page.tsx`** (edit) — imports and renders
  `<TravelAdvisoryBanner />` between the header and the page carousel.
- **`supabase/phone-home.sql`** (new) — `advisory_dismissals(user_id uuid
  references auth.users, advisory_key text, dismissed_at timestamptz, PRIMARY KEY
  (user_id, advisory_key))`, RLS enabled, owner-only select/insert/update policies
  (update exists so the client upsert on the PK is permitted). `CREATE TABLE IF
  NOT EXISTS` + drop-before-create policies: safe to fold into the final
  consolidated SQL. **NOT executed — queued for the coordinator.**
- **`tests/advisory.test.mjs`** (new) — 33 headless assertions.

## Tests

- `node tests/advisory.test.mjs` → **33 passed, 0 failed** (run 2026-09-29).
  Covers: exact advisory key / copy / table name; per-advisory localStorage
  namespacing; cloud read carries `user_id` + `advisory_key` filters on
  `advisory_dismissals`; two users get independent reads and writes
  (per-user scoping); `loadDismissal` returns `'cloud'` / `'local'` / `null`
  across the DB-down matrix; `recordDismissal` upserts the exact
  `{user_id, advisory_key}` row with `onConflict: 'user_id,advisory_key'`,
  falls back to localStorage on failure, and never throws.
- TSX validation: both `advisory-banner.tsx` and the edited `page.tsx` transpile
  clean via the repo's TypeScript; a scoped `tsc --noEmit` reports zero errors in
  the new files (the only diagnostics are pre-existing `process` name complaints
  in the untouched `lib/supabase.ts`).
- No `npm run build` (coordinator runs the one final build per workstream rules).

## Publish

- Branch: `feature/phone-home-advisory-2026-09-29`
- Incremental Git Data API publish (diff-by-blob-SHA, `base_tree`, branch ref).
  **NOT merged** — coordinator merges after the final green build.
- File set: `lib/advisory.js`, `app/phone-home/advisory-banner.tsx`,
  `app/phone-home/page.tsx`, `supabase/phone-home.sql`,
  `tests/advisory.test.mjs`, `reports/phone-home-advisory-2026-09-29.md`.

## Queued / notes for the coordinator

- **Execute `supabase/phone-home.sql`** (authoring depth has no dashboard access).
  Until it runs, the banner shows on every visit and dismissals persist only on
  the device — by design, zero errors.
- Concurrent-work note: while this workstream was editing, another workstream
  landed a steps-counter change in the same worktree's `app/phone-home/page.tsx`
  (lucide `Footprints` import, `@/lib/phone-home/steps` import, step state +
  `refreshSteps`/`logSteps`, pager widened `w-[400%]` → `w-[500%]`). The banner
  import/render was placed to avoid all of those regions; verified the file still
  transpiles clean. The coordinator's final build will confirm both coexist.

## Queued for Merlin

None — nothing needs his action. (SQL execution is the coordinator's queue.)
