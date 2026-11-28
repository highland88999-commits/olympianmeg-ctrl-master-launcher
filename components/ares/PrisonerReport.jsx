// components/ares/PrisonerReport.jsx — one prisoner's report.
//
// Opens when the keeper clicks a prisoner's NAME — its cell label in
// the 3D hall, or its row in the roster. The report is the factual,
// evidence-grade record for that prisoner:
//   - WHAT was sandboxed (the source, its score, hits, paths, UA).
//   - WHY it was sandboxed — and WHY other things were NOT sandboxed
//     (both ways, from the capture record; captures from before this
//     build recorded no why-not, and the report says so honestly).
//   - DATE AND TIME of the sandboxing — the real timestamp from the
//     event (first_seen), shown in the keeper's local time with the
//     stored value beside it. Never reconstructed.
//   - SENDER: the IP HASH fingerprint only — never a raw IP. "It's
//     security": the hash-only rule stands because it IS the security
//     handling.
//   - REPORTS SENT HOME for this source: legal reports and agent
//     self-terminate reports, as recorded in ares_events.
// Reports are MINIMIZABLE: the minimize button collapses the panel
// to a small bar (top right, under Leave) that reopens on tap.
// Phone tap targets are 44px or taller, and the panel never overlaps
// the Exit / Leave buttons or the HUD.
'use client';

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function PrisonerReport({ report, minimized, onMinimize, onRestore, onClose }) {
  if (!report) return null;
  const what = report.what_sandboxed || {};
  const name = report.name || report.short_id || 'Prisoner';

  if (minimized) {
    return (
      <button
        type="button"
        onClick={onRestore}
        className="absolute right-4 top-[4.5rem] z-40 flex min-h-11 items-center gap-2 rounded-full border border-sky-500/50 bg-black/80 px-4 py-2 text-xs font-semibold text-sky-100"
        aria-label={`Reopen report for ${name}`}
      >
        <span className="font-mono">{report.short_id}</span>
        <span className="text-sky-300/80">report minimized — tap to reopen</span>
      </button>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-4">
      <div className="pointer-events-auto flex max-h-[75dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-sky-500/40 bg-[#050b18]/95 shadow-2xl">
        <div className="flex items-start justify-between gap-2 border-b border-sky-500/25 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-sky-100">{name}</h2>
            <p className="mt-0.5 text-[11px] text-sky-300/70">Prisoner report — facts only</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={onMinimize}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/60 text-lg font-bold text-white"
              aria-label="Minimize report"
            >
              —
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/60 text-lg font-bold text-white"
              aria-label="Close report"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4 text-sm leading-relaxed text-zinc-300">
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-sky-300">What was sandboxed</h3>
            <p className="mt-1">Source <span className="font-mono text-zinc-100">{report.short_id}</span> — {what.reason || report.why_sandboxed || 'Extra-malicious attack'}</p>
            <p className="mt-1 text-xs text-zinc-400">
              Score {what.score ?? 0} · {what.hits ?? 0} hits · {what.paths ?? 0} paths
              {what.last_path ? <> · last path <span className="font-mono">{what.last_path}</span></> : null}
            </p>
            {what.user_agent && <p className="mt-1 break-all font-mono text-[11px] text-zinc-500">{what.user_agent}</p>}
            {(what.reasons || []).length > 0 && (
              <p className="mt-1 text-xs text-zinc-400">{what.reasons.join(' · ')}</p>
            )}
            <p className="mt-1 text-xs text-zinc-500">Cell status: {what.trap_status || 'trapped'}</p>
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-sky-300">Why — both ways</h3>
            <p className="mt-1">Sandboxed: {report.why_sandboxed || 'Extra-malicious attack'}</p>
            {report.why_not_recorded && Array.isArray(report.why_not_sandboxed) && report.why_not_sandboxed.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1">
                {report.why_not_sandboxed.map((w, i) => (
                  <li key={i} className="text-xs text-zinc-400">
                    Not sandboxed — {w.thing}: {w.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">
                Why other things were not sandboxed was not recorded at capture time — this prisoner predates the why-not record. Nothing is filled in after the fact.
              </p>
            )}
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-sky-300">Date and time of sandboxing</h3>
            <p className="mt-1">{fmtTime(report.sandboxed_at)}</p>
            {report.sandboxed_at && (
              <p className="mt-0.5 font-mono text-[11px] text-zinc-500">{report.sandboxed_at}</p>
            )}
            {report.last_seen && <p className="mt-1 text-xs text-zinc-500">Last seen: {fmtTime(report.last_seen)}</p>}
            <p className="mt-1 text-[11px] text-zinc-500">From the event itself — the database time of the capture, not reconstructed.</p>
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-sky-300">Sender</h3>
            <p className="mt-1 font-mono">{report.sender_ip_fingerprint}</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              IP hash only — the sender is identified by the SHA-256 hash, never a raw IP address. That is the security handling.
            </p>
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-sky-300">Reports sent home</h3>
            {(report.legal_reports || []).length === 0 && (report.self_terminate_reports || []).length === 0 ? (
              <p className="mt-1 text-xs text-zinc-500">No reports sent home for this source yet.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {(report.legal_reports || []).map((r) => (
                  <li key={`legal-${r.id}`} className="rounded-lg border border-amber-500/40 bg-black/40 px-3 py-2">
                    <p className="text-xs font-bold text-amber-200">Legal report · {fmtTime(r.found_at)}</p>
                    <p className="mt-1 text-[11px] text-zinc-400">Sent home to the ARES console. Facts only — no legal conclusions.</p>
                  </li>
                ))}
                {(report.self_terminate_reports || []).map((r) => (
                  <li key={`st-${r.id}`} className="rounded-lg border border-rose-500/40 bg-black/40 px-3 py-2">
                    <p className="text-xs font-bold text-rose-200">Agent self-terminated · {fmtTime(r.found_at)}</p>
                    <p className="mt-1 text-[11px] text-zinc-400">One report home, then the agent ended.</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-zinc-500">{report.event_count ?? 0} evidence events on record for this source.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
