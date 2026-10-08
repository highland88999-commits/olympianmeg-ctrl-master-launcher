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

const TILE = '/images/apollo-shared/apollo-panel-tile.webp';
const BG = '/images/loki/loki-bg.webp';

// Inline SVG glyph system (zero image weight) — APOLLO amber/gold treatment.
const G = (props) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props} />
);
const IconPlay = () => (<G><path d="M8 5v14l11-7z" fill="currentColor" stroke="none" /></G>);
const IconVolume = () => (<G><path d="M11 5 6.5 9H3v6h3.5L11 19z" fill="currentColor" stroke="none" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" /></G>);
const IconMute = () => (<G><path d="M11 5 6.5 9H3v6h3.5L11 19z" fill="currentColor" stroke="none" /><path d="m16 9 5 6M21 9l-5 6" /></G>);
const IconSpin = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#e8b93c" strokeWidth="3"
    strokeLinecap="round" aria-hidden="true" style={{ animation: 'lokispin 0.9s linear infinite' }}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);

export default function LokiPage() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const audioRef = useRef(null);
  const stateRef = useRef(null);
  const touchStartRef = useRef(null);
  const summoningRef = useRef(false);

  const [themeIndex, setThemeIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [summoning, setSummoning] = useState(false); // styled loading beat on the begin gesture
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
    if (started || summoningRef.current) return;
    summoningRef.current = true;
    setSummoning(true);
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
    // A short "summoning" beat so the begin gesture feels like a ritual, not a pop.
    setTimeout(() => {
      setStarted(true);
      setSummoning(false);
      summoningRef.current = false;
    }, 550);
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

      {/* Cinematic vignette bed — page background art framing the illusion. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.55) 100%), url(${BG})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.35,
        }}
      />

      {/* HUD */}
      <div className="absolute left-0 right-0 flex items-start justify-between p-5 pointer-events-none" style={{ top: 'max(3.5rem, calc(env(safe-area-inset-top) + 3rem))' }}>
        <div>
          <div className="text-[11px] tracking-[0.35em] uppercase text-amber-200/60">Loki's Illusions</div>
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
          className="pointer-events-auto px-4 py-2 rounded-full border border-amber-300/30 text-amber-100 text-sm backdrop-blur-sm hover:border-amber-200/60 transition-colors inline-flex items-center gap-2"
          style={{
            backgroundImage: `url(${TILE})`,
            backgroundSize: '200px',
            backgroundColor: 'rgba(10,7,3,0.55)',
          }}
          aria-label={muted ? 'Unmute the ambience' : 'Mute the ambience'}
        >
          {muted ? <IconMute /> : <IconVolume />}
          {muted ? 'Unmute' : 'Mute'}
        </button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <p className="text-xs tracking-[0.25em] uppercase text-white/40">
          {reducedMotion ? 'An illusion, held still' : 'Tap to shift the illusion'}
        </p>
      </div>

      {/* Begin overlay — doubles as the audio-unlock gesture */}
      {!started && (
        <button
          data-ui
          onClick={begin}
          className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer"
          style={{
            backgroundImage: `linear-gradient(rgba(3,2,1,0.72), rgba(3,2,1,0.78)), url(${BG})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backdropFilter: 'blur(2px)',
          }}
          aria-label="Begin Loki's Illusions"
        >
          <span className="text-4xl font-black text-white tracking-widest" style={{ textShadow: '0 0 24px #e8b93c' }}>
            LOKI
          </span>
          <span className="text-sm text-white/70 mt-3 tracking-wide">Four illusions. One trickster.</span>
          <span className="mt-6 px-6 py-3 rounded-full border border-amber-300/40 text-amber-200 text-sm tracking-[0.2em] uppercase inline-flex items-center gap-3 min-h-[48px]">
            {summoning ? (
              <>
                <IconSpin />
                Summoning…
              </>
            ) : (
              <>
                <IconPlay />
                Tap to begin
              </>
            )}
          </span>
        </button>
      )}
      <style>{`@keyframes lokispin { to { transform: rotate(360deg); } }`}</style>
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />
    </div>
  );
}
