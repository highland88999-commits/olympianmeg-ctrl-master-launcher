'use client';

// Remembrance Day 2026 greeting overlay (Merlin, 2026-11-01):
// the year-01 Remembrance video plays ONCE through, with sound, as a
// fullscreen overlay before anything else loads — then the app continues
// its usual process. Active only for Remembrance Day across all timezones.
// Window: Nov 11 00:00 UTC+14 → Nov 12 00:00 UTC-12
//       = 2026-11-10T10:00:00Z → 2026-11-12T12:00:00Z.
//
// HARDENED (lesson of the Nov 1 black screen of death): the active state
// re-checks the window every 30s while mounted, so a stale edge-cache render
// or a long-open tab can never leave this stuck past its window. The
// holiday-overlay-guard cron is the backstop.

import { useEffect, useRef, useState } from 'react';

const WINDOW_START = Date.parse('2026-11-10T10:00:00Z');
const WINDOW_END = Date.parse('2026-11-12T12:00:00Z');
const VIDEO_SRC = '/videos/holidays/remembrance/year-01.mp4';

function inWindow() {
  const now = Date.now();
  return now >= WINDOW_START && now <= WINDOW_END;
}

export default function RemembranceOverlay() {
  const [active, setActive] = useState(() => inWindow());
  const [needsTap, setNeedsTap] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const videoRef = useRef(null);

  // Re-check the window periodically: never stay up past WINDOW_END,
  // even if the HTML was cached from inside the window.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (!inWindow()) setActive(false);
    }, 30000);
    return () => clearInterval(id);
  }, [active ]);

  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const skipTimer = setTimeout(() => setShowSkip(true), 1500);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(skipTimer);
    };
  }, [active ]);

  useEffect(() => {
    if (!active) return;
    const v = videoRef.current;
    if (!v) return;
    const p = v.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => setNeedsTap(true));
    }
  }, [active ]);

  if (!active) return null;

  const dismiss = () => setActive(false);

  const tapToPlay = () => {
    const v = videoRef.current;
    setNeedsTap(false);
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => setShowSkip(true));
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Remembrance Day greeting"
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483000, background: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        playsInline
        preload="auto"
        onEnded={dismiss}
        onError={dismiss}
        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
      />
      {needsTap && (
        <button
          type="button"
          onClick={tapToPlay}
          style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
            border: 'none', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px',
          }}
        >
          <span style={{ fontSize: '3rem' }} aria-hidden="true">🌺</span>
          <span style={{ color: '#ffd700', fontSize: '1.1rem', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Tap for sound
          </span>
        </button>
      )}
      {showSkip && !needsTap && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Skip Remembrance video"
          style={{
            position: 'absolute', right: '18px', bottom: 'calc(24px + env(safe-area-inset-bottom))',
            background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,215,0,0.6)',
            color: '#ffd700', borderRadius: '999px', padding: '10px 22px',
            fontSize: '0.85rem', letterSpacing: '2px', textTransform: 'uppercase', cursor: 'pointer',
          }}
        >
          Skip
        </button>
      )}
    </div>
  );
}
