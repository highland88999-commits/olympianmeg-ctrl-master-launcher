// components/EarthMappedTracker.jsx — the Earth 1 mapped
// percentage pill (Merlin, 2026-10-26: "add a perctage rendered
// tracker to the very top right").
//
// Sits at the very top right of the street view only (earth_roam
// and diving_to_street), above the camera column and clear of the
// centred hint/prompt. Reads the live percentage from the
// mapping-progress session singleton, so it updates as the
// player moves without any prop-drilling through HomeScene.
// The label is honest: "your map" — this is the account's own
// mapped coverage (device + server record unioned), NOT the
// Earth-wide team total, which needs a server registry that
// does not exist yet. Never a team number.
import { useSyncExternalStore } from 'react';
import { getMappedPercent, subscribeMappedPercent } from '@/lib/earth/mapping-progress';

export default function EarthMappedTracker({ phase, hintVisible }) {
  const percent = useSyncExternalStore(subscribeMappedPercent, getMappedPercent);
  if (phase !== 'earth_roam' && phase !== 'diving_to_street') return null;
  // The first-entry movement hint is centred at the top; while
  // it is showing, the tracker stays hidden so nothing overlaps
  // on narrow phones. The hint is dismissible and first-entry-
  // only; the tracker is permanent once it is gone.
  if (hintVisible) return null;
  return (
    <div
      className="pointer-events-none fixed z-[65] rounded-full border border-amber-300/60 bg-black/60 px-3 py-1 text-xs font-semibold text-amber-200 shadow-lg"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
        right: 'calc(env(safe-area-inset-right, 0px) + 0.75rem)',
      }}
      role="status"
      aria-label={`Mapped ${percent.toFixed(1)} percent of your map`}
    >
      🗺 Mapped {percent.toFixed(1)}% · your map
    </div>
  );
}
