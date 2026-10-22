'use client';

// PortalEnterOverlay — the step-through rush shared by every portal
// surface (extracted from PortalRoom.jsx): tap a portal and the view
// rushes into it — the vortex video zooms to fill the screen over
// 460 ms — then onDone fires and the realm's own page opens.
//
// The caller owns the reduced-motion decision: under
// prefers-reduced-motion it navigates instantly and never mounts
// this overlay. Mounting with program=null renders nothing.

import { useEffect, useRef } from 'react';
import { OMEGA_VORTEX_VIDEO } from '@/lib/omega-arch';

export const PORTAL_ENTER_MS = 460;

export default function PortalEnterOverlay({ program, onDone }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!program) return undefined;
    const id = setTimeout(() => {
      if (doneRef.current) doneRef.current();
    }, PORTAL_ENTER_MS);
    return () => clearTimeout(id);
  }, [program]);

  if (!program) return null;

  return (
    <div className="fixed inset-0 z-[90] overflow-hidden bg-black">
      <style>{`
        .portal-enter { animation: portal-zoom 0.46s ease-in forwards; }
        @keyframes portal-zoom {
          0% { opacity: 0; transform: scale(0.82); }
          18% { opacity: 1; }
          100% { opacity: 1; transform: scale(1.9); }
        }
      `}</style>
      <video
        className="portal-enter absolute inset-0 h-full w-full object-cover"
        src={OMEGA_VORTEX_VIDEO}
        autoPlay
        muted
        loop
        playsInline
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl text-amber-200 drop-shadow-[0_0_18px_rgba(255,190,80,0.9)]">
            Ω
          </div>
          <div className="mt-3 text-sm tracking-[0.3em] text-zinc-100">
            {program.title.toUpperCase()}
          </div>
        </div>
      </div>
    </div>
  );
}
