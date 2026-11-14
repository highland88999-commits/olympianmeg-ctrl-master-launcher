// components/useRealmInfoFade.js — REALM INFO OVERLAY FADE (Merlin, Nov 13, 2026).
//
// In all 24 heaven/hell realms the realm information (title, tagline,
// "You are in: ...", hint pill) overlays the top of the screen. A
// click or tap anywhere on the screen fades that overlay out — a
// smooth opacity fade, never a hard cut — so the world underneath
// shows through. The overlay is pointer-events-none already, so the
// click that fades it still reaches the scene underneath (drag to
// look, the touch stick, arches, buttons). A small "Info" button
// brings the overlay back; the information is never lost for good.
//
// The overlay itself is per-realm code (each realm page renders its
// own HUD block); this hook is the ONE shared piece — every realm
// page wires the same fade the same way. Reduced motion: no
// transition, the overlay goes instantly (still opacity, still no
// hard removal from layout).

import { useCallback, useState } from 'react';

// One fade length for every realm — the same feel everywhere.
export const REALM_INFO_FADE_MS = 600;

export function useRealmInfoFade({ reduced = false } = {}) {
  const [infoHidden, setInfoHidden] = useState(false);

  // Fade out on any click/tap on the screen. Already hidden: no-op,
  // so repeated clicks never re-render.
  const fadeInfo = useCallback(() => {
    setInfoHidden((was) => (was ? was : true));
  }, []);

  // Bring the overlay back (the small Info button).
  const restoreInfo = useCallback(() => {
    setInfoHidden(false);
  }, []);

  // Opacity only — the overlay stays mounted, keeps its place in
  // layout, and never swallows a click (it is pointer-events-none).
  const infoStyle = {
    opacity: infoHidden ? 0 : 1,
    transition: reduced ? 'none' : `opacity ${REALM_INFO_FADE_MS}ms ease-out`,
  };

  return { infoHidden, fadeInfo, restoreInfo, infoStyle };
}
