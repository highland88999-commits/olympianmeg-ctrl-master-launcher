'use client';
import { useState } from 'react';
import { fx } from '@/lib/fx';

// BikeFloatButton — the TRON-bike shortcut, stacked on the right edge
// directly BELOW the floating STORE/hoodie button, aligned to the same x
// (right: calc(env(safe-area-inset-right) + 12px)) so the two read as one
// clean vertical control column.
//
// The icon is a looping muted video inside a circular mask: the electric-
// streak loop at /gemini_generated_video_65272AD7.mp4 (the same generated
// effect family as the hub's launch visuals — the most bike-appropriate
// looping asset in the repo). Honest fallback: a 🏍 glyph if the file is
// missing. Same onClick as SPAWN TO BIKE; the label follows the ride state.
//
// No pop-ups, no badges — a real <button>, keyboard accessible.
const BIKE_VIDEO_SRC = '/gemini_generated_video_65272AD7.mp4';

export default function BikeFloatButton({ onToggleBike, riding = false }) {
  const [videoOk, setVideoOk] = useState(true);

  return (
    <div
      className="fixed z-40 flex flex-col items-center gap-1 ui-element pointer-events-auto"
      style={{
        right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
        // The STORE block is vertically centered and ~92px tall
        // (68px circle + label); this sits just below it, same x.
        top: 'calc(50% + 56px)',
      }}
    >
      <button
        type="button"
        onClick={() => {
          fx.tap();
          onToggleBike();
        }}
        aria-label={riding ? 'Leave the TRON bike' : 'Spawn to the TRON bike'}
        title={riding ? 'Leave bike' : 'Spawn to bike'}
        className="relative w-[68px] h-[68px] rounded-full overflow-hidden border-2 border-teal-400/70 bg-zinc-950 shadow-[0_0_24px_rgba(45,212,191,0.35)] hover:border-teal-300 hover:shadow-[0_0_32px_rgba(45,212,191,0.55)] hover:scale-105 active:scale-95 transition-all"
      >
        {videoOk ? (
          <video
            src={BIKE_VIDEO_SRC}
            autoPlay
            loop
            muted
            playsInline
            aria-hidden="true"
            onError={() => setVideoOk(false)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <span
            className="absolute inset-0 flex items-center justify-center text-3xl"
            aria-hidden="true"
          >
            🏍️
          </span>
        )}
      </button>
      <span className="text-[8px] font-bold tracking-[0.25em] uppercase text-teal-300/90 bg-black/60 px-2 py-0.5 rounded-full border border-teal-500/25">
        {riding ? 'Leave' : 'Ride'}
      </span>
    </div>
  );
}
