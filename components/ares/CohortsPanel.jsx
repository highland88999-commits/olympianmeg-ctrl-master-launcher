// ARES "Cohorts" panel — Phase 1 cohort correlation v1.
//
// Shows groups of distinct visitors (distinct hashed IPs) that walk the
// site in lockstep: same client fingerprint, similar path-walk, bursts
// landing in the same short windows. Rotating IPs stops being a cloak
// when forty "different users" move as one.
//
// Honest limits, stated in the panel: the edge runtime exposes no TLS /
// JA3 fingerprint, so grouping uses the client fingerprint (user-agent +
// language + encoding) as the v1 proxy — it groups, it does not identify.
// Cohorts are surfaced for a human to read. They never block, ban, or
// throttle anyone on their own.
'use client';

export default function CohortsPanel({ cohorts }) {
  const list = Array.isArray(cohorts) ? cohorts : [];
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-100">
            Cohorts — visitors moving as one
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Cross-IP clusters: same fingerprint, same path-walk, same timing. A rotating IP stops hiding an attacker when the group moves in lockstep.
          </p>
        </div>
        <span className="rounded-full border border-zinc-700 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-zinc-300">
          {list.length} cohort{list.length === 1 ? '' : 's'}
        </span>
      </div>

      {list.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-800 bg-black/30 px-4 py-3 text-xs leading-relaxed text-zinc-500">
          No cross-IP cohorts in the recent events. Either traffic is genuinely independent, or the group has not probed enough yet to cluster — the panel only speaks when at least two distinct visitors share a fingerprint, a path-walk, and timing.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {list.map((c) => (
            <article key={`${c.fingerprint}:${c.members.join(',')}`} className="rounded-xl border border-zinc-800 bg-black/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-widest text-fuchsia-300">
                  {c.memberCount} visitors · {c.eventCount} events · score {c.score}
                </div>
                <div className="text-[11px] tabular-nums text-zinc-500">
                  walk {c.walkSimilarity} · timing {c.synchrony}
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                <span className="text-zinc-500">Fingerprint </span>
                <span className="font-mono text-zinc-300">{String(c.fingerprint).replace(/^fp:/, '').replace(/^ua:/, 'ua:').slice(0, 48)}</span>
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                <span className="text-zinc-500">Members </span>
                <span className="font-mono text-zinc-300">{c.members.join(', ')}</span>
                <span className="text-zinc-600"> (hashed prefixes only — never raw IPs)</span>
              </p>
              {c.sharedPaths && c.sharedPaths.length > 0 && (
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                  <span className="text-zinc-500">Shared paths </span>
                  <span className="font-mono text-zinc-300">{c.sharedPaths.join(', ')}</span>
                </p>
              )}
              {(c.firstSeen || c.lastSeen) && (
                <p className="mt-1 text-[11px] text-zinc-600">
                  {c.firstSeen ? new Date(c.firstSeen).toLocaleString() : ''}{c.firstSeen && c.lastSeen ? ' — ' : ''}{c.lastSeen ? new Date(c.lastSeen).toLocaleString() : ''}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
        Grouping uses the client fingerprint (user-agent + language + encoding) — the edge never sees a TLS fingerprint, so this is the v1 proxy, not an identity. Cohorts advise only; nothing is blocked on a cohort alone.
      </p>
    </section>
  );
}
