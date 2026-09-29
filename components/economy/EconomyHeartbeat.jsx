// components/economy/EconomyHeartbeat.jsx
// Client-side engagement heartbeat. Mounted once in the root layout.
// Every HEARTBEAT_INTERVAL_MS it reports "user is here and active" — the
// SERVER decides whether that earns gold (one accrual per 60s window,
// daily cap). Guests are ignored quietly; failures are soft.

'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ECONOMY } from '@/lib/economy/config';

export default function EconomyHeartbeat() {
  useEffect(() => {
    let lastActivity = Date.now();
    let stopped = false;
    const mark = () => { lastActivity = Date.now(); };
    const events = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));

    const beat = async () => {
      if (stopped || document.hidden) return;
      if (Date.now() - lastActivity > ECONOMY.HEARTBEAT_ACTIVE_WINDOW_MS) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { stopped = true; return; } // not signed in: stop quietly
        await fetch('/api/economy/heartbeat', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      } catch {
        // Soft fail — the next minute's beat will try again.
      }
    };

    const iv = setInterval(beat, ECONOMY.HEARTBEAT_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(iv);
      events.forEach((e) => window.removeEventListener(e, mark));
    };
  }, []);
  return null;
}
