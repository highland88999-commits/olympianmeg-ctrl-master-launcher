'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PassageLink from '@/components/styx/PassageLink';
import {
  createMatrix,
  monthProgress,
  orbitStatus,
  sysStatus,
  zoneForZoom,
  nextAlignmentIn,
  formatCycle,
  alignmentActive,
} from './orbits';
import { createOrbitalRenderer } from './canvas';

const FONT = "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace";

export default function LifePage() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const stateRef = useRef(null);

  const [reducedMotion, setReducedMotion] = useState(false);
  const [hud, setHud] = useState({ progress: 0, held: false });
  const [zoomTick, setZoomTick] = useState(0);

  useEffect(() => {
    const mq =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    const rm = !!(mq && mq.matches);
    setReducedMotion(rm);
    stateRef.current = createMatrix(20260927);
    if (canvasRef.current) {
      rendererRef.current = createOrbitalRenderer(canvasRef.current, stateRef.current, {
        reducedMotion: rm,
        onHud: (next) => {
          setHud(next);
          setZoomTick((t) => t + 1);
        },
      });
      rendererRef.current.start();
    }
    return () => {
      if (rendererRef.current) rendererRef.current.dispose();
    };
  }, []);

  const resetView = useCallback(() => {
    if (rendererRef.current) rendererRef.current.resetView();
  }, []);

  const s = stateRef.current;
  const progress = hud.progress;
  const aligning = s ? alignmentActive(s) && !reducedMotion : false;

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black select-none"
      style={{ touchAction: 'none', fontFamily: FONT }}
      role="application"
      aria-label="Life — an orbital matrix visualization"
    >
      <PassageLink />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" aria-hidden="true" />

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-4 sm:p-5 pointer-events-none">
        <div
          key={zoomTick}
          className="bg-black/60 backdrop-blur-sm px-4 py-3 border-l-2 border-cyan-400/80 max-w-[78vw]"
        >
          <div className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase text-cyan-300/90">
            Orbital Matrix
          </div>
          <h1 className="text-lg sm:text-2xl font-bold text-neutral-100 tracking-widest mt-0.5">
            LIFE
          </h1>
          <div className="text-[11px] sm:text-xs text-neutral-400 mt-1.5 tracking-wider">
            ZONE: <span className="text-cyan-300 font-bold">{s ? zoneForZoom(s.zoom) : '—'}</span>
          </div>
          <div className="text-[11px] sm:text-xs text-neutral-400 mt-0.5 tracking-wider">
            SYS: <span className="text-emerald-300 font-bold">{s ? sysStatus(s) : '—'}</span>
          </div>
          <div className="text-[11px] sm:text-xs text-neutral-400 mt-0.5 tracking-wider">
            ORBIT:{' '}
            <span className="text-amber-300 font-bold">{s ? orbitStatus(s) : '—'}</span>
          </div>
          <div className="mt-2">
            <div className="text-[10px] sm:text-[11px] text-neutral-500 tracking-wider flex justify-between">
              <span>MONTH CYCLE</span>
              <span className="text-emerald-300 font-bold">{formatCycle(progress)}</span>
            </div>
            <div
              className="mt-1 h-1.5 w-40 sm:w-52 bg-white/10 rounded overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Month cycle progress"
            >
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-emerald-300 rounded"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
          <div className="text-[10px] sm:text-[11px] text-neutral-500 mt-1.5 tracking-wider">
            NEXT ALIGNMENT: <span className="text-teal-300">{s ? nextAlignmentIn(s) : '—'}</span>
          </div>
          {reducedMotion && (
            <div className="text-[10px] text-neutral-500 mt-1 tracking-wider">
              HELD STILL — REDUCED MOTION
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {aligning && (
            <div className="text-white text-xs sm:text-sm font-bold tracking-[0.3em] animate-pulse px-2">
              ALIGNMENT
            </div>
          )}
          <button
            onClick={resetView}
            className="pointer-events-auto px-3 py-2 rounded border border-white/20 bg-white/5 text-neutral-300 text-[11px] sm:text-xs tracking-[0.2em] uppercase backdrop-blur-sm hover:bg-white/15 transition-colors"
            aria-label="Reset the orbital view"
          >
            Reset view
          </button>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-5 pointer-events-none px-4">
        <p className="text-[10px] sm:text-xs tracking-[0.25em] uppercase text-white/40 text-center">
          {reducedMotion
            ? 'Six rings, held in frame'
            : 'Drag to tilt the matrix · scroll or pinch to zoom'}
        </p>
      </div>
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
    </div>
  );
}
