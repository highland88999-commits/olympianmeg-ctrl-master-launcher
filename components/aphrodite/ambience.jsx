'use client';
// components/aphrodite/ambience.jsx — shared APHRODITE background layers.
//
// AphroBg: fixed full-viewport image layer + dark scrim so text stays legible.
// AphroVideoBg: fixed video layer with poster + still fallback and a
// Video → Still → Off toggle persisted in localStorage. Defaults to Still
// under prefers-reduced-motion. GPU-composited, never touches app threads.
//
// Paths are relative to /public (e.g. '/images/aphrodite/agora-bg.webp').

import { useEffect, useState } from 'react';

const SCRIM =
  'linear-gradient(to bottom, rgba(4,2,8,0.72) 0%, rgba(4,2,8,0.55) 40%, rgba(4,2,8,0.82) 100%)';

export function AphroBg({ img, opacity = 1, scrimOpacity = 1 }) {
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      <img
        src={img}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity }}
      />
      <div style={{ position: 'absolute', inset: 0, background: SCRIM, opacity: scrimOpacity }} />
    </div>
  );
}

const MODES = ['video', 'still', 'off'];
const LABEL = { video: 'Video', still: 'Still', off: 'Off' };

export function AphroVideoBg({ video, still, storageKey, opacity = 0.5, toggleStyle }) {
  const [mode, setMode] = useState('video');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let initial = 'video';
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved && MODES.includes(saved)) initial = saved;
      else if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) initial = 'still';
    } catch { /* private mode */ }
    setMode(initial);
    setReady(true);
  }, [storageKey]);

  const cycle = () => {
    setMode((m) => {
      const next = MODES[(MODES.indexOf(m) + 1) % MODES.length];
      try { window.localStorage.setItem(storageKey, next); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <>
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: '#050208' }}>
        {(mode === 'video' || mode === 'still') && (
          <img
            src={still}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity }}
          />
        )}
        {ready && mode === 'video' && (
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={still}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity }}
          >
            <source src={video} type="video/mp4" />
          </video>
        )}
        <div style={{ position: 'absolute', inset: 0, background: SCRIM }} />
      </div>
      <button
        type="button"
        onClick={cycle}
        aria-label={`Background ambience: ${LABEL[mode]}. Activate to change.`}
        title="Background ambience"
        style={{
          position: 'fixed', right: 12, bottom: 'calc(5rem + env(safe-area-inset-bottom) + 12px)',
          zIndex: 60, minWidth: 44, minHeight: 44, padding: '8px 12px',
          borderRadius: 999, border: '1px solid rgba(244,114,182,0.4)',
          background: 'rgba(10,4,12,0.72)', color: '#f9a8d4',
          fontSize: 11, letterSpacing: 2, cursor: 'pointer', backdropFilter: 'blur(6px)',
          ...(toggleStyle || {}),
        }}
      >
        ✦ {LABEL[mode].toUpperCase()}
      </button>
    </>
  );
}

// Shared panel texture style helper: rose-gold damask tile over a dark base.
// Spread into an inline style or compose with Tailwind classes.
export const aphroPanel = (extra = {}) => ({
  backgroundImage: 'url(/images/aphrodite/panel-texture.webp)',
  backgroundSize: '512px 512px',
  backgroundBlendMode: 'overlay',
  ...extra,
});
