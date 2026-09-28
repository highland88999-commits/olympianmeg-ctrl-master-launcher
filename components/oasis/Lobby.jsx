// OASIS Lobby — one lobby for every PvP game. Grown from the working
// battleship lobby: host a room, join by 6-char code, or go solo.
// Merlin's min-max rule lives here: when the host starts short of the
// minimum, NPC rivals backfill the roster automatically.
//
// Props:
//   gameSlug  — 'chess' | 'basketball' | 'colosseum'
//   supabase  — supabase client
//   userId    — current user id
//   callsign  — display name for the roster
//   stats     — player per-game stats (for boss unlocks)
//   onLaunch  — ({ mode, room, roster, boss }) => void — the game mounts its
//               existing engine from here. The lobby never rebuilds a game.
//   onExit    — () => void
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getGame } from '@/lib/oasis/games';
import {
  createRoom, joinRoom, setRoomStatus, setRoomNpcs, subscribeToRoom,
  normalizeCode, isValidRoomCode, ROOM_STATUS,
} from '@/lib/oasis/rooms';
import { fillParty, needsBackfill } from '@/lib/oasis/party';
import { getNpc, pickBackfill } from '@/lib/oasis/npcs';
import { bossesForGame, bossEligible } from '@/lib/oasis/bosses';
import ShareRoomCode from '@/components/oasis/ShareRoomCode';
import NpcPicker from '@/components/oasis/NpcPicker';
import RosterPanel from '@/components/oasis/RosterPanel';
import { useOasisJoinLink } from '@/hooks/oasis/useJoinLink';

export default function OasisLobby({ gameSlug, supabase, userId, callsign = 'PLAYER', stats = {}, onLaunch, onExit }) {
  const game = getGame(gameSlug);
  const [view, setView] = useState('menu'); // menu | waiting | joining
  const [room, setRoom] = useState(null);
  const [joinInput, setJoinInput] = useState('');
  const [npcIds, setNpcIds] = useState([]);
  const [bossId, setBossId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const theme = game?.theme || {};
  const bosses = useMemo(() => bossesForGame(gameSlug), [gameSlug]);

  const fail = (msg) => { setErrorMsg(msg); setLoading(false); };

  const handleHost = async () => {
    setLoading(true); setErrorMsg('');
    try {
      const fresh = await createRoom(supabase, {
        game: gameSlug, hostId: userId,
        minPlayers: game.minPlayers, maxPlayers: game.maxPlayers,
      });
      setRoom(fresh);
      setNpcIds([]);
      setBossId(null);
      setView('waiting');
    } catch (e) { fail('Could not create a room. Try again.'); }
    setLoading(false);
  };

  const handleJoin = async (codeArg) => {
    const code = normalizeCode(codeArg || joinInput);
    if (!isValidRoomCode(code)) { setErrorMsg('Enter a valid 6-character code.'); return; }
    setLoading(true); setErrorMsg('');
    const { room: joined, error } = await joinRoom(supabase, { code, playerId: userId });
    if (error) { fail(error === 'Room is full.' ? 'That room is full.' : 'Room not found or already started.'); return; }
    setLoading(false);
    // Guest jumps straight into the match with the room's current roster.
    launchFromRoom(joined, null);
  };

  const handleNpcSolo = async () => {
    // Solo vs NPCs: no room needed, roster is you + backfill to the minimum.
    const pool = pickBackfill({ gameSlug, count: game.minPlayers - 1, tier: 'rookie' });
    const { roster } = fillParty({
      humans: [userId], npcs: [], minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers, npcPool: pool,
    });
    onLaunch && onLaunch({ mode: 'npc', room: null, roster, boss: null });
  };

  const handleBossFight = async (boss) => {
    if (!bossEligible(boss.id, stats)) return;
    const { roster } = fillParty({
      humans: [userId], npcs: [], minPlayers: 2, maxPlayers: 2,
      npcPool: [getNpc(boss.npcId)].filter(Boolean),
    });
    onLaunch && onLaunch({ mode: 'boss', room: null, roster, boss });
  };

  const toggleNpc = (id) => {
    setNpcIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const launchFromRoom = async (roomRow, boss) => {
    const humans = (roomRow.player_ids || []).map((id) => id);
    const chosenNpcs = (npcIds.map(getNpc).filter(Boolean));
    // Backfill to the minimum when humans fall short — the min-max rule.
    const pool = pickBackfill({
      gameSlug, count: game.minPlayers, tier: 'rookie',
      excludeIds: chosenNpcs.map((n) => n.id),
    });
    const { roster } = fillParty({
      humans, npcs: chosenNpcs, minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers, npcPool: pool,
    });
    try {
      await setRoomNpcs(supabase, roomRow.room_code, roster.filter((s) => s.kind === 'npc').map((s) => s.id));
      await setRoomStatus(supabase, roomRow.room_code, ROOM_STATUS.PLAYING);
    } catch { /* non-fatal: the match still launches locally */ }
    onLaunch && onLaunch({ mode: 'pvp', room: roomRow, roster, boss: boss || null });
  };

  const handleStart = () => launchFromRoom(room, bossId ? bosses.find((b) => b.id === bossId) : null);

  const humans = (room?.player_ids || []).map((id, i) => ({
    id, label: i === 0 ? (callsign || 'HOST') : `PLAYER ${i + 1}`,
  }));

  // Deep-link auto-join: /<game>?code=XXXXXX jumps straight into join flow.
  useOasisJoinLink((code) => { setJoinInput(code); handleJoinRef.current(code); }, !!userId);
  const handleJoinRef = useRef(handleJoin);
  handleJoinRef.current = handleJoin;

  // Host: live roster updates from guests joining.
  useEffect(() => {
    if (view !== 'waiting' || !room) return undefined;
    return subscribeToRoom(supabase, room.room_code, (fresh) => setRoom(fresh));
  }, [view, room?.room_code, supabase]);

  if (!game) return null;

  return (
    <div className="absolute z-20 flex items-center justify-center w-full h-full bg-black/90 backdrop-blur-md p-4 overflow-y-auto">
      <div className={`flex flex-col items-center gap-6 p-6 sm:p-10 bg-zinc-950 border rounded-xl w-[520px] max-w-full my-auto ${theme.accentBorder} ${theme.glow}`}>
        <div className="text-center">
          <h1 className={`text-3xl sm:text-4xl font-black tracking-[0.2em] mb-2 uppercase ${theme.accentText}`}>{game.name}</h1>
          <p className="text-xs tracking-widest text-zinc-500 uppercase">{game.tagline}</p>
          <p className="text-[10px] tracking-widest text-zinc-600 uppercase mt-1">
            {game.minPlayers}–{game.maxPlayers} players · NPCs fill empty seats
          </p>
        </div>

        {view === 'menu' && (
          <div className="flex flex-col w-full gap-3">
            <button onClick={handleNpcSolo} disabled={loading}
              className={`w-full px-6 py-4 text-sm font-bold tracking-widest uppercase transition-all border ${theme.secondaryBorder} ${theme.secondaryText} bg-white/5 hover:bg-white/10 disabled:opacity-50`}>
              Quick Match vs NPC Rivals
            </button>
            {!userId && (
              <p className="text-[11px] text-zinc-500 tracking-widest uppercase text-center">
                Sign in to host or join rooms — Quick Match and boss fights work as a guest.
              </p>
            )}
            <button onClick={handleHost} disabled={loading || !userId}
              className={`w-full px-6 py-4 text-sm font-bold tracking-widest uppercase transition-all border ${theme.accentBorder} ${theme.accentText} ${theme.accentBg} ${theme.accentHover} disabled:opacity-50`}>
              {loading ? 'OPENING ROOM…' : 'Host Multiplayer Room'}
            </button>
            <div className="flex gap-2">
              <input type="text" placeholder="ENTER 6-CHARACTER CODE" maxLength={6}
                value={joinInput} onChange={(e) => setJoinInput(normalizeCode(e.target.value))} disabled={loading || !userId}
                className="w-full px-4 py-3 font-mono text-center text-white uppercase tracking-[0.2em] transition-all bg-black border outline-none border-zinc-700 focus:border-zinc-400 placeholder:text-zinc-600 disabled:opacity-50" />
              <button onClick={() => handleJoin()} disabled={joinInput.length !== 6 || loading || !userId}
                className="px-6 font-bold tracking-widest text-white transition-all border disabled:opacity-50 disabled:cursor-not-allowed border-zinc-500 hover:bg-white hover:text-black">
                JOIN
              </button>
            </div>

            {bosses.length > 0 && (
              <div className="flex flex-col gap-2 mt-2 pt-4 border-t border-zinc-800">
                <h3 className="text-xs font-bold tracking-widest uppercase text-red-400">BOSS FIGHTS</h3>
                {bosses.map((boss) => {
                  const unlocked = bossEligible(boss.id, stats);
                  return (
                    <button key={boss.id} onClick={() => unlocked && handleBossFight(boss)} disabled={!unlocked}
                      className={`text-left px-4 py-3 border rounded transition-all ${unlocked ? 'border-red-500/50 hover:bg-red-500/10' : 'border-zinc-800 opacity-50 cursor-not-allowed'}`}>
                      <div className="text-sm font-black tracking-widest uppercase text-red-300">{boss.name}</div>
                      <p className="text-[11px] text-zinc-500 mt-1">{unlocked ? boss.tagline : `Locked — ${boss.unlock.description}`}</p>
                    </button>
                  );
                })}
              </div>
            )}

            {errorMsg && <p className="text-xs text-center text-red-500 animate-pulse">{errorMsg}</p>}
            {onExit && (
              <button onClick={onExit} className="text-xs tracking-widest uppercase text-zinc-600 hover:text-zinc-300 mt-1">
                Back
              </button>
            )}
          </div>
        )}

        {view === 'waiting' && room && (
          <div className="flex flex-col w-full gap-4">
            <RosterPanel humans={humans} npcIds={npcIds} minPlayers={game.minPlayers} maxPlayers={game.maxPlayers} theme={theme} hostLabel={callsign || 'YOU'} />
            <ShareRoomCode gameSlug={gameSlug} code={room.room_code} codeLabel={game.codeLabel}
              shareTitle={game.shareTitle} shareText={game.shareText(room.room_code)} theme={theme} />
            <NpcPicker gameSlug={gameSlug} selected={npcIds} maxSelect={game.maxPlayers - 1} onToggle={toggleNpc} theme={theme} title="SEAT NPC RIVALS" />
            <button onClick={handleStart} disabled={loading}
              className={`w-full px-6 py-4 text-sm font-black tracking-widest uppercase transition-all border ${theme.accentBorder} ${theme.accentText} ${theme.accentBg} ${theme.accentHover} disabled:opacity-50`}>
              {needsBackfill(humans.length, game.minPlayers) ? 'START — NPCS WILL FILL IN' : 'START MATCH'}
            </button>
            {errorMsg && <p className="text-xs text-center text-red-500 animate-pulse">{errorMsg}</p>}
            <button onClick={() => setView('menu')} className="text-xs tracking-widest uppercase text-zinc-600 hover:text-zinc-300">
              Back to menu
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
