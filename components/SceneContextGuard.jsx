'use client';

// components/SceneContextGuard.jsx — React Three Fiber adapter for
// lib/scene-context-guard.js (fleet context-loss rollout, 2026-10-15).
//
// Usage in any component that renders an R3F <Canvas>:
//
//   const sceneGuard = useSceneContextGuard({ label: 'ARGO' });
//   <Canvas onCreated={sceneGuard.onCreated}>…</Canvas>
//
// What it does (the Kombat pattern, carried fleet-wide):
//   - attaches guardCanvasContext to the real canvas on creation;
//   - a transient loss heals silently on webglcontextrestored;
//   - while the context is lost, an 'always' frameloop is frozen
//     (best-effort — restored verbatim on heal) so the scene never
//     plays out blind;
//   - a loss that stays gone past the grace window surfaces the
//     shared FEED LOST fallback with a reload-the-scene button.
// Capable browsers see zero change: no state, no overlay, no extra
// renders until a loss actually happens. A component may render
// several Canvases (the skyscraper floors) — every onCreated call
// guards its own canvas, and all guards dispose on unmount.

import { useEffect, useRef } from 'react';
import { guardCanvasContext } from '@/lib/scene-context-guard';

export function useSceneContextGuard(opts = {}) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const guardsRef = useRef([]);

  const onCreated = (state) => {
    const canvas = state && state.gl && state.gl.domElement;
    if (!canvas) return;
    let prevFrameloop = null;
    const guard = guardCanvasContext(canvas, {
      ...optsRef.current,
      onLost: () => {
        try {
          if (state && state.frameloop === 'always') {
            prevFrameloop = state.frameloop;
            state.set({ frameloop: 'never' });
          }
        } catch { /* freeze is best-effort; the fallback still applies */ }
        try { optsRef.current.onLost && optsRef.current.onLost(); } catch { /* scene hooks are optional */ }
      },
      onRestored: () => {
        try {
          if (prevFrameloop && state) {
            state.set({ frameloop: prevFrameloop });
            prevFrameloop = null;
          }
        } catch { /* as above */ }
        try { optsRef.current.onRestored && optsRef.current.onRestored(); } catch { /* as above */ }
      },
    });
    guardsRef.current.push(guard);
  };

  useEffect(
    () => () => {
      for (const g of guardsRef.current) {
        try { g.dispose(); } catch { /* teardown is best-effort */ }
      }
      guardsRef.current = [];
    },
    [],
  );

  return { onCreated };
}

export default useSceneContextGuard;
