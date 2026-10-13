// components/DoomsdayBanner.jsx
// The financial-system-release countdown banner ("doomsday").
// Shown on EVERY launcher load until the accumulative lock lifts
// (Dec 11, 2026) — then it removes itself. A banner, never a modal:
// his no-popups law stands. Loki-green, minimizable (preference
// persisted), video-ready background with gradient fallback.
'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

function pad(n) {
  return String(n).padStart(2, '0');
}

const MIN_KEY = 'doomsday-banner-min';
const VIDEO_SRC = '/videos/doomsday-bg.mp4';

export default function DoomsdayBanner() {
  const pathname = usePathname();
  const [info, setInfo] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [videoOk, setVideoOk] = useState(true);

  useEffect(() => {
    try {
      setMinimized(window.localStorage.getItem(MIN_KEY) === '1');
    } catch {
      /* ignore */
    }
    let alive = true;
    let timer = null;
    async function load() {
      try {
        const res = await fetch('/api/wallet/lock', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (data && data.ok && data.locked) {
          setInfo(data);
          timer = setInterval(() => {
            setInfo((prev) =>
              prev ? { ...prev, countdown_ms: Math.max(0, (prev.countdown_ms || 0) - 1000) } : prev
            );
          }, 1000);
        } else {
          setInfo(null);
        }
      } catch {
        /* banner stays hidden on error — never break the shell */
      }
    }
    load();
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  function toggleMin() {
    setMinimized((m) => {
      const next = !m;
      try {
        window.localStorage.setItem(MIN_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // TRON realm (shadow-realm): banner fully hidden — Merlin 2026-10-12,
  // it interferes with the realm overlay. Not transparent; removed.
  // This check MUST stay below every hook: returning above the useEffect
  // changed the hook count between routes and crashed the app with React
  // error #300 (rendered fewer hooks than expected) on 2026-10-13.
  if (pathname && pathname.startsWith('/shadow-realm')) return null;

  if (!info) return null;

  const ms = Math.max(0, info.countdown_ms || 0);
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const clock = `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`;

  const shell = {
    position: 'relative',
    zIndex: 60,
    overflow: 'hidden',
    backgroundColor: '#03130b',
    borderBottom: '1px solid rgba(52,211,153,0.35)',
    color: '#a7f3d0',
  };

  const videoLayer =
    videoOk ? (
      <video
        src={VIDEO_SRC}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
        onError={() => setVideoOk(false)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.35,
          pointerEvents: 'none',
        }}
      />
    ) : null;

  const fallbackGlow = (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background:
          'linear-gradient(90deg, #03130b 0%, #0a2e1c 30%, #03130b 60%, #07231a 100%), radial-gradient(ellipse at 50% 120%, rgba(52,211,153,0.22), transparent 60%)',
      }}
    />
  );

  const toggleBtn = (
    <button
      onClick={toggleMin}
      aria-label={minimized ? 'Expand doomsday banner' : 'Minimize doomsday banner'}
      style={{
        background: 'transparent',
        border: '1px solid rgba(52,211,153,0.4)',
        borderRadius: 6,
        color: '#6ee7b7',
        cursor: 'pointer',
        fontSize: '0.8rem',
        lineHeight: 1,
        padding: '0.25rem 0.5rem',
      }}
    >
      {minimized ? '＋' : '−'}
    </button>
  );

  if (minimized) {
    return (
      <div role="status" style={{ ...shell, padding: '0.3rem 0.8rem' }}>
        {videoLayer}
        {fallbackGlow}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.7rem',
            fontSize: '0.78rem',
            letterSpacing: '0.04em',
          }}
        >
          <span style={{ fontWeight: 800, color: '#34d399' }}>DOOMSDAY</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#ecfdf5' }}>
            {clock}
          </span>
          {toggleBtn}
        </div>
      </div>
    );
  }

  return (
    <div role="status" aria-label={`Financial system releases in ${days} days`} style={shell}>
      {videoLayer}
      {fallbackGlow}
      <div
        style={{
          position: 'relative',
          padding: '0.55rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.9rem',
          flexWrap: 'wrap',
          fontSize: '0.85rem',
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ fontWeight: 800, color: '#34d399' }}>DOOMSDAY</span>
        <span style={{ color: '#6ee7b7' }}>The financial system releases in</span>
        <span
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 800,
            fontSize: '1rem',
            color: '#ecfdf5',
            background: 'rgba(52,211,153,0.12)',
            border: '1px solid rgba(52,211,153,0.4)',
            borderRadius: 8,
            padding: '0.15rem 0.6rem',
          }}
        >
          {clock}
        </span>
        <span style={{ color: '#5fb98a' }}>
          Every wallet is accumulating until {info.locked_until_label || 'Dec 11'} — then
          withdrawals unlock for everyone.
        </span>
        <Link
          href="/wallet/how-it-works"
          style={{ color: '#6ee7b7', fontWeight: 700, textDecoration: 'underline' }}
        >
          How it works
        </Link>
        <Link
          href="/wallet"
          style={{
            color: '#03130b',
            background: '#34d399',
            fontWeight: 800,
            borderRadius: 8,
            padding: '0.3rem 0.9rem',
            textDecoration: 'none',
          }}
        >
          View wallet →
        </Link>
        {toggleBtn}
      </div>
    </div>
  );
}
