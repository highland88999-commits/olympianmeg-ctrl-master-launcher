'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { submenuArtFor } from '@/lib/god-menus';
import {
  MODES,
  createCamera,
  orbitCamera,
  zoomCamera,
} from './arena';
import { createArenaScene } from './scene';
import Tickets from './tickets';
import Live from './live';
// Menu Art Transfer batch 2 — submenu art. Background image + dark legibility
// scrim; a missing image hides itself via onError so the chip falls back to
// its plain style. Never breaks the UI.
function SubmenuArt({ slot }) {
  return (
    <>
      <img
        src={submenuArtFor(slot)}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/55" />
    </>
  );
}

// Arena mode id -> submenu art slot suffix.
const MODE_ART = { concert: 'concert-night', game: 'game-night', quiet: 'empty-arena' };



export default function RogersArenaPage() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const camRef = useRef(createCamera());
  const dragRef = useRef(null);
  const reducedMotionRef = useRef(false);

  const [tab, setTab] = useState('arena'); // arena | live | tickets
  const [modeId, setModeId] = useState('concert');
  const mode = MODES.find((m) => m.id === modeId);

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
      {/* Section tabs: arena vignette | live game center | real ticket booking */}
      <div className="absolute top-0 left-0 right-0 z-20 flex justify-center pt-3 pointer-events-none">
        <div
          className="pointer-events-auto flex gap-1 p-1 rounded-full bg-black/70 border border-white/15"
          role="tablist"
          aria-label="Rogers Arena sections"
        >
          {[
            { id: 'arena', label: 'Arena' },
            { id: 'live', label: 'Live' },
            { id: 'tickets', label: 'Tickets' },
          ].map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-[44px] px-5 rounded-full text-xs sm:text-sm font-bold uppercase tracking-widest ${
                tab === t.id ? 'bg-cyan-400/90 text-black' : 'text-zinc-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

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
              Rogers Arena
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-md">
              {mode.description}
            </p>
          </header>

          {/* Mode picker */}
          <nav
            className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 flex flex-col items-center gap-2"
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
                  className={`relative min-h-[44px] inline-flex items-center justify-center overflow-hidden px-4 sm:px-6 rounded-full text-xs sm:text-sm font-bold uppercase tracking-widest border transition-all ${
                    modeId === m.id
                      ? 'bg-cyan-400/90 text-black border-cyan-300'
                      : 'bg-black/60 text-zinc-300 border-white/20 hover:border-cyan-400/60'
                  }`}
                >
                  {modeId !== m.id && <SubmenuArt slot={`submenu-prog-rogers-arena-${MODE_ART[m.id]}`} />}
                  <span className="relative">{m.label}</span>
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

