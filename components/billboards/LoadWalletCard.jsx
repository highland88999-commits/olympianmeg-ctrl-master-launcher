// components/billboards/LoadWalletCard.jsx — "Load Wallet" card, shared
// by the wallet page and the billboard request page. Client component.
// Loads CAD CREDIT (stored value for services like billboard ads —
// not gold, not aether, not cashable) via Stripe Checkout: pick an
// amount ($10/$25/$50/$100 presets or a custom amount, $5 minimum),
// tap Load Wallet, pay on Stripe's page, and come back to /wallet.
// The credit lands only when Stripe confirms the payment (webhook).

'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const PRESETS = [1000, 2500, 5000, 10000];

function fmt(cents) {
  return `$${(cents / 100).toFixed(2)} CAD`;
}

export default function LoadWalletCard() {
  const [amount, setAmount] = useState(2500);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const cents = custom !== '' ? Math.round(Number(custom) * 100) : amount;
      if (!Number.isFinite(cents) || cents < 500 || cents > 100000) {
        throw new Error('Load between $5 and $1,000 CAD at a time.');
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sign in to load your wallet.');
      const r = await fetch('/api/wallet/load', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ amountCents: cents }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) throw new Error(j.error || 'Could not start checkout.');
      window.location.href = j.url;
    } catch (err) {
      setError(err.message || 'Could not start checkout.');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={load} style={{ border: '1px solid #2a3352', background: 'linear-gradient(180deg, rgba(251,191,36,0.06), transparent 60%), #0d1226', borderRadius: 14, padding: '1.2rem', marginBottom: '1.2rem' }}>
      <h3 style={{ margin: '0 0 0.4rem' }}>Load Wallet</h3>
      <p style={{ color: '#8b91a8', fontSize: '0.82rem', margin: '0 0 0.8rem' }}>
        Add CAD credit for services like billboard ads. Credit is stored value — it is not gold, not aether,
        and not cashable. What you load is what you get: load $20, see $20 credit.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => { setAmount(p); setCustom(''); }}
            style={{
              padding: '0.5rem 0.9rem', borderRadius: 8, border: '1px solid #2a3352',
              background: custom === '' && amount === p ? '#fbbf24' : '#0b0e1a',
              color: custom === '' && amount === p ? '#0b0e1a' : '#e8e6df',
              fontWeight: 700, cursor: 'pointer',
            }}
          >
            {fmt(p)}
          </button>
        ))}
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="Custom $"
          inputMode="decimal"
          style={{ padding: '0.5rem', borderRadius: 8, border: '1px solid #2a3352', background: '#0b0e1a', color: '#e8e6df', fontSize: '1rem', width: 120 }}
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        style={{ padding: '0.7rem 1.4rem', borderRadius: 8, border: 'none', background: '#fbbf24', color: '#0b0e1a', fontWeight: 800, cursor: 'pointer' }}
      >
        {busy ? '…' : `Load ${custom !== '' ? `$${custom || '0'} CAD` : fmt(amount)}`}
      </button>
      {error && <p style={{ color: '#f87171', fontSize: '0.85rem', margin: '0.6rem 0 0' }}>{error}</p>}
    </form>
  );
}
