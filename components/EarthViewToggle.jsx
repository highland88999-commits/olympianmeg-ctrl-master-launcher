'use client';
import { useEffect, useState } from 'react';
import {
  getUserViewMode,
  setUserViewMode,
  subscribeEarthViewMode,
} from '@/lib/earth/view-mode';
import { roamState } from '@/lib/earth/roam';
import OrbButton, { OrbLabel } from '@/components/world/OrbButton';

// EarthViewToggle — the camera column on the right side of the
// Earth street screen (Merlin, 2026-10-26: "camera controls
// arranged as a column down the right side starting near the
// top"). Contents, in flow, no absolute pieces inside:
//   - the first / third person toggle — a plain circle orb
//     (Circle Orb Controls Law, Merlin Nov 16: every control under
//     a game screen is a circle orb, never a rectangle), wearing
//     the shared drive-cam face; the state word rides inside
//     (1ST / 3RD), the full wording in aria-label + title.
//     Moved from its old bottom-left corner, where the steering
//     square now lives.
//   - "Reset camera": a plain circle orb wearing the shared
//     recenter face — puts the camera behind the direction of
//     travel (yaw = face, pitch back to the 14° default). Safe
//     because the flight controller only ADDS drag deltas to
//     yawDeg, so the set value holds until the next drag; while
//     standing it is a no-op, since face already equals yaw.
// Visible whenever street/roam is active, in the EarthConsole
// overlay family. The traveler's own view-mode choice rules
// everywhere, and tapping always switches.
//
// DOCKING (Merlin, 2026-11-16 — overlap audit): the column must
// never sit on top of the console card. When the console is
// EXPANDED the card fills the top-right corner (top 16 px,
// up to ~190 px tall with focus + seed + busy lines — bottom
// ~206 px), and the old fixed top of 3.25rem put both orbs
// inside the card's box, hidden behind it (card z-80 over the
// column z-70). So the parent docks the column BELOW the card
// (top 14rem = 224 px, 18 px clear of the card's worst-case
// bottom) while expanded, and back up near the top (3.25rem,
// clear of the minimized globe tab at top 32%) while minimized.
// The column never overlaps the notice pill either: the pill is
// centred (right edge ~295 px at 390 wide) and the column starts
// at x 318 px.
//
// REMOVED 2026-10-26 (Merlin: "Remove the quantum realm
// completely"): the old Quantum lock is gone — no forced third
// person, no "Quantum" label, no scale polling.
export default function EarthViewToggle({ phase, dockedBelow = false }) {
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
        top: dockedBelow
          ? 'calc(env(safe-area-inset-top, 0px) + 14rem)'
          : 'calc(env(safe-area-inset-top, 0px) + 3.25rem)',
      }}
    >
      <OrbButton
        fn="drive-cam"
        accent="#00f2ff"
        ariaLabel={`View: ${userMode} person — tap to switch`}
        title="Toggle first / third person"
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <OrbLabel>{userMode === 'first' ? '1ST' : '3RD'}</OrbLabel>
      </OrbButton>
      <OrbButton
        fn="recenter"
        accent="#00f2ff"
        ariaLabel="Reset camera behind the direction of travel"
        title="Put the camera behind the direction of travel"
        onClick={resetCamera}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <OrbLabel>RESET</OrbLabel>
      </OrbButton>
    </div>
  );
}
