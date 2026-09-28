// Raptor Rush — high-score storage. Thin wrapper over the shared Supabase
// client. No secrets here; the client reads env vars (see lib/supabase.ts).
//
// The `raptor_rush_scores` table ships with the final consolidated Supabase
// SQL at the end of the project; until it exists the calls below degrade
// gracefully to localStorage-only bests (the page says so honestly).

import { supabase } from '@/lib/supabase';

const TABLE = 'raptor_rush_scores';
const BASE_COLS = 'id, player_name, score, rabbits, mode, created_at';

/** True when a Supabase error means the table/column doesn't exist yet. */
function isMissingRelation(error) {
  if (!error) return false;
  if (error.code === '42P01' || error.code === '42703') return true; // undefined_table / undefined_column
  const msg = String(error.message || '').toLowerCase();
  return /relation .* does not exist/.test(msg) || /column .* does not exist/.test(msg);
}

export async function fetchTopScores(limit = 10) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select(BASE_COLS)
      .eq('mode', 'solo')
      .order('score', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return { scores: data || [], error: null };
  } catch (error) {
    return { scores: [], error, missing: isMissingRelation(error) };
  }
}

/** Room-party leaderboard: scores tagged with an OASIS room code. */
export async function fetchRoomScores(roomCode, limit = 10) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select(BASE_COLS)
      .eq('room_code', String(roomCode || '').toUpperCase())
      .order('score', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return { scores: data || [], error: null };
  } catch (error) {
    return { scores: [], error, missing: isMissingRelation(error) };
  }
}

export function sanitizeName(name) {
  const clean = String(name || '')
    .replace(/[<>\"'&]/g, '')
    .trim()
    .slice(0, 24);
  return clean || 'PLAYER';
}

/**
 * Submit a hunt score. mode is 'solo' or 'party'; party scores carry the
 * room_code so the party leaderboard can show every hunter's result.
 * Returns { ok } — the caller shows an honest message when the table
 * isn't deployed yet instead of pretending the score was saved.
 */
export async function submitScore({ playerName, score, rabbits, mode, roomCode }) {
  const player_name = sanitizeName(playerName);
  const safeScore = Math.max(0, Math.min(50000, Math.floor(Number(score) || 0)));
  const safeRabbits = Math.max(0, Math.min(1000, Math.floor(Number(rabbits) || 0)));
  const safeMode = mode === 'party' ? 'party' : 'solo';
  const row = { player_name, score: safeScore, rabbits: safeRabbits, mode: safeMode };
  if (roomCode) row.room_code = String(roomCode).toUpperCase().slice(0, 6);
  try {
    const { error } = await supabase.from(TABLE).insert([row]);
    if (error) throw error;
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error, missing: isMissingRelation(error) };
  }
}
