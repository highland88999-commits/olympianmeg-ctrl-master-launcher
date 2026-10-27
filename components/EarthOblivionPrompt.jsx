'use client';

import { useState } from 'react';

// EarthOblivionPrompt — the mission panel (Merlin, 2026-10-26):
// subtle yet obvious, at the top of the screen, gold-accented. It
// advises travelers to MAP THE WORLD to trigger Oblivion and unlock
// Earth 2, with a dinosaur hint (ancient giants still walking) —
// and nothing more: NO franchise name, NO Earth 2 details, NO
// link, NO portal, NO preview. Earth 2 stays sealed.
// Behavior (Merlin, 2026-10-26): it appears EVERY time a user
// enters Earth 1 street level, and ONE tap on the pill dismisses
// it for the rest of that page load — dismissal is in-memory
// state only, never stored anywhere (no device storage, no
// account setting, no "don't show again"), so the next load
// shows it again.
// Placement: top-center, BELOW the first-entry movement hint's
// slot (top-5), so the two never stack. The outer wrapper stays
// pointer-events-none so nothing outside the pill can be blocked;
// the pill itself is pointer-events-auto and is the tap target.
// Street level ONLY (earth_roam): hidden in orbit, hub, and dive
// views. The pill is a plain tappable div, not a button or link,
// so it can never navigate anywhere.
export const OBLIVION_PROMPT_TEXT =
  '🦕 Map this world to trigger Oblivion and unlock Earth 2 — the ancient giants still walk here, waiting to be found.';

export default function EarthOblivionPrompt({ phase }) {
  const [dismissed, setDismissed] = useState(false);
  if (phase !== 'earth_roam' || dismissed) return null;
  return (
    <div
      className="ui-element pointer-events-none fixed left-1/2 z-[60] -translate-x-1/2 px-3"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4.25rem)' }}
    >
      <div
        role="button"
        aria-label="Dismiss mission panel"
        title="Tap to dismiss"
        onClick={() => setDismissed(true)}
        className="pointer-events-auto max-w-[92vw] cursor-pointer rounded-full border border-amber-400/50 bg-zinc-950/70 px-3.5 py-1.5 text-center text-[11px] font-bold leading-snug tracking-wide text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.25)] backdrop-blur-md"
      >
        {OBLIVION_PROMPT_TEXT}
        <span aria-hidden="true" className="ml-2 text-amber-300/80">✕</span>
      </div>
    </div>
  );
}
