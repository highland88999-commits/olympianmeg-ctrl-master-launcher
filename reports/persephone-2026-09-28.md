# PERSEPHONE — DJ concert-hall satellite (2026-09-28)

New single-word mythic satellite at **`/persephone`**: queen of the underworld's concert hall.
Underworld-club vibe — dark stone hall, gold/ember accents, a raised stage with the DJ booth.

## What was built

**Route + 3D hall**
- `app/persephone/page.jsx` — mobile-first page, scroll-safe, Safari bottom-bar clearance
  (`paddingBottom: max(5rem, env(safe-area-inset-bottom))`). Sections: the hall, tickets,
  broadcast room, the house cut, get paid.
- `components/persephone/HallScene.jsx` — three.js hall (react-three-fiber, dynamic
  `ssr:false`): dark hall, gold-collared columns, stage with ember-edged DJ booth and
  glowing decks, speaker stacks, rising ember particles, doorway glow. No postprocessing /
  no bloom — lighting stays localized per the lighting rule. Slow cinematic camera drift,
  frozen under `prefers-reduced-motion`. All procedural, zero external assets.

**Broadcast room** (`components/persephone/BroadcastRoom.jsx`)
- HONEST: full WebRTC broadcast infra is NOT built in this pass. The room is a running
  order + rehearsal checklist with an on-screen banner: "Not streaming yet — nothing here
  goes out to an audience, and nothing is marked live." Slots are QUEUED only (gray chips).
  No fake LIVE indicators anywhere. Future states, when ingest exists:
  `queued → soundcheck (real local preview) → live (real ingest confirmation)`.

**Attendance** (`components/persephone/AttendanceBar.jsx`)
- Wires the real presence client (`lib/presence.js`, sector `persephone:hall`). Real peers
  render as hooded-figure avatars with name tags in the 3D hall — nothing faked.
- Honest states: live count when peers exist ("N people in the hall right now — a live
  count, not a guess"); "Doors open — you're the first one here" when solo; "Live headcount
  isn't connected yet, so we won't invent a number" when presence is unavailable (no env /
  presence table still a draft). No simulated crowd, ever.

**Ticketing** (`app/api/persephone/checkout/route.js`, `lib/persephone/tickets.js`)
- Follows the repo's EXISTING Stripe checkout pattern (mirrors `app/api/olympus/checkout`):
  server-side catalog re-prices every order, secret key stays in `STRIPE_SECRET_KEY`,
  dynamic Stripe import, gold-at-checkout via `applyGoldCheckout` surface `'persephone'`
  (5th surface — same idempotency + compensating-credit safety), best-effort pending order
  record, Stripe-hosted Checkout redirect. Tickets: GA $25, Front Row $75, VIP Booth $150.
- `app/api/persephone/webhook/route.js` — signature-verified, idempotent
  `checkout.session.completed` handler flips `pending_payment → paid` via service role
  (mirrors hermes webhook). Needs a Stripe dashboard endpoint + `STRIPE_PERSEPHONE_WEBHOOK_SECRET`.

**Ledger** (`lib/persephone/ledger.js`) — Merlin's rule encoded + tested
- **10% of NET** (revenue − card fees − costs), NOT 10% of gross. No profit → no cut;
  a losing night shows the loss honestly on the artist's side. Rounding invariant:
  `houseCut + artistPayout === net` always. Stripe fees are labeled estimates until the
  webhook settles real numbers.
- `components/persephone/LedgerPanel.jsx` — plain-English explainer + interactive estimator.

**Payout method** (`lib/persephone/payout-methods.js`, `components/persephone/PayoutMethodPanel.jsx`)
- Types: bank transfer, Interac e-Transfer, PayPal, crypto wallet, other. Stores only the
  fields each type needs. Sensitive fields flagged 🔒 in the UI; saved method renders ONLY
  through `redactForDisplay()` (masked, last-4). Storage: artist's own browser localStorage
  (`persephone:payout-method`) — never sent anywhere, never logged, never committed.
- **Real money movement is OUT OF SCOPE** — ledger + preference only.

**Registration**
- `lib/god-menus.js`: `persephone` added to **DIONYSUS — Thrills & Play** (concert/nightclub
  fits; rogers-arena, the other venue, already lives there). 14 satellites, within 8–16.
- `lib/i18n/satellites.ts`: `{ key: "persephone", route: "/persephone", pos: "ZEUS_POS",
  section: "GAMES", constellation: "ZEUS" }` — paired with rogers-arena. Note: the file's
  "do not hand-edit / regenerate" header references a generator that no longer exists in
  this environment; hand-edit noted inline.
- `lib/i18n/locales/{en,el,es,fr,de,pt,it}.json`: `sat.persephone.title/subtitle` in all 7.
- `tests/i18n.test.mjs`: stale counts updated (123→129 satellites, 246→258 keys); the two
  stale launcher-wiring assertions rewritten to match the current architecture
  (hub builds its index from SATELLITES; GodMenuPanel uses `t(`sat.${key}.title`)`).

**Draft SQL** — `supabase/persephone.sql` (DRAFT, do-not-run): `persephone_orders` table +
  RLS. Folds into the final consolidated SQL.

## Test results (all headless, all green)
- `tests/persephone-ledger.test.js` — **30/30**: six fee scenarios (healthy night, thin
  margins, break-even → no cut, losing night → no cut + honest loss, rounding sweep,
  festival night), fee-estimator checks, input sanitation, formatting.
- `tests/persephone-payout.test.js` — **30/30**: type catalog + sensitive flags,
  validation per type, unknown-field dropping, masking, `redactForDisplay` leak checks
  (no raw sensitive value in the rendered view), record shape.
- `tests/god-menus.test.js` — **113/113** (129/129 exact-once coverage).
- `tests/i18n.test.mjs` — **38/38** (was 32 passed / 6 failed before this pass — stale).
- `tests/economy.test.mjs` — **54/54** (no regressions in the shared checkout path).
- Sucrase parse check on all 12 new/changed JS/JSX files — clean.

Not run: full production build (per task instruction). Not published.

## What's real vs. honestly labeled
| Surface | State |
|---|---|
| 3D hall, tickets UI, ledger estimator, payout-method form | Real, working |
| Stripe card checkout | Real — but only once `STRIPE_SECRET_KEY` is set; until then the UI says card payments aren't connected and disables buying (no fake checkout) |
| Attendance avatars / headcount | Real presence when the `presence` table is live; otherwise the UI says so and shows no number |
| Broadcast room | UI only — banner says "Not streaming yet"; running order is a real local list, nothing is live |
| Payouts | Preference storage only — no money moves |

## Stripe Connect — future payout path (for later)
When real payouts go live, the path is Stripe Connect: onboard artists as Express
connected accounts, collect payouts to them via transfers from the platform balance
(or destination charges), and keep the 10%-of-net split as the application fee logic
recorded in `lib/persephone/ledger.js`. The payout-method form already captures the
artist's preferred rail; Connect onboarding replaces the manual preference. Needs
Merlin's Stripe dashboard work (Connect settings, onboarding links) — not started.

## Notes for the FX pass
- **Ticketing purchase moment**: the buy button opens the real Stripe-hosted checkout
  (full-page redirect). A celebratory beat belongs on the `?checkout=success` return —
  currently a plain-English confirmation line. Don't over-claim: the webhook settles
  payment, the return page only confirms the redirect happened.
- **Door-entry moment**: when a ticket is paid, the holder's "walk-in" is the attendance
  join — the avatar fades in among the crowd. A door/entry transition in the 3D hall
  (camera push through the doorway glow at the back) would sell this.
- **Set-start moment**: when the broadcast room eventually goes live, the stage wash
  should bloom *on the decks only* (lighting rule: never drown the hall) and the ember
  particles can quicken — a real state change driven by the ingest confirmation, not a timer.
- The hall is dark by design; any FX must keep gold/ember accents readable, not washed.

## Merlin-only actions
1. **Stripe**: set `STRIPE_SECRET_KEY` (already needed for other surfaces); add a webhook
   endpoint `https://<app>/api/persephone/webhook` for `checkout.session.completed`;
   set `STRIPE_PERSEPHONE_WEBHOOK_SECRET` (or shared `STRIPE_WEBHOOK_SECRET`) in Vercel env.
2. **Supabase**: `supabase/persephone.sql` is a draft — folds into the final consolidated
   SQL prompt; nothing to run yet.
3. **Streaming** (future): WebRTC ingest + viewer delivery before the broadcast room can
   go live; artist onboarding for payouts via Stripe Connect when real payouts are wanted.
