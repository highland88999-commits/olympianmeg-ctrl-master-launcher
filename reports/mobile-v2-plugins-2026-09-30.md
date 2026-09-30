# Mobile App v2 — Capacitor Plugin Wiring (code-level)

Date: 2026-09-30. Branch: `feature/mobile-v2-plugins-2026-09-30`.
Parent: remote main tip `4144d6e5` (Phase 2b merged) — verified via GitHub API before work began.

## What was wired

**Dependencies installed** (npm, saved to `package.json` + `package-lock.json`):
- `@capacitor/core` 8.5.2, `@capacitor/cli` 8.5.2
- `@capacitor/push-notifications` 8.1.2, `@capacitor/haptics` 8.0.2
- `@capacitor/app` 8.1.1, `@capacitor/share` 8.0.2

**New: `lib/native.js`** — capability layer, safe to import on server and web.
Every native call is lazy (dynamic `import()` inside the function), guarded by
`isNative()`, wrapped in try/catch, and never throws to the caller.
- `isNative()` — true only inside the real Capacitor shell (`Capacitor.isNativePlatform()`).
- `tap()` / `confirm()` — subtle haptics for key taps. Native `Haptics.impact`
  (Light/Medium) in the shell → `navigator.vibrate(8/20ms)` on mobile web →
  silent `'none'`. Returns which channel fired; never throws.
- `shareContent({title, text, url, dialogTitle})` — Capacitor `Share.share` in
  the shell → Web Share API (`navigator.share`) on mobile web → clipboard
  `writeText` as last resort → honest `{ok:false, method:'none'}`. Never throws.
- `parseDeepLink(rawUrl)` — pure parser for custom-scheme (`nexusvortex://battleship?code=ABC123`),
  universal (`https://olympusverse.com/chess?code=ABC123`), and plain https URLs.
  Extracts `{path, search, code}`; only 6-char alphanumeric codes accepted.
- `initDeepLinks({onRoute})` — registers the native `appUrlOpen` listener and
  checks the cold-start launch URL via `App.getLaunchUrl()`. Default routing
  navigates the shell to `path+search` (the live-URL shell reloads the
  production page, whose own `?code=` joiner consumes the code). No-op on web/server.

**New: `components/NativeBridge.jsx`** — invisible client component mounted once
in the root layout. Wires `initDeepLinks` into Next SPA navigation
(`router.push`, with `window.location.assign` fallback). Renders null; no visual
change.

**New: `lib/push.js`** — push registration module. Graceful by design:
- Off native (web/server): every function is a documented no-op.
- In the shell with no push credentials configured yet: fails cleanly via the
  plugin's `registrationError` path — no crash, no retry loop.
- **Permission is requested ONLY from an explicit user action.** `registerPush()`
  is exported for a future settings toggle; nothing calls it on launch or first
  paint. `getPushPermissionStatus()` reads state without prompting.
- Token handoff (`onToken`) is stubbed for a future fan-out endpoint — not built.

**`capacitor.config.ts`** — re-added `import type { CapacitorConfig } from
'@capacitor/cli'` with a typed `const config: CapacitorConfig`. Safe now that
the package is installed; `tsc --noEmit` verified clean (the earlier Vercel
build-break is gone).

**`app/layout.jsx`** — mounts `<NativeBridge />` inside the root provider tree.
No other layout/markup change.

## Fallback behavior per plugin

| Plugin | Native shell | Mobile web | Desktop web | Nothing configured |
|---|---|---|---|---|
| Haptics | `Haptics.impact` Light/Medium | `navigator.vibrate(8/20ms)` | silent `'none'` | n/a (no config needed) |
| Share | native share sheet | Web Share API | clipboard copy | `{ok:false}` if clipboard blocked |
| App (deep links) | `appUrlOpen` + cold-start URL → SPA route | no-op | no-op | n/a |
| Push | permission → listeners → `register()`; token via `onToken` | no-op | no-op | `registrationError`, clean `{ok:false}` |

## Test results

- New `tests/native-capabilities.test.mjs`: **17/17 pass** (deep-link shapes,
  malformed-code rejection, init no-op off native, haptic fallbacks incl. the
  8ms-subtle assertion, share Web/Clipboard/none fallbacks, never-throws,
  push off-native refusal without prompting).
- `tests/mobile-readiness.test.mjs`: **5/5 pass** (manifest, icons, pinch zoom,
  touch floor, Capacitor config) — pinch zoom, scrolling, safe-area, and text
  selection preserved.
- `tsc --noEmit`: clean (exit 0), including the re-typed `capacitor.config.ts`.
- Full suite: 608/622 pass. The 14 failures are **pre-existing and unrelated**:
  verified by reverting this job's 3 modified files and re-running — identical
  608/622 with the same 14 failures (ui-declutter orbit rings/portals,
  god-menus home assertions, nv2-video-library `next/image` from the Phase 2b
  sweep, and whole-file failures in earth/entrance-video/hephaestus/museum/
  phone-home-*/profile/rainbow-wok/tools). None touch the files changed here.

## Publish

- Branch `feature/mobile-v2-plugins-2026-09-30` created from remote main tip
  `4144d6e5` via the incremental Git Data API pattern (changed blobs only,
  `base_tree`, commit parented on the tip, ref update). `node_modules/`,
  `.next/`, `.git`, `tsconfig.tsbuildinfo` excluded.
- Merged to `main` (merge commit) — tsc clean and all gate tests green.
- Merge SHA: see merge commit on `main` (`feature/mobile-v2-plugins-2026-09-30`).
- Remote verification: all 9 published paths re-fetched from `main` post-merge.

## What still needs Merlin (not done here — code wiring only)

1. **Native builds need macOS/cloud Mac CI.** This Linux VM cannot run Xcode;
   `npx cap add ios` was deliberately NOT run (per constraints). CI must
   generate `ios/` + `android/` from `capacitor.config.ts` at build time.
2. **APNs key (.p8)** from App Store Connect + Push Notifications capability in
   the Xcode project (iOS), and **google-services.json** from the Firebase
   console under `olympiannexus@gmail.com` (Android) before any push delivers.
3. **Push fan-out server**: an endpoint (e.g. `app/api/push/send`) storing
   device tokens per account and sending via FCM/APNs. Token table folds into
   the frozen consolidated Supabase SQL.
4. **An explicit user-facing toggle** (settings) that calls `registerPush()` —
   UI not built; permission must never be requested on launch.
5. **Paid CI approval**: if the chosen Mac CI service costs money, Merlin's
   card needs his explicit go-ahead.
6. **Deep-link scheme registration**: `nexusvortex://` custom scheme (Xcode
   URL Types / Android intent-filter) + Associated Domains / App Links for
   `olympusverse.com` — set up when the native projects are generated.
7. **SHIP GATE stands**: nothing uploaded to Apple/Google — no IPA/AAB, no
   TestFlight, no Play release. This job was code only.

## Constraints honored

- No `npx cap add`, no native folders, no builds, no paid CI, no submissions.
- No changes to payments, Supabase SQL, service integrations, or settings.
- Stake (`https://stake.com/?c=1FofAXWx`) and Betty affiliate inventory untouched.
- Scrolling, Safari safe-area clearance, pinch zoom, text selection preserved.
- No visual redesign; no popups/clickbait/predatory UX.
- No API keys or secrets in code.
