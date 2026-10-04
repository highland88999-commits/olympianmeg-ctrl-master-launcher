'use client';

// PerSymphony Tickets — performer dashboard. Per-show and total ledgers.
// Balances are tracked here; payouts move only when Merlin runs them,
// straight to the performer's bank via Stripe Connect.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatCents, showStatusTransitions } from '@/lib/persymphony/tickets';

const TRANSITION_LABEL = {
  published: 'Publish',
  live: 'Go live',
  ended: 'End show',
  cancelled: 'Cancel',
};

function ShowCard({ show: s, statusBusy, onTransition }) {
  const transitions = showStatusTransitions(s.status);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
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
      {transitions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {transitions.map((next) => (
            <button
              key={next}
              onClick={() => onTransition(s, next)}
              disabled={statusBusy === s.id}
              className={`min-h-[40px] px-4 rounded-lg text-sm font-semibold disabled:opacity-50 ${
                next === 'cancelled'
                  ? 'border border-red-500/40 text-red-300'
                  : 'bg-[#3a86ff] text-white'
              }`}
            >
              {statusBusy === s.id ? 'Updating…' : TRANSITION_LABEL[next] || next}
            </button>
          ))}
        </div>
      )}
      <LedgerLine label="Your share" ledger={s.ledger} />
    </div>
  );
}

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
  const [connect, setConnect] = useState(null);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState('');

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Sign in to view your dashboard.');
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const res = await fetch('/api/persymphony/tickets/performer/overview', { headers });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || 'Could not load your dashboard.');
    setData(d);
    return headers;
  };

  useEffect(() => {
    (async () => {
      try {
        const headers = await loadData();
        fetch('/api/connect/status', { headers })
          .then((r) => r.json())
          .then((c) => {
            if (c.ok) setConnect(c);
          })
          .catch(() => {});
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  const transitionShow = async (show, next) => {
    if (next === 'cancelled' && !window.confirm(`Cancel "${show.title}"? This cannot be undone.`)) return;
    setStatusBusy(show.id);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`/api/persymphony/tickets/shows/${show.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: next }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Could not update the show.');
      await loadData();
    } catch (e) {
      setError(e.message);
    } finally {
      setStatusBusy('');
    }
  };

  const setupPayouts = async () => {
    setPayoutBusy(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sign in to set up payouts.');
      const r = await fetch('/api/connect/onboard', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ kind: 'performer', next: '/persymphony/tickets/dashboard' }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Could not start payout setup.');
      if (d.ready) {
        window.location.reload();
        return;
      }
      if (d.url) {
        window.location.href = d.url;
        return;
      }
      throw new Error('No onboarding link returned.');
    } catch (e) {
      setError(e.message);
    } finally {
      setPayoutBusy(false);
    }
  };

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
                  Balances are tracked here. Payouts are sent manually once your
                  balance reaches $20 and your payout account is ready.
                </p>
              </div>
            )}

            {/* Payouts */}
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Payouts</p>
              {!connect && (
                <p className="mt-2 text-sm text-zinc-500">Checking payout status…</p>
              )}
              {connect && connect.connect_status === 'none' && (
                <>
                  <p className="mt-2 text-sm text-zinc-400">
                    Connect a payout account to receive your earnings. Payouts go
                    straight to your bank via Stripe.
                  </p>
                  <button
                    onClick={setupPayouts}
                    disabled={payoutBusy}
                    className="mt-3 min-h-[44px] px-5 rounded-lg bg-[#3a86ff] text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {payoutBusy ? 'Opening Stripe…' : 'Set up payouts'}
                  </button>
                </>
              )}
              {connect && connect.connect_status === 'pending' && (
                <p className="mt-2 text-sm text-amber-300">
                  Payout setup is in progress — finish the remaining steps in Stripe.{' '}
                  <button onClick={setupPayouts} disabled={payoutBusy} className="underline disabled:opacity-50">
                    {payoutBusy ? 'Opening…' : 'Resume setup'}
                  </button>
                </p>
              )}
              {connect && connect.connect_status === 'ready' && (
                <p className="mt-2 text-sm text-emerald-300">
                  Payouts ready ✓ — your balance will be sent when payouts run.
                </p>
              )}
              {connect && connect.payouts && connect.payouts.length > 0 && (
                <>
                  <h3 className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                    Payout history
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {connect.payouts.map((p, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
                      >
                        <p className="text-xs text-zinc-400">
                          {new Date(p.created_at).toLocaleDateString()} · {p.kind}
                        </p>
                        <p className="text-xs font-bold text-emerald-300">{p.amount_display}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <h2 className="font-bold mt-8 mb-3">Shows</h2>
            <div className="grid gap-3">
              {data.shows.map((s) => (
                <ShowCard key={s.id} show={s} statusBusy={statusBusy} onTransition={transitionShow} />
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
