'use client';
// app/global-error.jsx — Last-resort error page for the whole app.
// Next.js renders this INSTEAD of the root layout when a client-side
// exception escapes every boundary (the "Application error: a client-side
// exception has occurred" screen).
//
// Three jobs:
//   1. REPORT the real error: on mount, fire-and-forget POST the message +
//      stack to /api/client-error (persisted to the client_errors
//      Supabase table) so the actual crash can be diagnosed.
//   2. SHOW the real error on screen: message + collapsible stack + a copy
//      button, so a screenshot or paste captures the exact crash even if
//      the automatic report never lands.
//   3. Offer a reload button — no dead end.
//
// The reporter never throws and never blocks rendering: if the POST fails,
// the page still works.

import { useEffect, useState } from 'react';

export default function GlobalError({ error, reset }) {
  const message = String((error && error.message) || 'unknown error').slice(0, 500);
  const stack = String((error && error.stack) || '').slice(0, 4000);
  const digest = (error && error.digest) || null;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const payload = JSON.stringify({
        kind: 'global-error-boundary',
        message,
        stack: stack.slice(0, 2500),
        digest,
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
  }, [error, message, stack, digest]);

  const copyDetails = async () => {
    const text =
      `URL: ${typeof window !== 'undefined' ? window.location.href : ''}\n` +
      `UA: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}\n` +
      `Digest: ${digest || '-'}\n` +
      `Message: ${message}\n` +
      `Stack:\n${stack}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard is best-effort */
    }
  };

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
        <div style={{ textAlign: 'center', maxWidth: '30rem', width: '100%' }}>
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.3em', color: '#67e8f9', marginBottom: '1rem' }}>
            NEXUS VORTEX
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.75rem' }}>
            Something glitched in the hub
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#a1a1aa', lineHeight: 1.6, margin: '0 0 1rem' }}>
            The 3D scene hit an unexpected error. The details were sent to the
            crew automatically — tap below to reload and jump back in.
          </p>

          {/* The actual error, so a screenshot captures the exact crash. */}
          <div
            style={{
              textAlign: 'left',
              background: '#0c0c0e',
              border: '1px solid #27272a',
              borderRadius: '0.5rem',
              padding: '0.75rem 1rem',
              margin: '0 0 1rem',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '0.72rem',
              lineHeight: 1.5,
              color: '#fca5a5',
              wordBreak: 'break-word',
            }}
          >
            <div style={{ color: '#71717a', fontSize: '0.62rem', letterSpacing: '0.15em', marginBottom: '0.35rem' }}>
              ERROR
            </div>
            {message}
            {digest ? (
              <div style={{ color: '#71717a', marginTop: '0.35rem' }}>digest: {digest}</div>
            ) : null}
          </div>

          {stack ? (
            <details
              style={{
                textAlign: 'left',
                margin: '0 0 1.25rem',
                fontSize: '0.75rem',
                color: '#a1a1aa',
              }}
            >
              <summary style={{ cursor: 'pointer', color: '#67e8f9' }}>
                Technical details
              </summary>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  background: '#0c0c0e',
                  border: '1px solid #27272a',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1rem',
                  marginTop: '0.5rem',
                  fontSize: '0.65rem',
                  lineHeight: 1.5,
                  color: '#a1a1aa',
                  maxHeight: '12rem',
                  overflow: 'auto',
                }}
              >
                {stack}
              </pre>
            </details>
          ) : null}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
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
            <button
              onClick={copyDetails}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#67e8f9',
                background: 'transparent',
                border: '1px solid #67e8f9',
                borderRadius: '9999px',
                cursor: 'pointer',
              }}
            >
              {copied ? 'Copied ✓' : 'Copy error details'}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
