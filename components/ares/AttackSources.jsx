'use client';

import { useState } from 'react';

// Attack-source report: what the defence agents caught, where it came
// from, and what happened to it. Trapped sources sit in the abyss
// sandbox until the keeper releases them; every source here is also in
// the evidence log. Only hashed identifiers are shown — never a raw IP.
//
// RELEASE POLICY (Merlin, Nov 27 ~03:39): a prisoner is released only
// on a request that names the AGENT'S ID (its ip_hash), says WHO
// asked, and carries the PROMISE not to send it back. The request,
// the ID, and the promise are all recorded in the prison record.
// CUTOFF: if a duplicate agent, or an agent carrying other
// identifiable information related to another agent (or a threat),
// is in the prison, no further agents are released — the cutoff
// banner below says so, and the release form is gone until the keeper
// clears it directly in the database.
export default function AttackSources({ authedFetch, trapped, sources, cutoff, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [formFor, setFormFor] = useState(null);
  const [requestedBy, setRequestedBy] = useState('');
  const [promise, setPromise] = useState(false);

  const release = async (ipHash) => {
    if (!requestedBy.trim() || !promise) {
      setMsg('Release needs who asked and the promise not to send it back.');
      return;
    }
    setBusy(true); setMsg('');
    try {
      const res = await authedFetch('/api/ares/trapped', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ipHash, agentId: ipHash, requestedBy: requestedBy.trim(), promise: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data && data.error) || 'release failed');
      setFormFor(null);
      setRequestedBy('');
      setPromise(false);
      setMsg('Released — on the promise it will not be sent back.');
      onRefresh();
    } catch (e) {
      setMsg((e && e.message) || 'Could not release. Try again.');
    }
    setBusy(false);
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-5 backdrop-blur-md">
      <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-400">Attack sources · Abyss</h2>
      <p className="mt-2 text-[11px] text-zinc-500">
        Extra-malicious attackers are trapped in the abyss sandbox: every link inside
        leads back into it, so they never reach real data. Release returns a source
        to normal handling.
      </p>
      {cutoff && (
        <p className="mt-3 rounded-xl border border-red-700/60 bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-200">
          Releases are closed — a duplicate or linked agent was found in the prison. No further agents will be released.
        </p>
      )}
      {msg && <p className="mt-2 text-[11px] text-zinc-500">{msg}</p>}
      <h3 className="mt-4 text-[11px] font-bold uppercase tracking-widest text-red-300">Trapped in the abyss</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {(trapped || []).map((t) => (
          <li key={t.ip_hash} className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-black/40 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-xs text-red-200">{String(t.ip_hash).slice(0, 12)}</div>
                <div className="truncate text-[11px] text-zinc-500">{t.reason} · score {t.score} · {t.hits} hits</div>
              </div>
              {!cutoff && (
                <button onClick={() => { setFormFor(formFor === t.ip_hash ? null : t.ip_hash); setMsg(''); }}
                  disabled={busy}
                  className="min-h-11 shrink-0 rounded-lg border border-zinc-700 px-3 py-2 text-[11px] uppercase tracking-widest text-zinc-400 hover:text-emerald-300">
                  {formFor === t.ip_hash ? 'Cancel' : 'Release'}
                </button>
              )}
            </div>
            {!cutoff && formFor === t.ip_hash && (
              <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-black/60 p-3">
                <p className="text-[11px] leading-relaxed text-zinc-400">
                  Agent ID: <span className="font-mono text-zinc-200">{String(t.ip_hash).slice(0, 12)}</span>
                  {' '}— the prisoner is released by its ID.
                </p>
                <label htmlFor={`release-by-${String(t.ip_hash).slice(0, 12)}`} className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Who asked for the release</label>
                <input
                  id={`release-by-${String(t.ip_hash).slice(0, 12)}`}
                  type="text"
                  value={requestedBy}
                  onChange={(e) => setRequestedBy(e.target.value)}
                  placeholder="Name, handle, or contact"
                  className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                />
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[11px] leading-relaxed text-zinc-300">
                  <input
                    type="checkbox"
                    checked={promise}
                    onChange={(e) => setPromise(e.target.checked)}
                    className="h-5 w-5 shrink-0 accent-emerald-400"
                  />
                  They promise not to send it back.
                </label>
                <button onClick={() => release(t.ip_hash)} disabled={busy || !requestedBy.trim() || !promise}
                  className="min-h-11 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-widest text-black disabled:opacity-40">
                  {busy ? 'Releasing…' : 'Release on the promise'}
                </button>
              </div>
            )}
          </li>
        ))}
        {(!trapped || trapped.length === 0) && <li className="text-sm text-zinc-500">Nothing trapped right now.</li>}
      </ul>
      <p className="mt-3 text-[11px] text-zinc-500">
        <a href="/ares/prison" className="text-sky-300 hover:text-sky-200">Walk the prison →</a>
        {' '}— see every prisoner in its cell, as it appears. Click a prisoner&apos;s name to open its report. Viewing only; release stays here.
      </p>
      <h3 className="mt-4 text-[11px] font-bold uppercase tracking-widest text-zinc-400">Reported sources</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {(sources || []).map((s) => (
          <li key={s.ip_hash} className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2">
            <div className="font-mono text-xs text-zinc-200">{String(s.ip_hash).slice(0, 12)} · {s.trap_status}</div>
            <div className="truncate text-[11px] text-zinc-500">
              score {s.max_score} · {s.path_count} paths · last: {s.last_path || '—'}
            </div>
            {s.user_agent && <div className="truncate text-[11px] text-zinc-600">{s.user_agent}</div>}
            {(s.reasons || []).length > 0 && <div className="truncate text-[11px] text-zinc-600">{s.reasons.join(' · ')}</div>}
          </li>
        ))}
        {(!sources || sources.length === 0) && <li className="text-sm text-zinc-500">No attack sources reported yet.</li>}
      </ul>
    </div>
  );
}
