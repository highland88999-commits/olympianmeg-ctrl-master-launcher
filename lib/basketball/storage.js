// Streetball — high-score storage. Thin wrapper over the shared Supabase
// client. No secrets here; the client reads env vars (see lib/supabase.ts).

import { supabase } from '@/lib/supabase';

const TABLE = 'basketball_scores';
const BASE_COLS = 'id, player_name, score, mode, created_at';

/**
 * True when a Supabase error means the `is_npc` column doesn't exist yet.
 * Kept for the insert path below: NPC backfill inserts first try WITH
 * is_npc and retry WITHOUT it when the column isn't deployed.
 */
function isUnknownColumn(error) {
  if (!error) return false;
  if (error.code === '42703') return true; // Postgres undefined_column
  const msg = String(error.message || '');
  return /is_npc/i.test(msg) && /column/i.test(msg);
}

// NOTE (2026-11-14, scout flaw 9): the reads below select BASE_COLS only —
// NO is_npc. The column does not exist in the live database yet (verified:
// `select ..., is_npc` returns HTTP 400 "column basketball_scores.is_npc
// does not exist", while the same select without it returns 200), and every
// 400 logs a console error on the menu even though the old optimistic
// select + retry still delivered the rows. The column is staged in
// supabase/basketball.sql (needs Merlin's green light to run); once it is
// live, re-add `, is_npc` to both selects below so CPU rivals badge again.
// Rendering already tolerates a missing flag (`s.is_npc` undefined = no badge).
export async function fetchTopScores(limit = 10) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select(BASE_COLS)
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
      .select(`${BASE_COLS}, room_code`)
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
