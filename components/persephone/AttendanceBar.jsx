// components/persephone/AttendanceBar.jsx
// Honest attendance for the PERSEPHONE hall.
//
// Real presence only: wires lib/presence.js against the `presence` table
// (sector 'persephone:hall') and reports the live peer list upward.
// - Peers present  -> "N people in the hall right now" (a real count).
// - Joined, nobody else -> "Doors open — you're the first one here."
// - Presence unavailable (no Supabase env, or the presence table isn't live
//   yet — its SQL is still a draft) -> we SAY SO, and show no fake number.
//
// No simulated crowd. No fake "LIVE" viewers. Ever.

'use client';

import { useEffect, useRef, useState } from 'react';
import { createPresenceClient } from '@/lib/presence';
import { fx } from '@/lib/fx';

export default function AttendanceBar({ onPeers }) {
  const [status, setStatus] = useState('checking'); // checking | live | solo | offline
  const [count, setCount] = useState(0);
  const clientRef = useRef(null);
  const doorFxRef = useRef(false); // door-entry FX fires once per visit

  useEffect(() => {
    let cancelled = false;
    let client = null;

    (async () => {
      let supabase = null;
      try {
        const mod = await import('@/lib/supabase');
        supabase = mod.supabase;
      } catch {
        supabase = null;
      }
      if (cancelled) return;

      client = createPresenceClient(supabase, {
        sector: 'persephone:hall',
        label: 'Guest',
        color: '#ffd700',
        onPeers: (peers) => {
          if (cancelled) return;
          setCount(peers.length);
          setStatus(peers.length > 0 ? 'live' : 'solo');
          try { onPeers?.(peers); } catch { /* host callback must never break us */ }
        },
        onChange: ({ available }) => {
          if (cancelled) return;
          if (!available) {
            setStatus('offline');
            try { onPeers?.([]); } catch { /* noop */ }
          }
        },
      });
      clientRef.current = client;
      const joined = await client.join();
      if (cancelled) return;
      if (!joined || !client.available) {
        setStatus('offline');
        try { onPeers?.([]); } catch { /* noop */ }
      } else {
        setStatus('solo');
        // Door entry: the user walked into the hall. Once per visit —
        // peer updates don't re-fire.
        if (!doorFxRef.current) { doorFxRef.current = true; fx.doorEntry(); }
      }
    })();

    return () => {
      cancelled = true;
      try { clientRef.current?.leave(); } catch { /* best effort */ }
      try { clientRef.current?.dispose(); } catch { /* noop */ }
      clientRef.current = null;
    };
  }, [onPeers]);

  return (
    <div className="w-full rounded-xl border border-[#3a2f1a] bg-[#0e0b07]/90 px-4 py-3" role="status" aria-live="polite">
      {status === 'checking' && (
        <p className="text-sm text-[#a89a78]">Checking who&apos;s in the hall…</p>
      )}
      {status === 'live' && (
        <p className="text-sm text-[#e8d9b0]">
          <span className="font-bold text-[#ffd700]">{count}</span>{' '}
          {count === 1 ? 'person is' : 'people are'} in the hall right now — a live count, not a guess.
        </p>
      )}
      {status === 'solo' && (
        <p className="text-sm text-[#a89a78]">Doors open — you&apos;re the first one here. Nobody else has walked in yet.</p>
      )}
      {status === 'offline' && (
        <p className="text-sm text-[#a89a78]">
          Live headcount isn&apos;t connected yet, so we won&apos;t invent a number. The hall is open — walk in anyway.
        </p>
      )}
    </div>
  );
}
