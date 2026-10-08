'use client';

import { useEffect, useState } from 'react';

/**
 * /achievements — the global achievements ledger for all users.
 * Vecna Slayer milestones (1st / 100th / 1000th / T-1000) plus every generic
 * achievement (Olympian Scholar, …), newest first.
 */
const MILESTONE_TITLES = {
  first: '1st Vecna Slayer',
  '100th': '100th Vecna Slayer',
  '1000th': '1000th Vecna Slayer',
  't-1000': 'Vecna Slayer T-1000',
};

function shortId(id) {
  return id ? id.slice(0, 8) : '????';
}

export default function AchievementsPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/achievements');
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled && d.ok) setData(d);
      } catch { /* offline */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = [];
  if (data) {
    for (const m of data.milestones || []) {
      rows.push({
        key: 'vecna-' + m.milestone,
        title: MILESTONE_TITLES[m.milestone] || m.milestone,
        sub: `Vecna #${m.kill_number} sealed`,
        who: shortId(m.user_id),
        when: m.awarded_at,
        mine: data.myUserId && m.user_id === data.myUserId,
      });
    }
    for (const a of data.achievements || []) {
      rows.push({
        key: 'gen-' + a.key + '-' + a.user_id.slice(0, 8),
        title: a.title,
        sub: a.metadata?.description || '',
        who: shortId(a.user_id),
        when: a.awarded_at,
        mine: data.myUserId && a.user_id === data.myUserId,
      });
    }
    rows.sort((a, b) => new Date(b.when) - new Date(a.when));
  }

  return (
    <main className="min-h-screen bg-[#050508] text-neutral-200 px-4 py-8 max-w-2xl mx-auto">
      <h1 className="text-xl font-black tracking-[0.25em] uppercase text-center">Achievements</h1>
      <p className="text-center text-[12px] text-neutral-500 mt-1 mb-6">Every legend across Olympus, newest first.</p>
      {!data && <p className="text-center text-neutral-500 text-sm">Loading…</p>}
      {data && rows.length === 0 && (
        <p className="text-center text-neutral-500 text-sm">No achievements yet. Be the first.</p>
      )}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.key}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
              r.mine ? 'border-cyan-300/40 bg-cyan-300/[0.06]' : 'border-amber-300/20 bg-amber-300/[0.04]'
            }`}
          >
            <span aria-hidden="true" className="text-xl">🏆</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-amber-100">
                {r.title} {r.mine && <span className="text-cyan-300 text-[10px] font-black tracking-widest">· YOU</span>}
              </span>
              {r.sub && <span className="block text-[11px] text-neutral-400 truncate">{r.sub}</span>}
            </span>
            <span className="text-[10px] text-neutral-600 font-mono shrink-0">slayer {r.who}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
