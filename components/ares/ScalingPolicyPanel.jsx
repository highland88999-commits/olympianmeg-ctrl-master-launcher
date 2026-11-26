// ARES "Scaling policy" panel — Phase 1.
//
// Reads the versioned policy file (lib/ares/scaling-policy.json) and
// shows it in the console, exactly as ARCHITECTURE.md §4 requires:
// triggers, hard caps, cooldowns, and the kill switch. The file states
// the policy only — auto-scaling stays OFF in Phase 1, no scaling code
// runs, and nothing here can enable it. Enabling it is a Phase 3
// decision, by Merlin's explicit word.
'use client';

import policy from '@/lib/ares/scaling-policy.json';

const TRIGGER_LABELS = {
  load: 'Load',
  surface: 'Surface',
  incident: 'Incident',
  scheduled: 'Scheduled',
};

export default function ScalingPolicyPanel() {
  const triggers = policy.triggers || {};
  const caps = policy.caps || {};
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-100">
            Scaling policy
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            The Hub scales defenders only under this versioned policy — and only the Hub decides, never the field agents.
          </p>
        </div>
        <span className="rounded-full border border-zinc-700 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-zinc-300">
          v{policy.policyVersion}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
          policy.autoScalingEnabled
            ? 'border-emerald-700 text-emerald-300'
            : 'border-amber-700/70 text-amber-300'
        }`}>
          Auto-scaling {policy.autoScalingEnabled ? 'ON' : 'OFF'}
        </span>
        <span className="text-[11px] text-zinc-500">{policy.statusNote}</span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            Triggers
          </h3>
          <div className="flex flex-col gap-1.5">
            {Object.entries(triggers).map(([key, t]) => (
              <div key={key} className="rounded-lg border border-zinc-800/70 bg-black/30 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-300">{TRIGGER_LABELS[key] || key}</span>
                  <span className="text-[11px] uppercase tracking-widest text-zinc-600">{t.enabled ? 'enabled' : 'off'}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{t.description}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            Hard caps
          </h3>
          <div className="flex flex-col gap-1.5 text-[11px] text-zinc-400">
            <div className="flex items-center justify-between rounded-lg border border-zinc-800/70 bg-black/30 px-3 py-1.5">
              <span>Max defender instances</span><span className="tabular-nums text-zinc-300">{caps.maxInstances}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800/70 bg-black/30 px-3 py-1.5">
              <span>Per-instance CPU / memory</span><span className="tabular-nums text-zinc-300">{caps.perInstanceCpu} / {caps.perInstanceMemory}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800/70 bg-black/30 px-3 py-1.5">
              <span>Max spend per day</span><span className="tabular-nums text-zinc-300">${caps.maxSpendPerDayUsd}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800/70 bg-black/30 px-3 py-1.5">
              <span>Cooldown between scaling events</span><span className="tabular-nums text-zinc-300">{caps.cooldownMinutes} min</span>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">{caps.capBreach}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">{caps.scaleDown}</p>
        </div>
      </div>
    </section>
  );
}
