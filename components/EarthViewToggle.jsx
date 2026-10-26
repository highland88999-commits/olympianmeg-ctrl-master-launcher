'use client';
import { useEffect, useState } from 'react';
import {
  getUserViewMode,
  setUserViewMode,
  subscribeEarthViewMode,
} from '@/lib/earth/view-mode';

// EarthViewToggle — the small first / third person button at the
// bottom-left of the Earth screen (Merlin, 2026-10-20). Visible
// whenever street/roam is active, in the EarthConsole overlay
// family (glass pill, cyan rim) and parked in the corner below
// the bike stick's patch of screen, so thumbs walking the left
// side don't land on it by accident.
//
// REMOVED 2026-10-26 (Merlin: "Remove the quantum realm
// completely"): the old Quantum lock is gone — no forced third
// person, no "Quantum" label, no scale polling. The traveler's
// own choice rules everywhere, and tapping always switches.
export default function EarthViewToggle({ phase }) {
  const [userMode, setUserModeState] = useState(() => getUserViewMode());

  useEffect(() => subscribeEarthViewMode((m) => setUserModeState(m)), []);

  if (phase !== 'earth_roam' && phase !== 'diving_to_street') return null;

  const toggle = () => {
    setUserViewMode(userMode === 'first' ? 'third' : 'first');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={`View: ${userMode} person — tap to switch`}
      title="Toggle first / third person"
      className="ui-element pointer-events-auto fixed z-[70] flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[10px] font-black uppercase tracking-[0.18em] backdrop-blur-md transition-all active:scale-95 border-cyan-500/40 bg-zinc-950/70 text-cyan-100 shadow-[0_0_18px_rgba(0,242,255,0.22)] hover:border-cyan-400/70"
      style={{
        left: 'calc(env(safe-area-inset-left, 0px) + 16px)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
      }}
    >
      <span aria-hidden="true">👁</span>
      <span>{userMode === 'first' ? '1st person' : '3rd person'}</span>
    </button>
  );
}
