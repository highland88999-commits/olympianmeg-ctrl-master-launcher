# Scroll + Safari Clearance Sweep — 2026-09-28

## Merlin's ask
> "If a page has more content than what will fit cleanly on screen, allow for scrolling. Under every page, add enough blank space at the bottom to allow all Content to scroll or rest above the browser bar on safari."

## What was done
Every route page in the launcher — all top-level `app/*/page.jsx|tsx` plus all nested
sub-route pages — now ends its scroll container with a bottom spacer:

```jsx
<div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
```

(or the equivalent inline-style variant). This guarantees content can scroll or rest
above Safari's bottom browser bar. Desktop behavior is unchanged.

## Verification performed (2026-09-28)
- **Coverage:** all 128 top-level route pages and all 21 nested route pages contain a
  genuine bottom spacer (113 worker-placed spacers across both variants, plus
  pre-existing legitimate safe-area uses in fixed controls).
- **No duplicates:** the only files with more than one spacer occurrence
  (luge, medusa/lair, agora/new, holoframe, rem, the-afterlife) were inspected
  individually — every extra spacer sits in a *different* render branch or component
  (conditional UI states, gatekeeper vs journey views, selector vs detail views), so
  each is the correct single spacer for its own scroll region. None were removed.
- **Scroll traps:** only 4 pages combine `h-screen`/`h-dvh` with `overflow-hidden`
  (basketball, battleship, chess, phone-home) — all are intentional full-screen
  game/call experiences, not clipped documents. No other page traps content.
- **Build:** `npm run build` green.
- Nested pages (e.g. `app/medusa/lair/...`, `app/agora/new/...`) included.

## Publish
- Branch: `fix/scroll-sweep-final`
- Branch commit: `a195bde3bed2a8d294f752a7f351f8dc5db15350`
- Merge commit: `644abb2e9cb49962e71482ddcf6122961037c28e`
- Scope: 140 files (139 route pages + this report). `app/raptor-rush`, `app/rogers-arena`,
  `app/astra` were excluded — owned by other in-flight work; their scroll coverage was
  already handled in their own edits and they publish separately.

## Repair found during verification
- `app/basketball/page.jsx` was found truncated by a worker killed mid-write
  (dangling `function GameScreen` stub at EOF, no references anywhere). Removed the
  stub; file is now exactly the last-good remote version plus the legitimate spacer
  edit. Included in this branch's scope.

## Follow-ups
- None for this item. Spot-check a few long pages on a real iPhone (Safari) after
  Vercel deploys the merge to confirm the clearance feels right.
