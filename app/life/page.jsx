'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PassageLink from '@/components/styx/PassageLink';
import {
  createProceduralMatrix,
  monthProgress,
  orbitStatus,
  sysStatus,
  zoneForZoom,
  nextAlignmentIn,
  formatCycle,
  alignmentActive,
} from './orbits';
import { createOrbitalRenderer } from './canvas';
import { createPilot } from './game';
import { fx, unlockFx } from '@/lib/fx';
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

export default function LifePage() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const stateRef = useRef(null);

  const [reducedMotion, setReducedMotion] = useState(false);
  const [ready, setReady] = useState(false); // first renderer tick — matrix is live
  const [slowBoot, setSlowBoot] = useState(false); // only show the loader if boot drags
  const [hud, setHud] = useState({ progress: 0, held: false, game: null });
  const [zoomTick, setZoomTick] = useState(0);
  const pilotRef = useRef(null);

  useEffect(() => {
    const mq =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    const rm = !!(mq && mq.matches);
    setReducedMotion(rm);
    // Procedural generation (Merlin, bug report 2026-10-22: "make
    // life procedurally generate"): a fresh seed is minted on every
    // visit and the orbital matrix is generated from it — no two
    // visits replay the same fixed system. The seed is shown in the
    // HUD (SEED line) so any generated system can be named.
    stateRef.current = createProceduralMatrix();
    if (canvasRef.current) {
      pilotRef.current = createPilot(canvasRef.current, stateRef.current, {
        reducedMotion: rm,
      });
      const pilot = pilotRef.current;
      rendererRef.current = createOrbitalRenderer(canvasRef.current, stateRef.current, {
        reducedMotion: rm,
        onHud: (next) => {
          setHud(next);
          setReady(true);
          setZoomTick((t) => t + 1);
        },
        tick: (dt) => pilot.tick(dt),
        overlay: (ctx, w, h, t) => pilot.draw(ctx, w, h, t),
        getGameHud: () => pilot.hud(),
      });
      rendererRef.current.start();
    }
    // FX system: unlock sound+haptics on the first gesture.
    const unlock = () => unlockFx();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      if (pilotRef.current) pilotRef.current.dispose();
      if (rendererRef.current) rendererRef.current.dispose();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const resetView = useCallback(() => {
    if (rendererRef.current) rendererRef.current.resetView();
  }, []);

  // The boot loader only appears if the renderer takes a while to warm up.
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setSlowBoot(true), 350);
    return () => clearTimeout(t);
  }, [ready]);

  const startPilot = useCallback(() => {
    unlockFx(); // starting is a gesture: make sure FX is live
    fx.tap();
    if (pilotRef.current) pilotRef.current.start();
  }, []);

  const s = stateRef.current;
  const progress = hud.progress;
  const game = hud.game;
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

      {/* Warm hearth grade over the matrix — atmosphere only, the art is untouched. */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(120% 90% at 50% 100%, rgba(255,150,60,0.10) 0%, rgba(120,53,15,0.05) 42%, transparent 70%)' }} />

      {/* HUD */}
      <div className="absolute left-0 right-0 flex items-start justify-between p-4 sm:p-5 pointer-events-none" style={{ top: 'max(3.5rem, calc(env(safe-area-inset-top) + 3rem))' }}>
        <div
          key={zoomTick}
          className="relative overflow-hidden bg-black/60 backdrop-blur-sm px-4 py-3 border-l-2 border-cyan-400/80 max-w-[78vw]"
        >
          <div aria-hidden="true" className="absolute inset-0 opacity-25 pointer-events-none" style={panelTileStyle()} />
          <div className="relative">
          <div className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase text-cyan-300/90">
            Orbital Matrix
          </div>
          <h1 className="text-lg sm:text-2xl font-bold text-neutral-100 tracking-widest mt-0.5">
            SPARK FLIGHT
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
          <div className="text-[11px] sm:text-xs text-neutral-400 mt-0.5 tracking-wider">
            SEED:{' '}
            <span className="text-violet-300 font-bold">{s ? s.seed : '—'}</span>
            <span className="text-neutral-500"> · generated on arrival</span>
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
        </div>
        <div className="flex flex-col items-end gap-2">
          {aligning && (
            <div className="text-white text-xs sm:text-sm font-bold tracking-[0.3em] animate-pulse px-2">
              ALIGNMENT
            </div>
          )}
          {/* PILOT mode: blockers, boosts, shields — difficulty ramps */}
          {game && game.playing && (
            <div className="flex items-center gap-3 bg-black/60 backdrop-blur-sm px-3 py-2 border border-white/15 rounded text-[10px] sm:text-[11px] tracking-[0.2em] uppercase">
              <span className="text-neutral-300">
                Score <span className="text-amber-300 font-bold">{game.score}</span>
              </span>
              <span className="text-neutral-300 flex items-center gap-1">
                Hull
                <span className="flex gap-0.5" aria-label={`${game.hull} of ${game.maxHull} hull`}>
                  {Array.from({ length: game.maxHull }).map((_, i) => (
                    <span
                      key={i}
                      className={`inline-block w-2 h-3 rounded-[2px] ${
                        i < game.hull ? 'bg-cyan-300' : 'bg-white/15'
                      }`}
                    />
                  ))}
                </span>
              </span>
              <span className={game.shield ? 'text-cyan-300 font-bold' : 'text-neutral-500'}>
                Shield {game.shield ? `${game.shieldT}s` : '—'}
              </span>
              <span className="text-neutral-300">
                Lv <span className="text-fuchsia-300 font-bold">{game.level}</span>
              </span>
            </div>
          )}
          {game && !game.playing && !game.gameOver && (
            <button
              onClick={startPilot}
              className="pointer-events-auto inline-flex items-center gap-2 px-4 py-2 rounded border border-cyan-300/50 bg-cyan-400/15 text-cyan-100 text-[11px] sm:text-xs tracking-[0.25em] uppercase backdrop-blur-sm hover:bg-cyan-400/30 transition-colors"
              aria-label="Play: guide your spark through the matrix"
            >
              <Glyph size={13}>
                <path d="m3 11 19-9-9 19-2-8-8-2Z" />
              </Glyph>
              Pilot the spark
            </button>
          )}
          <button
            onClick={resetView}
            className="pointer-events-auto inline-flex items-center gap-2 px-3 py-2 rounded border border-white/20 bg-white/5 text-neutral-300 text-[11px] sm:text-xs tracking-[0.2em] uppercase backdrop-blur-sm hover:bg-white/15 transition-colors"
            aria-label="Reset the orbital view"
          >
            <Glyph size={13}>
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </Glyph>
            Reset view
          </button>
        </div>
      </div>

      {/* Game-over panel */}
      {game && game.gameOver && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-4">
          <div className="pointer-events-auto relative overflow-hidden bg-black/80 backdrop-blur-md border border-white/15 rounded-lg px-8 py-6 text-center max-w-sm">
            <img src="/images/life/bg-orbit.webp" alt="" aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none" />
            <div className="relative">
            <div className="text-[10px] tracking-[0.3em] uppercase text-rose-300/90">
              Out of hull
            </div>
            <div className="text-4xl font-bold text-neutral-100 mt-2">{game.score}</div>
            <div className="text-[11px] tracking-[0.2em] uppercase text-neutral-400 mt-1">
              Best {game.best}
            </div>
            <button
              onClick={startPilot}
              className="mt-5 px-5 py-2.5 rounded border border-cyan-300/50 bg-cyan-400/15 text-cyan-100 text-xs tracking-[0.25em] uppercase hover:bg-cyan-400/30 transition-colors inline-flex items-center gap-2"
              aria-label="Fly again"
            >
              <Glyph size={13}>
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </Glyph>
              Fly again
            </button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none px-4" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <p className="text-[10px] sm:text-xs tracking-[0.25em] uppercase text-white/40 text-center">
          {game && game.playing
            ? 'Guide your spark — dodge the shards, grab the surges'
            : reducedMotion
              ? 'Six rings, held in frame'
              : 'Drag to tilt the matrix · scroll or pinch to zoom'}
        </p>
      </div>
      {/* Styled boot state — only appears if the matrix takes a moment to warm up. */}
      {!ready && slowBoot && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85" role="status">
          <img src="/images/life/bg-orbit.webp" alt="" aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none" />
          <p className="relative text-xs tracking-[0.3em] uppercase text-amber-200/80 animate-pulse">
            Aligning the rings…
          </p>
        </div>
      )}
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />
    </div>
  );
}
