// World Engine — credits panel (HUD overlay on the 3D engine page).
//
// Replaces the original AuthTerminal: the launcher already owns
// authentication, so this panel only reflects the existing session and shows
// the user's Aether credit balance + free monthly generations. No second
// auth system, no realtime subscription — the balance refreshes on demand.
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatBalance } from '@/lib/world-engine/economy';

export default function CreditsPanel() {
  const [session, setSession] = useState(null);
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCredits = useCallback(async (accessToken) => {
    try {
      const res = await fetch('/api/world-engine/credits', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setCredits(await res.json());
    } catch {
      // Balance stays hidden; synthesis will surface the real error.
    }
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setSession(session);
      if (session) fetchCredits(session.access_token);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return;
      setSession(s);
      if (s) fetchCredits(s.access_token);
      else setCredits(null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [fetchCredits]);

  if (loading) {
    return (
      <div className="border border-[#00ffcc] bg-black/90 p-4 font-mono text-[#00ffcc] text-sm min-w-[250px]">
        <span className="animate-pulse">Checking session...</span>
      </div>
    );
  }

  return (
    <div className="border border-[#00ffcc] bg-black/80 backdrop-blur-md p-5 font-mono text-[#00ffcc] min-w-[280px]">
      <div className="border-b border-[#00ffcc]/50 pb-2 mb-3 flex justify-between items-center">
        <span className="text-xs font-bold tracking-widest">WORLD ENGINE</span>
        <div className={`h-2 w-2 rounded-full ${session ? 'bg-[#00ffcc]' : 'bg-red-500'}`} />
      </div>

      {!session ? (
        <p className="text-xs text-gray-400 leading-relaxed">
          You are browsing as a guest. Sign in from the launcher to use AI
          generation and save your worlds.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col overflow-hidden">
            <span className="text-[10px] text-gray-500 uppercase">Signed in</span>
            <span className="text-sm truncate">{session.user.email}</span>
          </div>

          <div className="flex flex-col bg-[#00ffcc]/10 p-2 border border-[#00ffcc]/30">
            <span className="text-[10px] text-gray-500 uppercase">Aether credits</span>
            <span className="text-xl font-bold">
              {credits ? formatBalance(credits.tokens) : '—'}
            </span>
            {credits && (
              <span className="text-[10px] text-gray-400">
                {credits.freeRemaining} free generations left this month
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => session && fetchCredits(session.access_token)}
              className="flex-1 border border-[#00ffcc]/60 hover:bg-[#00ffcc] hover:text-black transition-all py-1.5 text-xs font-bold tracking-wider"
            >
              Refresh
            </button>
            <Link
              href="/world-engine/credits"
              className="flex-1 text-center border border-[#00ffcc] bg-[#00ffcc]/10 hover:bg-[#00ffcc] hover:text-black transition-all py-1.5 text-xs font-bold tracking-wider"
            >
              Buy credits
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
