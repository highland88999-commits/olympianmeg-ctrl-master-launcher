# /persephone production crash — diagnosis and fix (2026-09-29)

## Symptom
`/persephone` threw "Application error: a client-side exception has occurred" in
production, persistent across reloads. No other route was affected.

## Root cause
`components/persephone/HallScene.jsx` imported `{ useReducedMotion }` from
`@react-three/drei`. The installed drei (9.122.0) does **not** export that name —
neither as a runtime export nor as a type. Webpack treats a missing ESM named
export as a build-time warning only, leaving `undefined` in the bundle, so
`npm run build` stayed green while every browser render threw
`TypeError: useReducedMotion is not a function` on HallScene's first render,
straight into the Next.js error boundary. It was the only file in the repo
importing that name, which is why only /persephone crashed.

## Fix
- Replaced the drei import with a small local `useReducedMotion()` hook in
  HallScene.jsx (reads `matchMedia('(prefers-reduced-motion: reduce)')`,
  live-updates on change, guarded for SSR/old browsers). Same reduced-motion
  behavior: ember drift and camera drift freeze when reduced motion is on.
- `Html` still comes from drei (it exists there and is used by working pages).

## Verification (no browser available to this agent; reproduced headlessly)
- Built a jsdom harness that mounts the real PersephonePage component tree:
  before the fix it threw `TypeError: useReducedMotion is not a function`
  into an error boundary (the exact production symptom); after the fix the
  full page renders with zero boundary catches.
- Mounted the real HallScene (R3F Canvas) with a stubbed WebGLRenderer:
  renders clean after the fix (remaining jsdom gaps — ResizeObserver,
  `screen` — exist in real browsers and were mocked, not code bugs).
- New regression test `tests/drei-imports.test.mjs`: scans every component
  and page for named imports from `@react-three/drei` / `@react-three/fiber`
  and asserts each name exists in the installed package (type-only imports in
  .tsx, e.g. fiber's `ThreeEvent`, are correctly allowed). Verified the test
  FAILS on the pre-fix file and passes after.
- Full suite: all green except two pre-existing, unrelated failures —
  `tests/rainbow-wok.test.js` (stale: references `app/rainbow-wok`, removed
  when Rainbow Wok was isolated to its standalone repo) and
  `tests/tools.test.js` (section-constellation ACCENT check, pre-existing).
- Production build green (`next build`, exit 0; /persephone prerendered static).

## Changed files
- `components/persephone/HallScene.jsx` (the fix)
- `tests/drei-imports.test.mjs` (new regression test)
- `reports/persephone-crash-fix-2026-09-29.md` (this report)
