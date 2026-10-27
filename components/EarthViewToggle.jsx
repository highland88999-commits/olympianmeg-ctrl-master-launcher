'use client';
import { useEffect, useState } from 'react';
import {
  getUserViewMode,
  setUserViewMode,
  subscribeEarthViewMode,
} from '@/lib/earth/view-mode';
import { roamState } from '@/lib/earth/roam';

// EarthViewToggle — the camera column on the right side of the
// Earth street screen (Merlin, 2026-10-26: "camera controls
// arranged as a column down the right side starting near the
// top"). The column starts just below the mapped tracker pill
// at the very top right and stays clear of the console globe
// tab (top 32%) below it on portrait phones; on short
// landscape screens the two can crowd — a noted edge, not
// solved. Contents, in flow, no absolute pieces inside:
//   - the first / third person toggle (same glass pill, cyan
//     rim — moved from its old bottom-left corner, where the
//     steering square now lives)
//   - "Reset camera": puts the camera behind the direction of
//     travel (yaw = face, pitch back to the 14° default). Safe
//     because the flight controller only ADDS drag deltas to
//     yawDeg, so the set value holds until the next drag; while
//     standing it is a no-op, since face already equals yaw.
// Visible whenever street/roam is active, in the EarthConsole
// overlay family. The traveler's own view-mode choice rules
// everywhere, and tapping always switches.
//
// REMOVED 2026-10-26 (Merlin: "Remove the quantum realm
// completely"): the old Quantum lock is gone — no forced third
// person, no "Quantum" label, no scale polling.
export default function EarthViewToggle({ phase }) {
  const [userMode, setUserModeState] = useState(() => getUserViewMode());

  useEffect(() => subscribeEarthViewMode((m) => setUserModeState(m)), []);

  if (phase !== 'earth_roam' && phase !== 'diving_to_street') return null;

  const toggle = () => {
    setUserViewMode(userMode === 'first' ? 'third' : 'first');
  };

  const resetCamera = () => {
    // Camera behind the direction of travel, default pitch.
    roamState.yawDeg = roamState.faceDeg;
    roamState.pitchDeg = 14;
  };

  return (
    <div
      className="ui-element pointer-events-auto fixed z-[70] flex flex-col items-end gap-2"
      style={{
        right: 'calc(env(safe-area-inset-right, 0px) + 16px)',
        top: 'calc(env(safe-area-inset-top, 0px) + 3.25rem)',
      }}
    >
      <button
        type="button"
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`View: ${userMode} person — tap to switch`}
        title="Toggle first / third person"
        className="flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[10px] font-black uppercase tracking-[0.18em] backdrop-blur-md transition-all active:scale-95 border-cyan-500/40 bg-zinc-950/70 text-cyan-100 shadow-[0_0_18px_rgba(0,242,255,0.22)] hover:border-cyan-400/70"
      >
        <span aria-hidden="true">👁</span>
        <span>{userMode === 'first' ? '1st person' : '3rd person'}</span>
      </button>
      <button
        type="button"
        onClick={resetCamera}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Reset camera behind the direction of travel"
        title="Put the camera behind the direction of travel"
        className="flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[10px] font-black uppercase tracking-[0.18em] backdrop-blur-md transition-all active:scale-95 border-cyan-500/40 bg-zinc-950/70 text-cyan-100 shadow-[0_0_18px_rgba(0,242,255,0.22)] hover:border-cyan-400/70"
      >
        <span aria-hidden="true">🎥</span>
        <span>Reset camera</span>
      </button>
    </div>
  );
}
