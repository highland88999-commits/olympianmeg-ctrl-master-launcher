# Presence integration recipe — 2026-09-29

**Status:** library complete and tested. Route wiring NOT done yet — intentionally left to the
route owners (app/nova, app/myriad, app/argo, app/enyo). This doc is the recipe they follow.

## What exists (already merged into the worktree)

| File | Purpose |
|---|---|
| `lib/presence.js` | Presence client. Pure helpers (`isStale`, `peerKey`, `sanitizeLabel`, `makeSessionId`, `shouldSendUpdate`, `sanitizePos`, `mapRowToPeer`) + `createPresenceClient(supabase, opts)`. ~2.5s upsert cadence (`UPDATE_MS`), ~2.5s poll cadence (`POLL_MS`), 15s client-side stale drop (`STALE_MS`). Detects the missing `presence` table (error `42P01`) and goes silent/solo — no crash, no console spam. |
| `components/presence/GhostRiders.jsx` | Self-contained `<GhostRiders peers visible />` for `@react-three/fiber` scenes. Translucent geometric ghost bikes (no TronBikes import — stays cheap), peer-color glow, canvas-sprite name labels, hover bob + position lerp. Renders nothing when `peers` is empty/malformed. |
| `supabase/presence.sql` | **DRAFT — DO NOT RUN.** `presence` table (uuid `id` PK, `user_label`, `sector`, `pos` jsonb, `vehicle`, `color`, `updated_at`), RLS on (everyone reads last-30s rows; owner writes own row; anon best-effort until auth ships), `purge_stale_presence()` for scheduled cleanup. Folds into the final consolidated SQL when the Takeout freeze lifts. |
| `tests/presence.test.js` | 62 headless tests (pure helpers, fake-DB client flows, missing-table degradation, source checks). Run: `node tests/presence.test.js`. |

## Shared peer shape

```js
{ id, label, sector, pos: {x,y,z}, vehicle, color, ts } // rendered form
// DB row: { id uuid, user_label, sector, pos jsonb, vehicle, color, updated_at }
```

## How to wire a route (NOVA / MYRIAD / ARGO — owners copy this)

Do this INSIDE the flight-scene component that already has access to the live bike state
(`flightRef` / `inputRef` in NOVA-style scenes). GhostRiders must render INSIDE the `<Canvas>`.

```jsx
import { createPresenceClient, POLL_MS } from '@/lib/presence';
import GhostRiders from '@/components/presence/GhostRiders';
import { supabase } from '@/lib/supabase'; // proxy — presence no-ops if env missing

function NovaScene({ flightRef, bikeKey, sectorKey, ...rest }) {
  const [peers, setPeers] = useState([]);
  const presenceRef = useRef(null);

  // 1. Join once per sector.
  useEffect(() => {
    const client = createPresenceClient(supabase, {
      sector: `nova:${sectorKey}`,            // MYRIAD: `myriad:${universeId}` · ARGO: `argo:earth`
      getState: () => ({
        pos: flightRef.current?.pos ?? { x: 0, y: 0, z: 0 },
        vehicle: bikeKey,                    // wisp | comet | atlas
        color: profileBikeGlow ?? '#22d3ee', // from /profile when wired
      }),
      label: profileCallsign ?? 'Rider',
      vehicle: bikeKey,
      onPeers: (p) => setPeers(p),
    });
    presenceRef.current = client;
    client.join();
    return () => { client.leave(); };        // remove our row on exit/unmount
  }, [sectorKey]);                            // re-join on wormhole/universe jump

  // 2. Push state every frame (cheap — internally throttled to 2.5s).
  useFrame(() => { presenceRef.current?.update(); });

  return (
    <>
      {/* existing scene */}
      <GhostRiders peers={peers} visible />   {/* 3. render other riders */}
    </>
  );
}
```

## Wiring checklist per route

- [ ] NOVA (`app/nova/page.jsx`): sectors `nova:shallows` | `nova:gift-drift` | `nova:spiral-reach`. Re-join on wormhole jump (sectorKey change). GhostRiders inside `<Canvas>`.
- [ ] MYRIAD (`app/myriad/page.jsx`): sector `myriad:<1-100>` per universe. Re-join on universe change.
- [ ] ARGO (`app/argo/page.jsx`): sector `argo:earth` (destination can ride in `pos`/`vehicle`; keep one sector until per-city scope is decided).
- [ ] ENYO: FPS — optional; skip unless the FPS builder asks for it.
- [ ] Profile labels/colors (`app/profile`): feed `label`/`color` into `join()`/`setLabel()`/`setColor()` so ghost riders show real names and /profile bike-glow colors. Until then defaults are safe.
- [ ] `leave()` on unmount/sector change; the SQL purge is backstop, not primary.

## Why this shape is safe

- **No Realtime, no websockets** — plain Supabase `upsert`/`select` on a 2.5s timer (OASIS pattern).
- **Solo until SQL lands** — table absent ⇒ first 42P01 ⇒ client goes silent, page renders alone.
- **Self-throttling** — `update()` ignores calls inside the 2.5s window; `document.hidden` skips polls.
- **Stale dropped twice** — 30s server read window (RLS) + 15s client drop in `mapRowToPeer`.
- **Abuse surface is minimal** — rows are ephemeral; labels are sanitized (no `<>`, 24 chars);
  purge function clears abandoned sessions.
