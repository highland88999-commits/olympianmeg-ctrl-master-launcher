'use client';

// components/HubPulseGlow.jsx
//
// The shared 30 s glow-pulse ring (Merlin, Nov 27, 2026): once every
// 30 seconds a glow swells up and fades down around the outline of the
// FLIGHT AXIS pill and the hub icon (Concourse Orb) — a visual
// indicator for motion, subtle but eye-catching. One component, one
// keyframes animation (`.hub-pulse-glow`, app/globals.css), used by
// both elements so they pulse together.
//
// The wall-clock alignment lives here, not in render: the negative
// animation-delay is set in an effect after mount, so server HTML and
// the first client render match (no hydration mismatch) and the
// animation lands mid-cycle at the wall-clock phase — two elements
// mounted at different times still swell and fade in sync. The ring
// is pointer-events-none: it never steals taps or changes any mode.

import { useEffect, useRef } from 'react';
import { pulseDelaySeconds } from '@/lib/seasonal/hub-christmas-fx';

export default function HubPulseGlow() {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.animationDelay = `-${pulseDelaySeconds()}s`;
    }
  }, []);
  return <span ref={ref} aria-hidden="true" className="hub-pulse-glow" />;
}
