// Battleship — OASIS-linked host panel (adapter UI).
// Sits inside the native Lobby untouched: the existing "Host Multiplayer
// Game" button keeps its own code flow. This panel creates a LINKED lobby —
// the same 6-char code lives in olympus_battleship_rooms AND oasis_rooms —
// and shows the universal OASIS ShareRoomCode control so the host can copy
// or share a /battleship?code=XXXXXX deep link.
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/battleship/supabase';
import { useGameStore } from '@/store/battleship/useGameStore';
import { createLinkedLobby } from '@/lib/battleship/oasis-adapter';
import ShareRoomCode from '@/components/oasis/ShareRoomCode';
import { getGame } from '@/lib/oasis/games';

const game = getGame('battleship');
const THEME = (game && game.theme) || {};

export default function OasisLinkedHost() {
  const setGameMode = useGameStore((state) => state.setGameMode);
  const setRoomId = useGameStore((state) => state.setRoomId);
  const [code, setCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleHost = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setErrorMsg('Sign in to host.');
        setLoading(false);
        return;
      }
      const { code: fresh } = await createLinkedLobby(supabase, { userId: user.id });
      setCode(fresh);
    } catch (e) {
      setErrorMsg((e && e.message) || 'Could not create a shareable battle.');
    }
    setLoading(false);
  };

  const enterBattle = () => {
    setGameMode('pvp');
    setRoomId(code, true);
  };

  if (!code) {
    return (
      <div className="flex flex-col w-full gap-2">
        <button
          onClick={handleHost}
          disabled={loading}
          className="w-full px-6 py-4 text-sm font-bold tracking-widest text-cyan-400 uppercase transition-all border border-cyan-500/50 bg-cyan-950/20 hover:bg-cyan-900/40 hover:shadow-[0_0_20px_rgba(0,242,255,0.3)] disabled:opacity-50"
        >
          {loading ? 'OPENING ROOM…' : 'Host with Share Code'}
        </button>
        {errorMsg && <p className="text-xs text-center text-red-500 animate-pulse">{errorMsg}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full gap-4">
      <ShareRoomCode
        gameSlug="battleship"
        code={code}
        codeLabel={(game && game.codeLabel) || 'FLEET CODE'}
        shareTitle={(game && game.shareTitle) || 'Battleship'}
        shareText={game && typeof game.shareText === 'function' ? game.shareText(code) : undefined}
        theme={THEME}
      />
      <button
        onClick={enterBattle}
        className="w-full px-6 py-4 text-sm font-black tracking-widest text-fuchsia-300 uppercase transition-all border border-fuchsia-500/60 bg-fuchsia-950/30 hover:bg-fuchsia-900/50 hover:shadow-[0_0_20px_rgba(255,0,255,0.35)]"
      >
        Enter Fleet Setup →
      </button>
      <p className="text-[10px] tracking-widest uppercase text-zinc-600 text-center">
        Share the code — your rival jumps straight into your battle from the link.
      </p>
    </div>
  );
}
