'use client';
import { useEffect, useState } from 'react';
import {
  getUserViewMode,
  setUserViewMode,
  subscribeEarthViewMode,
  isMicroScale,
} from '@/lib/earth/view-mode';

// EarthViewToggle — the small first / third person button at the
// bottom-left of the Earth screen (Merlin, 2026-10-20). Visible
// whenever street/roam is active, in the EarthConsole overlay
// family (glass pill, cyan rim) and parked in the corner below
// the bike stick's patch of screen, so thumbs walking the left
// side don't land on it by accident.
//
// In the Quantum Realm the view is FORCED to third person (the
// shrunken character must stay visible in the tile world): the
// button then shows the locked state and tapping it changes
// nothing — the traveler's own choice is kept, untouched, and
// rules again the moment they grow back.
export default function EarthViewToggle({ phase }) {
  const [userMode, setUserModeState] = useState(() => getUserViewMode());
  const [micro, setMicro] = useState(() => isMicroScale());

  useEffect(() => subscribeEarthViewMode((m) => setUserModeState(m)), []);
  // The Ant-Man scale lives in a shared singleton the B / E keys
  // also mutate without React events — poll it like the bike UI
  // does (EarthConsole's standing pattern) so the lock state
  // never desyncs mid-shrink.
  useEffect(() => {
    const id = setInterval(() => {
      setMicro((prev) => {
        const next = isMicroScale();
        return prev === next ? prev : next;
      });
    }, 250);
    return () => clearInterval(id);
  }, []);

  if (phase !== 'earth_roam' && phase !== 'diving_to_street') return null;

  const effective = micro ? 'third' : userMode;
  const toggle = () => {
    if (micro) return; // forced third in the Quantum Realm
    setUserViewMode(userMode === 'first' ? 'third' : 'first');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={
        micro
          ? 'View: third person (locked in the Quantum Realm)'
          : `View: ${effective} person — tap to switch`
      }
      title={
        micro
          ? 'Third person is locked on in the Quantum Realm'
          : 'Toggle first / third person'
      }
      className={`ui-element pointer-events-auto fixed z-[70] flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[10px] font-black uppercase tracking-[0.18em] backdrop-blur-md transition-all active:scale-95 ${
        micro
          ? 'border-violet-400/50 bg-violet-950/60 text-violet-200 shadow-[0_0_18px_rgba(167,139,250,0.25)]'
          : 'border-cyan-500/40 bg-zinc-950/70 text-cyan-100 shadow-[0_0_18px_rgba(0,242,255,0.22)] hover:border-cyan-400/70'
      }`}
      style={{
        left: 'calc(env(safe-area-inset-left, 0px) + 16px)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
      }}
    >
      <span aria-hidden="true">{micro ? '🔒' : '👁'}</span>
      <span>{effective === 'first' ? '1st person' : '3rd person'}</span>
      {micro && <span className="text-[8px] tracking-[0.14em] text-violet-300/80">Quantum</span>}
    </button>
  );
}
