// World Engine — full-screen 3D world canvas (SSR-bypassed by the page).
// Boots PrecisionEngine once, then re-applies the store's world parameters
// (clamped through the AestheticEngine) whenever they change.
'use client';

import { useEffect, useRef } from 'react';
import { PrecisionEngine } from '@/lib/world-engine/PrecisionEngine';
import { useEngineStore } from '@/lib/world-engine/useEngineStore';
import { applyAestheticEngine } from '@/lib/world-engine/aesthetic';

export default function WorldCanvas() {
  const mountRef = useRef(null);
  const engineRef = useRef(null);
  const isInitialized = useRef(false);

  const loadSkyscraperLogic = useEngineStore((s) => s.loadSkyscraperLogic);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const bootEngine = async () => {
      if (mountRef.current && !engineRef.current) {
        const logicConfig = await loadSkyscraperLogic();
        const world = useEngineStore.getState().world;
        engineRef.current = new PrecisionEngine(mountRef.current, {
          ...logicConfig,
          ...applyAestheticEngine(world),
        });
      }
    };

    bootEngine();

    // Live-update the scene whenever world params change in the store.
    const unsubscribe = useEngineStore.subscribe((state, prev) => {
      if (state.world !== prev.world && engineRef.current) {
        engineRef.current.applyWorldParams(applyAestheticEngine(state.world));
      }
    });

    return () => {
      unsubscribe();
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
      isInitialized.current = false;
    };
  }, [loadSkyscraperLogic]);

  return <div ref={mountRef} className="absolute inset-0 z-0 h-full w-full overflow-hidden" />;
}
