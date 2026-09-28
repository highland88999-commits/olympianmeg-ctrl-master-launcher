// Ice Monster — "the frost behemoth" pocket universe.
// Port of highland88999-commits/Ice-Monster. Cinematic flow: tap to begin,
// tap to descend to the ice floor, then touch-and-hold the behemoth to calm
// it. As trust grows the behemoth slows, its breath settles, and the ground
// tremor eases; at full trust it kneels to you.
"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMachine, STATES } from './stateMachine.js';
import { createIceMonsterScene } from './scene.js';

const RING_C = 2 * Math.PI * 52; // progress ring circumference (r=52)

const COPY = {
  [STATES.IDLE]: { title: 'THE FROST BEHEMOTH', sub: 'Tap to awaken' },
  [STATES.APPROACH]: { title: 'THE FROST BEHEMOTH', sub: 'Tap to descend to the ice floor' },
  [STATES.ENTERING]: { title: '', sub: '' },
  [STATES.INSIDE]: { title: '', sub: 'Touch the behemoth and hold on to calm it' },
  [STATES.CALMING]: { title: '', sub: 'Keep holding…' },
  [STATES.TRUSTED]: { title: '', sub: 'The behemoth trusts you' },
};

export default function IceMonsterPage() {
  const router = useRouter();
  const canvasRef = useRef(null);
  const machineRef = useRef(null);
  const sceneRef = useRef(null);
  const holdingRef = useRef(false);
  const activeRafRef = useRef(0);
  const meterRafRef = useRef(0);
  const ringFgRef = useRef(null);
  const tremorBarRef = useRef(null);
  const trustBarRef = useRef(null);
  const lastPctRef = useRef(-1);
  const bannerShownRef = useRef(false);

  const [phase, setPhase] = useState(STATES.IDLE);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [trustBanner, setTrustBanner] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const machine = createMachine();
    machineRef.current = machine;
    const scene = createIceMonsterScene(canvasRef.current, {
      reducedMotion: mq.matches,
      onZoomComplete: () => {
        machine.zoomComplete();
        setPhase(machine.getState());
      },
    });
    sceneRef.current = scene;

    // Lightweight always-on meter loop: tremor + trust bars only.
    const meter = () => {
      const m = machineRef.current;
      const s = sceneRef.current;
      if (m && s) {
        if (tremorBarRef.current) {
          tremorBarRef.current.style.width = `${Math.round(s.getTremor() * 100)}%`;
        }
        if (trustBarRef.current) {
          trustBarRef.current.style.width = `${Math.round(m.getTrust() * 100)}%`;
        }
      }
      meterRafRef.current = requestAnimationFrame(meter);
    };
    meterRafRef.current = requestAnimationFrame(meter);

    return () => {
      cancelAnimationFrame(activeRafRef.current);
      cancelAnimationFrame(meterRafRef.current);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Runs while the behemoth is being calmed or trusted.
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
      const next = machine.update(dt, holdingRef.current);

      if (next === STATES.CALMING) {
        const t = machine.getTrust();
        scene.setTrust(t);
        const pct = Math.round(t * 100);
        if (pct !== lastPctRef.current) {
          lastPctRef.current = pct;
          if (ringFgRef.current) {
            ringFgRef.current.style.strokeDashoffset = String(RING_C * (1 - t));
          }
        }
      } else if (next === STATES.TRUSTED) {
        scene.setTrust(1);
        if (!bannerShownRef.current) {
          bannerShownRef.current = true;
          setTrustBanner(true);
        }
        setPhase(STATES.INSIDE);
        return; // loop ends; the behemoth kneels and settles
      } else if (next === STATES.INSIDE) {
        // Released early (trust ratcheted) — keep the partial trust.
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
    if (!scene.hitBehemoth(x, y)) return;

    if (reducedMotion) {
      // Calm mode: trust instantly — the behemoth kneels and rests.
      machine.beginCalm();
      while (machine.getState() === STATES.CALMING) machine.update(0.1, true);
      machine.update(0.1, false); // TRUSTED -> INSIDE
      scene.setTrust(1);
      if (!bannerShownRef.current) {
        bannerShownRef.current = true;
        setTrustBanner(true);
      }
      setPhase(machine.getState());
      return;
    }

    const wasWary = machine.getTrust() < 1;
    const next = machine.beginCalm();
    holdingRef.current = true;
    lastPctRef.current = -1;
    setPhase(next);
    if (wasWary && next === STATES.CALMING) {
      startActiveLoop();
    }
  };

  const handleRelease = () => {
    holdingRef.current = false;
  };

  const copy = COPY[phase] || COPY[STATES.IDLE];
  const showOverlay = phase === STATES.IDLE || phase === STATES.APPROACH;
  const showHint = phase === STATES.INSIDE;
  const showRing = phase === STATES.CALMING;
  const showPanel = phase === STATES.INSIDE || phase === STATES.CALMING;

  return (
    <div className="fixed inset-0 bg-[#01050a] overflow-hidden select-none" style={{ touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block outline-none"
        onPointerDown={handleCanvasDown}
        onPointerUp={handleRelease}
        onPointerCancel={handleRelease}
        onPointerLeave={handleRelease}
        aria-label="The frost behemoth. An interactive 3D scene."
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
          className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center icemonster-landing cursor-pointer"
          style={{ touchAction: 'manipulation' }}
          aria-label={copy.sub}
        >
          <span className="icemonster-title text-white px-5">{copy.title}</span>
          <span className="icemonster-ticker mt-6">{copy.sub}</span>
        </button>
      )}

      {/* Inside hint */}
      {showHint && (
        <div className="absolute bottom-[12%] left-0 right-0 z-20 text-center pointer-events-none px-6">
          <span className="icemonster-hint">{copy.sub}</span>
        </div>
      )}

      {/* Calming progress ring */}
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
              Calming
            </span>
          </div>
          <span className="icemonster-hint mt-4">{copy.sub}</span>
        </div>
      )}

      {/* Trust banner (dismissible) */}
      {trustBanner && (
        <div className="absolute top-[10%] left-0 right-0 z-20 text-center px-6 pointer-events-none">
          <div className="icemonster-banner">The behemoth trusts you</div>
          <div className="icemonster-hint mt-3">It kneels. The ground is still.</div>
          <button
            onClick={() => setTrustBanner(false)}
            className="pointer-events-auto mt-5 min-h-[44px] px-6 rounded-full bg-black/60 border border-cyan-400/40 text-cyan-100 text-sm tracking-widest uppercase hover:bg-cyan-400/20"
            style={{ touchAction: 'manipulation' }}
          >
            Keep watching
          </button>
        </div>
      )}

      {/* Tremor + trust panel */}
      {showPanel && (
        <div className="absolute bottom-6 right-4 z-20 bg-black/60 border border-cyan-400/30 rounded-lg px-4 py-3 backdrop-blur-sm w-[210px]">
          <label className="block text-[11px] tracking-[0.25em] uppercase text-cyan-200 mb-1">
            Ground tremor
          </label>
          <div className="h-[8px] rounded-full bg-white/10 overflow-hidden mb-3" aria-hidden="true">
            <div ref={tremorBarRef} className="h-full rounded-full bg-cyan-300/80" style={{ width: '0%' }} />
          </div>
          <label className="block text-[11px] tracking-[0.25em] uppercase text-cyan-200 mb-1">
            Trust
          </label>
          <div className="h-[8px] rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
            <div ref={trustBarRef} className="h-full rounded-full bg-emerald-300/90" style={{ width: '0%' }} />
          </div>
        </div>
      )}

      {reducedMotion && (
        <div className="absolute bottom-4 right-4 z-20 text-[10px] tracking-widest uppercase text-zinc-500 pointer-events-none">
          Calm mode
        </div>
      )}

      <style>{`
        .icemonster-landing {
          background:
            radial-gradient(ellipse 60% 45% at 50% 38%, rgba(0,213,255,0.10), transparent 70%),
            radial-gradient(ellipse 45% 35% at 72% 70%, rgba(80,220,255,0.08), transparent 70%),
            radial-gradient(ellipse 50% 40% at 28% 72%, rgba(120,255,200,0.08), transparent 70%),
            linear-gradient(rgba(1,10,20,0.55), rgba(1,1,3,0.92));
        }
        .icemonster-title {
          font-size: clamp(1.8rem, 8.5vw, 3.6rem);
          letter-spacing: 0.3em;
          text-indent: 0.3em;
          text-shadow: 0 0 18px rgba(0,213,255,0.85), 0 0 46px rgba(140,255,255,0.5);
          animation: icemonster-float 4.5s ease-in-out infinite;
        }
        .icemonster-ticker {
          font-size: clamp(0.85rem, 3.5vw, 1.15rem);
          letter-spacing: 0.3em;
          text-indent: 0.3em;
          color: #c9f6ff;
          text-shadow: 0 0 12px rgba(0,213,255,0.7);
          animation: icemonster-pulse 1.6s ease-in-out infinite;
        }
        .icemonster-hint {
          font-size: clamp(0.8rem, 3.2vw, 1.1rem);
          letter-spacing: 0.25em;
          text-indent: 0.25em;
          color: #aef6ff;
          text-shadow: 0 0 12px rgba(0,213,255,0.8);
          animation: icemonster-hintfade 9s forwards;
        }
        .icemonster-banner {
          font-size: clamp(1.2rem, 5vw, 2.2rem);
          letter-spacing: 0.3em;
          text-indent: 0.3em;
          color: #eaffff;
          text-shadow: 0 0 16px rgba(0,213,255,0.9), 0 0 44px rgba(255,255,255,0.5);
        }
        @keyframes icemonster-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes icemonster-pulse { 0%,100% { opacity: 0.45; } 50% { opacity: 1; } }
        @keyframes icemonster-hintfade { 0%,70% { opacity: 1; } 100% { opacity: 0.35; } }
        @media (prefers-reduced-motion: reduce) {
          .icemonster-title, .icemonster-ticker { animation: none; }
        }
      `}</style>
    </div>
  );
}
