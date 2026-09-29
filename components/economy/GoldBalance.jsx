// components/economy/GoldBalance.jsx
// Small gold-balance readout. Fetches on mount and exposes a refresh() so
// pages can update it after earning (e.g. after a mining claim).
// Renders nothing for guests or when the service is offline.

'use client';

import { useEffect, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { formatGold } from '@/lib/economy/config';

const GoldBalance = forwardRef(function GoldBalance({ style, label = 'GOLD', hideWhenZero = true }, ref) {
  const [gold, setGold] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setGold(0); return; }
      const res = await fetch('/api/economy/balance', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setGold(d.gold ?? 0);
      }
    } catch {
      // stay silent — gold is a bonus, never a blocker
    }
  }, []);

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  if (gold === null) return null; // still loading
  if (gold <= 0 && hideWhenZero) return null;
  return (
    <span style={style} title="In-house credit. Earn it by playing; spend it for dollars off at checkout.">
      🪙{label ? ` ${label}: ` : ' '}{formatGold(gold)}
    </span>
  );
});

export default GoldBalance;
