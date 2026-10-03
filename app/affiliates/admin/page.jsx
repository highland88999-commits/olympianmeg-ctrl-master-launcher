'use client';

// Affiliate admin — MERLIN ONLY. Every affiliate's wallet plus the house's
// total outstanding liability. The API strictly gates to the owner account;
// anyone else gets a 404 and sees nothing.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function AffiliateAdminPage() {
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) {
        setDenied(true);
        return;
      }
      fetch('/api/affiliates/admin/overview', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then(async (r) => {
          if (r.status === 404) {
            setDenied(true);
            return;
          }
          const d = await r.json();
          if (!d.ok) throw new Error(d.error || 'Could not load.');
          setData(d);
        })
        .catch(() => setDenied(true));
    });
  }, []);

  if (denied) {
    return (
      <div className="min-h-screen bg-[#070d1d] text-[#f4f6ff] flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070d1d] text-[#f4f6ff]">
      <div className="max-w-5xl mx-auto px-4 pt-6 pb-24">
        <p className="text-xs tracking-[0.2em] uppercase text-[#3a86ff]">Plutus · Owner only</p>
        <h1 className="text-2xl font-black mt-1">Affiliate liability</h1>

        {!data && <p className="mt-8 text-sm text-zinc-500">Loading…</p>}

        {data && (
          <>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-center">
                <p className="text-2xl font-black text-red-300">{data.total_liability_display}</p>
                <p className="text-[11px] uppercase tracking-wider text-zinc-500 mt-1">Outstanding liability</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center">
                <p className="text-2xl font-black">{data.affiliate_count}</p>
                <p className="text-[11px] uppercase tracking-wider text-zinc-500 mt-1">Affiliates</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center">
                <p className="text-2xl font-black text-amber-300">{data.total_pending_count}</p>
                <p className="text-[11px] uppercase tracking-wider text-zinc-500 mt-1">Awaiting cost</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center">
                <p className="text-2xl font-black text-emerald-300">
                  {data.affiliates.filter((a) => a.accrued_cents > 0).length}
                </p>
                <p className="text-[11px] uppercase tracking-wider text-zinc-500 mt-1">With balance</p>
              </div>
            </div>

            <h2 className="mt-8 text-sm font-bold uppercase tracking-[0.18em] text-zinc-400">
              All affiliates
            </h2>
            {data.affiliates.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No affiliates yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                      <th className="px-4 py-3">Affiliate</th>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3 text-right">Referred</th>
                      <th className="px-4 py-3 text-right">Balance</th>
                      <th className="px-4 py-3 text-right">Lifetime</th>
                      <th className="px-4 py-3 text-right">Paid</th>
                      <th className="px-4 py-3 text-right">Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.affiliates.map((a) => (
                      <tr key={a.user_id} className="border-b border-zinc-800/60 last:border-0">
                        <td className="px-4 py-3 text-zinc-300 break-all">{a.email || a.user_id.slice(0, 8) + '…'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-zinc-400">{a.code}</td>
                        <td className="px-4 py-3 text-right">{a.referred_count}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-300">{a.accrued_display}</td>
                        <td className="px-4 py-3 text-right text-zinc-300">{a.lifetime_display}</td>
                        <td className="px-4 py-3 text-right text-zinc-500">{a.paid_display}</td>
                        <td className="px-4 py-3 text-right text-amber-300">{a.pending_count || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <p className="mt-10 text-center text-xs text-zinc-600">
          <Link href="/affiliates" className="underline">Affiliate dashboard</Link>
        </p>
      </div>
    </div>
  );
}
