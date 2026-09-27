'use client';

// Top probed paths and loudest visitor fingerprints, computed in the browser
// from the events feed (same math as lib/ares/intel.js).
function countBy(events, keyFn, limit) {
  const counts = new Map();
  for (const e of events) {
    const k = keyFn(e);
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function Bar({ label, count, max }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-mono text-[11px] text-zinc-300">{label}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">{count}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-fuchsia-500/80" style={{ width: `${max ? (count / max) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

export default function TopLists({ events = [] }) {
  const paths = countBy(events, (e) => e.path, 6);
  const fps = countBy(events, (e) => String(e.ip_hash).slice(0, 12), 6);
  const maxPath = paths[0]?.[1] || 1;
  const maxFp = fps[0]?.[1] || 1;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-5 backdrop-blur-md">
        <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-400">Most probed paths</h2>
        {paths.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No probes yet.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {paths.map(([p, c]) => <Bar key={p} label={p} count={c} max={maxPath} />)}
          </div>
        )}
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-5 backdrop-blur-md">
        <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-400">Loudest visitors</h2>
        {fps.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No repeat visitors yet.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {fps.map(([f, c]) => <Bar key={f} label={f} count={c} max={maxFp} />)}
          </div>
        )}
        <p className="mt-3 text-[11px] text-zinc-600">Fingerprints are truncated hashes, not IP addresses.</p>
      </div>
    </div>
  );
}
