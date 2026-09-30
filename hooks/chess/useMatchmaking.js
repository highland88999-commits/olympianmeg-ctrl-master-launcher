import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/chess/supabase';

// Chess PvP transport — database-backed rooms (the proven battleship pattern).
// No Supabase Realtime dependency: moves, state sync, and resign flow through
// the `oasis_rooms` table (game = 'chess') with lightweight polling (~1.5s,
// plenty for turn-based play). Same hook API as the old broadcast version.
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

  const userIdRef = useRef(null);
  const lastMoveSeqRef = useRef(-1);
  const syncedRef = useRef(false);
  const pollRef = useRef(null);

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

      // Incoming move (dedupe by sequence number)
      const lm = room.last_move;
      if (lm && typeof lm.seq === 'number' && lm.seq > lastMoveSeqRef.current && lm.senderColor !== myColor) {
        lastMoveSeqRef.current = lm.seq;
        setOpponentMove({ pieceId: lm.pieceId, to: lm.to, nextTurn: lm.nextTurn, promotion: lm.promotion || 'queen' });
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
      last_move: { seq, pieceId, to: { x: tx, z: tz }, nextTurn, senderColor: playerColor, promotion },
      current_turn: nextTurn,
    });
  };

  const broadcastState = (pieces, currentTurn) => {
    updateRoom({ full_state: { pieces, currentTurn } });
  };

  const broadcastResign = async () => {
    const uid = await getUserId();
    setGameStatus('finished');
    await updateRoom({ resigned_by: uid, status: 'finished' });
  };

  return {
    sectorId, playerColor, gameStatus, opponentMove, opponentResigned,
    hostMatch, joinMatch, adoptRoom, broadcastMove, broadcastResign,
    broadcastState, fullStateSync, hostNeedsToSync
  };
}
