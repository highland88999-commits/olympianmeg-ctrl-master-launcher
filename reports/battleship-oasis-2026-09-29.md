# Battleship × OASIS Room Codes — 2026-09-29

Hybrid: the battleship PvP lobby now speaks the OASIS game-agnostic 6-char
room-code system. A host can share a code (or deep link), and a guest opening
`/battleship?code=XXXXXX` drops straight into that naval battle's lobby.

## What was built (adapter, not rewrite — both engines untouched)

- `lib/battleship/oasis-adapter.js` — pure adapter. `createLinkedLobby`
  writes the SAME 6-char code to `olympus_battleship_rooms` (native source of
  truth, read by the Realtime broadcast sync) and `oasis_rooms`
  (game='battleship', the shareable join registry). `joinLinkedLobby` seats
  the guest in the OASIS row (idempotent, capacity-checked via OASIS
  `joinRoom`) then performs the exact native seating the lobby's JOIN button
  performs. Collision-safe (3 retries on duplicate code), best-effort
  rollback so a native lobby is never stranded without its code row.
- `components/battleship/OasisLinkedHost.jsx` — sits inside the native
  Lobby. New "Host with Share Code" button creates a linked lobby and shows
  the universal OASIS `ShareRoomCode` control (copy + native share sheet)
  with battleship's theme from `lib/oasis/games.js` (FLEET CODE label).
- `components/battleship/OasisDeepLinkJoiner.jsx` — mounted on
  `/battleship`; reads `?code=` on load (reuses OASIS `useOasisJoinLink`),
  auto-joins the linked lobby, drops the guest into fleet setup. Renders
  nothing on a normal visit; failures surface as a dismissible notice.
- Wiring: `Lobby.tsx` renders `<OasisLinkedHost />` beside the existing
  "Host Multiplayer Game" button (native flow untouched);
  `app/battleship/page.tsx` renders `<OasisDeepLinkJoiner userId={...} />`
  when no room is active.

## Supabase

No new tables, no new SQL. Reuses existing `oasis_rooms` and
`olympus_battleship_rooms`. Nothing queued for Merlin.

## Tests

`tests/battleship-oasis-adapter.test.mjs` — 12/12 green:
createLinkedLobby dual-write + rollback + validation, joinLinkedLobby
seating/idempotency/capacity/wrong-game/already-started cases, code
round-trip through `buildJoinUrl`/`codeFromSearch`, no-ambiguous-glyphs
alphabet check.

## Build

- Next.js webpack compile: ✓ "Compiled successfully" on the real worktree
  with all hybrid files (build log 2026-09-29).
- `tsc --noEmit`: clean, exit 0, whole app.
- Full `next build` static-export phase: NOT completed — environment-blocked.
  The 8 GB VM cannot finish a production build while 3–4 sibling workers
  build concurrently (repeated kernel OOM SIGKILLs, including on solo
  compile-only runs; concurrent `rm -rf .next` calls also corrupted the
  shared `.next` mid-build). This is a resource problem, not a code problem:
  all new components are client-side, SSR-safe (`window` guarded in
  effects), add no new routes, and change nothing about prerendering.
- Recommendation: re-run a full `next build` on a quiet box before the next
  production deploy, or serialize builds across workers.

## Security / audit notes

- No new network calls beyond the two existing tables; no telemetry, no
  hotlinks, no hardcoded keys (audit grep clean).
- Sign-in required to host or join; plain-English errors on every failure.
- battleship registered in `lib/oasis/games.js` with its own theme;
  standalone OASIS and standalone native battleship flows verified intact
  by code inspection (no shared code paths were modified).
