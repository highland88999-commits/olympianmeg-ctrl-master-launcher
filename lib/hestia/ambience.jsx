'use client';
// Shared HESTIA interior-graphics helpers (Maestro-pilot pattern).
//
// useAmbience(key, defaultMode) — cycles Video → Still → Off, persisted in
// localStorage under `hestia-bg-<key>`. Reduced-motion users default to Still.
// AmbienceToggle — the small pill button that drives it (icon + label).

import { useEffect, useState } from 'react';

export const HESTIA_PANEL_TILE = '/images/hestia/panel-ember.webp';

/** Inline background-image style for the shared charred-stone panel tile. */
export function panelTileStyle(opacity = 1) {
  return {
    backgroundImage: `url(${HESTIA_PANEL_TILE})`,
    backgroundSize: '512px 512px',
    backgroundRepeat: 'repeat',
    opacity,
  };
}

export function useAmbience(key, defaultMode = 'video') {
  const [mode, setMode] = useState('video');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let next = defaultMode;
    try {
      const saved = window.localStorage.getItem('hestia-bg-' + key);
      if (saved === 'video' || saved === 'still' || saved === 'off') {
        next = saved;
      } else if (
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        next = 'still';
      }
    } catch {
      /* private mode — fall through to default */
    }
    setMode(next);
    setHydrated(true);
  }, [key, defaultMode]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem('hestia-bg-' + key, mode);
    } catch {
      /* ignore */
    }
  }, [key, mode, hydrated]);

  const cycle = () =>
    setMode((m) => (m === 'video' ? 'still' : m === 'still' ? 'off' : 'video'));

  return { mode, cycle, hydrated };
}

export function AmbienceToggle({ mode, onCycle, tone = 'light', className = '' }) {
  const label = mode === 'video' ? 'Ambience · Video' : mode === 'still' ? 'Ambience · Still' : 'Ambience · Off';
  const fg = tone === 'light' ? 'text-amber-100/80' : 'text-zinc-300';
  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label="Cycle page background: video, still image, or off"
      title={label}
      className={`inline-flex items-center gap-1.5 rounded-full border border-amber-200/25 bg-black/50 px-2.5 py-1.5 text-[10px] tracking-[0.18em] uppercase backdrop-blur-sm transition-colors hover:border-amber-200/60 hover:text-amber-100 ${fg} ${className}`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.4c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z" />
      </svg>
      <span>{mode === 'video' ? 'Video' : mode === 'still' ? 'Still' : 'Off'}</span>
    </button>
  );
}
