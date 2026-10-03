'use client';

// PerSymphony Tickets — performer dashboard. Per-show and total ledgers.
// LEDGER ONLY: balances are tracked here; no payouts move in v1.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatCents } from '@/lib/persymphony/tickets';

function LedgerLine({ label, ledger }) {
  if (!ledger) return null;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-2">
      <span className="text-zinc-500">Tickets sold</span>
      <span className="text-right">{ledger.tickets_sold}</span>
      <span className="text-zinc-500">Gross</span>
      <span className="text-right">{formatCents(ledger.gross_cents)}</span>
      <span className="text-zinc-500">Stripe fees</span>
      <span className="text-right text-zinc-400">−{formatCents(ledger.stripe_fee_cents)}</span>
      <span className="text-zinc-500">Net profit</span>
      <span className="text-right font-semibold">{formatCents(ledger.net_cents)}</span>
      <span className="text-zinc-500">Platform (10%)</span>
      <span className="text-right text-zinc-400">−{formatCents(ledger.platform_fee_cents)}</span>
      <span className="text-zinc-300 font-semibold">{label}</span>
      <span className="text-right font-black text-[#3a86ff]">{formatCents(ledger.performer_share_cents)}</span>
    </div>
  );
}

export default function PerformerDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Sign in to view your dashboard.');
        const res = await fetch('/api/persymphony/tickets/performer/overview', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || 'Could not load your dashboard.');
        setData(d);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[#070d1d] text-[#f4f6ff]">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-24">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-[#3a86ff]">Persymphony</p>
            <h1 className="text-2xl font-black mt-1">Performer dashboard</h1>
          </div>
          <Link
            href="/persymphony/tickets/create"
            className="shrink-0 min-h-[44px] px-4 py-2.5 rounded-lg bg-[#3a86ff] text-white text-sm font-semibold"
          >
            New show
          </Link>
        </div>

        {error && (
          <p className="mt-6 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            {error}
          </p>
        )}
        {!data && !error && <p className="mt-8 text-zinc-500 text-sm">Loading…</p>}

        {data && !data.performer && (
          <p className="mt-8 text-sm text-zinc-400">
            No performer profile yet.{' '}
            <Link href="/persymphony/tickets/create" className="text-[#3a86ff] underline">
              Create your first show
            </Link>{' '}
            to set one up.
          </p>
        )}

        {data?.performer && (
          <>
            <p className="text-sm text-zinc-400 mt-2">
              Performing as <span className="text-white font-semibold">{data.performer.display_name}</span>
              {' · '}
              <Link href={`/persymphony/performers/${data.performer.id}`} className="text-[#3a86ff] underline">
                View public profile
              </Link>
            </p>

            {data.totals && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h2 className="font-bold">All shows</h2>
                <LedgerLine label="Your balance" ledger={data.totals} />
                <p className="text-[11px] text-zinc-600 mt-3">
                  Balances are tracked here. Payouts arrive in a later phase.
                </p>
              </div>
            )}

            <h2 className="font-bold mt-8 mb-3">Shows</h2>
            <div className="grid gap-3">
              {data.shows.map((s) => (
                <div key={s.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/persymphony/tickets/${s.id}`} className="font-semibold">
                        {s.title}
                      </Link>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {s.performance_type} · {s.venue_type} · {s.status}
                        {s.tickets_redeemed > 0 && ` · ${s.tickets_redeemed} entered`}
                      </p>
                    </div>
                  </div>
                  <LedgerLine label="Your share" ledger={s.ledger} />
                </div>
              ))}
              {data.shows.length === 0 && (
                <p className="text-sm text-zinc-500">No shows yet.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
