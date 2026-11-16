'use client';

// PortalEnterOverlay — the step-through shared by every portal surface
// (Portal Room page + Concourse Portals 3D panel): tap a portal and you
// ride the vortex tube to the realm — the new transit system (Merlin,
// 2026-10-29). Random skins every ride (never the same back-to-back),
// the destination named ahead, and the rider's character flying in
// front of them in 3rd person. When the ride ends, onDone fires and
// the caller opens the realm's own page.
//
// The caller owns the reduced-motion decision: under
// prefers-reduced-motion it navigates instantly and never mounts
// this overlay. Mounting with program=null renders nothing.

import { useRef } from 'react';
import { pickVortexWraps } from '@/lib/vortex/wraps';
import { VORTEX_RIDE_MS } from '@/app/nexus-vortex/lib/tube.js';
import VortexTubeRide from '@/app/nexus-vortex/components/VortexTubeRide.jsx';

// The skin chain lives module-level so back-to-back portal hops never
// repeat a texture, even across separate overlay mounts.
let prevSkins = null;

export default function PortalEnterOverlay({ program, onDone, riderPrefs }) {
  // Pick a fresh skin pair per entry (render-phase adjustment, the
  // React-endorsed pattern — re-picks only when the program changes).
  const pickedFor = useRef(null);
  const skinsRef = useRef(null);
  if (program && pickedFor.current !== program) {
    pickedFor.current = program;
    prevSkins = pickVortexWraps(prevSkins);
    skinsRef.current = prevSkins;
  }
  if (!program) {
    pickedFor.current = null;
    skinsRef.current = null;
  }
  const skins = skinsRef.current;

  if (!program || !skins) return null;

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black"
      style={{ zIndex: 2147483000 }}
      role="dialog"
      aria-label={`Traveling to ${program.title}`}
    >
      <VortexTubeRide
        outsideSkin={skins.outside}
        insideSkin={skins.inside}
        destinationName={program.title}
        durationMs={VORTEX_RIDE_MS}
        onDone={onDone}
        characterPreview={riderPrefs?.characterPreview || null}
        perspective={riderPrefs?.perspective || '1st'}
      />
    </div>
  );
}
