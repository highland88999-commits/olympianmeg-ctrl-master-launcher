// Hercules — "a voyage across the solar system" pocket universe.
// Port of highland88999-commits/Hercules ("Adaptive Solar Explorer").
// Mission-style guided voyage: pick a destination, fly there on a cinematic
// camera path, read the mission log on arrival. This is deliberately NOT a
// free-fly explorer — Olympus already has one of those.
"use client";

import { useEffect, useRef, useState } from 'react';
import { BackButton } from '@/components/ui';
import { fx, unlockFx } from '@/lib/fx';
import { createTour, STATES, PLANETS, SUN, pickQualityTier, logFor } from './tour.js';
import { createSolarScene } from './solarSystem.js';

const FLIGHT_MS = 4200;

function colorStyle(hex) {
  return { backgroundColor: `#${hex.toString(16).padStart(6, '0')}` };
}

export default function HerculesPage() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const tourRef = useRef(null);

  const [phase, setPhase] = useState(STATES.BRIEFING);
  const [log, setLog] = useState([]);
  const [count, setCount] = useState(3);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [qualityLabel, setQualityLabel] = useState('medium');
  const [arrivedAt, setArrivedAt] = useState(null);
  const [legsLeft, setLegsLeft] = useState(0);

  const pushLog = (lines) => setLog((prev) => [...prev.slice(-8), ...lines]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    // unlock FX on first gesture (deep links may land here without the hub)
    const unlock = () => unlockFx();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const tier = pickQualityTier({ isMobile, devicePixelRatio: window.devicePixelRatio || 1, reducedMotion: mq.matches });
    setQualityLabel(tier);

    tourRef.current = createTour();
    const scene = createSolarScene(canvasRef.current, {
      qualityTier: tier,
      reducedMotion: mq.matches,
      onArrive: (id) => {
        const tour = tourRef.current;
        tour.arrived();
        const dest = tour.currentDestination();
        setArrivedAt(dest);
        setLegsLeft(tour.legsRemaining());
        pushLog(logFor(STATES.ARRIVED, dest));
        setPhase(STATES.ARRIVED);
        fx.landing(); // touchdown on a new world: controlled-burn rumble
      },
    });
    sceneRef.current = scene;
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startVoyage = (ids) => {
    const tour = tourRef.current;
    const scene = sceneRef.current;
    if (!tour || !scene) return;
    if (!tour.begin(ids)) return;
    fx.tap(); // destination locked in: tiny tick
    const dest = tour.currentDestination();
    pushLog(logFor(STATES.COUNTDOWN, dest));
    setPhase(STATES.COUNTDOWN);
    if (reducedMotion) {
      finishCountdown();
    } else {
      setCount(3);
      const step = (n) => {
        if (n <= 0) { finishCountdown(); return; }
        setCount(n);
        fx.countdownBeep(n === 1); // 3-2-1, final beep higher
        setTimeout(() => step(n - 1), 800);
      };
      step(3);
    }
  };

  const finishCountdown = () => {
    const tour = tourRef.current;
    const scene = sceneRef.current;
    if (!tour || !scene) return;
    tour.countdownDone();
    const dest = tour.currentDestination();
    pushLog(logFor(STATES.CRUISING, dest));
    setPhase(STATES.CRUISING);
    scene.flyTo(dest.id, reducedMotion ? 600 : FLIGHT_MS);
  };

  const nextLeg = () => {
    const tour = tourRef.current;
    if (!tour) return;
    const next = tour.nextLeg();
    if (next === STATES.COMPLETE) {
      pushLog(logFor(STATES.COMPLETE));
      setPhase(STATES.COMPLETE);
      fx.gameWin(); // voyage complete: full fanfare
    } else {
      const dest = tour.currentDestination();
      pushLog(logFor(STATES.COUNTDOWN, dest));
      setPhase(STATES.COUNTDOWN);
      if (reducedMotion) finishCountdown();
      else {
        const step = (n) => {
          if (n <= 0) { finishCountdown(); return; }
          setCount(n);
          fx.countdownBeep(n === 1); // 3-2-1, final beep higher
          setTimeout(() => step(n - 1), 800);
        };
        step(3);
      }
    }
  };

  const endVoyage = () => {
    const tour = tourRef.current;
    const scene = sceneRef.current;
    if (!tour) return;
    tour.backToBriefing();
    if (scene) { scene.setFreeLook(false); scene.goHome(); }
    setArrivedAt(null);
    setLog([]);
    setPhase(STATES.BRIEFING);
  };

  const showBriefing = phase === STATES.BRIEFING;
  const showCountdown = phase === STATES.COUNTDOWN;
  const showCruise = phase === STATES.CRUISING;
  const showArrived = phase === STATES.ARRIVED;
  const showComplete = phase === STATES.COMPLETE;

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none" style={{ touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block outline-none"
        aria-label="Hercules: a 3D voyage across the solar system."
      />

      {/* Back */}
      <BackButton label="Worlds" />

      {reducedMotion && (
        <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-20 text-[10px] tracking-widest uppercase text-zinc-500 pointer-events-none">
          Calm mode
        </div>
      )}

      {/* Mission briefing */}
      {showBriefing && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto bg-black/55" style={{ touchAction: 'pan-y' }}>
          <div className="w-full max-w-lg rounded-2xl border border-amber-400/30 bg-[#0a0805]/95 p-6 my-8">
            <h1 className="text-2xl font-bold tracking-[0.25em] text-amber-300">HERCULES</h1>
            <p className="mt-1 text-sm text-zinc-300">A voyage across the solar system.</p>
            <p className="mt-3 text-xs leading-relaxed text-zinc-400">
              Pick a destination and Hercules flies you there, logging the journey
              as you go. Picture quality adjusts itself to your device
              <span className="text-amber-200/80"> (currently {qualityLabel})</span>.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {PLANETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => startVoyage([p.id])}
                  className="min-h-[52px] flex items-center gap-3 rounded-xl border border-amber-400/20 bg-black/50 px-3 text-left hover:bg-amber-400/15"
                >
                  <span className="h-5 w-5 shrink-0 rounded-full" style={colorStyle(p.color)} aria-hidden />
                  <span className="text-sm font-semibold tracking-wider text-amber-100">{p.name}</span>
                </button>
              ))}
              <button
                onClick={() => startVoyage([SUN.id])}
                className="min-h-[52px] flex items-center gap-3 rounded-xl border border-amber-400/20 bg-black/50 px-3 text-left hover:bg-amber-400/15"
              >
                <span className="h-5 w-5 shrink-0 rounded-full" style={colorStyle(SUN.color)} aria-hidden />
                <span className="text-sm font-semibold tracking-wider text-amber-100">The Sun</span>
              </button>
              <button
                onClick={() => startVoyage(['grand-tour'])}
                className="min-h-[52px] col-span-2 rounded-xl border border-amber-400/50 bg-amber-400/10 px-3 text-center text-sm font-bold tracking-[0.2em] text-amber-200 uppercase hover:bg-amber-400/25"
              >
                Grand tour — visit all 8 planets
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Countdown */}
      {showCountdown && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <span className="text-7xl font-bold text-amber-300" style={{ textShadow: '0 0 30px rgba(251,191,36,0.8)' }}>
            {count}
          </span>
        </div>
      )}

      {/* Cruising */}
      {showCruise && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[86%] max-w-md pointer-events-none">
          <div className="rounded-xl border border-amber-400/30 bg-black/60 px-4 py-3">
            <p className="text-xs tracking-[0.25em] uppercase text-amber-200">Cruising…</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-400/15">
              {!reducedMotion && (
                <div
                  className="h-full rounded-full bg-amber-300"
                  style={{ width: '100%', transformOrigin: 'left', animation: `hercules-cruise ${FLIGHT_MS}ms linear forwards` }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mission log */}
      {(showCruise || showArrived || showComplete) && log.length > 0 && (
        <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-20 max-w-[300px] pointer-events-none">
          <div className="rounded-xl border border-amber-400/25 bg-black/60 p-3">
            <p className="text-[10px] tracking-[0.3em] uppercase text-amber-300/80 mb-1">Mission log</p>
            {log.slice(-3).map((line, i) => (
              <p key={i} className="text-xs leading-relaxed text-zinc-300">{line}</p>
            ))}
          </div>
        </div>
      )}

      {/* Arrival card */}
      {showArrived && arrivedAt && (
        <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-md">
          <div className="rounded-2xl border border-amber-400/40 bg-[#0a0805]/95 p-5">
            <div className="flex items-center gap-3">
              <span className="h-6 w-6 rounded-full shrink-0" style={colorStyle(arrivedAt.color)} aria-hidden />
              <h2 className="text-xl font-bold text-amber-200">{arrivedAt.name}</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-200">{arrivedAt.fact}</p>
            {arrivedAt.moons && arrivedAt.moons.length > 0 && (
              <p className="mt-2 text-xs text-zinc-400">
                Moons on this stop: {arrivedAt.moons.map((m) => m.name).join(', ')}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              {legsLeft > 0 ? (
                <button
                  onClick={nextLeg}
                  className="min-h-[48px] flex-1 rounded-xl bg-amber-300 text-sm font-bold text-black"
                >
                  Next stop ({legsLeft} left) →
                </button>
              ) : (
                <button
                  onClick={nextLeg}
                  className="min-h-[48px] flex-1 rounded-xl bg-amber-300 text-sm font-bold text-black"
                >
                  Finish voyage
                </button>
              )}
              <button
                onClick={endVoyage}
                className="min-h-[48px] px-4 rounded-xl border border-amber-400/40 text-sm text-amber-200"
              >
                New voyage
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete */}
      {showComplete && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-black/55">
          <div className="w-full max-w-md rounded-2xl border border-amber-400/30 bg-[#0a0805]/95 p-6 text-center">
            <h2 className="text-xl font-bold tracking-[0.2em] text-amber-200">VOYAGE COMPLETE</h2>
            <p className="mt-2 text-sm text-zinc-300">The crew thanks you for flying Hercules.</p>
            <button
              onClick={endVoyage}
              className="mt-5 min-h-[48px] w-full rounded-xl bg-amber-300 text-sm font-bold text-black"
            >
              Plan another voyage
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes hercules-cruise { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes hercules-cruise { from { transform: scaleX(1); } to { transform: scaleX(1); } }
        }
      `}</style>
    </div>
  );
}
