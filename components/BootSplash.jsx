'use client';

// components/BootSplash.jsx — static loading shell for the app root.
//
// Merlin, 2026-11-19: on his phone the home page kept reloading itself
// and every reload showed a blank white page, then a blank black page —
// the initial HTML carries zero content until the JS bundle downloads
// and hydrates, so a slow reload reads as a dead page. This splash is
// server-rendered into the first HTML bytes, so the visitor sees
// "Loading Olympus…" instead of nothing while the bundle loads; it
// removes itself the moment React hydrates. Pure inline styles +
// keyframes, so it looks right before globals.css ever arrives.
import { useEffect, useState } from 'react';

export default function BootSplash() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  if (ready) return null;
  return (
    <div
      id="olympus-boot"
      role="status"
      aria-label="Loading Olympus"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: '#050505',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '18px',
        color: '#fff',
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        pointerEvents: 'none',
      }}
    >
      <style>{`@keyframes olympus-boot-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ fontSize: '11px', letterSpacing: '0.35em', color: '#67e8f9', fontWeight: 600 }}>
        NEXUS VORTEX
      </div>
      <div
        aria-hidden="true"
        style={{
          width: '34px',
          height: '34px',
          borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.18)',
          borderTopColor: '#22d3ee',
          animation: 'olympus-boot-spin 0.9s linear infinite',
        }}
      />
      <div style={{ fontSize: '14px', color: '#d4d4d8' }}>Loading Olympus…</div>
    </div>
  );
}
