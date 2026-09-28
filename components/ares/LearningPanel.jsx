// ARES "Sentinel Learning" panel — the learning-pipeline readout.
// Plain English, honest by design: it shows what the sentinels have
// COLLECTED (labeled events, feature coverage, readiness gates). It never
// claims a model is trained and never shows accuracy — there is no model
// yet. Training happens offline once the gates are met.
'use client';

import { useMemo, useState } from 'react';
import { summarizeLearning, THREAT_CLASS_LABELS, AGENT_LABELS } from '@/lib/ares/training';

export default function LearningPanel({ events, authedFetch }) {
  const [downloading, setDownloading] = useState(false);
  const summary = useMemo(() => summarizeLearning(events), [events]);

  const download = async () => {
    setDownloading(true);
    try {
      const res = await authedFetch('/api/ares/training');
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ares-training-data.jsonl`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* dashboard stays put; the user can retry */
    }
    setDownloading(false);
  };

  const ready = summary.state === 'ready-for-training';
  const maxLabel = Math.max(1, ...Object.values(summary.labelDistribution));

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-100">
            Sentinel Learning
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            How ARES learns to protect the hive — training pipeline, plain English.
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
            ready
              ? 'border-emerald-700 text-emerald-300'
              : 'border-amber-700/70 text-amber-300'
          }`}
        >
          {summary.stateLabel}
        </span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-zinc-400">{summary.stateNote}</p>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
          <div className="text-xl font-black text-zinc-100">{summary.labeled.toLocaleString()}</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">Labeled events</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
          <div className="text-xl font-black text-zinc-100">{Math.round(summary.coverage * 100)}%</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">Feature coverage</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
          <div className="text-xl font-black text-zinc-100">
            {Object.values(summary.labelDistribution).filter((c) => c > 0).length}/{Object.keys(summary.labelDistribution).length}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">Threat types seen</div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            What the sentinels have seen
          </h3>
          <div className="flex flex-col gap-1.5">
            {Object.entries(summary.labelDistribution).map(([cls, count]) => (
              <div key={cls} className="flex items-center gap-2">
                <span className="w-32 shrink-0 text-[11px] text-zinc-400">{THREAT_CLASS_LABELS[cls]}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-red-500"
                    style={{ width: `${Math.round((count / maxLabel) * 100)}%` }}
                  />
                </div>
                <span className="w-10 text-right text-[11px] tabular-nums text-zinc-500">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            Reports by agent
          </h3>
          <div className="flex flex-col gap-1.5">
            {Object.entries(summary.agentDistribution).map(([agent, count]) => (
              <div key={agent} className="flex items-center justify-between rounded-lg border border-zinc-800/70 bg-black/30 px-3 py-1.5">
                <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-300">{AGENT_LABELS[agent]}</span>
                <span className="text-[11px] tabular-nums text-zinc-500">{count.toLocaleString()} reports</span>
              </div>
            ))}
          </div>
          <h3 className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            Ready to train when
          </h3>
          <ul className="flex flex-col gap-1.5">
            {summary.gates.map((gate) => (
              <li key={gate.id} className="flex items-center gap-2 text-[11px] text-zinc-400">
                <span className={gate.met ? 'text-emerald-400' : 'text-zinc-600'}>
                  {gate.met ? '✓' : '○'}
                </span>
                <span>{gate.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/70 pt-4">
        <p className="max-w-md text-[11px] leading-relaxed text-zinc-600">
          The download below is the raw material for offline training — labeled examples, not a model.
          No data ever leaves your infrastructure except through this button, in your hands.
        </p>
        <button
          onClick={download}
          disabled={downloading || summary.labeled === 0}
          className="rounded-lg border border-fuchsia-700/60 px-4 py-2 text-xs font-bold uppercase tracking-widest text-fuchsia-300 transition-colors hover:border-fuchsia-400 hover:text-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {downloading ? 'Preparing…' : 'Download training data (JSONL)'}
        </button>
      </div>
    </section>
  );
}
