'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Achievements — the signed-in user's earned achievements.
 * Shows Vecna Slayer milestones and generic achievements (e.g. Olympian Scholar).
 * Links out to the global /achievements ledger.
 */
const MILESTONE_TITLES = {
  first: '1st Vecna Slayer',
  '100th': '100th Vecna Slayer',
  '1000th': '1000th Vecna Slayer',
  't-1000': 'Vecna Slayer T-1000',
};

export default function Achievements() {
  const [mine, setMine] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/achievements', {
          headers: session ? { Authorization: 'Bearer ' + session.access_token } : {},
        });
        if (!res.ok) return;
        const d = await res.json();
        if (cancelled || !d.ok || !d.myUserId) return;
        const myMilestones = (d.milestones || [])
          .filter((m) => m.user_id === d.myUserId)
          .map((m) => ({
            key: 'vecna-' + m.milestone,
            title: MILESTONE_TITLES[m.milestone] || m.milestone,
            sub: `Vecna #${m.kill_number} sealed`,
            when: m.awarded_at,
          }));
        const myGeneric = (d.achievements || [])
          .filter((a) => a.user_id === d.myUserId)
          .map((a) => ({
            key: 'gen-' + a.key,
            title: a.title,
            sub: a.metadata?.description || '',
            when: a.awarded_at,
          }));
        setMine([...myMilestones, ...myGeneric].sort((a, b) => new Date(b.when) - new Date(a.when)));
      } catch { /* offline — achievements hide quietly */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!mine || mine.length === 0) return null;

  return (
    <section aria-label="Achievements" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-sm font-bold tracking-[0.3em] uppercase text-neutral-100 mb-1">Achievements</h2>
      <p className="text-[11px] text-neutral-500 mb-3">Earned across Olympus. <a href="/achievements" className="text-cyan-300/80 underline underline-offset-2">View all slayers →</a></p>
      <ul className="flex flex-col gap-2">
        {mine.map((a) => (
          <li key={a.key} className="flex items-center gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] px-4 py-3">
            <span aria-hidden="true" className="text-xl">🏆</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-amber-100">{a.title}</span>
              {a.sub && <span className="block text-[11px] text-neutral-400 truncate">{a.sub}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
