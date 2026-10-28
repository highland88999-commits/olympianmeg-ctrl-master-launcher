'use client';

import { useState } from 'react';

// Allowlist and blocklist manager. The allowlist form takes a raw IP and a
// label; the IP is hashed server-side and never stored.
export default function ListsManager({ authedFetch, whitelist, blocks, onRefresh }) {
  const [ip, setIp] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const add = async () => {
    if (!ip.trim() || !label.trim()) return;
    setBusy(true); setMsg('');
    try {
      const res = await authedFetch('/api/ares/whitelist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ip: ip.trim(), label: label.trim() }),
      });
      if (!res.ok) throw new Error();
      setIp(''); setLabel(''); setMsg('Added to the allowlist.');
      onRefresh();
    } catch {
      setMsg('Could not add. Try again.');
    }
    setBusy(false);
  };

  const remove = async (ipHash) => {
    setBusy(true);
    try {
      await authedFetch('/api/ares/whitelist', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ipHash }),
      });
      onRefresh();
    } catch { /* noop */ }
    setBusy(false);
  };

  const unban = async (ipHash) => {
    setBusy(true);
    try {
      await authedFetch('/api/ares/blocks', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ipHash }),
      });
      onRefresh();
    } catch { /* noop */ }
    setBusy(false);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-5 backdrop-blur-md">
        <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-400">Allowlist</h2>
        <p className="mt-2 text-[11px] text-zinc-500">These visitors are never inspected or logged. Miles is already on the list via server settings. Registered users are allowed automatically — see the registered-users panel below.</p>
        <div className="mt-4 flex flex-col gap-2">
          <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="IP address or range (1.2.3.4 or 1.2.3.0/24)"
            className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-zinc-600 focus:border-emerald-500" />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. Home office"
            className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-emerald-500" />
          <button onClick={add} disabled={busy || !ip.trim() || !label.trim()}
            className="rounded-lg border border-emerald-500/50 px-4 py-2 text-xs font-bold uppercase tracking-widest text-emerald-300 transition-all hover:bg-emerald-500/10 disabled:opacity-50">
            Add to allowlist
          </button>
          {msg && <p className="text-[11px] text-zinc-500">{msg}</p>}
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {(whitelist || []).map((w) => (
            <li key={w.ip_hash} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm text-zinc-200">{w.label}</div>
                <div className="font-mono text-[10px] text-zinc-600">{String(w.ip_hash).slice(0, 20)}</div>
              </div>
              {!w.static && (
                <button onClick={() => remove(w.ip_hash)} disabled={busy}
                  className="shrink-0 text-[11px] uppercase tracking-widest text-zinc-500 hover:text-red-400">Remove</button>
              )}
            </li>
          ))}
          {(!whitelist || whitelist.length === 0) && <li className="text-sm text-zinc-500">No manual entries yet.</li>}
        </ul>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-5 backdrop-blur-md">
        <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-400">Active bans</h2>
        <p className="mt-2 text-[11px] text-zinc-500">Temporary bans from repeated strikes. They expire on their own; you can also lift one early.</p>
        <ul className="mt-4 flex flex-col gap-2">
          {(blocks || []).map((b) => (
            <li key={b.ip_hash} className="flex items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-black/40 px-3 py-2">
              <div className="min-w-0">
                <div className="font-mono text-xs text-red-200">{String(b.ip_hash).slice(0, 12)}</div>
                <div className="truncate text-[11px] text-zinc-500">{b.reason} · {b.strikes} strikes · until {new Date(b.expires_at).toLocaleString()}</div>
              </div>
              <button onClick={() => unban(b.ip_hash)} disabled={busy}
                className="shrink-0 text-[11px] uppercase tracking-widest text-zinc-400 hover:text-emerald-300">Lift</button>
            </li>
          ))}
          {(!blocks || blocks.length === 0) && <li className="text-sm text-zinc-500">No active bans.</li>}
        </ul>
      </div>
    </div>
  );
}
