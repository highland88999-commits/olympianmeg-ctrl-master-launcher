// Battleship — OASIS deep-link joiner (adapter UI).
// Reads /battleship?code=XXXXXX on load and auto-joins the linked lobby:
// the guest is seated in the OASIS room row AND the native battleship row,
// then dropped straight into the battle (fleet-setup screen) with the
// untouched native Realtime sync. Renders nothing on a normal visit;
// failures surface as a dismissible notice over the native lobby.
'use client';

import { useCallback, useState } from 'react';
import { supabase } from '@/lib/battleship/supabase';
import { useGameStore } from '@/store/battleship/useGameStore';
import { useOasisJoinLink } from '@/hooks/oasis/useJoinLink';
import { joinLinkedLobby } from '@/lib/battleship/oasis-adapter';

export default function OasisDeepLinkJoiner({ userId }) {
  const setGameMode = useGameStore((state) => state.setGameMode);
  const setRoomId = useGameStore((state) => state.setRoomId);
  const [joining, setJoining] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const attemptJoin = useCallback(async (code) => {
    setJoining(true);
    setErrorMsg('');
    const { code: joined, error } = await joinLinkedLobby(supabase, { code, userId });
    if (error) {
      setErrorMsg(error);
      setJoining(false);
      return;
    }
    setGameMode('pvp');
    setRoomId(joined, false);
  }, [userId, setGameMode, setRoomId]);

  useOasisJoinLink(attemptJoin, !!userId);

  if (!joining && !errorMsg) return null;

  return (
    <div className="absolute z-30 top-20 left-1/2 -translate-x-1/2 w-[min(420px,90vw)]">
      <div className="flex flex-col items-center gap-3 p-5 bg-zinc-950/95 border border-fuchsia-500/40 rounded-lg shadow-[0_0_30px_rgba(255,0,255,0.2)]">
        {joining && !errorMsg && (
          <p className="text-xs font-bold tracking-[0.25em] uppercase text-cyan-400 animate-pulse">
            Joining battle…
          </p>
        )}
        {errorMsg && (
          <>
            <p className="text-xs tracking-widest uppercase text-red-400 text-center">{errorMsg}</p>
            <p className="text-[10px] tracking-widest uppercase text-zinc-500 text-center">
              Ask your host for a fresh code, or join manually below.
            </p>
            <button
              onClick={() => { setErrorMsg(''); setJoining(false); }}
              className="px-4 py-2 text-[10px] font-bold tracking-widest uppercase text-zinc-300 border border-zinc-700 rounded hover:text-white hover:border-zinc-400"
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}
