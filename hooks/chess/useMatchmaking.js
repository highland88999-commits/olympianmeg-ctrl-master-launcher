import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/chess/supabase';
import {
  kingPicksFromState, withKingPick,
  opponentKingFromState, opponentKingFromMove, validKingPick,
} from '@/lib/chess/king-character';

// Chess PvP transport — database-backed rooms (the proven battleship pattern).
// No Supabase Realtime dependency: moves, state sync, and resign flow through
// the `oasis_rooms` table (game = 'chess') with lightweight polling (~1.5s,
// plenty for turn-based play). Same hook API as the old broadcast version.
//
// WAVE 3: each player's KING pick (their profile character, D1)
// rides the same room row — merged into full_state.kingPicks and
// piggybacked on every last_move (see lib/chess/king-character.js
// for the protocol). No new columns, no new SQL: the picks live
// inside the JSONB the transport already moves.
const POLL_MS = 1500;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function useMatchmaking(username) {
  const [sectorId, setSectorId] = useState(null);
  const [playerColor, setPlayerColor] = useState(null);
  const [opponentMove, setOpponentMove] = useState(null);
  const [opponentResigned, setOpponentResigned] = useState(false);
  const [gameStatus, setGameStatus] = useState('idle');

  const [fullStateSync, setFullStateSync] = useState(null);
  const [hostNeedsToSync, setHostNeedsToSync] = useState(0);

  // WAVE 3: the opponent's king pick (characterId) once the room
  // state testifies to it; null = their king keeps its native figure.
  const [opponentKingId, setOpponentKingId] = useState(null);

  const userIdRef = useRef(null);
  const lastMoveSeqRef = useRef(-1);
  const syncedRef = useRef(false);
  const pollRef = useRef(null);
  const myKingIdRef = useRef(null); // my validated king pick
  const fullStateRef = useRef(null); // last full_state seen or written

  const getUserId = async () => {
    if (userIdRef.current) return userIdRef.current;
    const { data: { user } } = await supabase.auth.getUser();
    userIdRef.current = user?.id || null;
    return userIdRef.current;
  };

  // ---- polling loop: the single source of truth is the room row ----
  useEffect(() => {
    if (!sectorId || !playerColor) return;

    const poll = async () => {
      const { data: room, error } = await supabase
        .from('oasis_rooms')
        .select('player_ids, status, last_move, full_state, resigned_by')
        .eq('game', 'chess')
        .eq('room_code', sectorId)
        .single();
      if (error || !room) return;

      const myColor = playerColor;
      const ids = Array.isArray(room.player_ids) ? room.player_ids : [];

      // Opponent joined → the match is live
      if (ids.length >= 2 && gameStatus !== 'active' && gameStatus !== 'finished') {
        setGameStatus('active');
        if (myColor === 'cyan' && !syncedRef.current) {
          syncedRef.current = true;
          setHostNeedsToSync(Date.now());
        }
      }

      // Guest picks up the host's full board state on join
      if (myColor === 'pink' && room.full_state && !syncedRef.current) {
        syncedRef.current = true;
        setFullStateSync(room.full_state);
        setGameStatus('active');
      }

      // WAVE 3 — king picks riding full_state (protocol in
      // lib/chess/king-character.js): learn the opponent's pick,
      // and self-heal my own pick into any pieces-carrying state
      // that lacks it, so the two writers converge instead of
      // clobbering each other.
      if (room.full_state) {
        fullStateRef.current = room.full_state;
        const oppPick = opponentKingFromState(room.full_state, myColor);
        if (oppPick) setOpponentKingId(oppPick);
        const myPick = validKingPick(myKingIdRef.current);
        if (
          room.full_state.pieces &&
          kingPicksFromState(room.full_state)[myColor] !== myPick
        ) {
          const merged = withKingPick(room.full_state, myColor, myPick);
          fullStateRef.current = merged;
          await supabase
            .from('oasis_rooms')
            .update({ full_state: merged })
            .eq('game', 'chess')
            .eq('room_code', sectorId);
        }
      }

      // Incoming move (dedupe by sequence number)
      const lm = room.last_move;
      if (lm && typeof lm.seq === 'number' && lm.seq > lastMoveSeqRef.current && lm.senderColor !== myColor) {
        lastMoveSeqRef.current = lm.seq;
        setOpponentMove({ pieceId: lm.pieceId, to: lm.to, nextTurn: lm.nextTurn, promotion: lm.promotion || 'queen' });
        // The move also testifies to the mover's king pick.
        const movePick = opponentKingFromMove(lm, myColor);
        if (movePick) setOpponentKingId(movePick);
      }

      // Opponent resigned
      if (room.resigned_by && !opponentResigned) {
        const { data: { user } } = await supabase.auth.getUser();
        if (room.resigned_by !== user?.id) setOpponentResigned(true);
      }

      if (room.status === 'finished') setGameStatus('finished');
    };

    poll();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectorId, playerColor]);

  const hostMatch = async () => {
    const uid = await getUserId();
    if (!uid) return;
    const code = generateRoomCode();
    const { error } = await supabase.from('oasis_rooms').insert([{
      game: 'chess',
      room_code: code,
      host_id: uid,
      player_ids: [uid],
      status: 'waiting',
      min_players: 2,
      max_players: 2,
    }]);
    if (error) return;
    lastMoveSeqRef.current = -1;
    syncedRef.current = false;
    fullStateRef.current = null;
    setOpponentKingId(null);
    setSectorId(code);
    setPlayerColor('cyan');
    setGameStatus('waiting');
  };

  const joinMatch = async (code) => {
    const uid = await getUserId();
    if (!uid || !code) return;
    const clean = code.toUpperCase().trim();
    const { data: room, error } = await supabase
      .from('oasis_rooms')
      .select('player_ids, status, max_players')
      .eq('game', 'chess')
      .eq('room_code', clean)
      .single();
    if (error || !room || room.status !== 'waiting') return;
    const ids = Array.isArray(room.player_ids) ? room.player_ids : [];
    if (ids.includes(uid)) return; // already seated (rejoin)
    if (ids.length >= (room.max_players || 2)) return; // full

    const { error: upErr } = await supabase
      .from('oasis_rooms')
      .update({ player_ids: [...ids, uid], status: 'playing' })
      .eq('game', 'chess')
      .eq('room_code', clean);
    if (upErr) return;

    lastMoveSeqRef.current = -1;
    syncedRef.current = false;
    fullStateRef.current = null;
    setOpponentKingId(null);
    setSectorId(clean);
    setPlayerColor('pink');
    setGameStatus('waiting'); // flips to active once the host's state arrives
  };

  // Adopt a room created elsewhere (e.g. the OASIS lobby) instead of
  // creating one. The poll loop takes over from here — same transport.
  const adoptRoom = async (code, color) => {
    const uid = await getUserId();
    if (!uid || !code) return false;
    const clean = code.toUpperCase().trim();
    const { data: room, error } = await supabase
      .from('oasis_rooms')
      .select('status, last_move')
      .eq('game', 'chess')
      .eq('room_code', clean)
      .single();
    if (error || !room) return false;
    lastMoveSeqRef.current = (room.last_move && typeof room.last_move.seq === 'number') ? room.last_move.seq : -1;
    syncedRef.current = false;
    fullStateRef.current = null;
    setOpponentKingId(null);
    setOpponentMove(null);
    setOpponentResigned(false);
    setFullStateSync(null);
    setSectorId(clean);
    setPlayerColor(color);
    setGameStatus('waiting');
    return true;
  };

  const updateRoom = async (patch) => {    if (!sectorId) return;
    await supabase
      .from('oasis_rooms')
      .update(patch)
      .eq('game', 'chess')
      .eq('room_code', sectorId);
  };

  const broadcastMove = async (pieceId, tx, tz, nextTurn, promotion = 'queen') => {
    const seq = lastMoveSeqRef.current + 1;
    lastMoveSeqRef.current = seq;
    await updateRoom({
      // kingId: the mover's king pick rides every move (WAVE 3).
      last_move: { seq, pieceId, to: { x: tx, z: tz }, nextTurn, senderColor: playerColor, promotion, kingId: validKingPick(myKingIdRef.current) },
      current_turn: nextTurn,
    });
  };

  const broadcastState = (pieces, currentTurn) => {
    // My king pick is merged into the state channel; an opponent
    // pick already present in the last seen state is preserved.
    const fs = withKingPick(
      { ...(fullStateRef.current || {}), pieces, currentTurn },
      playerColor,
      myKingIdRef.current
    );
    fullStateRef.current = fs;
    updateRoom({ full_state: fs });
  };

  // WAVE 3 — the page hands the hook the player's king pick (the
  // pick chain's effective id, or null for the native king). Stored
  // for the broadcast channels; if a pieces-carrying full_state
  // already exists, the pick is merged in immediately — the poll
  // self-heal covers every other ordering.
  const publishKingPick = (characterId) => {
    myKingIdRef.current = validKingPick(characterId);
    const fs = fullStateRef.current;
    if (fs && fs.pieces && playerColor) {
      const merged = withKingPick(fs, playerColor, myKingIdRef.current);
      fullStateRef.current = merged;
      updateRoom({ full_state: merged });
    }
  };

  const broadcastResign = async () => {
    const uid = await getUserId();
    setGameStatus('finished');
    await updateRoom({ resigned_by: uid, status: 'finished' });
  };

  return {
    sectorId, playerColor, gameStatus, opponentMove, opponentResigned,
    hostMatch, joinMatch, adoptRoom, broadcastMove, broadcastResign,
    broadcastState, fullStateSync, hostNeedsToSync,
    opponentKingId, publishKingPick
  };
}
