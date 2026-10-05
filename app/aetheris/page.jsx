'use client';

import { useState } from 'react';
import PlanViewer from './plan-viewer';
import DiagnosticConsole from './console';
import RenewalPlanBadge from '@/components/RenewalPlanBadge';
import { IcDoc, IcTerminal, AetherisCrest } from '@/app/artemis-ui/icons';

export default function AetherisPage() {
  const [tab, setTab] = useState('plan');

  return (
    <main className="min-h-dvh bg-black text-white relative">
      <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none opacity-40"
        style={{ backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.8)), url(/images/aetheris/bg.webp)", backgroundSize: "cover", backgroundPosition: "center" }} />
      <div className="max-w-6xl mx-auto px-4 py-8 relative z-[1]">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <AetherisCrest size={36} />
            <div>
              <div className="text-[11px] font-mono text-cyan-500/70 tracking-widest">ARGUS // OBSERVATORY</div>
              <h1 className="text-3xl md:text-4xl font-black tracking-wide mt-1">Air Purifier</h1>
            </div>
          </div>
          <p className="text-zinc-400 mt-2 max-w-2xl text-[15px] leading-relaxed">
            The outdoor air-purification program: the business plan for the ET-GAP-700 breathing towers,
            and an interactive simulation console for a fictional UNIT_07.
          </p>
          <RenewalPlanBadge nodeId="node-1" />
        </header>

        <div className="flex gap-2 mb-6" role="tablist" aria-label="Aetheris views">
          {[
            { id: 'plan', label: 'Business Plan', Icon: IcDoc },
            { id: 'console', label: 'UNIT_07 Console', Icon: IcTerminal },
          ].map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={
                'px-5 py-3 min-h-[44px] rounded border text-sm font-black tracking-widest uppercase transition-all inline-flex items-center gap-2 ' +
                (tab === t.id
                  ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                  : 'bg-black/60 border-zinc-800 text-zinc-400 hover:border-cyan-500/40 hover:text-white')
              }
            >
              <t.Icon />
              {t.label}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-zinc-800/80 overflow-hidden"
          style={{ backgroundImage: "linear-gradient(rgba(0,0,0,0.82), rgba(0,0,0,0.82)), url(/images/aetheris/tile.webp)", backgroundSize: "auto, 170px" }}>
          {tab === 'plan' ? <PlanViewer /> : <DiagnosticConsole />}
        </div>

        <footer className="mt-8 text-[11px] text-zinc-600 font-mono">
          All data local. No telemetry, no external requests.
        </footer>
        <div aria-hidden="true" className="player-clear" />
      </div>
    </main>
  );
}
