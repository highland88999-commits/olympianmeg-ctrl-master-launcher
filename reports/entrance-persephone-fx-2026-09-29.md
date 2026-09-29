# Entrance + FX + PERSEPHONE build report — 2026-09-29

Three-part build for the Nexus master launcher: (1) G.I. Joe: Retaliation-homage
entrance sequence, (2) central sound+haptics FX system with a full animation
audit, (3) the PERSEPHONE DJ concert-hall satellite. Plus Merlin's delivered
entrance video wired behind auth and as a shadowed distant backdrop.

## PART 1 — Entrance sequence ("We don't launch it / We DROP it.")

Original cinematic intro, zero copyrighted material — all visuals and sound
synthesized in code:

- `components/EntranceSequence.jsx` — Canvas 2D (broadcast static, glitch
  tear-bars, Earth with 10 satellites falling from above into orbit rings) +
  two original SVG silhouettes (podium speaker, hooded masked commander with
  glowing visor) + CSS scanlines/vignette/lower-third captions.
- `lib/entrance-sequence.js` — pure state machine: phases
  `static → speech → glitch → commander → drop`, durations, captions, skip
  persistence (`nexus_intro_skip_v1` in localStorage — only an EXPLICIT skip
  persists; watching through does not).
- `lib/entrance-audio.js` — 100% Web-Audio-synthesized cues per phase (static
  hiss, broadcast beeps, hijack stutter, deep two-note sting, whoosh + orbital
  thud). Silent no-op if AudioContext is blocked; silent until first tap
  (autoplay policy — `unlockEntranceAudio()` on first pointerdown).
- Storyboard (~11s): dark broadcast static ("TUNING IN…") → podium figure,
  "We don't launch it—" → glitch tear ("SIGNAL HIJACKED") → masked commander,
  "We DROP it." → satellites drop into orbit rings → white flash → seamless
  fade into the live orbit scene (stays mounted underneath — never blank).
- Skip via tap/click, SKIP button, or Escape. `↺ INTRO` replay button
  (top-left, hub states only); replay never clears the skip flag.
- Mobile-safe: DPR-capped canvas, low-res noise tile, `clamp()` captions, skip
  button clears `env(safe-area-inset-bottom)`; `prefers-reduced-motion` gets a
  compressed ~4s cut with glitch jitter disabled.
- `launchPocketUniverse` untouched.

FX hooks for the sound pass: every phase change dispatches window CustomEvent
`nexus:entrance-phase` (`detail: { phase }`); overlay root carries
`data-entrance-phase`; `lib/entrance-audio.js` exposes `playPhaseSound`,
`setEntranceAudioEnabled`, `stopAllEntranceAudio`, `unlockEntranceAudio`.

## PART 2 — Sound + haptics FX system (`lib/fx.js`)

Central FX library: 100% synthesized WebAudio SFX (no external audio files) +
`navigator.vibrate` haptics. 14 matched pairs (right sound + right haptic per
moment), plus `unlockFx`, `setFxEnabled`/`isFxEnabled`,
`setReducedMotion`/`prefersReducedMotion`, `canVibrate`, `FX_DEBUG` log.

Design rules: pre-gesture gate (nothing fires before `unlockFx()` on first
pointerdown/keydown — no buzzing someone who hasn't touched anything); iOS
Safari has no vibration API → degrades to sound-only, never faked
(`canVibrate()` feature-detected every call); reduced-motion collapses big
kinetic patterns to a single ≤25ms pulse and halves gains; every pair wrapped
in try/catch — FX can never break the launcher; stake.com/ad panels get a
neutral tap only (drop fanfare never plays on affiliate/external links —
`fx.routeLaunch()` detects `http(s)` routes); purchase confirmations are a
warm 3-note rise, deliberately not a fanfare (celebrates the redirect return —
the webhook settles payment); cancellation is a soft settle, never
buzz-shame.

Wired call sites: `app/page.jsx` (launchPocketUniverse → `fx.routeLaunch`,
toggleBike → mount/dismount, beginEarthDive, FLIGHT AXIS / ↺ INTRO / cloud
dismiss taps, menu open/close, entrance-phase subscription);
`components/GodMenuPanel.jsx` (accordion); `components/persephone/*`
(checkout success/cancelled/failure, door entry on presence join, once per
visit); `app/olympus/page.jsx` and `app/liquid-gold/page.jsx` (checkout
confirm/cancelled, victory arpeggio on bar mint). `fx.stageWash()` exists but
is NOT wired — fires only when real broadcast ingest confirms live. No FX on
fake-live, ever.

### FULL ANIMATION AUDIT LIST (element → FX or still → reason)

Gets FX:

| Element | FX | Reason |
|---|---|---|
| Satellite launch — god menu panel, 3D orbit nodes, tower panels (all funnel through `launchPocketUniverse`) | `satelliteDrop`: rising whoosh + deep sub-thud + `[25,60,90]` buzz | Signature "we DROP it" moment; the one big celebratory pair in the hub |
| stake.com/ad tower panels (external URLs through same function) | neutral `tap` only | No fanfare on affiliate inventory, ever |
| God-menu accordion open/close (10 cards) | `menuOpen`/`menuClose`: soft swell up / down | Frequent action → kept short and quiet so it never annoys |
| Hub panel [_] collapse / orb expand | same menuClose/menuOpen | Consistent with god menus |
| SPAWN TO BIKE / LEAVE BIKE | `bikeMount`: engine-up sawtooth sweep + rising buzz; `bikeDismount`: soft settle | Mount is a "transformation" moment; deserves weight. Dismount is gentle |
| FLIGHT AXIS, ↺ INTRO replay, cloud-note ✕, SettingsGear | plain `tap` | Utility taps: acknowledge, nothing more |
| Entrance phases (subscribed to `nexus:entrance-phase`) | haptics only, layered per phase (glitch stutter, commander punch, drop rumble) | Extends `lib/entrance-audio.js`, doesn't replace it; silent before first gesture |
| Earth dive (`beginEarthDive`) | `earthDive`: descending whoosh | One-way trip moment; subtle |
| Persephone `?checkout=success` / gold purchase | `checkoutConfirm`: warm 3-note rise | Honest — celebrates the return, not settled payment |
| Persephone `?checkout=cancelled` | `checkoutCancelled`: soft low settle | Cancellation isn't an error — no buzz-shame |
| Persephone checkout start failure / gold claim failure | `error`: low double-buzz + muted descending tone | Actionable failures the user must notice and can retry |
| Persephone door entry (presence join) | `doorEntry`: soft welcome shimmer, once per visit | Real human moment: "you walked in" |
| Olympus `?checkout=success` | `checkoutConfirm` | Same honest-purchase rule as Persephone |
| Liquid Gold bar mint | `victory`: bright sparkle arpeggio + shimmer buzz | The genuine victory loop in the launcher — earned, so it earns the one fanfare |
| Liquid Gold sell/claim success | `checkoutConfirm` | Money-adjacent transaction; soft confirm |

Stays still (deliberately quiet):

| Element | Reason |
|---|---|
| Joystick drag, camera look/zoom, Earth spin, orbit band rotation | Continuous inputs/motion — any FX here becomes noise within seconds |
| Satellite-node hover (scale + cursor) | Already has visual feedback; 100+ nodes would chatter |
| Bike hover bob, landing-beacon pulse, starfield, fog | Ambient motion; buzzing ambience is wrong |
| Entrance background video | Decorative behind the scene; ruled out |
| Cloud-offline banner, presence offline/solo status, peer-count updates | Informational state, not user action — no buzz for bad news you can't act on |
| Loading screens ("Raising the hall…", "CHARTING THE SOLAR SYSTEM…") | Waiting isn't a moment |
| Flash/notice text appearances | Purchase-success flashes carry their own FX via the pair; everything else is text |
| Persephone set-start stage wash | Reserved `fx.stageWash()` exists but NOT wired — fires only when real ingest confirms live. No FX on fake-live, ever |
| Sign-in success | The entrance cinematic already owns that moment; no double-celebration |
| `?checkout=success` anywhere | No triumphant fanfare — modest confirmation only, never over-claims settled payment |
| DISCONNECT, SettingsGear internals | Utility taps (`tap`); nothing more |

Open follow-up: a user-facing mute toggle (calls `setFxEnabled`) would fit
naturally in SettingsGear — API is ready, left out as a UI decision.

## PART 3 — PERSEPHONE (/persephone), DIONYSUS (Thrills & Play)

Underworld-club DJ concert hall satellite:

- `app/persephone/page.jsx` — mobile-first, scroll-safe, Safari clearance.
- `components/persephone/HallScene.jsx` — three.js hall (dark stone,
  gold/ember, DJ booth stage, ember particles; no bloom, localized lights,
  reduced-motion support).
- `AttendanceBar.jsx`, `TicketsPanel.jsx`, `BroadcastRoom.jsx`,
  `LedgerPanel.jsx`, `PayoutMethodPanel.jsx`.
- `lib/persephone/ledger.js` — encodes MERLIN'S RULE: **10% of NET**
  (revenue − fees − costs), never gross. No profit → no cut; losing nights
  show the loss honestly; rounding invariant `cut + payout === net` holds.
  Six fee scenarios tested.
- `lib/persephone/payout-methods.js` — artist saves payout method of choice
  (bank transfer, PayPal, crypto wallet…); stores only what's needed, UI
  renders masked output via `redactForDisplay()`, never logs secrets.
- `lib/persephone/tickets.js`, `app/api/persephone/checkout/route.js`,
  `app/api/persephone/webhook/route.js` — Stripe Checkout Sessions,
  server-repriced, gold-at-checkout via existing `applyGoldCheckout` surface
  (`'persephone'`), idempotent webhook flips pending→paid.
- `supabase/persephone.sql` — DRAFT, do-not-run (folds into the final
  consolidated SQL prompt).

Real vs. honestly labeled: REAL — 3D hall, ticket catalog, ledger estimator,
payout-method form, Stripe Checkout Sessions. QUEUED (labeled on-screen) —
broadcast room ("Not streaming yet", QUEUED chips only, zero fake LIVE
indicators); attendance (real presence peers render as avatars; when presence
is unavailable the UI says "we won't invent a number" and shows no count);
card payments disabled with plain-English "not connected yet" until
`STRIPE_SECRET_KEY` is set. Payout method = preference storage on the
artist's device only — NO real money moves in this pass.

Stripe Connect future path: onboard artists as Connect Express accounts, pay
via transfers/destination charges, keep the 10%-of-net split as the
application-fee logic. Needs Merlin's Stripe dashboard work — not started.

Registered in `lib/god-menus.js` (DIONYSUS), `lib/i18n/satellites.ts`, all 7
locale files; launches via `launchPocketUniverse`.

## Merlin's entrance video

`public/media/entrance.mp4` (H.264, 720p, 10s loop, ~3MB — converted from
his HEVC upload for browser compatibility; original at
`~/workspace/user/media_library/video/ff/fffc09c91352e9878bd2612786079e71c25d2cf178f05591d94f895e0cf4463f.mp4`):

1. Behind the auth text (`components/Auth.jsx`) — full-bleed, loop/muted/
   playsinline/autoplay, `bg-black/55` dim keeps text readable. This is his
   one house ad slot.
2. Shadowed distant iteration behind the home scene (`app/page.jsx`) —
   brightness 0.30, saturate 0.55, 50% black veil; Canvas runs
   `gl={{ alpha: true }}` so it shows through behind Earth/rings/bike, with
   the opaque `#050505` backdrop restored if the file is ever missing.
   Gated on hub visibility (never double-plays under Auth), pointer-events-none.

## Tests — 397/397 green

- entrance-sequence: 32/32 · entrance-video: 20/20 · fx: 80/80 ·
  persephone-ledger: 30/30 · persephone-payout: 30/30 · god-menus: 113/113
  (129/129 exact-once) · i18n: 38/38 (fixed 6 pre-existing stale-count
  failures as a bonus) · economy: 54/54.
- Production build: green (Next.js 14.2.35).

## Publish

Merged to `main` via incremental Git Data API publish (strict allowlist,
base_tree, parented merge commit). Merge commit: `<SHA>`.

## Queued Merlin-only actions

- `STRIPE_SECRET_KEY` + `STRIPE_PERSEPHONE_WEBHOOK_SECRET` env vars, webhook
  endpoint registration (per new standing rule: never use his card — ask him
  first if any service needs it; API accounts use the olympiannexus@gmail.com
  credentials).
- Run `supabase/persephone.sql` (folds into the final consolidated SQL —
  still frozen pending Takeout part 2).
- Stripe Connect Express onboarding when real artist payouts go live.
- Visible rider on the TRON bike (still queued from the expansion batch).
