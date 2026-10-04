'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HiveCore, MODE_KEYS, MODES } from './hive';
import { createHiveRenderer } from './render';

// --- DIONYSUS interior treatment ---
const HIVE_BG = '/images/hive/bg.webp';
const HIVE_TILE = '/images/shared/honeycomb-tile.webp';
function HexGlyph({ size = 14 }) {
  // Hex cell glyph: no text, inline SVG, zero image weight.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M12 2 21 7v10l-9 5-9-5V7z" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </svg>
  );
}

export default function HivePage() {
  const canvasRef = useRef(null);
  const coreRef = useRef(null);
  const rendererRef = useRef(null);
  const reducedMotionRef = useRef(false);

  const [mode, setMode] = useState('active');
  const [meter, setMeter] = useState(0);
  const [awakened, setAwakened] = useState(false);

  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const core = new HiveCore({ radius: 5, mode: 'active' });
    coreRef.current = core;
    const renderer = createHiveRenderer(canvasRef.current, core, {
      reducedMotion: reducedMotionRef.current,
      onEvent: (e) => {
        if (e.type === 'awaken') {
          setAwakened(true);
          window.setTimeout(() => setAwakened(false), 3500);
        }
      },
    });
    rendererRef.current = renderer;
    renderer.resize();
    if (reducedMotionRef.current) renderer.drawStatic();
    else renderer.start();

    const onResize = () => {
      renderer.resize();
      if (reducedMotionRef.current) renderer.drawStatic();
    };
    window.addEventListener('resize', onResize);

    // Keep the hive-mind meter HUD in sync (cheap interval, not per frame).
    const meterTimer = window.setInterval(() => {
      if (coreRef.current) setMeter(Math.round(coreRef.current.meter));
    }, 250);

    return () => {
      window.removeEventListener('resize', onResize);
      window.clearInterval(meterTimer);
      renderer.stop();
    };
  }, []);

  const changeMode = useCallback((next) => {
    setMode(next);
    if (rendererRef.current) rendererRef.current.setMode(next);
  }, []);

  const handleTap = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;
    const rect = canvas.getBoundingClientRect();
    renderer.tap(clientX - rect.left, clientY - rect.top, performance.now());
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#020608] text-white select-none">
      {/* Ambient backdrop behind the hive canvas (shows while the renderer boots) */}
      <div aria-hidden="true" className="absolute inset-0 bg-cover bg-center opacity-50" style={{ backgroundImage: `url(${HIVE_BG})` }} />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#020608]/70 via-[#020608]/50 to-[#020608]/85" />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        onPointerDown={(e) => handleTap(e.clientX, e.clientY)}
        aria-label="Cyber hive core. Tap a hex cell to energize it."
      />

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 pointer-events-none">
        <h1 className="text-xl sm:text-2xl font-black tracking-widest uppercase text-cyan-300">
          The Hive
        </h1>
        <p className="text-xs sm:text-sm text-cyan-100/70 mt-1">
          {MODES[mode].description}
        </p>

        <div className="mt-3 max-w-xs">
          <div className="flex justify-between text-[11px] uppercase tracking-wider text-cyan-100/70">
            <span>Hive mind</span>
            <span>{meter}%</span>
          </div>
          <div
            className="h-2 mt-1 rounded bg-cyan-950/80 border border-cyan-500/30 overflow-hidden"
            role="progressbar"
            aria-valuenow={meter}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Hive mind charge"
          >
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-orange-400 transition-all duration-300"
              style={{ width: `${meter}%` }}
            />
          </div>
        </div>

        {awakened && (
          <div
            className="mt-3 inline-block px-4 py-2 rounded border border-orange-400/60 bg-orange-500/10 text-orange-200 text-sm font-bold tracking-wide"
            style={{ backgroundImage: `url(${HIVE_TILE})`, backgroundSize: '96px 96px', backgroundBlendMode: 'overlay' }}
          >
            HIVE MIND AWAKENED
          </div>
        )}
      </div>

      {/* Mode switcher */}
      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 flex flex-col items-center gap-2">
        <p className="text-[11px] uppercase tracking-widest text-cyan-100/50 pointer-events-none">
          Tap a cell to send a pulse through the hive
        </p>
        <div className="flex gap-2 pointer-events-auto">
          {MODE_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => changeMode(key)}
              aria-pressed={mode === key}
              className={`min-h-[44px] px-5 rounded-full border text-sm font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2 ${
                mode === key
                  ? 'bg-cyan-400/20 border-cyan-300 text-cyan-200'
                  : 'bg-black/50 border-cyan-500/30 text-cyan-100/60 hover:border-cyan-300/60'
              }`}
            >
              <HexGlyph size={14} />
              {MODES[key].label}
            </button>
          ))}
        </div>
      </div>
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />
    </div>
  );
}
