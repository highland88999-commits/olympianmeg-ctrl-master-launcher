// app/wallet/admin/page.jsx
// Merlin's payout queue. MERLIN-ONLY: the server enforces it on every
// route; this page just won't render anything useful for anyone else.
//
// His release flow:
//   1. A user requests a withdrawal (funds HELD, not moved).
//   2. Merlin reviews the queue here.
//   3. approve            -> tries an automatic Stripe transfer when a
//                            Connect account id is supplied; otherwise the
//                            withdrawal sits in "processing" for manual payout.
//   4. mark_completed     -> ONLY after the money really left (bank, Interac,
//                            Stripe dashboard). Debits the wallet now.
//   5. fail / cancel      -> releases the hold; the user keeps the funds.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

async function authed(path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in first.');
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
  const a = Math.abs(c);
  return `$${c < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

function ts(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch { return iso || ''; }
}

const card = {
  border: '1px solid #2a3352', background: '#0d1226', borderRadius: 14, padding: '1.1rem',
};

export default function WalletAdminPage() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [connectId, setConnectId] = useState('');
  const [note, setNote] = useState('');
  const [released, setReleased] = useState(null);
  const [releasing, setReleasing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await authed('/api/wallet/admin/queue');
      setQueue(r.queue);
      setReleased(r.christmas_released || null);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function releaseChristmasQueue() {
    if (!window.confirm('Release the Christmas payout queue? The queue will then process itself — oldest earnings first, pausing honestly if platform funds run short. This is your one explicit confirmation.')) return;
    setReleasing(true);
    try {
      const r = await authed('/api/wallet/admin/payout-release', { method: 'POST', body: JSON.stringify({}) });
      setReleased(r.released_at);
      setError('');
    } catch (e) {
      setError(e.message);
    }
    setReleasing(false);
  }

  async function act(id, action) {
    setBusyId(id);
    try {
      await authed('/api/wallet/admin/release', {
        method: 'POST',
        body: JSON.stringify({
          withdrawal_id: id,
          action,
          note: note.trim(),
          connect_account_id: connectId.trim() || undefined,
        }),
      });
      setNote('');
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusyId('');
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.2rem 5rem', color: '#e8e6df' }}>
      <h1 style={{ fontSize: '1.8rem', margin: '0 0 0.4rem' }}>Payout queue</h1>
      <p style={{ color: '#8b91a8', margin: '0 0 1.4rem' }}>
        Approve releases money. <strong style={{ color: '#fbbf24' }}>Mark completed only after the payout really left.</strong>
      </p>

      <div style={{
        ...card, marginBottom: '1.2rem',
        borderColor: released ? 'rgba(52,211,153,0.5)' : 'rgba(251,191,36,0.5)',
        background: 'linear-gradient(180deg, rgba(251,191,36,0.06), transparent 60%), #0d1226',
      }}>
        <h3 style={{ margin: '0 0 0.4rem', color: '#fbbf24' }}>🔒 Christmas queue release</h3>
        <p style={{ color: '#8b91a8', fontSize: '0.85rem', margin: '0 0 0.9rem' }}>
          {released
            ? `Released ${ts(released)} — the queue processes itself: oldest earnings first, pausing honestly if platform funds run short.`
            : 'One explicit confirmation from you, then the queue runs itself. The lock must also have lifted (Dec 11) before anything processes.'}
        </p>
        {!released && (
          <button onClick={releaseChristmasQueue} disabled={releasing}
            style={{ padding: '0.8rem 1.8rem', borderRadius: 10, border: 'none', background: '#fbbf24', color: '#0b0e1a', fontWeight: 800, fontSize: '1rem', cursor: 'pointer' }}>
            {releasing ? '…' : 'Release the Christmas queue'}
          </button>
        )}
      </div>

      <div style={{ ...card, marginBottom: '1.2rem', display: 'flex', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: '#8b91a8' }}>
          Connect account id (optional — attempts auto Stripe transfer on approve)
          <input value={connectId} onChange={(e) => setConnectId(e.target.value)} placeholder="acct_…"
            style={{ padding: '0.6rem', borderRadius: 8, border: '1px solid #2a3352', background: '#0b0e1a', color: '#e8e6df', width: 220 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: '#8b91a8', flex: 1, minWidth: 200 }}>
          Note (saved on the withdrawal)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sent via Interac 3:42pm…"
            style={{ padding: '0.6rem', borderRadius: 8, border: '1px solid #2a3352', background: '#0b0e1a', color: '#e8e6df' }} />
        </label>
      </div>

      {error && <p style={{ color: '#f43f5e' }}>{error}</p>}
      {loading ? (
        <p style={{ color: '#8b91a8' }}>Loading…</p>
      ) : queue.length === 0 ? (
        <p style={{ ...card, color: '#8b91a8' }}>Queue is empty. Nothing awaiting release.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {queue.map((w) => (
            <div key={w.id} style={card}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#fbbf24' }}>{fmt(w.amount_cents)}</div>
                  <div style={{ color: '#8b91a8', fontSize: '0.82rem' }}>
                    {w.user_email || w.user_id}
                    {w.destination_label && ` · ${w.destination_label}`}
                  </div>
                  <div style={{ color: '#5b6178', fontSize: '0.75rem' }}>
                    {w.status.toUpperCase()} · requested {ts(w.created_at)}
                  </div>
                  {w.note && <div style={{ color: '#8b91a8', fontSize: '0.82rem', marginTop: '0.3rem' }}>{w.note}</div>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button disabled={busyId === w.id || w.status !== 'requested'} onClick={() => act(w.id, 'approve')}
                    style={btn('#38bdf8', w.status === 'requested')}>Approve</button>
                  <button disabled={busyId === w.id} onClick={() => act(w.id, 'mark_completed')}
                    style={btn('#34d399', true)}>Mark completed</button>
                  <button disabled={busyId === w.id} onClick={() => act(w.id, 'fail')}
                    style={btn('#f43f5e', true)}>Fail</button>
                  <button disabled={busyId === w.id} onClick={() => act(w.id, 'cancel')}
                    style={btn('#8b91a8', true)}>Cancel</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function btn(color, enabled) {
  return {
    padding: '0.6rem 1rem', borderRadius: 8, border: `1px solid ${color}88`,
    background: enabled ? `${color}22` : 'transparent', color: enabled ? color : '#5b6178',
    fontWeight: 700, cursor: enabled ? 'pointer' : 'not-allowed', fontSize: '0.85rem',
  };
}
