# Mobile App Program — Progress Report 2026-09-29

## Phase 1 — Plan (done)

Full plan: `~/workspace/github-work/reports/mobile-conversion-plan-2026-09-29.md`

- **Decision: Capacitor live-URL wrapper** (`server.url → https://olympusverse.com`).
  Static export would kill 15+ API routes (Stripe webhooks, Supabase auth callbacks, council,
  gallery); PWABuilder/TWA is Android-only; a React Native rewrite is out of scope.
- PWA baseline already exists (manifest, icons incl. 1024 master, appleWebApp meta).
  No service worker, no native wrapper — this program adds the wrapper.
- iOS track: PrivacyInfo.xcprivacy, ATT analysis, StoreKit mapping (digital goods → IAP:
  gallery credits, Persephone tickets; physical hoodies → Stripe), export compliance
  (AES-GCM vault questionnaire), screenshots, demo reviewer account, 17+ rating expected
  (Stake/Betty affiliate references — external links only, never in-app gambling).
- Android track: Data Safety, Play Billing, **the 14-day closed-test gate** (12+ real testers,
  14 days continuous — starts at enrollment, nothing technical shortens it).
- Build infra: iOS needs macOS — cloud Mac CI (Merlin approves if paid). Android AAB can
  build on Linux or the same CI. Platform folders are CI-generated, never hand-committed.

## SHIP GATE (Merlin, 2026-09-29) — HARD BLOCK

**No upload/submission to either store — no IPA/AAB upload, no TestFlight external, no Play
release, no "send for review" — until Merlin explicitly says the build is ready to ship.**
Preparation is unlimited; the upload step stays BLOCKED. "Approve all" and momentum are
NOT approval for this step. Gate criteria (his checklist + our verification checklist) are
in §7 of the plan.

## Phase 2 — Groundwork v1 (this publish)

- `capacitor.config.ts` — app id `com.olympusverse.nexus` (provisional; Merlin registers the
  final id at enrollment), live server URL, SplashScreen/StatusBar/PushNotifications defaults.
- `app/layout.jsx` — removed `maximumScale: 1, userScalable: false`; pinch zoom restored
  (was a WCAG failure and a Phase 2b item, done early as mobile baseline).
- `tests/mobile-readiness.test.mjs` — 5/5 green: manifest soundness, icons on disk,
  viewport not blocking zoom, touch-floor/clearance tokens, Capacitor config sanity.

## Merlin-only (unchanged)

Enroll Apple ($99) + Google ($25) today by card; identity verification; recruit 12+ testers
DAY ONE; banking/tax before IAP; ASC API key for CI; approve Mac CI if paid.

## Next

Phase 2b mobile fixes (store-quality gate) → native plugin wiring (push, haptics, deep links,
share) → store assets → staged submission package presented for his explicit go-ahead.
