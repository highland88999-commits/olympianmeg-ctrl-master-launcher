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
import OracleView from './oracle/OracleView';
import OSView from './os/OSView';

const VIEWS = [
  { key: 'oracle', label: 'ORACLE' },
  { key: 'os', label: 'OS' },
];

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
    <div style={{ minHeight: '100dvh', background: '#04060a', color: '#dfe9f2' }}>
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
          background: 'rgba(4,6,10,0.92)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <BackButton label="Launcher" />
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
              }}
            >
              {v.label}
            </button>
          ))}
        </nav>
      </header>

      {view === 'oracle' ? <OracleView /> : <OSView />}

      <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
    </div>
  );
}

export default function ArtemisPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#04060a' }} />}>
      <ArtemisShell />
    </Suspense>
  );
}
