// app/keepsake/view/[id]/page.jsx — the public Keepsake viewer.
// Anyone with the link can open a shared globe: no sign-in, no account.
// The globe loads from /api/keepsake/[id] (public read) and renders
// view-only: shake, swipe and the joystick all work, saving does not.
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import KeepsakeGlobe from '@/components/keepsake/KeepsakeGlobe';

export default function KeepsakeViewPage() {
  const params = useParams();
  const id = params?.id;
  const [globe, setGlobe] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetch(`/api/keepsake/${encodeURIComponent(String(id))}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'That keepsake could not be opened.');
        return j;
      })
      .then((j) => {
        if (alive) setGlobe(j.globe || null);
      })
      .catch((e) => {
        if (alive) setError(e.message || 'That keepsake could not be opened.');
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return (
      <div
        style={{
          minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center',
          background: 'linear-gradient(180deg, #0b1026 0%, #1b1440 55%, #2a1a3e 100%)',
          color: '#f5efe0', fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <div style={{ fontSize: 20, color: '#f0d493' }}>This keepsake could not be opened.</div>
        <div style={{ fontSize: 14, opacity: 0.8, maxWidth: 420 }}>{error}</div>
        <a
          href="/keepsake"
          style={{
            display: 'inline-flex', padding: '12px 22px', borderRadius: 999,
            background: '#c9a24d', color: '#241a05', textDecoration: 'none', fontWeight: 600,
          }}
        >
          Make your own keepsake
        </a>
      </div>
    );
  }

  if (!globe) {
    return (
      <div
        style={{
          minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(180deg, #0b1026 0%, #1b1440 55%, #2a1a3e 100%)',
          color: '#f0d493', fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 16,
        }}
      >
        Opening the keepsake…
      </div>
    );
  }

  return (
    <KeepsakeGlobe
      mode="view"
      initialImageSrc={globe.image_url}
      initialTitle={globe.title || 'Keepsake'}
      initialPlaque={globe.plaque || 'Keepsake'}
    />
  );
}
