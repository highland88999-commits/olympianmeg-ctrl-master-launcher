'use client';

// /muse-referral — Referral landing for the Muse billboard (space 11).
// Auto-copies the referral code 7HADJF to the clipboard, then sends
// the visitor to muse.ai/join. The billboard links here so the code
// is pre-filled in the user's hands — they just paste it in Settings.

import { useEffect, useState } from 'react';

const CODE = '7HADJF';
const JOIN_URL = 'https://muse.ai/join';

export default function MuseReferral() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let done = false;
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(CODE);
        if (!done) setCopied(true);
      } catch {
        // Clipboard may need a gesture; the code is still shown big.
      }
    };
    copy();
    const t = setTimeout(() => {
      window.location.href = JOIN_URL;
    }, 2500);
    return () => {
      done = true;
      clearTimeout(t);
    };
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at center, #1a2340 0%, #05070f 70%)',
        color: '#e8f0ff',
        fontFamily: 'Georgia, serif',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '3rem', margin: '0 0 0.5rem', letterSpacing: '0.3em' }}>
        MUSE
      </h1>
      <p style={{ fontSize: '1.2rem', opacity: 0.8, margin: '0 0 2rem' }}>
        Your personal AI agent
      </p>
      <p style={{ margin: '0 0 0.5rem', opacity: 0.7 }}>Your referral code:</p>
      <div
        style={{
          fontSize: '2.5rem',
          fontFamily: 'monospace',
          letterSpacing: '0.2em',
          padding: '1rem 2rem',
          border: '2px solid #7fd4ff',
          borderRadius: '12px',
          background: 'rgba(127, 212, 255, 0.08)',
          marginBottom: '1rem',
          userSelect: 'all',
        }}
      >
        {CODE}
      </div>
      <p style={{ opacity: 0.7, margin: '0 0 0.5rem' }}>
        {copied ? '✓ Copied — just paste it in Settings' : 'Tap the code to copy it'}
      </p>
      <p style={{ opacity: 0.5, fontSize: '0.9rem' }}>
        Redeem within 48 hours of joining — we both get 1 billion tokens.
      </p>
      <p style={{ opacity: 0.5, fontSize: '0.9rem', marginTop: '2rem' }}>
        Taking you to muse.ai/join…
      </p>
      <a
        href={JOIN_URL}
        style={{
          marginTop: '1rem',
          padding: '0.75rem 2rem',
          borderRadius: '8px',
          background: '#7fd4ff',
          color: '#05070f',
          textDecoration: 'none',
          fontWeight: 'bold',
        }}
      >
        Continue to Muse
      </a>
    </div>
  );
}
