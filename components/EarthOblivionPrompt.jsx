'use client';

// EarthOblivionPrompt — street-level-only advisory (Merlin, 2026-10-26):
// subtle yet obvious, at the top of the screen, gold-accented. It
// advises travelers to MAP THE WORLD to trigger Oblivion and unlock
// Earth 2, with a dinosaur hint (ancient giants still walking) —
// and nothing more: NO franchise name, NO Earth 2 details, NO
// link, NO portal, NO preview. Earth 2 stays sealed.
// No progress counter: no mapping-progress source exists in code
// (the lens cache is per-device rendered cells, not world progress).
// Placement: top-center, BELOW the first-entry movement hint's
// slot (top-5), so the two never stack. pointer-events-none, so
// it can never cover or block the vehicle/console buttons on the
// right or the view-mode pill at the bottom-left. Street level
// ONLY (earth_roam): hidden in orbit, hub, and dive views.
export const OBLIVION_PROMPT_TEXT =
  '🦕 Map this world to trigger Oblivion and unlock Earth 2 — the ancient giants still walk here, waiting to be found.';

export default function EarthOblivionPrompt({ phase }) {
  if (phase !== 'earth_roam') return null;
  return (
    <div
      className="ui-element pointer-events-none fixed left-1/2 z-[60] -translate-x-1/2 px-3"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4.25rem)' }}
    >
      <div className="max-w-[92vw] rounded-full border border-amber-400/50 bg-zinc-950/70 px-3.5 py-1.5 text-center text-[11px] font-bold leading-snug tracking-wide text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.25)] backdrop-blur-md">
        {OBLIVION_PROMPT_TEXT}
      </div>
    </div>
  );
}
