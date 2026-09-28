'use client';

import { useState } from 'react';
import { PLAN_SECTIONS } from './plan-data';

export default function PlanViewer() {
  const [active, setActive] = useState(PLAN_SECTIONS[0].id);
  const section = PLAN_SECTIONS.find((s) => s.id === active) || PLAN_SECTIONS[0];

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <nav className="md:w-52 shrink-0 flex md:flex-col flex-row flex-wrap gap-2" aria-label="Business plan sections">
        {PLAN_SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={
              'text-left px-4 py-3 rounded border text-sm tracking-widest uppercase font-bold transition-all ' +
              (s.id === active
                ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                : 'bg-black/60 border-zinc-800 text-zinc-400 hover:border-cyan-500/40 hover:text-white')
            }
          >
            {s.title}
          </button>
        ))}
      </nav>

      <article className="flex-1 bg-black/60 border border-zinc-800 rounded p-6 md:p-8">
        <h2 className="text-2xl md:text-3xl font-black text-white tracking-wide">{section.title}</h2>
        <p className="text-cyan-300/90 mt-1 text-sm tracking-wide">{section.tagline}</p>

        <div className="mt-5 space-y-4">
          {section.blocks.map((b, i) => (
            <p key={i} className="text-zinc-300 leading-relaxed text-[15px]">
              {b}
            </p>
          ))}
        </div>

        {section.facts && (
          <dl className="mt-6 space-y-3">
            {section.facts.map((f, i) => (
              <div key={i} className="bg-zinc-950/70 border border-zinc-800/80 rounded p-4">
                <dt className="text-cyan-400 text-xs font-black tracking-widest uppercase">{f.label}</dt>
                <dd className="text-zinc-300 text-sm mt-1 leading-relaxed">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </article>
    </div>
  );
}
