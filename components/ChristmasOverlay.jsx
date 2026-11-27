'use client';

// Christmas season greeting overlay (Merlin, 2026-11-15; re-routed Nov 27, 2026):
// a seasonal video plays ONCE through, with sound, as a fullscreen overlay
// before anything else loads — then the app continues its usual process.
// The video is routed by the viewer's LOCAL calendar date (see
// lib/seasonal/overlay-video.js):
//   Nov 27 - Dec 24, 2026 : 2026-early.mp4 (60 s, vertical)
//   Dec 25, 2026 - Jan 6, 2027 : 2026-day.mp4 (1:04, landscape)
// The season ends with Twelfth Night (Jan 6); the tree is gone Jan 8.
//
// LOCAL dates, not absolute-UTC windows, on purpose — the lesson of the
// Nov 27 Thanksgiving bug: a UTC window ("Christmas Day across all
// timezones") stays open into the next local day, so the wrong video can
// play on the morning of the changeover. A date is a date.
//
// HARDENED (lesson of the Nov 1 black screen of death): the active state
// re-checks the date every 30s while mounted, so a stale edge-cache
// render or a long-open tab can never leave this stuck past its window,
// and a midnight rollover swaps the video. The holiday-overlay-guard cron
// is the backstop.

import { useEffect, useRef, useState } from 'react';
import { seasonalOverlayVideo } from '@/lib/seasonal/overlay-video';

export default function ChristmasOverlay() {
  const [src, setSrc] = useState(() => seasonalOverlayVideo(new Date()));
  const [needsTap, setNeedsTap] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const videoRef = useRef(null);

  const active = src !== null;

  // Re-check the date periodically: never stay up past the season's end,
  // even if the HTML was cached from inside the window — and swap the
  // video when the date rolls over (Dec 24 -> Dec 25).
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const next = seasonalOverlayVideo(new Date());
      if (next !== src) {
        setNeedsTap(false);
        setShowSkip(false);
        setSrc(next);
      }
    }, 30000);
    return () => clearInterval(id);
  }, [active, src ]);

  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const skipTimer = setTimeout(() => setShowSkip(true), 1500);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(skipTimer);
    };
  }, [active, src ]); // src too: a midnight video swap restarts the SKIP timer

  useEffect(() => {
    if (!active) return;
    const v = videoRef.current;
    if (!v) return;
    const p = v.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => setNeedsTap(true));
    }
  }, [active, src ]);

  if (!active) return null;

  const dismiss = () => setSrc(null);

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
      aria-label="Christmas greeting"
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483000, background: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <video
        ref={videoRef}
        src={src}
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
          <span style={{ fontSize: '3rem' }} aria-hidden="true">🎄</span>
          <span style={{ color: '#ffd700', fontSize: '1.1rem', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Tap for sound
          </span>
        </button>
      )}
      {showSkip && !needsTap && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Skip Christmas video"
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
