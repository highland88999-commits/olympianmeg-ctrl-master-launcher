// components/DoomsdayBanner.jsx
// The financial-system-release countdown ("doomsday").
// HUB-ONLY (Merlin, 2026-10-14): the countdown lives in the main hub
// (route "/") and nowhere else — never inside a pocket universe or
// program. Shown until the accumulative lock lifts (Dec 11, 2027) —
// then it removes itself. Never a modal: his no-popups law stands.
// 2026-10-20 (Merlin): the countdown MOVED into the top of the
// Concourse, styled gold — see DoomsdayStrip below. The old page-top
// banner (Loki-green, minimizable, video background) is retired;
// DoomsdayStrip is the only mounted form now.
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

  // HUB-ONLY gate (Merlin, 2026-10-14): render ONLY on the main hub
  // route "/". Every pocket universe / program route gets null — the
  // countdown never appears inside Kombat, the store, Earth, or any
  // satellite. This subsumes the old shadow-realm carve-out
  // (2026-10-12: banner fully hidden there); "/shadow-realm" is not
  // "/", so it stays hidden. Not transparent; removed.
  // This check MUST stay below every hook: returning above the useEffect
  // changed the hook count between routes and crashed the app with React
  // error #300 (rendered fewer hooks than expected) on 2026-10-13.
  // (An unknown/null pathname keeps the old fall-through behaviour.)
  if (pathname && pathname !== '/') return null;

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

// DoomsdayStrip — the countdown's Concourse form (Merlin, 2026-10-20):
// a golden band across the top of the Concourse box. Same lock data
// and per-second tick as the retired banner; hub-only; removes itself
// when the lock lifts. Reports its visibility so the Concourse can
// size the box around it. The whole strip links to the explainer.
export function DoomsdayStrip({ onVisibility }) {
  const pathname = usePathname();
  const [info, setInfo] = useState(null);
  const [artFailed, setArtFailed] = useState(false);

  useEffect(() => {
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
        /* strip stays hidden on error — never break the shell */
      }
    }
    load();
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  const visible = !!info && (!pathname || pathname === '/');
  useEffect(() => {
    onVisibility?.(visible);
  }, [visible, onVisibility]);

  if (!visible) return null;

  const ms = Math.max(0, info.countdown_ms || 0);
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const clock = `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`;

  return (
    <Link
      href="/wallet/how-it-works"
      role="status"
      aria-label={`Financial system releases in ${days} days`}
      className="ui-element pointer-events-auto relative -mx-3.5 -mt-3.5 mb-3 flex flex-wrap items-center justify-center gap-2.5 overflow-hidden rounded-t-[1.5rem] border-b border-amber-300/40 px-3.5 py-2 no-underline shadow-[inset_0_1px_0_rgba(255,215,130,0.35),0_0_24px_rgba(245,197,66,0.15)]"
    >
      {/* The golden graphic (Merlin, 2026-10-21) replaces the flat
          gold gradient: sunburst over Olympus, cropped so the text
          row rides the artwork's dark bronze field (object-position
          62% — below the bright sunburst, above the Greek-key band).
          If the art ever fails, the old gradient returns. */}
      {artFailed ? (
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(66,45,4,0.85) 0%, rgba(120,84,10,0.75) 50%, rgba(66,45,4,0.85) 100%)',
          }}
        />
      ) : (
        <img
          src="/concourse-icons/doomsday-strip.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          onError={() => setArtFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: '50% 62%' }}
        />
      )}
      <span className="relative text-[10px] font-black tracking-[0.28em] uppercase text-amber-300 drop-shadow-[0_0_6px_rgba(245,197,66,0.6)]">
        Doomsday
      </span>
      <span
        className="relative text-[13px] font-extrabold tabular-nums text-amber-100 drop-shadow-[0_0_8px_rgba(245,197,66,0.45)]"
        style={{ textShadow: '0 1px 8px rgba(0,0,0,0.55)' }}
      >
        {clock}
      </span>
      <span className="relative text-[9px] font-semibold tracking-wider uppercase text-amber-200/70">
        until {info.locked_until_label || 'Dec 11'}
      </span>
    </Link>
  );
}
