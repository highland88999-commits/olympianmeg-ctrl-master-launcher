# Spotify Source Toggle — "Nexus Radio" ↔ "My Spotify" (2026-09-29)

Workstream 1 of the radio expansion. Adds a per-user playback-source toggle to
the Nexus universe radio bar. The house station is untouched — the toggle only
switches the playback *source*, never the station.

## What shipped

**Toggle.** A segmented "Nexus Radio | My Spotify" control at the top of the
expanded radio sheet (clean, minimal, matches the existing pill style).
"Nexus Radio" is the default and behaves exactly as before (official Spotify
embed, 30-second previews, deep link). "My Spotify" switches the sheet to the
user's own Spotify account panel.

**Spotify OAuth (Authorization Code + PKCE).** Public client — there is no
client secret anywhere. The browser generates the PKCE verifier/challenge and
redirects to Spotify's own login page; the code↔token exchange and every
refresh happen in server API routes. The refresh token never leaves the server;
the browser only ever holds short-lived access tokens for Spotify's own APIs.

**"My Spotify" playback.** Uses the Spotify Web Playback SDK when the account
is Premium: play/pause/next/previous on an in-app device, "Play my top
tracks", "Play my liked songs", live now-playing from real SDK events.
Honest degradation everywhere else: non-Premium accounts (or a player that
won't start) get a plain-English notice — "Full in-app playback needs Spotify
Premium — opening in Spotify instead." — plus a working "Open in Spotify"
deep link to their library. Playback state is never faked.

**Per-user persistence.** Toggle choice lives in Supabase (`radio_source_prefs`,
owner read/write) and syncs from a localStorage fallback when offline.
Switching back to "Nexus Radio" pauses nothing that isn't real; leaving the
house station pauses its embed so two sources never play over each other.

**Connect/disconnect.** Connect starts the PKCE flow (with `state` CSRF check
against sessionStorage). Disconnect deletes the stored tokens server-side and
falls back to the house station.

## Files

New:
- `lib/radio/spotify-auth.js` — pure PKCE/URL/expiry helpers (headless-tested)
- `app/api/spotify/_server.js` — server-only: admin client, session verify,
  Spotify token endpoint calls, profile read
- `app/api/spotify/callback/route.js` — OAuth landing pad; bounces back to the
  app with `?spotify_code=&spotify_state=` (no token work in the navigation)
- `app/api/spotify/exchange/route.js` — POST: verifies app user, exchanges
  code+verifier server-side, upserts `spotify_tokens`
- `app/api/spotify/token/route.js` — GET: fresh access token (refreshes
  server-side when needed); `{ connected: false }` / `{ revoked: true }`
  otherwise. Never returns the refresh token.
- `app/api/spotify/disconnect/route.js` — POST: deletes the user's tokens
- `app/api/spotify/prefs/route.js` — GET/PUT per-user source preference
- `supabase/spotify.sql` — migration (NOT executed; queued for the
  consolidated SQL): `spotify_tokens` (RLS, owner-read only, no client writes)
  + `radio_source_prefs` (RLS, owner read/write)
- `components/radio/MySpotifyPanel.jsx` — account panel: connect CTA, Premium
  playback via Web Playback SDK, honest non-Premium/device-error notices
- `tests/spotify-toggle.test.mjs` — 17/17 green
- `reports/spotify-toggle-2026-09-29.md` — this file

Modified:
- `components/radio/RadioProvider.jsx` — source state + persistence, Spotify
  connection state, OAuth start/finish actions, `getSpotifyToken()`
- `components/radio/RadioBar.jsx` — source toggle in the sheet, conditional
  panel, collapsed-bar label for "My Spotify"

## Validation

- `node --test tests/spotify-toggle.test.mjs` — **17/17 pass** (PKCE incl. the
  real RFC 7636 Appendix B vector, authorize-URL params, exchange/refresh
  bodies, expiry skew, source constants, pinned honest-degradation copy,
  station untouched, SQL migration assertions).
- `node --test tests/radio.test.mjs` — **16/16 pass** (no station regression).
- `node --check` on all 7 new JS files — clean.
- `tsc --noEmit` on the 3 JSX components — **0 errors**.
- `npm run build` NOT run (worktree rule — concurrent builds clash; the
  coordinator runs the final green build before merging).

## Queued for Merlin (user-only actions)

1. **Create a Spotify Developer app** at https://developer.spotify.com/dashboard
   (any name, e.g. "Nexus Radio").
2. **Set redirect URIs** in the app settings — both, exactly:
   - `https://olympusverse.com/api/spotify/callback`
   - `http://localhost:3000/api/spotify/callback`
3. **Add `NEXT_PUBLIC_SPOTIFY_CLIENT_ID`** to Vercel env vars (all
   environments) with the app's Client ID, then **redeploy**.
4. **Run `supabase/spotify.sql`** in the Supabase SQL editor (or fold it into
   the frozen consolidated SQL prompt — it is written idempotent and marked
   for that list).

Until (1)–(4) are done, the feature degrades honestly: the toggle renders, but
"My Spotify" shows "Spotify sign-in is not configured yet" instead of a
broken connect button. No card, no cost — Spotify developer apps are free.

## Notes / follow-ups

- Disconnect removes tokens here; the Spotify-side grant stays until the user
  revokes it in Spotify account settings — the API response says so.
- "My Spotify" transport uses the Web Playback SDK device only; it does not
  try to drive the user's other Spotify Connect devices (kept minimal).
- Branch `feature/spotify-toggle-2026-09-29` published via the incremental
  GitHub API pattern. **Not merged** — awaiting the coordinator's final green
  build + Merlin's Spotify app setup.
