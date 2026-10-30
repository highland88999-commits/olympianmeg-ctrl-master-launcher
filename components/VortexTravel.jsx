'use client';

// useVortexTravel — the one vortex system for every entry point
// (Merlin, 2026-10-29): "All entry points should use this vortex
// system we just built."
//
// Any surface that sends the user into a program/realm calls
// travel(route, name) instead of router.push(route): the fullscreen
// vortex tube ride carries them there — random skins every trip
// (module-level chain, never back-to-back repeats), the destination
// named ahead, and the rider's character medallion in 3rd person.
// Render `overlay` anywhere in the surface's DOM.
//
// External URLs skip the tube and navigate directly. Reduced-motion
// users are the caller's decision (the portal surfaces bypass; the
// hub drop and tour ride the tube).

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import VortexTubeRide from '@/app/nexus-vortex/components/VortexTubeRide.jsx';
import { pickVortexWraps } from '@/lib/vortex/wraps';
import { VORTEX_RIDE_MS } from '@/app/nexus-vortex/lib/tube.js';
import { useRiderPrefs } from '@/lib/use-rider-prefs';

// Module-level so no two trips — on any surface — repeat a texture
// back to back.
let prevSkins = null;

export function useVortexTravel() {
  const router = useRouter();
  const [trip, setTrip] = useState(null); // { route, name } | null
  const skinsRef = useRef(null);
  const prefs = useRiderPrefs();

  const travel = useCallback((route, name) => {
    if (!route) return;
    if (String(route).startsWith('http')) {
      window.location.href = route;
      return;
    }
    prevSkins = pickVortexWraps(prevSkins);
    skinsRef.current = prevSkins;
    setTrip({ route, name: name || 'Realm' });
  }, []);

  const done = useCallback(() => {
    const r = trip?.route;
    setTrip(null);
    if (r) router.push(r);
  }, [trip, router]);

  const overlay =
    trip && skinsRef.current ? (
      <div
        className="fixed inset-0 overflow-hidden bg-black"
        style={{ zIndex: 2147483000 }}
        role="dialog"
        aria-label={`Traveling to ${trip.name}`}
      >
        <VortexTubeRide
          outsideSkin={skinsRef.current.outside}
          insideSkin={skinsRef.current.inside}
          destinationName={trip.name}
          durationMs={VORTEX_RIDE_MS}
          onDone={done}
          characterPreview={prefs.characterPreview}
          perspective={prefs.perspective}
        />
      </div>
    ) : null;

  return { travel, overlay, traveling: !!trip };
}
