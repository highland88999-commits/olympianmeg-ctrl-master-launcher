// app/wallet/page.jsx
// The user's in-house wallet: balance, full timestamped history,
// withdrawals. Every program's earnings land here.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

async function authed(path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in to view your wallet.');
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function fmt(cents) {
  const c = Math.round(Number(cents) || 0);
  const sign = c < 0 ? '-' : '';
  const a = Math.abs(c);
  return `$${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

function ts(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return iso || ''; }
}

const STATUS_COLORS = {
  requested: '#fbbf24', processing: '#38bdf8', completed: '#34d399',
  failed: '#f43f5e', canceled: '#8b91a8', 'paused-funds': '#fb923c',
};

function Countdown({ ms }) {
  const m = Math.max(0, Math.round(Number(ms) || 0));
  const d = Math.floor(m / 86400000);
  const h = String(Math.floor((m % 86400000) / 3600000)).padStart(2, '0');
  const mi = String(Math.floor((m % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((m % 60000) / 1000)).padStart(2, '0');
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: '1.4rem', color: '#fbbf24' }}>
      {d}d {h}:{mi}:{s}
    </span>
  );
}

const card = {
  border: '1px solid #2a3352', background: 'linear-gradient(180deg, rgba(56,189,248,0.06), transparent 60%), #0d1226',
  borderRadius: 14, padding: '1.2rem',
};

export default function WalletPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [txns, setTxns] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [programFilter, setProgramFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [withdrawals, setWithdrawals] = useState([]);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amount, setAmount] = useState('');
  const [destLabel, setDestLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [lock, setLock] = useState(null);
  const [payoutDest, setPayoutDest] = useState('');
  const [destSaved, setDestSaved] = useState(false);

  const load = useCallback(async (prog, kind) => {
    setLoading(true);
    setError('');
    try {
      const s = await authed('/api/wallet');
      setSummary(s.wallet);
      setLock(s.lock || null);
      const q = new URLSearchParams({ limit: '100' });
      if (prog) q.set('program', prog);
      if (kind) q.set('kind', kind);
      const t = await authed(`/api/wallet/transactions?${q.toString()}`);
      setTxns(t.transactions);
      setPrograms(t.programs);
      const w = await authed('/api/wallet/withdrawals');
      setWithdrawals(w.withdrawals);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(programFilter, kindFilter); }, [load, programFilter, kindFilter]);

  async function saveDestination(e) {
    e.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const r = await authed('/api/wallet/destination', {
        method: 'POST',
        body: JSON.stringify({ payout_destination: payoutDest }),
      });
      setDestSaved(true);
      setNotice(r.saved
        ? `Payout destination saved (${r.masked}). You're in the automatic Christmas queue.`
        : 'Payout destination cleared.');
      load(programFilter, kindFilter);
    } catch (e2) {
      setNotice(e2.message);
    }
    setBusy(false);
  }

  async function requestWithdraw(e) {
    e.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const cents = Math.round(Number(amount) * 100);
      const r = await authed('/api/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount_cents: cents, destination_label: destLabel }),
      });
      setNotice(`Withdrawal requested — ${fmt(r.withdrawal.amount_cents)} held. ${r.note || ''}`);
      setShowWithdraw(false);
      setAmount('');
      setDestLabel('');
      load(programFilter, kindFilter);
    } catch (e2) {
      setNotice(e2.message);
    }
    setBusy(false);
  }

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1.2rem 5rem', color: '#e8e6df' }}>
      <p style={{ color: '#8b91a8', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
        <Link href="/profile" style={{ color: '#38bdf8' }}>← Profile</Link>
      </p>
      <h1 style={{ fontSize: '2rem', margin: '0 0 0.4rem' }}>Wallet</h1>
      <p style={{ color: '#8b91a8', margin: '0 0 1.6rem' }}>
        Every program pays your cut here. Earnings accumulate until the vaults open — then withdraw to your bank.
      </p>

      {error && <p style={{ color: '#f43f5e' }}>{error}</p>}

      {lock?.locked && (
        <div style={{
          ...card, marginBottom: '1.2rem', textAlign: 'center',
          borderColor: 'rgba(251,191,36,0.5)',
          background: 'linear-gradient(180deg, rgba(251,191,36,0.08), transparent 60%), #140b12',
        }}>
          <div style={{ fontWeight: 800, letterSpacing: '0.08em', color: '#fbbf24', fontSize: '0.9rem' }}>
            🔒 DOOMSDAY — THE VAULTS OPEN IN
          </div>
          <div style={{ margin: '0.5rem 0' }}>
            <Countdown ms={lock.countdown_ms} />
          </div>
          <p style={{ color: '#d6a35c', fontSize: '0.85rem', margin: 0 }}>
            Accumulating until {lock.locked_until_label || 'Dec 11'} — then withdrawals unlock for everyone,
            oldest earnings paid first.
          </p>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#8b91a8' }}>Loading…</p>
      ) : summary && (
        <>
          <div style={{ ...card, marginBottom: '1.2rem', textAlign: 'center' }}>
            <div style={{ color: '#8b91a8', fontSize: '0.85rem', letterSpacing: '0.06em' }}>AVAILABLE BALANCE</div>
            <div style={{ fontSize: '3rem', fontWeight: 800, color: '#34d399', margin: '0.3rem 0' }}>
              {fmt(summary.available_cents)}
            </div>
            <div style={{ display: 'flex', gap: '1.6rem', justifyContent: 'center', color: '#8b91a8', fontSize: '0.9rem' }}>
              <span>Total {fmt(summary.balance_cents)}</span>
              {summary.held_cents > 0 && <span>Held {fmt(summary.held_cents)}</span>}
            </div>
            <button
              onClick={() => setShowWithdraw(true)}
              disabled={lock?.locked || summary.available_cents < 500}
              title={lock?.locked ? `Withdrawals unlock ${lock?.locked_until_label || 'Dec 11'}` : undefined}
              style={{
                marginTop: '1rem', padding: '0.8rem 2.2rem', borderRadius: 10, border: 'none',
                background: (!lock?.locked && summary.available_cents >= 500) ? '#34d399' : '#2a3352',
                color: '#0b0e1a', fontWeight: 800, fontSize: '1rem',
                cursor: (!lock?.locked && summary.available_cents >= 500) ? 'pointer' : 'not-allowed',
              }}
            >
              {lock?.locked ? `Unlocks ${lock?.locked_until_label || 'Dec 11'}` : 'Withdraw'}
            </button>
            {lock?.locked ? (
              <p style={{ color: '#d6a35c', fontSize: '0.8rem', margin: '0.6rem 0 0' }}>
                🔒 Accumulating — withdrawals unlock {lock?.locked_until_label || 'Dec 11'}.
              </p>
            ) : summary.available_cents < 500 && (
              <p style={{ color: '#8b91a8', fontSize: '0.8rem', margin: '0.6rem 0 0' }}>Minimum withdrawal is $5.00.</p>
            )}
          </div>

          {!lock?.locked && (
            <form onSubmit={saveDestination} style={{ ...card, marginBottom: '1.2rem' }}>
              <h3 style={{ margin: '0 0 0.4rem' }}>Payout destination</h3>
              <p style={{ color: '#8b91a8', fontSize: '0.82rem', margin: '0 0 0.8rem' }}>
                {summary.payout_destination_set || destSaved
                  ? '✓ Saved — your withdrawals join the automatic Christmas queue.'
                  : 'Where should automatic payouts go? Your Stripe Connect account id.'}
              </p>
              <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'end' }}>
                <input
                  value={payoutDest} onChange={(e) => { setPayoutDest(e.target.value); setDestSaved(false); }}
                  placeholder="acct_…"
                  style={{ padding: '0.7rem', borderRadius: 8, border: '1px solid #2a3352', background: '#0b0e1a', color: '#e8e6df', fontSize: '1rem', width: 220 }}
                />
                <button type="submit" disabled={busy}
                  style={{ padding: '0.7rem 1.4rem', borderRadius: 8, border: 'none', background: '#38bdf8', color: '#0b0e1a', fontWeight: 800, cursor: 'pointer' }}>
                  {busy ? '…' : 'Save'}
                </button>
              </div>
            </form>
          )}

          {notice && <p style={{ color: '#38bdf8', ...card, marginBottom: '1.2rem' }}>{notice}</p>}

          {showWithdraw && (
            <form onSubmit={requestWithdraw} style={{ ...card, marginBottom: '1.2rem', borderColor: '#34d39988' }}>
              <h3 style={{ margin: '0 0 0.8rem' }}>Request withdrawal</h3>
              <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'end' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', color: '#8b91a8' }}>
                  Amount (USD)
                  <input
                    type="number" min="5" step="0.01" required value={amount}
                    onChange={(e) => setAmount(e.target.value)} placeholder="25.00"
                    style={{ padding: '0.7rem', borderRadius: 8, border: '1px solid #2a3352', background: '#0b0e1a', color: '#e8e6df', fontSize: '1rem', width: 140 }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', color: '#8b91a8' }}>
                  Destination label (optional)
                  <input
                    value={destLabel} onChange={(e) => setDestLabel(e.target.value)} placeholder="Bank ••1234"
                    style={{ padding: '0.7rem', borderRadius: 8, border: '1px solid #2a3352', background: '#0b0e1a', color: '#e8e6df', fontSize: '1rem', width: 180 }}
                  />
                </label>
                <button type="submit" disabled={busy}
                  style={{ padding: '0.7rem 1.4rem', borderRadius: 8, border: 'none', background: '#34d399', color: '#0b0e1a', fontWeight: 800, cursor: 'pointer' }}>
                  {busy ? '…' : 'Confirm request'}
                </button>
                <button type="button" onClick={() => setShowWithdraw(false)}
                  style={{ padding: '0.7rem 1rem', borderRadius: 8, border: '1px solid #2a3352', background: 'transparent', color: '#8b91a8', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
              <p style={{ color: '#8b91a8', fontSize: '0.82rem', margin: '0.8rem 0 0' }}>
                Requesting holds the funds — nothing leaves your wallet until the payout is released.
              </p>
            </form>
          )}

          <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', marginRight: 'auto' }}>Transactions</h2>
            <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: 8, border: '1px solid #2a3352', background: '#0d1226', color: '#e8e6df' }}>
              <option value="">All programs</option>
              {programs.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: 8, border: '1px solid #2a3352', background: '#0d1226', color: '#e8e6df' }}>
              <option value="">Credits + debits</option>
              <option value="credit">Credits</option>
              <option value="debit">Debits</option>
            </select>
          </div>

          {txns.length === 0 ? (
            <p style={{ ...card, color: '#8b91a8' }}>No transactions yet. Earnings from programs will appear here.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '2rem' }}>
              {txns.map((t) => (
                <div key={t.id} style={{ ...card, padding: '0.9rem 1.1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <span style={{
                    minWidth: 44, textAlign: 'center', fontWeight: 800, fontSize: '1.1rem',
                    color: t.kind === 'credit' ? '#34d399' : '#f43f5e',
                  }}>
                    {t.kind === 'credit' ? '+' : '−'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{fmt(t.amount_cents)}</div>
                    <div style={{ color: '#8b91a8', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.reason || t.program}
                    </div>
                    {t.kind === 'credit' && (
                      <div style={{ color: '#5b6178', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                        gross {fmt(t.gross_cents)} − Stripe fee {fmt(t.stripe_fee_cents)} − platform fee {fmt(t.platform_fee_cents)} = {fmt(t.amount_cents)}
                      </div>
                    )}
                    <div style={{ color: '#5b6178', fontSize: '0.75rem' }}>{ts(t.created_at)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {t.program && (
                      <span style={{ fontSize: '0.7rem', background: '#2a3352', borderRadius: 4, padding: '0.15rem 0.5rem', color: '#c9cede' }}>
                        {t.program}
                      </span>
                    )}
                    <div style={{ color: '#8b91a8', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      bal {fmt(t.balance_after_cents)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Withdrawals</h2>
          {withdrawals.length === 0 ? (
            <p style={{ ...card, color: '#8b91a8' }}>No withdrawals yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {withdrawals.map((w) => (
                <div key={w.id} style={{ ...card, padding: '0.9rem 1.1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{fmt(w.amount_cents)}</div>
                    <div style={{ color: '#5b6178', fontSize: '0.75rem' }}>
                      Requested {ts(w.created_at)}
                      {w.processed_at && ` · settled ${ts(w.processed_at)}`}
                    </div>
                    {w.note && <div style={{ color: '#8b91a8', fontSize: '0.82rem' }}>{w.note}</div>}
                  </div>
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.06em',
                    color: STATUS_COLORS[w.status] || '#8b91a8',
                    border: `1px solid ${STATUS_COLORS[w.status] || '#8b91a8'}66`,
                    borderRadius: 20, padding: '0.3rem 0.8rem', textTransform: 'uppercase',
                  }}>
                    {w.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
