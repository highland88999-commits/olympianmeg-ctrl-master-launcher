# Mega City subway — 2026-09-29

Merlin asked: put the train system underground, load it through opening doors, and make sure cars never have to stop for trains.

## What changed (`app/mega-city/scene.js`)

- **Removed** the elevated skyway monorail (rail at y=470, support pillars, glow train).
- **New underground line** drawn as a cutaway: soil strata between the street (y=790) and a bored tunnel (y=872–952), with wall seams, tunnel lights, sleepers, and twin rails at y=928.
- **3 stations** — NEON HARBOR (x=350), SPIRE DISTRICT (x=800), DATA BAZAAR (x=1250) — each with a platform deck at train-floor height, edge warning dashes, hanging sign, platform lights.
- **Train behavior** (state machine: cruise → brake → dwell → depart): cruises at 150 px/s, brakes at 130 px/s² into the station, dwells 3.4 s, departs at 90 px/s². Wraps around the line forever.
- **Opening doors for loading**: each of the 3 cars has 2 sliding door pairs that open during the dwell (0.7 s open / hold / 0.7 s close), revealing a warm lit interior. Each station also has a street-level glass kiosk ("SUBWAY" sign) with double doors and a stair shaft down to the platform — the kiosk doors slide open in sync with the train dwelling at that station.
- **Cars never stop for trains**: the line is fully grade-separated — no level crossings exist anywhere, so the existing street traffic logic is untouched and cars keep flowing.
- **Reduced motion**: frozen tableau — train dwelling at Spire District with doors open.
- District + hotspot entries renamed from "Skyway Ring" to "Subway — Line One" (hotspot at x=800, y=910; tapping it pans the camera down to the tunnel).

## Verification

- `tests/mega-city.test.mjs`: **74/74 green** — subwayAhead wrap math, next-station selection, braking distances, door open/hold/close curve, full stop–dwell–depart cycle, long-run stability (6+ station stops, finite positions, non-negative speed), registration checks, and source-level checks (no monorail remnants, no crossing logic, no telemetry).
- Production build: green (`next build`, exit 0).
