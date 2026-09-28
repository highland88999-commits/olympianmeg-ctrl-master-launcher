// Streetball — high-score storage. Thin wrapper over the shared Supabase
// client. No secrets here; the client reads env vars (see lib/supabase.ts).

import { supabase } from '@/lib/supabase';

const TABLE = 'basketball_scores';
const BASE_COLS = 'id, player_name, score, mode, created_at';

/**
 * True when a Supabase error means the `is_npc` column doesn't exist yet.
 * The column is queued for the final consolidated SQL; until then the
 * queries below retry without it so real score submission never breaks.
 */
function isUnknownColumn(error) {
  if (!error) return false;
  if (error.code === '42703') return true; // Postgres undefined_column
  const msg = String(error.message || '');
  return /is_npc/i.test(msg) && /column/i.test(msg);
}

export async function fetchTopScores(limit = 10) {
  try {
    let { data, error } = await supabase
      .from(TABLE)
      .select(`${BASE_COLS}, is_npc`)
      .order('score', { ascending: false })
      .limit(limit);
    if (error && isUnknownColumn(error)) {
      ({ data, error } = await supabase
        .from(TABLE)
        .select(BASE_COLS)
        .order('score', { ascending: false })
        .limit(limit));
    }
    if (error) throw error;
    return { scores: data || [], error: null };
  } catch (error) {
    return { scores: [], error };
  }
}

/** Room-party leaderboard: scores tagged with an OASIS room code. */
export async function fetchRoomScores(roomCode, limit = 10) {
  try {
    let { data, error } = await supabase
      .from(TABLE)
      .select(`${BASE_COLS}, is_npc`)
      .eq('room_code', String(roomCode || '').toUpperCase())
      .order('score', { ascending: false })
      .limit(limit);
    if (error && isUnknownColumn(error)) {
      ({ data, error } = await supabase
        .from(TABLE)
        .select(BASE_COLS)
        .eq('room_code', String(roomCode || '').toUpperCase())
        .order('score', { ascending: false })
        .limit(limit));
    }
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

/**
 * isNpc: pass true for backfilled/simulated CPU rival scores so the
 * leaderboard can badge them. The insert first tries WITH is_npc; if the
 * column isn't deployed yet it retries WITHOUT it — never breaking a save.
 */
export async function submitScore({ playerName, score, mode, roomCode, isNpc }) {
  const player_name = sanitizeName(playerName);
  const safeScore = Math.max(0, Math.min(500, Math.floor(Number(score) || 0)));
  const safeMode = mode === 'freeplay' ? 'freeplay' : 'shootout';
  const row = { player_name, score: safeScore, mode: safeMode };
  if (roomCode) row.room_code = String(roomCode).toUpperCase().slice(0, 6);
  const insertRow = isNpc ? { ...row, is_npc: true } : row;
  try {
    let { error } = await supabase
      .from(TABLE)
      .insert([insertRow]);
    if (error && isNpc && isUnknownColumn(error)) {
      ({ error } = await supabase
        .from(TABLE)
        .insert([row]));
    }
    if (error) throw error;
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error };
  }
}
