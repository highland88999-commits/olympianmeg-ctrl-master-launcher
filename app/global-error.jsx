'use client';
// app/global-error.jsx — Last-resort error page for the whole app.
// Next.js renders this INSTEAD of the root layout when a client-side
// exception escapes every boundary (the "Application error: a client-side
// exception has occurred" screen).
//
// Two jobs:
//   1. REPORT the real error: on mount, fire-and-forget POST the message +
//      stack to /api/client-error, which logs it to Vercel runtime logs so
//      the actual crash can be diagnosed instead of guessed at.
//   2. Show a human screen with a retry button — no dead end.
//
// The reporter never throws and never blocks rendering: if the POST fails,
// the page still works.

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    try {
      const payload = JSON.stringify({
        kind: 'global-error-boundary',
        message: String((error && error.message) || 'unknown').slice(0, 500),
        stack: String((error && error.stack) || '').slice(0, 2500),
        digest: (error && error.digest) || null,
        url: typeof window !== 'undefined' ? window.location.href.slice(0, 300) : '',
        ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : '',
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          '/api/client-error',
          new Blob([payload], { type: 'application/json' })
        );
      } else {
        fetch('/api/client-error', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* reporter never throws */
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: '#050505',
          color: '#e4e4e7',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '26rem' }}>
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.3em', color: '#67e8f9', marginBottom: '1rem' }}>
            NEXUS VORTEX
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.75rem' }}>
            Something glitched in the hub
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#a1a1aa', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
            The 3D scene hit an unexpected error. The details were sent to the
            crew automatically — tap below to reload and jump back in.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.75rem 2rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#050505',
              background: '#67e8f9',
              border: 'none',
              borderRadius: '9999px',
              cursor: 'pointer',
            }}
          >
            Reload the hub
          </button>
        </div>
      </body>
    </html>
  );
}
