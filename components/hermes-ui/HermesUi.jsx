'use client';
// Shared HERMES-family UI atoms — mythic dark-cinematic, merchant gold + teal.
// Zero image weight for icons (inline SVG); images live in /public/images/*.

import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// HermesBackdrop — fixed full-viewport still-image backdrop with a dark scrim
// so menus/HUD stay legible. Sits behind everything (zIndex prop).
// ---------------------------------------------------------------------------
export function HermesBackdrop({
  src,
  imgOpacity = 0.42,
  scrimTop = 0.82,
  scrimBottom = 0.94,
  zIndex = -20,
  alt = '',
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      style={{ zIndex }}
    >
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ opacity: imgOpacity }}
        loading="eager"
        draggable={false}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, rgba(2,4,8,${scrimTop}) 0%, rgba(2,4,8,${scrimTop * 0.55}) 45%, rgba(2,4,8,${scrimBottom}) 100%)`,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// HermesPanelTexture — subtle gold-veined tile overlay for cards/panels.
// Drop inside a `relative` panel as the first child.
// ---------------------------------------------------------------------------
export function HermesPanelTexture({ opacity = 0.08, tile = 256 }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      style={{
        opacity,
        backgroundImage: 'url(/images/hermes/gold-tile.webp)',
        backgroundSize: `${tile}px`,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// HermesLoader — styled loading state: gold shimmer bar + tracking label.
// ---------------------------------------------------------------------------
const SHIMMER_CSS = `
@keyframes hermes-shimmer-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(320%); } }
.hermes-shimmer-bar { animation: hermes-shimmer-slide 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .hermes-shimmer-bar { animation: none; } }
`;

export function HermesLoader({ label = 'Loading', className = '' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-4 py-10 ${className}`}
    >
      <style>{SHIMMER_CSS}</style>
      <div className="h-1 w-44 overflow-hidden rounded-full bg-white/10">
        <div className="hermes-shimmer-bar h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-amber-300 to-transparent" />
      </div>
      <p className="text-[11px] uppercase tracking-[0.35em] text-amber-200/70">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// useAmbience — Video → Still → Off cycle state, persisted per page.
// Defaults to Still when the OS prefers reduced motion.
// ---------------------------------------------------------------------------
const AMBIENCE_MODES = ['video', 'still', 'off'];

export function useAmbience(storageKey, defaultMode = 'video') {
  const [mode, setMode] = useState(defaultMode);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved && AMBIENCE_MODES.includes(saved)) {
        setMode(saved);
        return;
      }
    } catch { /* storage unavailable — keep default */ }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMode('still');
    }
  }, [storageKey]);
  const cycle = useCallback(() => {
    setMode((m) => {
      const next = AMBIENCE_MODES[(AMBIENCE_MODES.indexOf(m) + 1) % AMBIENCE_MODES.length];
      try { window.localStorage.setItem(storageKey, next); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);
  return [mode, cycle];
}

const AMBIENCE_LABEL = { video: 'Video', still: 'Still', off: 'Off' };

// ---------------------------------------------------------------------------
// AmbienceToggle — small header button cycling Video → Still → Off.
// ---------------------------------------------------------------------------
export function AmbienceToggle({ mode, onCycle, className = '' }) {
  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={`Background ambience: ${AMBIENCE_LABEL[mode]}. Activate to change.`}
      title="Background ambience"
      className={`inline-flex min-h-[36px] items-center gap-2 rounded-full border border-amber-300/30 bg-black/50 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/90 backdrop-blur transition hover:border-amber-300/60 hover:text-amber-100 ${className}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${mode === 'video' ? 'bg-amber-300' : mode === 'still' ? 'bg-teal-300' : 'bg-zinc-600'}`}
      />
      {AMBIENCE_LABEL[mode]}
    </button>
  );
}
