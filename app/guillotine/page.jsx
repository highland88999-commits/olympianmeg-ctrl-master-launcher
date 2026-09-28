// Guillotine — "a 300-year-old machine, rebuilt in 3D" pocket universe.
// Port of highland88999-commits/Guillotine. Cinematic flow: tap to begin,
// tap to approach the machine, then examine its parts and work the winch:
// press-and-hold the winch wheel to raise the blade (it ratchets), then tap
// the raised blade to let it drop onto a fresh-cut log. Timber only.
"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMachine, STATES } from './stateMachine.js';
import { createGuillotineScene, PART_LABELS } from './scene.js';

const RING_C = 2 * Math.PI * 52; // progress ring circumference (r=52)

const COPY = {
  [STATES.IDLE]: { title: 'THE GUILLOTINE', sub: 'Tap to begin' },
  [STATES.APPROACH]: { title: 'THE GUILLOTINE', sub: 'Tap to approach the machine' },
  [STATES.ENTERING]: { title: '', sub: '' },
  [STATES.INSIDE]: {
    title: '',
    sub: 'A 300-year-old machine, rebuilt in 3D. Drag to look around — tap a part to learn what it is. Hold the winch wheel to raise the blade.',
  },
  [STATES.RAISING]: { title: '', sub: 'Winching the blade up…' },
  [STATES.READY]: { title: '', sub: 'The blade is raised. Tap the blade to let it drop.' },
  [STATES.DROPPING]: { title: '', sub: '' },
  [STATES.SPLIT]: { title: 'Clean split.', sub: 'The log is split. A fresh log is set on the stand.' },
};

export default function GuillotinePage() {
  const router = useRouter();
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const machineRef = useRef(null);
  const holdingRef = useRef(false);
  const animRafRef = useRef(0);
  const ringFgRef = useRef(null);
  const lastPctRef = useRef(-1);
  const downPosRef = useRef(null);
  const audioRef = useRef(null);

  const [phase, setPhase] = useState(STATES.IDLE);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [partId, setPartId] = useState(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Wooden thunk: low thump + filtered noise crack. Created lazily on the
  // first user gesture so mobile autoplay policies are satisfied.
  const playThunk = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioRef.current) audioRef.current = new Ctx();
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
      const len = Math.floor(ctx.sampleRate * 0.12);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.4, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(f).connect(g2).connect(ctx.destination);
      src.start(t);
    } catch (e) {
      /* audio is a nicety, never a blocker */
    }
  };

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const machine = createMachine();
    machineRef.current = machine;
    const scene = createGuillotineScene(canvasRef.current, {
      reducedMotion: mq.matches,
      onZoomComplete: () => {
        machine.zoomComplete();
        setPhase(machine.getState());
      },
      onSplit: () => {
        playThunk();
      },
    });
    sceneRef.current = scene;
    return () => {
      cancelAnimationFrame(animRafRef.current);
      scene.dispose();
      sceneRef.current = null;
      if (audioRef.current) audioRef.current.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Frame loop driving the state machine while it is active.
  const stopLoop = () => cancelAnimationFrame(animRafRef.current);
  const startLoop = () => {
    stopLoop();
    let last = performance.now();
    const tick = (now) => {
      const machine = machineRef.current;
      const scene = sceneRef.current;
      if (!machine || !scene) return;
      const dt = (now - last) / 1000;
      last = now;
      const before = machine.getState();
      const next = machine.update(dt, holdingRef.current);
      const lift = machine.getLift();

      if (next === STATES.RAISING) {
        scene.setLift(lift);
        const pct = Math.round(lift * 100);
        if (pct !== lastPctRef.current) {
          lastPctRef.current = pct;
          if (ringFgRef.current) ringFgRef.current.style.strokeDashoffset = String(RING_C * (1 - lift));
        }
      } else if (next === STATES.DROPPING) {
        scene.setDropProgress(machine.getDropProgress());
      } else if (next === STATES.SPLIT && before !== STATES.SPLIT) {
        scene.triggerSplit();
        setBannerDismissed(false);
      } else if (next === STATES.INSIDE && before === STATES.SPLIT) {
        scene.resetLog();
      }

      if (next !== before) {
        if (next === STATES.INSIDE || next === STATES.READY) scene.setRaising(false);
        setPhase(next);
      }

      // Keep looping while the machine is doing something animated.
      if (next === STATES.RAISING || next === STATES.DROPPING || next === STATES.SPLIT) {
        animRafRef.current = requestAnimationFrame(tick);
      }
    };
    animRafRef.current = requestAnimationFrame(tick);
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
    if (!machine || !scene) return;
    const x = e.clientX ?? (e.touches && e.touches[0] && e.touches[0].clientX);
    const y = e.clientY ?? (e.touches && e.touches[0] && e.touches[0].clientY);
    if (x == null || y == null) return;
    downPosRef.current = { x, y };

    const state = machine.getState();
    if (state === STATES.INSIDE && scene.hitLever(x, y)) {
      machine.beginRaise();
      scene.setRaising(true);
      holdingRef.current = true;
      lastPctRef.current = -1;
      setPartId(null);
      setPhase(STATES.RAISING);
      startLoop();
    }
  };

  const handleCanvasUp = (e) => {
    const machine = machineRef.current;
    const scene = sceneRef.current;
    holdingRef.current = false;
    if (!machine || !scene || !downPosRef.current) {
      downPosRef.current = null;
      return;
    }
    const x = e.clientX ?? (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientX);
    const y = e.clientY ?? (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientY);
    const { x: dx, y: dy } = downPosRef.current;
    downPosRef.current = null;
    if (x == null || y == null) return;
    // Only treat near-stationary presses as taps (orbit drags are excluded).
    if (Math.hypot(x - dx, y - dy) > 10) return;

    const state = machine.getState();
    if (state === STATES.READY && scene.hitBlade(x, y)) {
      machine.dropBlade();
      scene.beginDrop();
      setPartId(null);
      setPhase(STATES.DROPPING);
      startLoop();
    } else if (state === STATES.INSIDE) {
      const id = scene.hitPart(x, y);
      setPartId(id);
    }
  };

  const handleDropButton = () => {
    const machine = machineRef.current;
    const scene = sceneRef.current;
    if (!machine || !scene || machine.getState() !== STATES.READY) return;
    machine.dropBlade();
    scene.beginDrop();
    setPartId(null);
    setPhase(STATES.DROPPING);
    startLoop();
  };

  const copy = COPY[phase] || COPY[STATES.IDLE];
  const part = partId ? PART_LABELS[partId] : null;
  const showOverlay = phase === STATES.IDLE || phase === STATES.APPROACH;
  const showHint = phase === STATES.INSIDE;
  const showRing = phase === STATES.RAISING;
  const showDrop = phase === STATES.READY;
  const showBanner = phase === STATES.SPLIT && !bannerDismissed;

  return (
    <div className="fixed inset-0 bg-[#0a0705] overflow-hidden select-none" style={{ touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block outline-none"
        onPointerDown={handleCanvasDown}
        onPointerUp={handleCanvasUp}
        onPointerCancel={() => {
          holdingRef.current = false;
          downPosRef.current = null;
        }}
        onPointerLeave={() => {
          holdingRef.current = false;
        }}
        aria-label="The Guillotine, a 300-year-old machine rebuilt in 3D. An interactive scene."
      />

      {/* Back */}
      <button
        onClick={() => router.back()}
        className="absolute top-4 left-4 z-30 min-w-[44px] min-h-[44px] px-4 flex items-center justify-center rounded-full bg-black/60 border border-amber-400/30 text-amber-200 text-sm tracking-widest uppercase hover:bg-amber-400/20"
        aria-label="Back to all worlds"
      >
        ‹ Worlds
      </button>

      {/* Intro overlay */}
      {showOverlay && (
        <button
          onClick={handleOverlayTap}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center guillotine-landing cursor-pointer"
          style={{ touchAction: 'manipulation' }}
          aria-label={copy.sub}
        >
          <span className="guillotine-title text-white px-5">{copy.title}</span>
          <span className="guillotine-ticker mt-6">{copy.sub}</span>
        </button>
      )}

      {/* Inside hint */}
      {showHint && (
        <div className="absolute bottom-[12%] left-0 right-0 z-20 text-center pointer-events-none px-6">
          <span className="guillotine-hint">{copy.sub}</span>
        </div>
      )}

      {/* Part label card (examine mode) */}
      {part && (
        <div className="absolute bottom-[24%] left-1/2 -translate-x-1/2 z-20 w-[min(92vw,420px)] px-2">
          <div className="bg-black/70 border border-amber-400/40 rounded-2xl px-5 py-4 text-center">
            <div className="text-amber-100 text-sm font-bold tracking-[0.25em] uppercase">{part.name}</div>
            <div className="text-zinc-300 text-sm mt-2 leading-relaxed">{part.blurb}</div>
            <button
              onClick={() => setPartId(null)}
              className="mt-3 min-h-[44px] px-6 rounded-full bg-black/60 border border-amber-400/40 text-amber-100 text-xs tracking-widest uppercase hover:bg-amber-400/20"
              style={{ touchAction: 'manipulation' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Winch progress ring */}
      {showRing && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
          <div className="relative w-[132px] h-[132px]">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,180,80,0.15)" strokeWidth="8" />
              <circle
                ref={ringFgRef}
                cx="60" cy="60" r="52" fill="none"
                stroke="#fbbf24" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C}
                style={{ filter: 'drop-shadow(0 0 6px #fbbf24)', transition: 'stroke-dashoffset 80ms linear' }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-amber-100 text-xs tracking-[0.25em] uppercase">
              Winch
            </span>
          </div>
          <span className="guillotine-hint mt-4">{copy.sub}</span>
        </div>
      )}

      {/* Drop button (ready state) */}
      {showDrop && (
        <div className="absolute bottom-[12%] left-0 right-0 z-20 flex flex-col items-center px-6">
          <span className="guillotine-hint mb-4 text-center">{copy.sub}</span>
          <button
            onClick={handleDropButton}
            className="min-h-[52px] px-8 rounded-full bg-amber-500/20 border border-amber-400/60 text-amber-100 text-sm font-bold tracking-[0.25em] uppercase hover:bg-amber-400/30"
            style={{ touchAction: 'manipulation' }}
          >
            Drop the blade
          </button>
        </div>
      )}

      {/* Split banner */}
      {showBanner && (
        <div className="absolute top-[10%] left-0 right-0 z-20 text-center px-6 pointer-events-none">
          <div className="guillotine-banner">{copy.title}</div>
          <div className="guillotine-hint mt-3">{copy.sub}</div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="pointer-events-auto mt-5 min-h-[44px] px-6 rounded-full bg-black/60 border border-amber-400/40 text-amber-100 text-sm tracking-widest uppercase hover:bg-amber-400/20"
            style={{ touchAction: 'manipulation' }}
          >
            Admire the machine
          </button>
        </div>
      )}

      {reducedMotion && (
        <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-20 text-[10px] tracking-widest uppercase text-zinc-500 pointer-events-none">
          Calm mode
        </div>
      )}

      <style>{`
        .guillotine-landing {
          background:
            radial-gradient(ellipse 60% 45% at 50% 38%, rgba(255,170,80,0.10), transparent 70%),
            radial-gradient(ellipse 45% 35% at 72% 70%, rgba(255,68,204,0.08), transparent 70%),
            radial-gradient(ellipse 50% 40% at 28% 72%, rgba(0,220,255,0.08), transparent 70%),
            linear-gradient(rgba(10,7,5,0.55), rgba(10,7,5,0.92));
        }
        .guillotine-title {
          font-size: clamp(2rem, 9vw, 4rem);
          letter-spacing: 0.35em;
          text-indent: 0.35em;
          text-shadow: 0 0 18px rgba(255,180,80,0.8), 0 0 46px rgba(255,68,204,0.5);
          animation: guillotine-float 4.5s ease-in-out infinite;
        }
        .guillotine-ticker {
          font-size: clamp(0.85rem, 3.5vw, 1.15rem);
          letter-spacing: 0.3em;
          text-indent: 0.3em;
          color: #ffd9a0;
          text-shadow: 0 0 12px rgba(255,180,80,0.7);
          animation: guillotine-pulse 1.6s ease-in-out infinite;
        }
        .guillotine-hint {
          font-size: clamp(0.8rem, 3.2vw, 1.1rem);
          letter-spacing: 0.25em;
          text-indent: 0.25em;
          color: #ffe7c4;
          text-shadow: 0 0 12px rgba(255,180,80,0.8);
          animation: guillotine-hintfade 12s forwards;
        }
        .guillotine-banner {
          font-size: clamp(1.2rem, 5vw, 2.2rem);
          letter-spacing: 0.3em;
          text-indent: 0.3em;
          color: #fff7ea;
          text-shadow: 0 0 16px rgba(255,180,80,0.9), 0 0 44px rgba(255,255,255,0.5);
        }
        @keyframes guillotine-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes guillotine-pulse { 0%,100% { opacity: 0.45; } 50% { opacity: 1; } }
        @keyframes guillotine-hintfade { 0%,70% { opacity: 1; } 100% { opacity: 0.35; } }
        @media (prefers-reduced-motion: reduce) {
          .guillotine-title, .guillotine-ticker { animation: none; }
        }
      `}</style>
    </div>
  );
}
