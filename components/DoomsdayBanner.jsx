// components/DoomsdayBanner.jsx
// The Christmas-unlock countdown banner ("doomsday").
// Shown on EVERY launcher load until the accumulative lock lifts
// (Dec 11, 2026) — then it removes itself. A banner, never a modal:
// his no-popups law stands. Bold, vault-themed, live countdown.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

function pad(n) {
  return String(n).padStart(2, '0');
}

export default function DoomsdayBanner() {
  const [info, setInfo] = useState(null);

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
        /* banner stays hidden on error — never break the shell */
      }
    }
    load();
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  if (!info) return null;

  const ms = Math.max(0, info.countdown_ms || 0);
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);

  return (
    <div
      role="status"
      aria-label={`Withdrawals unlock in ${days} days`}
      style={{
        background:
          'linear-gradient(90deg, #12060a 0%, #2b0f1e 30%, #12060a 60%, #1c0b16 100%), radial-gradient(ellipse at 50% 120%, rgba(251,191,36,0.25), transparent 60%)',
        backgroundColor: '#12060a',
        borderBottom: '1px solid rgba(251,191,36,0.35)',
        color: '#fde68a',
        padding: '0.55rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.9rem',
        flexWrap: 'wrap',
        fontSize: '0.85rem',
        letterSpacing: '0.04em',
        position: 'relative',
        zIndex: 60,
      }}
    >
      <span style={{ fontSize: '1.05rem' }} aria-hidden="true">
        🔒
      </span>
      <span style={{ fontWeight: 800, color: '#fbbf24' }}>DOOMSDAY</span>
      <span style={{ color: '#fcd34d' }}>The vaults open in</span>
      <span
        style={{
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 800,
          fontSize: '1rem',
          color: '#fff7ed',
          background: 'rgba(251,191,36,0.12)',
          border: '1px solid rgba(251,191,36,0.4)',
          borderRadius: 8,
          padding: '0.15rem 0.6rem',
        }}
      >
        {days}d {pad(hours)}:{pad(mins)}:{pad(secs)}
      </span>
      <span style={{ color: '#d6a35c' }}>
        Every wallet is accumulating until {info.locked_until_label || 'Dec 11'} — then withdrawals
        unlock for everyone.
      </span>
      <Link
        href="/wallet"
        style={{
          color: '#0b0e1a',
          background: '#fbbf24',
          fontWeight: 800,
          borderRadius: 8,
          padding: '0.3rem 0.9rem',
          textDecoration: 'none',
        }}
      >
        View wallet →
      </Link>
    </div>
  );
}
