'use client';

// In-house affiliate program — the house's own referral engine.
// Any signed-in user becomes an affiliate, shares their link, and earns
// 10% of whatever the house earns on every purchase their referrals make.
// Balances accrue in the wallet; payouts move only when Merlin runs them,
// straight to the affiliate's bank via Stripe Connect.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

function authedFetch(path, opts = {}) {
  return supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session?.access_token) throw new Error('Sign in to use the affiliate program.');
    return fetch(path, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: `Bearer ${session.access_token}` },
    });
  });
}

export default function AffiliatesPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connect, setConnect] = useState(null);
  const [payoutBusy, setPayoutBusy] = useState(false);

  const load = () => {
    setError('');
    authedFetch('/api/affiliates/overview')
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error || 'Could not load your dashboard.');
        setData(d);
      })
      .catch((e) => setError(e.message));
    authedFetch('/api/connect/status')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setConnect(d);
      })
      .catch(() => {});
  };

  useEffect(load, []);

  const become = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await authedFetch('/api/affiliates/code', { method: 'POST' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Could not create your affiliate link.');
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!data?.link) return;
    try {
      await navigator.clipboard.writeText(data.link);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = data.link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const setupPayouts = async () => {
    setPayoutBusy(true);
    setError('');
    try {
      const r = await authedFetch('/api/connect/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'affiliate', next: '/affiliates' }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Could not start payout setup.');
      if (d.ready) {
        load();
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
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-24">
        <p className="text-xs tracking-[0.2em] uppercase text-[#3a86ff]">Plutus · Wealth &amp; Trade</p>
        <h1 className="text-2xl font-black mt-1">Affiliates</h1>
        <p className="text-sm text-zinc-400 mt-1 max-w-xl">
          Share your link. Anyone who signs up with it is yours — every in-house
          purchase they ever make earns you 10% of the house&apos;s cut.
          No fees, no middlemen, tracked on your account forever.
        </p>

        {error && (
          <p className="mt-6 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{error}</p>
        )}

        {!data && !error && <p className="mt-8 text-sm text-zinc-500">Loading your dashboard…</p>}

        {data && !data.is_affiliate && (
          <div className="mt-8 rounded-xl border border-[#3a86ff]/30 bg-[#3a86ff]/5 p-6 text-center">
            <p className="text-sm text-zinc-300">You don&apos;t have an affiliate link yet.</p>
            <button
              onClick={become}
              disabled={busy}
              className="mt-4 min-h-[48px] px-6 rounded-lg bg-[#3a86ff] text-white text-sm font-bold disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Become an affiliate'}
            </button>
          </div>
        )}

        {data && data.is_affiliate && (
          <>
            {/* Wallet — the balance is the hero */}
            <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-gradient-to-b from-emerald-400/10 to-transparent p-6 text-center">
              <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-400">Wallet balance</p>
              <p className="mt-2 text-5xl font-black text-emerald-300">{data.balance_display}</p>
              <p className="mt-2 text-xs text-zinc-500">
                {data.threshold.reached
                  ? 'Threshold reached — set up payouts below to receive your balance.'
                  : `${data.threshold.threshold_display} minimum payout`}
              </p>
              <div className="mt-4 flex items-center justify-center gap-6 text-sm">
                <div>
                  <p className="font-bold text-[#f4f6ff]">{data.lifetime_display}</p>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Lifetime earned</p>
                </div>
                <div className="w-px h-8 bg-zinc-800" aria-hidden="true" />
                <div>
                  <p className="font-bold text-[#f4f6ff]">{data.paid_display}</p>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Paid out</p>
                </div>
                <div className="w-px h-8 bg-zinc-800" aria-hidden="true" />
                <div>
                  <p className="font-bold text-[#f4f6ff]">{data.referred_count}</p>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Referred</p>
                </div>
              </div>
              {data.pending_count > 0 && (
                <p className="mt-3 text-[11px] text-amber-300/90">
                  {data.pending_count} commission{data.pending_count === 1 ? '' : 's'} awaiting
                  cost finalization — not counted in your balance yet.
                </p>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>To payout threshold</span>
                <span>{data.threshold.percent}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all"
                  style={{ width: `${data.threshold.percent}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                Balances accrue as your referrals buy. True net = sale minus
                Stripe fees minus real product costs. Payouts are sent manually
                once your balance reaches the threshold and your payout account
                is ready — nothing moves on its own.
              </p>
            </div>

            {/* Payouts */}
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Payouts</p>
              {!connect && (
                <p className="mt-2 text-sm text-zinc-500">Checking payout status…</p>
              )}
              {connect && connect.connect_status === 'none' && (
                <>
                  <p className="mt-2 text-sm text-zinc-400">
                    Connect a payout account to receive your balance. Payouts go
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
                        className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
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

            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Your referral link</p>
              <p className="mt-2 text-sm break-all text-[#f4f6ff] font-mono">{data.link}</p>
              <button
                onClick={copyLink}
                className="mt-3 min-h-[44px] px-5 rounded-lg bg-[#3a86ff] text-white text-sm font-semibold"
              >
                {copied ? 'Copied ✓' : 'Copy link'}
              </button>
            </div>

            <h2 className="mt-8 text-sm font-bold uppercase tracking-[0.18em] text-zinc-400">Commission history</h2>
            {data.commissions.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No commissions yet. Share your link to start earning.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.commissions.map((c) => (
                  <li
                    key={c.source + ':' + c.source_id}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold">{c.source_label}</p>
                      <p className="text-[11px] text-zinc-500">
                        {new Date(c.created_at).toLocaleDateString()} ·{' '}
                        {c.status === 'pending_cost' ? (
                          <span className="text-amber-300">awaiting cost finalization</span>
                        ) : (
                          c.status
                        )}
                      </p>
                    </div>
                    <p className={`text-sm font-bold ${c.status === 'pending_cost' ? 'text-zinc-500' : 'text-emerald-300'}`}>
                      {c.status === 'pending_cost' ? 'pending' : `+${c.commission_display}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <p className="mt-10 text-center text-xs text-zinc-600">
          <Link href="/" className="underline">Back to the hub</Link>
          {data?.is_owner && (
            <>
              {' · '}
              <Link href="/affiliates/admin" className="underline">Owner liability view</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
