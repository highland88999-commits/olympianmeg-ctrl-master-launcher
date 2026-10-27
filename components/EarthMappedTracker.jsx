// components/EarthMappedTracker.jsx — the Earth 1 mapped
// percentage pill (Merlin, 2026-10-26: "add a perctage rendered
// tracker to the very top right"; 2026-10-26: "build the global
// team registry").
//
// Sits at the very top right of the street view only (earth_roam
// and diving_to_street), above the camera column and clear of the
// centred hint/prompt.
//
// WHAT IT SHOWS, honestly labeled:
//   * Once the global registry answers (the migration has been
//     run): the TEAM total — "Mapped X% · team map". One Earth
//     total for everyone mapping together toward Oblivion.
//   * Until then: the account's own coverage — "Mapped X% ·
//     your map". A personal number is never presented as the
//     team number, and a missing table is never an error: the
//     fetch fails silently and the personal number stands.
// The pill shows ONLY the one percentage — no per-user
// breakdown, no names, ever. The team value refreshes on mount
// and every 60 s while mounted (the registry only moves on the
// 30 s personal sync beat, so a faster poll would be noise).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { getMappedPercent, subscribeMappedPercent } from '@/lib/earth/mapping-progress';
import { GLOBAL_ROUTE, resolveTrackerDisplay } from '@/lib/earth/global-registry';

export default function EarthMappedTracker({ phase, hintVisible }) {
  const personalPercent = useSyncExternalStore(subscribeMappedPercent, getMappedPercent);
  const [globalPercent, setGlobalPercent] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      fetch(GLOBAL_ROUTE)
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
          if (cancelled) return;
          // registryReady + a real number = team total. Anything
          // else (not run yet, unreachable) = stay personal.
          if (body && body.registryReady && typeof body.globalPercent === 'number') {
            setGlobalPercent(body.globalPercent);
          } else {
            setGlobalPercent(null);
          }
        })
        .catch(() => {
          if (!cancelled) setGlobalPercent(null);
        });
    };
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (phase !== 'earth_roam' && phase !== 'diving_to_street') return null;
  // The first-entry movement hint is centred at the top; while
  // it is showing, the tracker stays hidden so nothing overlaps
  // on narrow phones. The hint is dismissible and first-entry-
  // only; the tracker is permanent once it is gone.
  if (hintVisible) return null;

  const display = resolveTrackerDisplay({ globalPercent, personalPercent });
  const label = display.scope === 'team' ? 'team map' : 'your map';
  return (
    <div
      className="pointer-events-none fixed z-[65] rounded-full border border-amber-300/60 bg-black/60 px-3 py-1 text-xs font-semibold text-amber-200 shadow-lg"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
        right: 'calc(env(safe-area-inset-right, 0px) + 0.75rem)',
      }}
      role="status"
      aria-label={`Mapped ${display.percent.toFixed(1)} percent of ${display.scope === 'team' ? 'Earth, mapped by the whole team' : 'your map'}`}
    >
      🗺 Mapped {display.percent.toFixed(1)}% · {label}
    </div>
  );
}
