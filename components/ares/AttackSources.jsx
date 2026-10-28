'use client';

import { useState } from 'react';

// Attack-source report: what the defence agents caught, where it came
// from, and what happened to it. Trapped sources sit in the abyss
// sandbox until the keeper releases them; every source here is also in
// the evidence log. Only hashed identifiers are shown — never a raw IP.
export default function AttackSources({ authedFetch, trapped, sources, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const release = async (ipHash) => {
    setBusy(true); setMsg('');
    try {
      const res = await authedFetch('/api/ares/trapped', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ipHash }),
      });
      if (!res.ok) throw new Error();
      onRefresh();
    } catch {
      setMsg('Could not release. Try again.');
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
      {msg && <p className="mt-2 text-[11px] text-zinc-500">{msg}</p>}
      <h3 className="mt-4 text-[11px] font-bold uppercase tracking-widest text-red-300">Trapped in the abyss</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {(trapped || []).map((t) => (
          <li key={t.ip_hash} className="flex items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-black/40 px-3 py-2">
            <div className="min-w-0">
              <div className="font-mono text-xs text-red-200">{String(t.ip_hash).slice(0, 12)}</div>
              <div className="truncate text-[11px] text-zinc-500">{t.reason} · score {t.score} · {t.hits} hits</div>
            </div>
            <button onClick={() => release(t.ip_hash)} disabled={busy}
              className="shrink-0 text-[11px] uppercase tracking-widest text-zinc-400 hover:text-emerald-300">Release</button>
          </li>
        ))}
        {(!trapped || trapped.length === 0) && <li className="text-sm text-zinc-500">Nothing trapped right now.</li>}
      </ul>
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
