# Google Photorealistic 3D Tiles — Earth module (2026-09-28)

Merlin: "Do it!" — wired Google's photorealistic 3D tiles into the hub Earth
as a real data layer, with the ESRI satellite lens kept as the honest fallback.

## What changed

- `app/api/earth/tiles/session/route.js` (new) — `GET /api/earth/tiles/session`.
  Mints a short-lived Map Tiles 3D-tiles session token server-side from
  `GOOGLE_MAP_TILES_API_KEY`. The key never leaves the server: the client only
  ever receives the session token, which Google accepts on tile requests in
  place of the key. Honest failures: **503** when the key isn't configured,
  **502** when Google rejects the exchange. The server-side call sends
  `Referer: https://nexus-phi-taupe.vercel.app/` because the production key is
  HTTP-referrer-restricted to that origin.
- `lib/maptiles.js` (new) — pure, headless-testable session logic: request
  construction (exact URL, POST, headers, body), `withSession()` tile-URL
  helper, expiry math, and the full `createMapTilesSession()` exchange with an
  injectable fetch. No DOM, no THREE.
- `components/GoogleEarthTiles.jsx` (new) — renders Google's photorealistic
  3D tileset as the hub globe via `3d-tiles-renderer` (lazy dynamic import, so
  it never touches SSR or the initial bundle). ECEF meters are scaled to the
  55-unit hub globe and rotated Z-up → Y-up so the photorealistic globe lines
  up exactly with the stylized globe (prime meridian +X, north pole +Y) and
  follows the shared `quatRef` treadmill. Every tile request carries the
  current session token via `preprocessURL`; the token refreshes 5 minutes
  before expiry. If the session can't be minted, the tileset won't load, or a
  refresh fails, it reports the failure and renders nothing — NexusEarth falls
  back to the ESRI lens. No fake tiles, no simulated loading states.
- `components/NexusEarth.jsx` — tries the photorealistic layer on mount but
  only claims it after the tileset really loads (`'Photorealistic · Google'`
  badge). Until then, and on any failure, the existing stylized globe + ESRI
  lens renders (`'Satellite · ESRI'` badge). The lens patch hides while the
  photorealistic globe is active. Click-through (`onSelect`) works in both
  modes; hover raycasting is click-only in tile mode to protect mobile perf.
- `package.json` / `package-lock.json` — added `3d-tiles-renderer@0.3.34`
  (peer `three >= 0.123.0`; repo has three 0.164.1 — installs clean, no
  `--legacy-peer-deps`).
- `tests/maptiles.test.mjs` (new) — 62 headless assertions (see below).

## Tests

- `tests/maptiles.test.mjs`: **62 passed, 0 failed** — covers the exact
  session-request construction (URL, POST, Referer header, satellite body),
  honest 503 with zero network calls when the key is missing, 502 on Google
  rejection/network throw/tokenless body, API-key isolation (token response
  never carries the key), `withSession` URL handling, expiry math, plus
  structural checks on the route (force-dynamic, no hardcoded key, no
  NEXT_PUBLIC) and components (client never references the key env var,
  lazy renderer import, refresh + dispose + fallback wiring, plain-English
  layer badge).
- Full suite: **44/44 test files pass** (includes the new file).
- `npm run build`: **passes** (verified in a scratch copy of main + only
  these files; see limitation below).

## Publish

- Branch: `earth-google-photorealistic-tiles` (merged to `main`; SHAs in the
  delivery report)

## Honest limitations

1. **The live session call is unverified against the real key.** There is no
   key in this environment (and there shouldn't be), so the server route's
   `POST https://tile.googleapis.com/v1/3dtiles/sessions` — including the
   `Referer`-header behavior against the key's HTTP-referrer restriction —
   has only been exercised with mocked fetch. If Google rejects it in
   production, the route returns an honest 502 and Earth stays on the ESRI
   lens; nothing will look broken, it just won't upgrade. Worth one live
   check: `curl https://nexus-phi-taupe.vercel.app/api/earth/tiles/session`
   should return 200 with a session token.
2. **Another thread's in-flight economy work is in this worktree**
   (`lib/economy/*`, `app/api/economy/*`, `components/economy/*`,
   `supabase/gold.sql`, plus edits to checkout routes and pages). It is
   **not published** and currently **breaks `npm run build`** in the shared
   worktree (`lib/economy/ledger.js` fails webpack parsing). My branch
   contains only the 8 Earth files; the build was verified green in an
   isolated copy of main + my files. The economy thread's build break is
   theirs to fix — do not treat this merge as covering it.
3. Tile detail is capped at `errorTarget: 24` with a modest tile cache to
   stay mobile-friendly; it can be tuned up for desktop if Merlin wants more
   crispness at the cost of bandwidth.
4. The photorealistic globe replaces the stylized day/night shader while
   active (Google's tiles are daytime imagery). The atmosphere shell stays.
