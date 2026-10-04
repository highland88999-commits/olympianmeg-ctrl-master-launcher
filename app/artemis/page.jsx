'use client';

/*
 * ARTEMIS — Merlin's program, migrated from his four original repos:
 *   Architect-Artemis (oracle council + forge), artemis-hub (APEX HERITAGE
 *   OS), artemis-os (NOVA shell), artemis-proxy (port function only).
 *
 * Two views, one codebase (deduped — no duplicate logic):
 *   ORACLE — the council chat + forge + ecosystem HUD (Architect-Artemis)
 *   OS     — the deduped window-manager desktop (artemis-hub + artemis-os)
 *
 * Deep links: /artemis?view=oracle | /artemis?view=os
 * (/architect-artemis and /artemis-hub redirect here.)
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BackButton } from '@/components/ui';
import { IcEye, IcGrid, ArtemisCrest } from '@/app/artemis-ui/icons';
import OracleView from './oracle/OracleView';
import OSView from './os/OSView';

const VIEWS = [
  { key: 'oracle', label: 'ORACLE', Icon: IcEye },
  { key: 'os', label: 'OS', Icon: IcGrid },
];

function ArtemisLoading() {
  return (
    <div style={{ minHeight: '100dvh', background: '#04060a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }} aria-label="Loading Artemis">
      <ArtemisCrest size={56} />
      <div style={{ width: 180, height: 3, borderRadius: 2, background: 'rgba(0,242,255,0.12)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: '40%', borderRadius: 2, background: 'linear-gradient(90deg, #5eead4, #d9a441)', animation: 'artemis-load 1.2s ease-in-out infinite' }} />
      </div>
      <div style={{ fontSize: 11, letterSpacing: 5, color: '#5eead4' }}>AWAKENING ARTEMIS</div>
      <style>{`@keyframes artemis-load { 0% { transform: translateX(-100%); } 100% { transform: translateX(450%); } }`}</style>
    </div>
  );
}

function ArtemisShell() {
  const params = useSearchParams();
  const initial = params.get('view') === 'os' ? 'os' : 'oracle';
  const [view, setView] = useState(initial);

  useEffect(() => {
    const v = params.get('view');
    if (v === 'os' || v === 'oracle') setView(v);
  }, [params]);

  const switchView = (v) => {
    setView(v);
    const url = v === 'oracle' ? '/artemis' : '/artemis?view=os';
    window.history.replaceState(null, '', url);
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#04060a', color: '#dfe9f2', position: 'relative' }}>
      {/* page background: still wilds art behind the shell (Oracle/OS views carry their own video) */}
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.3,
        backgroundImage: 'linear-gradient(to bottom, rgba(4,6,10,0.6), rgba(4,6,10,0.25) 45%, rgba(4,6,10,0.75)), url(/images/artemis/bg.webp)',
        backgroundSize: 'cover', backgroundPosition: 'center' }} />
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          borderBottom: '1px solid rgba(0,242,255,0.18)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backgroundImage: 'linear-gradient(rgba(4,6,10,0.92), rgba(4,6,10,0.92)), url(/images/artemis/tile.webp)',
          backgroundSize: 'auto, 170px',
          backdropFilter: 'blur(8px)',
        }}
      >
        <BackButton label="Launcher" />
        <ArtemisCrest size={34} />
        <div style={{ fontSize: 13, letterSpacing: 5, color: '#00f2ff', fontWeight: 700 }}>
          ARTEMIS
        </div>
        <nav aria-label="Artemis views" style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => switchView(v.key)}
              aria-pressed={view === v.key}
              aria-label={`Switch to ${v.label} view`}
              style={{
                minHeight: 44,
                padding: '0 18px',
                borderRadius: 999,
                border: view === v.key ? '1px solid #00f2ff' : '1px solid rgba(0,242,255,0.25)',
                background: view === v.key ? 'rgba(0,242,255,0.14)' : 'transparent',
                color: view === v.key ? '#fff' : '#9fb6c6',
                fontSize: 13,
                letterSpacing: 2,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <v.Icon />
              {v.label}
            </button>
          ))}
        </nav>
      </header>

      <div style={{ position: 'relative', zIndex: 1 }}>
        {view === 'oracle' ? <OracleView /> : <OSView />}
      </div>

      <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))', position: 'relative', zIndex: 1 }} />
    </div>
  );
}

export default function ArtemisPage() {
  return (
    <Suspense fallback={<ArtemisLoading />}>
      <ArtemisShell />
    </Suspense>
  );
}
