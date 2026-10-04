'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createState, formatDecay, stageLabel, zoneLabel, applyPan } from './decay';
import { createAntiLifeRenderer } from './canvas';
import PassageLink from '@/components/styx/PassageLink';
import { panelTileStyle } from '@/lib/hestia/ambience';

const FONT = "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace";

function Glyph({ size = 13, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {children}
    </svg>
  );
}

export default function AntiLifePage() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const stateRef = useRef(null);
  const seedRef = useRef(20260927);

  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false); // renderer built — world is shaped
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hud, setHud] = useState({ decay: 0, ashfall: false, held: false });

  useEffect(() => {
    const mq =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    const rm = !!(mq && mq.matches);
    setReducedMotion(rm);
    stateRef.current = createState(seedRef.current);
    if (canvasRef.current) {
      rendererRef.current = createAntiLifeRenderer(canvasRef.current, stateRef.current, {
        reducedMotion: rm,
        onHud: (next) => setHud(next),
      });
      setReady(true);
    }
    return () => {
      if (rendererRef.current) rendererRef.current.dispose();
    };
  }, []);

  const begin = useCallback(() => {
    setStarted(true);
    if (rendererRef.current) rendererRef.current.start();
  }, []);

  const reset = useCallback(() => {
    seedRef.current = (seedRef.current * 1103515245 + 12345) >>> 0;
    if (rendererRef.current) rendererRef.current.reset(seedRef.current);
  }, []);

  // Keyboard: arrows drift through the world without a pointer.
  useEffect(() => {
    const onKey = (e) => {
      if (!started || reducedMotion) return;
      const s = stateRef.current;
      if (!s) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        applyPan(s, (e.key === 'ArrowRight' ? 1 : -1) * 60);
      } else if ((e.key === 'Enter' || e.key === ' ') && !started) {
        e.preventDefault();
        begin();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, reducedMotion, begin]);

  const decay = hud.decay;
  const zone = stateRef.current ? zoneLabel(stateRef.current.cameraX, decay) : '—';
  // Zone text needs the live camera; re-derive on each HUD tick via a tick key.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setTick((t) => t + 1);
  }, [hud]);

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black select-none"
      style={{ fontFamily: FONT }}
      role="application"
      aria-label="Anti-Life — an interactive study of impermanence"
    >
      <style>{`
        /* Page-level lift: PassageLink (shared component, can't edit) sits at
           bottom:1.25rem, which is under the fixed radio bar. Keep it above. */
        a[href="/styx?advanced=1"] { bottom: max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem)) !important; }
      `}</style>
      <PassageLink />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" aria-hidden="true" style={{ touchAction: 'none' }} />

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-4 sm:p-5 pointer-events-none">
        <div className="relative overflow-hidden bg-black/60 backdrop-blur-sm px-4 py-3 border-l-2 border-red-500/80 max-w-[78vw]">
          <div aria-hidden="true" className="absolute inset-0 opacity-25 pointer-events-none" style={panelTileStyle()} />
          <div className="relative">
          <div className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase text-red-400/90">
            Entropy Core
          </div>
          <h1 className="text-lg sm:text-2xl font-bold text-neutral-200 tracking-widest mt-0.5">
            ANTI-LIFE
          </h1>
          <div key={tick} className="text-[11px] sm:text-xs text-neutral-400 mt-1.5 tracking-wider">
            ZONE: <span className="text-neutral-200 font-bold">{zone}</span>
          </div>
          <div className="text-[11px] sm:text-xs text-neutral-400 mt-0.5 tracking-wider">
            STAGE: <span className="text-neutral-200 font-bold">{stageLabel(decay)}</span>
          </div>
          <div className="text-[11px] sm:text-xs text-neutral-400 mt-0.5 tracking-wider">
            DECAY: <span className="text-red-400 font-bold">{formatDecay(decay)}</span>
          </div>
          {reducedMotion && (
            <div className="text-[10px] text-neutral-500 mt-1 tracking-wider">
              HELD STILL — REDUCED MOTION
            </div>
          )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {hud.ashfall && (
            <div className="text-red-500 text-xs sm:text-sm font-bold tracking-[0.3em] animate-pulse px-2">
              ASHFALL
            </div>
          )}
          <button
            onClick={reset}
            className="pointer-events-auto inline-flex items-center gap-2 px-3 py-2 rounded border border-white/20 bg-white/5 text-neutral-300 text-[11px] sm:text-xs tracking-[0.2em] uppercase backdrop-blur-sm hover:bg-white/15 transition-colors"
            aria-label="Begin the world again with a new seed"
          >
            <Glyph size={13}>
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </Glyph>
            Begin again
          </button>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-[calc(4.5rem+env(safe-area-inset-bottom))] pointer-events-none px-4">
        <p className="text-[10px] sm:text-xs tracking-[0.25em] uppercase text-white/40 text-center">
          {reducedMotion ? 'A world, held mid-breath' : 'Drag to move through time — the world fades where you pass'}
        </p>
      </div>

      {/* Begin overlay — frames the piece before anyone enters */}
      {!started && (
        <button
          onClick={begin}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-[2px] cursor-pointer px-6 py-8 text-center overflow-y-auto"
          aria-label="Enter the Anti-Life art piece"
        >
          <img src="/images/anti-life/bg-embers.webp" alt="" aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/85 pointer-events-none" />
          <span className="relative text-[10px] tracking-[0.4em] uppercase text-red-400/80">Entropy Core</span>
          <span
            className="relative text-3xl sm:text-5xl font-bold text-neutral-100 tracking-[0.2em] mt-2"
            style={{ textShadow: '0 0 24px rgba(255,0,68,0.45)' }}
          >
            ANTI-LIFE
          </span>
          <span className="relative text-xs sm:text-sm text-neutral-400 mt-4 max-w-md leading-relaxed">
            An interactive study of impermanence. A living world of woods and towers —
            your passage moves time forward, and nothing that fades here is mourned.
            Everything passes, as everything does.
          </span>
          <span className="relative mt-6 px-6 py-3 rounded-full border border-red-500/50 text-red-300 text-xs sm:text-sm tracking-[0.25em] uppercase inline-flex items-center gap-2.5">
            {!ready ? (
              <span className="inline-flex items-center gap-2.5 animate-pulse">
                <Glyph size={14}>
                  <circle cx="12" cy="12" r="9" strokeDasharray="42" strokeDashoffset="14" />
                </Glyph>
                Shaping the world…
              </span>
            ) : (
              <>
                <Glyph size={14}>
                  <path d="M6 4.5v15l13-7.5Z" fill="currentColor" stroke="none" />
                </Glyph>
                {reducedMotion ? 'View the still frame' : 'Enter the world'}
              </>
            )}
          </span>
        </button>
      )}
    </div>
  );
}
