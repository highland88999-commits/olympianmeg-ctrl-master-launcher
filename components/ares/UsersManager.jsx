'use client';

import { useState } from 'react';

// Registered-users allowlist. Every account that registers or signs in
// is on the allowlist automatically — this list simply shows them all,
// with a Ban button next to any account that acts in bad faith. A ban
// is lifted with the same row's Lift button.
export default function UsersManager({ authedFetch, users, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const ban = async (userId) => {
    setBusy(true); setMsg('');
    try {
      const res = await authedFetch('/api/ares/user-bans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error();
      setMsg('Account banned.');
      onRefresh();
    } catch {
      setMsg('Could not ban. Try again.');
    }
    setBusy(false);
  };

  const lift = async (userId) => {
    setBusy(true); setMsg('');
    try {
      await authedFetch('/api/ares/user-bans', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      onRefresh();
    } catch { /* noop */ }
    setBusy(false);
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-5 backdrop-blur-md">
      <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-400">Registered users · Allowlist</h2>
      <p className="mt-2 text-[11px] text-zinc-500">
        Every account that registers or signs in is on the allowlist automatically.
        A banned account is refused by every API route until you lift it.
      </p>
      {msg && <p className="mt-2 text-[11px] text-zinc-500">{msg}</p>}
      <ul className="mt-4 flex flex-col gap-2">
        {(users || []).map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm text-zinc-200">{u.email || u.id}</div>
              <div className="truncate text-[11px] text-zinc-500">
                {u.banned ? `Banned · ${u.ban_reason || 'misuse'}` : 'Allowed'}
                {u.created_at && ` · joined ${new Date(u.created_at).toLocaleDateString()}`}
              </div>
            </div>
            {u.banned ? (
              <button onClick={() => lift(u.id)} disabled={busy}
                className="shrink-0 text-[11px] uppercase tracking-widest text-zinc-400 hover:text-emerald-300">Lift</button>
            ) : (
              <button onClick={() => ban(u.id)} disabled={busy}
                className="shrink-0 text-[11px] uppercase tracking-widest text-zinc-500 hover:text-red-400">Ban</button>
            )}
          </li>
        ))}
        {(!users || users.length === 0) && <li className="text-sm text-zinc-500">No registered users yet.</li>}
      </ul>
    </div>
  );
}
