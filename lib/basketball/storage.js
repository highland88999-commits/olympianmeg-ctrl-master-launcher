// Streetball — high-score storage. Thin wrapper over the shared Supabase
// client. No secrets here; the client reads env vars (see lib/supabase.ts).

import { supabase } from '@/lib/supabase';

const TABLE = 'basketball_scores';

export async function fetchTopScores(limit = 10) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, player_name, score, mode, created_at')
      .order('score', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return { scores: data || [], error: null };
  } catch (error) {
    return { scores: [], error };
  }
}

/** Room-party leaderboard: scores tagged with an OASIS room code. */
export async function fetchRoomScores(roomCode, limit = 10) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, player_name, score, mode, created_at')
      .eq('room_code', String(roomCode || '').toUpperCase())
      .order('score', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return { scores: data || [], error: null };
  } catch (error) {
    return { scores: [], error };
  }
}

export function sanitizeName(name) {
  const clean = String(name || '')
    .replace(/[<>"'&]/g, '')
    .trim()
    .slice(0, 24);
  return clean || 'PLAYER';
}

export async function submitScore({ playerName, score, mode, roomCode }) {
  const player_name = sanitizeName(playerName);
  const safeScore = Math.max(0, Math.min(500, Math.floor(Number(score) || 0)));
  const safeMode = mode === 'freeplay' ? 'freeplay' : 'shootout';
  const row = { player_name, score: safeScore, mode: safeMode };
  if (roomCode) row.room_code = String(roomCode).toUpperCase().slice(0, 6);
  try {
    const { error } = await supabase
      .from(TABLE)
      .insert([row]);
    if (error) throw error;
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error };
  }
}
