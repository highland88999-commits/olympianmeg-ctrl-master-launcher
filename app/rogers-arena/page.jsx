'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MODES,
  createCamera,
  orbitCamera,
  zoomCamera,
} from './arena';
import { createArenaScene } from './scene';
import Tickets from './tickets';
import Live from './live';

// --- DIONYSUS interior treatment: SVG glyph system + ambient backdrop ---
const RA_BG = '/images/rogers-arena/bg.webp';
const RA_VIDEO = '/images/rogers-arena/bg-loop.mp4';
const RA_STILL = '/images/rogers-arena/bg-still.jpg';
const RA_GLYPHS = {
  dome: 'M12 2C6.5 2 2 6.5 2 12v9h20v-9c0-5.5-4.5-10-10-10zm0 3c3.9 0 7 3.1 7 7H5c0-3.9 3.1-7 7-7z',
  live: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-5a9 9 0 0 1 6.4 2.6l-1.4 1.4A7 7 0 0 0 12 5a7 7 0 0 0-5 2L5.6 5.6A9 9 0 0 1 12 3z',
  ticket: 'M4 7h16a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4V8a1 1 0 0 1 1-1zm3.5 4h9V9.5h-9z',
};
function RaIcon({ name, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
      <path d={RA_GLYPHS[name]} />
    </svg>
  );
}

export default function RogersArenaPage() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const camRef = useRef(createCamera());
  const dragRef = useRef(null);
  const reducedMotionRef = useRef(false);

  const [tab, setTab] = useState('arena'); // arena | live | tickets
  const [modeId, setModeId] = useState('concert');
  const mode = MODES.find((m) => m.id === modeId);

  // Ambient backdrop: arena flyover video on the vignette tab (never over the
  // 3D scene itself — the opaque canvas covers it), still art on Live/Tickets.
  // Cycles Video → Still → Off, persisted in localStorage ('rogers-arena-bg').
  const [ambience, setAmbience] = useState('video');
  useEffect(() => {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setAmbience('still'); return; }
      const saved = window.localStorage.getItem('rogers-arena-bg');
      if (saved === 'still' || saved === 'off' || saved === 'video') setAmbience(saved);
    } catch { /* storage unavailable */ }
  }, []);
  const cycleAmbience = () => {
    setAmbience((a) => {
      const next = a === 'video' ? 'still' : a === 'still' ? 'off' : 'video';
      try { window.localStorage.setItem('rogers-arena-bg', next); } catch { /* noop */ }
      return next;
    });
  };

  useEffect(() => {
    if (tab !== 'arena') return; // 3D vignette only mounts on its own tab
    reducedMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!mountRef.current) return;
    const scene = createArenaScene(mountRef.current, {
      mode: modeId,
      reducedMotion: reducedMotionRef.current,
    });
    scene.applyCamera(camRef.current);
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const pickMode = useCallback((id) => {
    setModeId(id);
    if (sceneRef.current) sceneRef.current.setMode(id);
  }, []);

  const applyCam = useCallback(() => {
    if (sceneRef.current) sceneRef.current.applyCamera(camRef.current);
  }, []);

  // Drag to orbit
  const onPointerDown = useCallback((e) => {
    dragRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);
  const onPointerMove = useCallback(
    (e) => {
      const d = dragRef.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      camRef.current = orbitCamera(camRef.current, dx, dy);
      applyCam();
    },
    [applyCam]
  );
  const onPointerUp = useCallback((e) => {
    if (dragRef.current && dragRef.current.id === e.pointerId) dragRef.current = null;
  }, []);

  // Wheel / pinch to zoom (pinch arrives as wheel with ctrlKey on trackpads)
  const onWheel = useCallback(
    (e) => {
      e.preventDefault();
      camRef.current = zoomCamera(camRef.current, e.deltaY);
      applyCam();
    },
    [applyCam]
  );

  useEffect(() => {
    if (tab !== 'arena') return;
    const el = mountRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel, tab]);

  return (
    <>
    <main className="fixed inset-0 bg-[#05070d] text-white overflow-hidden select-none">
      {/* Ambient backdrop: video flyover behind the 3D vignette (scene boot), still art on Live/Tickets */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
        {tab === 'arena' && ambience === 'video' && (
          <video
            src={RA_VIDEO}
            autoPlay loop muted playsInline preload="metadata" poster={RA_STILL}
            className="absolute inset-0 w-full h-full object-cover opacity-50"
            aria-hidden="true"
          />
        )}
        {(tab !== 'arena' || ambience === 'still') && ambience !== 'off' && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-50"
            style={{ backgroundImage: `url(${ambience === 'video' && tab === 'arena' ? RA_STILL : RA_BG})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#05070d]/75 via-[#05070d]/40 to-[#05070d]/85" />
      </div>
      {/* Section tabs: arena vignette | live game center | real ticket booking */}
      <div className="absolute left-0 right-0 z-20 flex justify-center pt-3 pointer-events-none" style={{ top: 'max(3.5rem, calc(env(safe-area-inset-top) + 3rem))' }}>
        <div
          className="pointer-events-auto flex gap-1 p-1 rounded-full bg-black/70 border border-white/15"
          role="tablist"
          aria-label="Rogers Arena sections"
        >
          {[
            { id: 'arena', label: 'Arena', icon: 'dome' },
            { id: 'live', label: 'Live', icon: 'live' },
            { id: 'tickets', label: 'Tickets', icon: 'ticket' },
          ].map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-[44px] px-5 rounded-full text-xs sm:text-sm font-bold uppercase tracking-widest flex items-center gap-2 ${
                tab === t.id ? 'bg-cyan-400/90 text-black' : 'text-zinc-300'
              }`}
            >
              <RaIcon name={t.icon} size={15} />
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={cycleAmbience}
        aria-label={`Ambience: ${ambience}. Activate to change.`}
        title={`Ambience: ${ambience} (Video → Still → Off)`}
        className="absolute top-3 right-3 z-30 min-h-[44px] px-3 rounded-full bg-black/60 border border-white/20 text-[10px] font-bold tracking-widest uppercase text-zinc-300 hover:border-cyan-400/60"
      >
        {ambience === 'video' ? 'Video' : ambience === 'still' ? 'Still' : 'Off'}
      </button>

      {tab === 'tickets' ? (
        <div className="absolute inset-0 overflow-y-auto select-text">
          <Tickets />
        </div>
      ) : tab === 'live' ? (
        <div className="absolute inset-0 overflow-y-auto select-text">
          <Live />
        </div>
      ) : (
        <>
          <div
            ref={mountRef}
            className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label="3D arena view. Drag to look around."
          />

          {/* Header */}
          <header className="absolute top-0 left-0 right-0 p-4 sm:p-6 pt-16 sm:pt-20 pointer-events-none">
            <h1 className="text-xl sm:text-2xl font-black tracking-widest uppercase drop-shadow">
              Concert Arena
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-md">
              {mode.description}
            </p>
          </header>

          {/* Mode picker */}
          <nav
            className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2"
            aria-label="Arena modes"
          >
            <p className="text-[11px] text-zinc-500 uppercase tracking-widest pointer-events-none">
              Drag to look around &middot; Scroll or pinch to zoom
            </p>
            <div className="flex gap-2 sm:gap-3">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => pickMode(m.id)}
                  aria-pressed={modeId === m.id}
                  className={`min-h-[44px] px-4 sm:px-6 rounded-full text-xs sm:text-sm font-bold uppercase tracking-widest border transition-all ${
                    modeId === m.id
                      ? 'bg-cyan-400/90 text-black border-cyan-300'
                      : 'bg-black/60 text-zinc-300 border-white/20 hover:border-cyan-400/60'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </nav>
        </>
      )}
    </main>
    {/* Safari bottom-bar clearance: blank space under the fixed arena viewport */}
    <div aria-hidden="true" className="player-clear" />
    </>
  );
}
