// components/economy/GoldCheckoutOption.jsx
// "Use my gold" option for checkout pages. Plain English, no amounts sent —
// the client only reports the toggle; the server prices everything.
// Renders nothing for guests, while loading, or when the service is offline.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { computeGoldDiscount, formatGold } from '@/lib/economy/config';

function dollars(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function GoldCheckoutOption({ totalCents, checked, onToggle, style }) {
  const [gold, setGold] = useState(null);
  const [internal, setInternal] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const useGold = checked ?? internal;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;
        const res = await fetch('/api/economy/balance', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (cancelled) return;
        if (res.ok) {
          const d = await res.json();
          setGold(d.gold ?? 0);
        } else {
          setUnavailable(true);
        }
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (unavailable || gold === null || gold <= 0 || !Number.isInteger(totalCents) || totalCents <= 0) {
    return null;
  }

  const d = computeGoldDiscount(gold, totalCents);
  if (d.goldToSpend <= 0) return null;

  const toggle = () => {
    const next = !useGold;
    if (checked === undefined) setInternal(next);
    onToggle?.(next);
  };

  return (
    <div style={{ border: '1px solid rgba(255,211,77,0.4)', borderRadius: 10, padding: 12, fontSize: 13, ...style }}>
      <div style={{ color: '#e8cf8a', marginBottom: 8 }}>
        🪙 You have <strong style={{ color: '#ffd34d' }}>{formatGold(gold)}</strong>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', color: '#fff3d6' }}>
        <input type="checkbox" checked={useGold} onChange={toggle} style={{ marginTop: 3, accentColor: '#ffd34d' }} />
        <span>
          Use <strong style={{ color: '#ffd34d' }}>{d.goldToSpend.toLocaleString('en-US')} gold</strong>
          {' '}for <strong style={{ color: '#ffd34d' }}>{dollars(d.discountCents)} off</strong> this order.
          {d.paidByGold ? (
            <span> That covers the whole bill — <strong>no card needed.</strong></span>
          ) : (
            <span> Your card is charged {dollars(d.chargeCents)}.</span>
          )}
        </span>
      </label>
      {!d.paidByGold && d.chargeCents === 50 && d.discountCents < totalCents && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#8a7648' }}>
          Card charges can&apos;t go below $0.50, so a little less gold is applied.
        </div>
      )}
    </div>
  );
}
