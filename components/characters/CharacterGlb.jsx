'use client';
// components/characters/CharacterGlb.jsx
//
// WAVE 0 — the React face of the shared character embodiment
// (lib/characters/character-glb.js). Surfaces whose render loop is
// React-driven mount this; imperative scenes (the GTA-kit walkers
// and kin) call attachCharacterGlb directly — same handles, same
// contract, same fallback law.
//
// The component renders NOTHING itself. It attaches the character's
// embodiment group to a host THREE.Object3D the surface owns, and
// (by default) drives it from its own rAF loop, reading the current
// pose from poseRef each frame so the surface never re-renders
// React to animate. The surface's native figure stays visible until
// onReady(true) — fallback is the native body, never a hole
// (see character-glb.js).
//
// Props:
//   characterId  roster characterId (required)
//   host         THREE.Object3D the embodiment group is added to
//   poseRef      ref whose .current is 'idle' | 'walk' | 'run' |
//                another driver pose, or { pose, ctx } when the
//                surface needs driver context (moveDir, ...)
//   procSize     {x,y,z} measured size of the native figure
//   registry     per-scene GLB slot registry (presence cap)
//   slotKey      cap key (per-instance in presence scenes)
//   drive        false = attach only; the surface calls
//                handleRef.current.update(...) in its own loop
//   handleRef    receives the attach handle (or null)
//   onMode       (kind: 'glb' | 'billboard' | null) => void
//   onReady      (ok: boolean) => void — hide the native figure
//                when this reports true
import { useEffect, useRef } from 'react';
import { attachCharacterGlb } from '@/lib/characters/character-glb';

export default function CharacterGlb({
  characterId,
  host,
  poseRef,
  procSize,
  registry,
  slotKey,
  drive = true,
  handleRef,
  onMode,
  onReady,
}) {
  const callbacks = useRef({ onMode, onReady });
  callbacks.current = { onMode, onReady };

  useEffect(() => {
    if (!host || !characterId) return undefined;
    const handle = attachCharacterGlb({ characterId, procSize, registry, slotKey });
    if (handleRef) handleRef.current = handle;
    if (!handle) {
      callbacks.current.onMode?.(null);
      return undefined;
    }
    host.add(handle.group);
    callbacks.current.onMode?.(handle.kind);
    let cancelled = false;
    handle.ready
      .then((ok) => { if (!cancelled) callbacks.current.onReady?.(ok); })
      .catch(() => { if (!cancelled) callbacks.current.onReady?.(false); });

    let raf = 0;
    if (drive) {
      let last = performance.now();
      const tick = (nowMs) => {
        if (cancelled) return;
        const dt = Math.min(0.1, Math.max(0, (nowMs - last) / 1000));
        last = nowMs;
        const p = poseRef ? poseRef.current : null;
        if (typeof p === 'string') handle.update(p, dt, nowMs / 1000, {});
        else if (p && typeof p === 'object') handle.update(p.pose || 'idle', dt, nowMs / 1000, p.ctx || {});
        else handle.update('idle', dt, nowMs / 1000, {});
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (handle.group.parent === host) host.remove(handle.group);
      handle.dispose();
      if (handleRef && handleRef.current === handle) handleRef.current = null;
    };
    // procSize/registry/slotKey are attach-time facts: a surface
    // that changes them remounts via characterId/host identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, host, drive]);

  return null;
}
