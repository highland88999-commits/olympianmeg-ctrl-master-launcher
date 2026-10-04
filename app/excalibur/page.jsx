// Excalibur — "the sword in the stone" pocket universe.
// Port of highland88999-commits/Excalibur. Cinematic flow: tap to begin,
// tap to approach the stone, then touch-and-hold the sword to prove your
// worth. On success the sword rises and the champion banner appears.
"use client";

import { useEffect, useRef, useState } from 'react';
import { BackButton } from '@/components/ui';
import { AresButton } from '@/components/ares/ares-chrome';
import { fx, unlockFx } from '@/lib/fx';
import { createMachine, STATES } from './stateMachine.js';
import { createExcaliburScene } from './scene.js';

const RING_C = 2 * Math.PI * 52; // progress ring circumference (r=52)

const COPY = {
  [STATES.IDLE]: { title: 'EXCALIBUR', sub: 'Tap to begin' },
  [STATES.APPROACH]: { title: 'EXCALIBUR', sub: 'Tap to approach the stone' },
  [STATES.ENTERING]: { title: '', sub: '' },
  [STATES.INSIDE]: { title: '', sub: 'Touch the sword and hold on to prove your worth' },
  [STATES.PULLING]: { title: '', sub: 'Hold on…' },
  [STATES.CHAMPION]: { title: 'The sword is yours', sub: 'The champion has arrived.' },
};

export default function ExcaliburPage() {
  const canvasRef = useRef(null);
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const machineRef = useRef(null);
  const holdingRef = useRef(false);
  const pullRafRef = useRef(0);
  const ringFgRef = useRef(null);
  const lastPctRef = useRef(-1);

  const [phase, setPhase] = useState(STATES.IDLE);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    // unlock FX on first gesture (deep links may land here without the hub)
    const unlock = () => unlockFx();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    const machine = createMachine();
    machineRef.current = machine;
    const scene = createExcaliburScene(canvasRef.current, {
      reducedMotion: mq.matches,
      onZoomComplete: () => {
        machine.zoomComplete();
        setPhase(machine.getState());
        fx.checkpoint(); // arrived at the stone: soft chime
      },
    });
    sceneRef.current = scene;
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      cancelAnimationFrame(pullRafRef.current);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Worthiness loop: runs only while pulling.
  const stopPullLoop = () => cancelAnimationFrame(pullRafRef.current);
  const startPullLoop = () => {
    stopPullLoop();
    let last = performance.now();
    const tick = (now) => {
      const machine = machineRef.current;
      const scene = sceneRef.current;
      if (!machine || !scene) return;
      const dt = (now - last) / 1000;
      last = now;
      const next = machine.update(dt, holdingRef.current);
      const w = machine.getWorthiness();
      scene.setWorthiness(w);
      const pct = Math.round(w * 100);
      if (pct !== lastPctRef.current) {
        lastPctRef.current = pct;
        if (ringFgRef.current) {
          ringFgRef.current.style.strokeDashoffset = String(RING_C * (1 - w));
        }
      }
      if (next === STATES.CHAMPION) {
        scene.triggerChampion();
        scene.setPulling(false);
        setPhase(STATES.CHAMPION);
        fx.gameWin(); // the sword is yours: full fanfare
        return; // loop ends
      }
      if (next !== STATES.PULLING) {
        scene.setPulling(false);
        setPhase(next);
        fx.menuClose(); // worthiness faded: soft settle back to the stone
        return; // worthiness decayed to zero -> back inside
      }
      pullRafRef.current = requestAnimationFrame(tick);
    };
    pullRafRef.current = requestAnimationFrame(tick);
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
      fx.tap(); // intro advance: tiny tick
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
    if (scene.hitSword(x, y)) {
      machine.beginPull();
      scene.setPulling(true);
      holdingRef.current = true;
      lastPctRef.current = -1;
      setPhase(STATES.PULLING);
      fx.tap(); // gripped the sword: tiny tick
      startPullLoop();
    }
  };

  const handleRelease = () => {
    holdingRef.current = false;
  };

  const copy = COPY[phase] || COPY[STATES.IDLE];
  const showOverlay = phase === STATES.IDLE || phase === STATES.APPROACH;
  const showHint = phase === STATES.INSIDE;
  const showRing = phase === STATES.PULLING;
  const showBanner = phase === STATES.CHAMPION && !bannerDismissed;

  return (
    <div ref={mountRef} className="fixed inset-0 bg-[#010103] overflow-hidden select-none" style={{ touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block outline-none"
        onPointerDown={handleCanvasDown}
        onPointerUp={handleRelease}
        onPointerCancel={handleRelease}
        onPointerLeave={handleRelease}
        aria-label="Excalibur, the sword in the stone. An interactive 3D scene."
      />

      {/* Back */}
      <BackButton label="Worlds" />

      {/* Intro overlay */}
      {showOverlay && (
        <button
          onClick={handleOverlayTap}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center excalibur-landing cursor-pointer"
          style={{ touchAction: 'manipulation' }}
          aria-label={copy.sub}
        >
          {/* ARES interior art: mythic backdrop behind the intro menu */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <img
              src="/images/excalibur/excalibur-bg.webp"
              alt=""
              draggable={false}
              className="h-full w-full object-cover opacity-55"
            />
            <span
              className="absolute inset-0"
              style={{ background: 'linear-gradient(180deg, rgba(1,1,3,0.25) 0%, rgba(1,1,3,0.88) 100%)' }}
            />
          </span>
          <span className="excalibur-title relative text-white px-5">{copy.title}</span>
          <span className="excalibur-ticker relative mt-6">{copy.sub}</span>
        </button>
      )}

      {/* Inside hint */}
      {showHint && (
        <div className="absolute bottom-[12%] left-0 right-0 z-20 text-center pointer-events-none px-6">
          <span className="excalibur-hint">{copy.sub}</span>
        </div>
      )}

      {/* Worthiness progress ring */}
      {showRing && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
          <div className="relative w-[132px] h-[132px]">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(0,242,255,0.15)" strokeWidth="8" />
              <circle
                ref={ringFgRef}
                cx="60" cy="60" r="52" fill="none"
                stroke="#00f2ff" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C}
                style={{ filter: 'drop-shadow(0 0 6px #00f2ff)', transition: 'stroke-dashoffset 80ms linear' }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-cyan-100 text-xs tracking-[0.25em] uppercase">
              Worthiness
            </span>
          </div>
          <span className="excalibur-hint mt-4">{copy.sub}</span>
        </div>
      )}

      {/* Champion banner */}
      {showBanner && (
        <div className="absolute top-[10%] left-0 right-0 z-20 text-center px-6 pointer-events-none">
          <div className="excalibur-banner">{copy.title}</div>
          <div className="excalibur-hint mt-3">{copy.sub}</div>
          <AresButton
            icon="sword"
            tone="gold"
            onClick={() => setBannerDismissed(true)}
            className="pointer-events-auto mt-5"
            style={{ touchAction: 'manipulation' }}
          >
            Admire the blade
          </AresButton>
        </div>
      )}

      {reducedMotion && (
        <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-20 text-[10px] tracking-widest uppercase text-zinc-500 pointer-events-none">
          Calm mode
        </div>
      )}

      <style>{`
        .excalibur-landing {
          background:
            radial-gradient(ellipse 60% 45% at 50% 38%, rgba(0,242,255,0.10), transparent 70%),
            radial-gradient(ellipse 45% 35% at 72% 70%, rgba(255,0,255,0.08), transparent 70%),
            radial-gradient(ellipse 50% 40% at 28% 72%, rgba(90,40,255,0.10), transparent 70%),
            linear-gradient(rgba(1,1,3,0.55), rgba(1,1,3,0.92));
        }
        .excalibur-title {
          font-size: clamp(2rem, 9vw, 4rem);
          letter-spacing: 0.35em;
          text-indent: 0.35em;
          text-shadow: 0 0 18px rgba(0,242,255,0.8), 0 0 46px rgba(255,0,255,0.5);
          animation: excalibur-float 4.5s ease-in-out infinite;
        }
        .excalibur-ticker {
          font-size: clamp(0.85rem, 3.5vw, 1.15rem);
          letter-spacing: 0.3em;
          text-indent: 0.3em;
          color: #ff7ae0;
          text-shadow: 0 0 12px rgba(255,0,255,0.7);
          animation: excalibur-pulse 1.6s ease-in-out infinite;
        }
        .excalibur-hint {
          font-size: clamp(0.8rem, 3.2vw, 1.1rem);
          letter-spacing: 0.25em;
          text-indent: 0.25em;
          color: #aef6ff;
          text-shadow: 0 0 12px rgba(0,242,255,0.8);
          animation: excalibur-hintfade 9s forwards;
        }
        .excalibur-banner {
          font-size: clamp(1.2rem, 5vw, 2.2rem);
          letter-spacing: 0.3em;
          text-indent: 0.3em;
          color: #eaffff;
          text-shadow: 0 0 16px rgba(0,242,255,0.9), 0 0 44px rgba(255,255,255,0.5);
        }
        @keyframes excalibur-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes excalibur-pulse { 0%,100% { opacity: 0.45; } 50% { opacity: 1; } }
        @keyframes excalibur-hintfade { 0%,70% { opacity: 1; } 100% { opacity: 0.35; } }
        @media (prefers-reduced-motion: reduce) {
          .excalibur-title, .excalibur-ticker { animation: none; }
        }
      `}</style>
    </div>
  );
}
