'use client';

// Threat level gauge: 0-100 score with a plain-English label.
export default function ThreatGauge({ level = 0, label = 'Calm', trend = 'steady' }) {
  const color =
    label === 'Severe' ? 'text-red-500 border-red-500/50' :
    label === 'Elevated' ? 'text-orange-400 border-orange-500/50' :
    label === 'Watchful' ? 'text-yellow-300 border-yellow-500/40' :
    'text-emerald-400 border-emerald-500/40';
  const bar =
    label === 'Severe' ? 'bg-red-500' :
    label === 'Elevated' ? 'bg-orange-400' :
    label === 'Watchful' ? 'bg-yellow-300' : 'bg-emerald-400';
  const trendText = trend === 'rising' ? 'Attacks rising' : trend === 'falling' ? 'Attacks falling' : 'Activity steady';

  return (
    <div className={`rounded-xl border bg-zinc-950/90 p-5 backdrop-blur-md ${color}`}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-400">Threat level</h2>
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">{trendText}</span>
      </div>
      <div className="mt-3 flex items-end gap-3">
        <span className="text-5xl font-black tabular-nums">{level}</span>
        <span className="pb-1 text-lg font-bold uppercase tracking-widest">{label}</span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${Math.min(100, level)}%` }} />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
        Based on the last 24 hours of logged events. Recent activity counts more than older activity.
      </p>
    </div>
  );
}
