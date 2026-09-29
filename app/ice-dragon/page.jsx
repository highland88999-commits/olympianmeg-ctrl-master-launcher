// Ice Dragon — "the glacial dragon" pocket universe.
// Port of highland88999-commits/Ice-Dragon. Cinematic flow: tap to begin,
// tap to descend to the ice floor, then touch-and-hold the dragon to wake
// it. At full wakefulness the dragon takes a flight loop around the glacier.
// An altitude slider gives real control of the dragon's flight height.
"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMachine, STATES } from './stateMachine.js';
import { createIceDragonScene } from './scene.js';

const RING_C = 2 * Math.PI * 52; // progress ring circumference (r=52)

const COPY = {
  [STATES.IDLE]: { title: 'THE GLACIAL DRAGON', sub: 'Tap to awaken' },
  [STATES.APPROACH]: { title: 'THE GLACIAL DRAGON', sub: 'Tap to descend to the ice floor' },
  [STATES.ENTERING]: { title: '', sub: '' },
  [STATES.INSIDE]: { title: '', sub: 'Touch the dragon and hold on to wake it' },
  [STATES.WAKING]: { title: '', sub: 'Keep holding…' },
  [STATES.FLYING]: { title: '', sub: 'The dragon flies' },
};

export default function IceDragonPage() {
  const router = useRouter();
  const canvasRef = useRef(null);
  const machineRef = useRef(null);
  const sceneRef = useRef(null);
  const holdingRef = useRef(false);
  const activeRafRef = useRef(0);
  const ringFgRef = useRef(null);
  const lastPctRef = useRef(-1);
  const bannerShownRef = useRef(false);

  const [phase, setPhase] = useState(STATES.IDLE);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [altitude, setAltitude] = useState(800);
  const [awakeBanner, setAwakeBanner] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const machine = createMachine();
    machineRef.current = machine;
    const scene = createIceDragonScene(canvasRef.current, {
      reducedMotion: mq.matches,
      onZoomComplete: () => {
        machine.zoomComplete();
        setPhase(machine.getState());
      },
    });
    sceneRef.current = scene;
    scene.setAltitude(800);
    return () => {
      cancelAnimationFrame(activeRafRef.current);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Runs while the dragon is waking or flying.
  const stopActiveLoop = () => cancelAnimationFrame(activeRafRef.current);
  const startActiveLoop = () => {
    stopActiveLoop();
    let last = performance.now();
    const tick = (now) => {
      const machine = machineRef.current;
      const scene = sceneRef.current;
      if (!machine || !scene) return;
      const dt = (now - last) / 1000;
      last = now;
      const prev = machine.getState();
      const next = machine.update(dt, holdingRef.current);

      if (next === STATES.WAKING) {
        const w = machine.getWakefulness();
        scene.setWakefulness(w);
        const pct = Math.round(w * 100);
        if (pct !== lastPctRef.current) {
          lastPctRef.current = pct;
          if (ringFgRef.current) {
            ringFgRef.current.style.strokeDashoffset = String(RING_C * (1 - w));
          }
        }
      } else if (next === STATES.FLYING) {
        scene.setFlying(true);
        scene.setWakefulness(1);
        scene.setFlightProgress(machine.getFlightProgress());
      } else if (next === STATES.INSIDE) {
        // Wake released early (ratcheted), or the flight just finished.
        scene.setFlying(false);
        if (prev === STATES.FLYING && !bannerShownRef.current) {
          bannerShownRef.current = true;
          setAwakeBanner(true);
        }
        setPhase(STATES.INSIDE);
        return; // loop ends
      }

      setPhase(next);
      activeRafRef.current = requestAnimationFrame(tick);
    };
    activeRafRef.current = requestAnimationFrame(tick);
  };

  const handleOverlayTap = () => {
    const machine = machineRef.current;
    const scene = sceneRef.current;
    if (!machine || !scene) return;
    const before = machine.getState();
    machine.tap();
    const after = machine.getState();
    if (after !== before) {
      if (after === STATES.ENTERING) scene.beginZoom();
      setPhase(after);
    }
  };

  const handleCanvasDown = (e) => {
    const machine = machineRef.current;
    const scene = sceneRef.current;
    if (!machine || !scene || machine.getState() !== STATES.INSIDE) return;
    const x = e.clientX ?? (e.touches && e.touches[0] && e.touches[0].clientX);
    const y = e.clientY ?? (e.touches && e.touches[0] && e.touches[0].clientY);
    if (x == null || y == null) return;
    if (!scene.hitDragon(x, y)) return;

    if (reducedMotion) {
      // Calm mode: wake instantly, skip the flight — the dragon rests, awake.
      let s = machine.beginWake();
      while (machine.getState() === STATES.WAKING) machine.update(0.1, true);
      if (machine.getState() === STATES.FLYING) {
        while (machine.getState() === STATES.FLYING) machine.update(8.0, true);
      }
      scene.setWakefulness(1);
      setPhase(machine.getState());
      return;
    }

    const wasAsleep = machine.getWakefulness() < 1;
    const next = machine.beginWake();
    holdingRef.current = true;
    lastPctRef.current = -1;
    setPhase(next);
    if (wasAsleep && next === STATES.WAKING) {
      startActiveLoop();
    } else if (next === STATES.FLYING) {
      scene.setFlying(true);
      scene.setWakefulness(1);
      startActiveLoop();
    }
  };

  const handleRelease = () => {
    holdingRef.current = false;
  };

  const handleAltitude = (e) => {
    const v = parseInt(e.target.value, 10);
    setAltitude(v);
    const scene = sceneRef.current;
    if (scene) scene.setAltitude(v);
  };

  const copy = COPY[phase] || COPY[STATES.IDLE];
  const showOverlay = phase === STATES.IDLE || phase === STATES.APPROACH;
  const showHint = phase === STATES.INSIDE;
  const showRing = phase === STATES.WAKING;
  const showFlight = phase === STATES.FLYING;
  const showPanel = phase === STATES.INSIDE || phase === STATES.WAKING || phase === STATES.FLYING;

  return (
    <div className="fixed inset-0 bg-[#01050a] overflow-hidden select-none" style={{ touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block outline-none"
        onPointerDown={handleCanvasDown}
        onPointerUp={handleRelease}
        onPointerCancel={handleRelease}
        onPointerLeave={handleRelease}
        aria-label="The glacial dragon. An interactive 3D scene."
      />

      {/* Back */}
      <button
        onClick={() => router.back()}
        className="absolute top-4 left-4 z-30 min-w-[44px] min-h-[44px] px-4 flex items-center justify-center rounded-full bg-black/60 border border-cyan-400/30 text-cyan-200 text-sm tracking-widest uppercase hover:bg-cyan-400/20"
        aria-label="Back to all worlds"
      >
        ‹ Worlds
      </button>

      {/* Intro overlay */}
      {showOverlay && (
        <button
          onClick={handleOverlayTap}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center icedragon-landing cursor-pointer"
          style={{ touchAction: 'manipulation' }}
          aria-label={copy.sub}
        >
          <span className="icedragon-title text-white px-5">{copy.title}</span>
          <span className="icedragon-ticker mt-6">{copy.sub}</span>
        </button>
      )}

      {/* Inside hint */}
      {showHint && (
        <div className="absolute bottom-[12%] left-0 right-0 z-20 text-center pointer-events-none px-6">
          <span className="icedragon-hint">{copy.sub}</span>
        </div>
      )}

      {/* Waking progress ring */}
      {showRing && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
          <div className="relative w-[132px] h-[132px]">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(0,255,255,0.15)" strokeWidth="8" />
              <circle
                ref={ringFgRef}
                cx="60" cy="60" r="52" fill="none"
                stroke="#00e5ff" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C}
                style={{ filter: 'drop-shadow(0 0 6px #00e5ff)', transition: 'stroke-dashoffset 80ms linear' }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-cyan-100 text-xs tracking-[0.25em] uppercase">
              Waking
            </span>
          </div>
          <span className="icedragon-hint mt-4">{copy.sub}</span>
        </div>
      )}

      {/* Flight banner */}
      {showFlight && (
        <div className="absolute top-[10%] left-0 right-0 z-20 text-center px-6 pointer-events-none">
          <div className="icedragon-banner">The dragon takes flight</div>
          <div className="icedragon-hint mt-3">{copy.sub}</div>
        </div>
      )}

      {/* Awake banner (dismissible) */}
      {awakeBanner && (
        <div className="absolute top-[10%] left-0 right-0 z-20 text-center px-6 pointer-events-none">
          <div className="icedragon-banner">The dragon is awake</div>
          <div className="icedragon-hint mt-3">Hold it again to send it flying.</div>
          <button
            onClick={() => setAwakeBanner(false)}
            className="pointer-events-auto mt-5 min-h-[44px] px-6 rounded-full bg-black/60 border border-cyan-400/40 text-cyan-100 text-sm tracking-widest uppercase hover:bg-cyan-400/20"
            style={{ touchAction: 'manipulation' }}
          >
            Keep watching
          </button>
        </div>
      )}

      {/* Altitude slider */}
      {showPanel && (
        <div className="absolute bottom-6 right-4 z-20 bg-black/60 border border-cyan-400/30 rounded-lg px-4 py-3 backdrop-blur-sm">
          <label htmlFor="alt-slider" className="block text-[11px] tracking-[0.25em] uppercase text-cyan-200 mb-2">
            Flight height
          </label>
          <input
            id="alt-slider"
            type="range"
            min={50}
            max={4000}
            value={altitude}
            onChange={handleAltitude}
            className="w-[180px] accent-cyan-300 cursor-pointer min-h-[44px]"
            aria-label="Dragon flight height"
          />
        </div>
      )}

      {reducedMotion && (
        <div className="absolute bottom-4 right-4 z-20 text-[10px] tracking-widest uppercase text-zinc-500 pointer-events-none">
          Calm mode
        </div>
      )}

      <style>{`
        .icedragon-landing {
          background:
            radial-gradient(ellipse 60% 45% at 50% 38%, rgba(0,229,255,0.10), transparent 70%),
            radial-gradient(ellipse 45% 35% at 72% 70%, rgba(80,220,255,0.08), transparent 70%),
            radial-gradient(ellipse 50% 40% at 28% 72%, rgba(120,255,200,0.08), transparent 70%),
            linear-gradient(rgba(1,10,20,0.55), rgba(1,1,3,0.92));
        }
        .icedragon-title {
          font-size: clamp(1.8rem, 8.5vw, 3.6rem);
          letter-spacing: 0.3em;
          text-indent: 0.3em;
          text-shadow: 0 0 18px rgba(0,229,255,0.85), 0 0 46px rgba(140,255,255,0.5);
          animation: icedragon-float 4.5s ease-in-out infinite;
        }
        .icedragon-ticker {
          font-size: clamp(0.85rem, 3.5vw, 1.15rem);
          letter-spacing: 0.3em;
          text-indent: 0.3em;
          color: #c9f6ff;
          text-shadow: 0 0 12px rgba(0,229,255,0.7);
          animation: icedragon-pulse 1.6s ease-in-out infinite;
        }
        .icedragon-hint {
          font-size: clamp(0.8rem, 3.2vw, 1.1rem);
          letter-spacing: 0.25em;
          text-indent: 0.25em;
          color: #aef6ff;
          text-shadow: 0 0 12px rgba(0,229,255,0.8);
          animation: icedragon-hintfade 9s forwards;
        }
        .icedragon-banner {
          font-size: clamp(1.2rem, 5vw, 2.2rem);
          letter-spacing: 0.3em;
          text-indent: 0.3em;
          color: #eaffff;
          text-shadow: 0 0 16px rgba(0,229,255,0.9), 0 0 44px rgba(255,255,255,0.5);
        }
        @keyframes icedragon-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes icedragon-pulse { 0%,100% { opacity: 0.45; } 50% { opacity: 1; } }
        @keyframes icedragon-hintfade { 0%,70% { opacity: 1; } 100% { opacity: 0.35; } }
        @media (prefers-reduced-motion: reduce) {
          .icedragon-title, .icedragon-ticker { animation: none; }
        }
      `}</style>
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
    </div>
  );
}
