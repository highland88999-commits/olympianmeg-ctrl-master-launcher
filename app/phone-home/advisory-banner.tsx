'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  ADVISORY_KEY,
  ADVISORY_COPY,
  loadDismissal,
  recordDismissal,
} from '@/lib/advisory';

// TravelAdvisoryBanner — temporary, dismissible advisory shown near the top
// of /phone-home, below the header.
//
// - Dismissal is persisted PER USER in Supabase (advisory_dismissals,
//   keyed by ADVISORY_KEY) — see lib/advisory.js for the full design.
// - "Temporary" is handled by the key: retiring or replacing the advisory
//   is an admin-side data change (delete rows / publish a new key), never
//   a code change.
// - While the cloud is unreachable, dismissal falls back to a
//   device-local flag; the banner may reappear on another device until the
//   cloud record lands.
// - No entrance animation or transitions (nothing to fight
//   prefers-reduced-motion); the banner sits in normal flow so it never
//   breaks page scrolling or safe-area clearance.

type BannerState = 'loading' | 'visible' | 'hidden';

export default function TravelAdvisoryBanner() {
  const [state, setState] = useState<BannerState>('loading');

  useEffect(() => {
    let alive = true;
    (async () => {
      let userId: string | null = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        userId = session?.user?.id ?? null;
      } catch {
        // Unconfigured/unreachable Supabase — loadDismissal degrades to
        // the localStorage fallback on its own.
      }
      const dismissal = await loadDismissal(supabase as any, userId, ADVISORY_KEY);
      if (alive) setState(dismissal ? 'hidden' : 'visible');
    })();
    return () => { alive = false; };
  }, []);

  const handleDismiss = async () => {
    setState('hidden'); // hide immediately; persistence happens quietly
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await recordDismissal(supabase as any, session?.user?.id ?? null, ADVISORY_KEY);
    } catch {
      // recordDismissal already never throws; this is belt and suspenders.
    }
  };

  if (state !== 'visible') return null;

  return (
    <div className="w-full max-w-md px-6 z-10">
      <div
        role="note"
        aria-label="Travel and emergency advisory"
        className="mt-2 rounded-xl border border-white/15 bg-black/50 backdrop-blur-md px-4 py-3 flex items-start gap-3"
      >
        <p className="flex-1 text-[11px] leading-relaxed text-slate-300">
          {ADVISORY_COPY}
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss advisory"
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/15 text-[10px] uppercase tracking-widest text-slate-400 hover:text-slate-100 hover:border-slate-300 transition-colors"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Dismiss</span>
        </button>
      </div>
    </div>
  );
}
