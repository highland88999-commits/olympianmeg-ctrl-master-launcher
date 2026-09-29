# Entrance Cinematic Sequence — 2026-09-29

Original ~11s intro for the Nexus master launcher (G.I. Joe: Retaliation-STYLE
homage, 100% original — no footage, no audio files, no copyrighted material).
Sells the core metaphor: **we don't launch satellites, we DROP them**
(echoes the `launchPocketUniverse` entry point).

## Files

- `components/EntranceSequence.jsx` (new) — the cinematic component. Canvas 2D
  (broadcast static, glitch tears, Earth + 10 falling satellites seating into
  orbit rings) + two original SVG silhouettes (podium speaker, hooded masked
  commander) + CSS scanlines/vignette/lower-thirds. Zero external assets.
- `lib/entrance-sequence.js` (new) — pure state machine
  (`createEntranceMachine`): phases static → speech → glitch → commander → drop,
  durations, captions, skip persistence. Testable headlessly.
- `lib/entrance-audio.js` (new) — 100% Web-Audio-synthesized cues per phase
  (hiss, broadcast beeps, hijack stutter, deep sting, whoosh+thud). Guarded:
  silent no-op when AudioContext is unavailable/blocked.
- `tests/entrance-sequence.test.js` (new) — 32 headless assertions, green.
- `app/page.jsx` (modified) — mounts `<EntranceSequence>` over the live orbit
  scene after auth/guest gate; auto-plays unless the skip flag is set; adds a
  small `↺ INTRO` replay button (top-left, hub states only).

## Behavior

- Plays on entrance, before the orbit home scene. The 3D scene stays mounted
  underneath; the intro fades out → seamless handoff, never a blank screen.
- Skippable: tap/click anywhere, SKIP button, or Escape. Explicit skip persists
  `nexus_intro_skip_v1 = '1'` in localStorage — never auto-plays again.
  Watching it through does NOT persist (only the skip action does).
- Replay: `↺ INTRO` button, top-left in hub states. Replay never clears the
  skip flag.
- Mobile: full-screen, DPR-capped canvas, low-res noise tile, captions in
  `clamp()` sizes, skip button clears `env(safe-area-inset-bottom)`.
- `prefers-reduced-motion`: compressed ~4s cut, glitch jitter disabled.
- No fake systems: captions are plain English, figures are original silhouettes,
  no real-world claims. stake.com ad panels, BABEL vault, ARES untouched.

## Tests

`node tests/entrance-sequence.test.js` → **32 passed, 0 failed**.
Covers: phase order/ids/durations (total 8–12s), captions, autoplay vs skip
flag, null/throwing storage degradation, full lifecycle, skip persistence +
idempotence, completion not persisting, replay semantics, fast-cut scaling,
audio module import-safety in node. JSX of all touched files verified via the
repo's bundled SWC parser (no full production build run — coordinator owns it).

## FX pass hooks (sound/haptics)

1. `window` CustomEvent **`nexus:entrance-phase`** with `detail: { phase }`
   fires on every phase change (`static|speech|glitch|commander|drop|skipped`).
   Subscribe to layer richer sound or haptics per phase.
2. `lib/entrance-audio.js` is intentionally thin: `playPhaseSound(phase)`,
   `setEntranceAudioEnabled(bool)`, `stopAllEntranceAudio()`,
   `unlockEntranceAudio()`. Extend per-phase bodies without touching the component.
3. The overlay root carries `data-entrance-phase="<phase>"` for CSS hooks.

## Merlin-only queue

Nothing. No env vars, no SQL, no credentials. Pure client-side addition.
