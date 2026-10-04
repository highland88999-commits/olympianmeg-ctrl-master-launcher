'use client';

// Shared ambient-background kit for the PLUTUS interior-graphics batch
// (Maestro-pilot pattern): a fixed full-viewport layer with a slow ambient
// video loop, a still-image fallback, and an off state. GPU-composited,
// never blocks content. Toggle cycles Video -> Still -> Off and persists in
// localStorage; defaults to Still when the OS reports prefers-reduced-motion.
//
// Usage:
//   const [bgMode, cycleBg] = useAmbience('plutus-bg');
//   <AmbienceBackdrop basePath="/images/auction-house" bgMode={bgMode} />
//   <button onClick={cycleBg}>Ambience: …</button>

import { useEffect, useState } from 'react';

export function useAmbience(storageKey) {
  const [bgMode, setBgMode] = useState('video');
  useEffect(() => {
    let initial = 'video';
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === 'video' || saved === 'still' || saved === 'off') initial = saved;
    } catch {
      /* storage unavailable: keep default */
    }
    if (
      initial === 'video' &&
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      initial = 'still';
    }
    setBgMode(initial);
  }, [storageKey]);

  const cycle = () => {
    setBgMode((m) => {
      const next = m === 'video' ? 'still' : m === 'still' ? 'off' : 'video';
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };
  return [bgMode, cycle];
}

export function bgModeLabel(bgMode) {
  return bgMode === 'video' ? 'Video' : bgMode === 'still' ? 'Still' : 'Off';
}

// Static (non-video) backdrop: fixed image + readability scrim.
// For programs whose background is a still image only.
export function StillBackdrop({ src, alt = '', opacity = 0.35, scrim = 'from-black/70 via-black/55 to-black/85' }) {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <img src={src} alt={alt} className="w-full h-full object-cover" style={{ opacity }} />
      <div className={`absolute inset-0 bg-gradient-to-b ${scrim}`} />
    </div>
  );
}

export default function AmbienceBackdrop({ basePath, bgMode, scrim = 'from-[#05070a]/75 via-[#05070a]/60 to-[#05070a]/90' }) {
  if (bgMode === 'off') return null;
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {bgMode === 'video' ? (
        <video
          className="w-full h-full object-cover opacity-45"
          src={`${basePath}/bg-loop.mp4`}
          poster={`${basePath}/bg-still.jpg`}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : (
        <img
          className="w-full h-full object-cover opacity-45"
          src={`${basePath}/bg-still.jpg`}
          alt=""
        />
      )}
      {/* Readability scrim: keeps text legible over the motion. */}
      <div className={`absolute inset-0 bg-gradient-to-b ${scrim}`} />
    </div>
  );
}
