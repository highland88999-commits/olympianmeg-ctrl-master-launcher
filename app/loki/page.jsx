'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  THEMES,
  createIllusionState,
  nextThemeIndex,
  prevThemeIndex,
  createAudioEngine,
} from './illusions';
import { createIllusionRenderer } from './canvas';

export default function LokiPage() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const audioRef = useRef(null);
  const stateRef = useRef(null);
  const touchStartRef = useRef(null);

  const [themeIndex, setThemeIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Build renderer once.
  useEffect(() => {
    const mq =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    const rm = !!(mq && mq.matches);
    setReducedMotion(rm);
    stateRef.current = createIllusionState(0);
    if (canvasRef.current) {
      rendererRef.current = createIllusionRenderer(canvasRef.current, stateRef.current, {
        reducedMotion: rm,
      });
    }
    return () => {
      if (rendererRef.current) rendererRef.current.dispose();
      if (audioRef.current) audioRef.current.dispose();
    };
  }, []);

  const shiftTo = useCallback(
    (idx) => {
      const n = ((idx % THEMES.length) + THEMES.length) % THEMES.length;
      stateRef.current = createIllusionState(n);
      if (rendererRef.current) rendererRef.current.setIllusion(stateRef.current);
      if (audioRef.current) audioRef.current.setTheme(THEMES[n]);
      setThemeIndex(n);
    },
    []
  );

  const shiftNext = useCallback(() => shiftTo(nextThemeIndex(themeIndex)), [themeIndex, shiftTo]);
  const shiftPrev = useCallback(() => shiftTo(prevThemeIndex(themeIndex)), [themeIndex, shiftTo]);

  const begin = useCallback(() => {
    if (started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        const engine = createAudioEngine(() => new AC());
        engine.setTheme(THEMES[themeIndex]);
        engine.start();
        audioRef.current = engine;
      }
    } catch (_) {
      // Audio is atmosphere only — the visuals stand alone.
    }
    setStarted(true);
  }, [started, themeIndex]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (audioRef.current) audioRef.current.setMuted(next);
      return next;
    });
  }, []);

  const onTap = useCallback(
    (e) => {
      if (!started) {
        begin();
        return;
      }
      // Don't cycle when tapping the mute button.
      if (e.target && e.target.closest && e.target.closest('[data-ui]')) return;
      shiftNext();
    },
    [started, begin, shiftNext]
  );

  // Keyboard: arrows cycle, M mutes, Enter/Space begins.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') shiftNext();
      else if (e.key === 'ArrowLeft') shiftPrev();
      else if (e.key === 'm' || e.key === 'M') toggleMute();
      else if ((e.key === 'Enter' || e.key === ' ') && !started) {
        e.preventDefault();
        begin();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shiftNext, shiftPrev, toggleMute, begin, started]);

  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    const s = touchStartRef.current;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    if (Math.abs(dx) > 48 && started) {
      if (dx > 0) shiftPrev();
      else shiftNext();
    }
    touchStartRef.current = null;
  };

  const theme = THEMES[themeIndex];

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black select-none"
      style={{ touchAction: 'pan-y' }}
      onClick={onTap}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="application"
      aria-label="Loki's Illusions — an ambient illusion"
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" aria-hidden="true" />

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-5 pointer-events-none">
        <div>
          <div className="text-[11px] tracking-[0.35em] uppercase text-white/50">Loki's Illusions</div>
          <h1 className="text-2xl font-black text-white tracking-wide mt-1" style={{ textShadow: `0 0 18px ${theme.palette.glow}` }}>
            {theme.name}
          </h1>
          <p className="text-sm text-white/60 mt-1 max-w-[240px]">{theme.tagline}</p>
        </div>
        <button
          data-ui
          onClick={(e) => {
            e.stopPropagation();
            if (!started) begin();
            toggleMute();
          }}
          className="pointer-events-auto px-4 py-2 rounded-full bg-white/10 border border-white/20 text-white text-sm backdrop-blur-sm hover:bg-white/20 transition-colors"
          aria-label={muted ? 'Unmute the ambience' : 'Mute the ambience'}
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-6 pointer-events-none">
        <p className="text-xs tracking-[0.25em] uppercase text-white/40">
          {reducedMotion ? 'An illusion, held still' : 'Tap to shift the illusion'}
        </p>
      </div>

      {/* Begin overlay — doubles as the audio-unlock gesture */}
      {!started && (
        <button
          data-ui
          onClick={begin}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px] cursor-pointer"
          aria-label="Begin Loki's Illusions"
        >
          <span className="text-4xl font-black text-white tracking-widest" style={{ textShadow: '0 0 24px #35e0ff' }}>
            LOKI
          </span>
          <span className="text-sm text-white/70 mt-3 tracking-wide">Four illusions. One trickster.</span>
          <span className="mt-6 px-6 py-3 rounded-full border border-cyan-300/40 text-cyan-200 text-sm tracking-[0.2em] uppercase">
            Tap to begin
          </span>
        </button>
      )}
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
    </div>
  );
}
