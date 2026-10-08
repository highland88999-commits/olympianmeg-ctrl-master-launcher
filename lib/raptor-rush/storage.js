// Raptor Rush — high-score storage. Talks to the server scoreboard API
// (/api/raptor-rush/leaderboard + /api/raptor-rush/submit); the
// raptor_rush_scores table ships via supabase/raptor_rush_scores.sql
// (Merlin green-lights SQL personally). Until the table exists the API
// reports missing:true and the page says so honestly. Guests keep
// localStorage-only bests — submitScore returns { guest: true } for them.

import { supabase } from '@/lib/supabase';

async function authHeaders() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: 'Bearer ' + session.access_token } : null;
  } catch {
    return null;
  }
}

export async function fetchTopScores(limit = 10) {
  try {
    const res = await fetch(`/api/raptor-rush/leaderboard?mode=solo&limit=${limit}`);
    const d = await res.json();
    if (d.missing) return { scores: [], error: new Error('missing table'), missing: true };
    if (!d.ok) throw new Error('leaderboard');
    return { scores: d.scores || [], error: null };
  } catch (error) {
    return { scores: [], error };
  }
}

/** Room-party leaderboard: scores tagged with an OASIS room code. */
export async function fetchRoomScores(roomCode, limit = 10) {
  try {
    const code = encodeURIComponent(String(roomCode || '').toUpperCase());
    const res = await fetch(`/api/raptor-rush/leaderboard?mode=party&roomCode=${code}&limit=${limit}`);
    const d = await res.json();
    if (d.missing) return { scores: [], error: new Error('missing table'), missing: true };
    if (!d.ok) throw new Error('leaderboard');
    return { scores: d.scores || [], error: null };
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
 * Submit a hunt score. mode is 'solo' or 'party'; party scores carry the
 * room_code so the party leaderboard can show every hunter's result.
 * Signed-in users post to the shared board (server-validated); guests get
 * { guest: true } and the page keeps its honest local-only message.
 */
export async function submitScore({ playerName, score, rabbits, mode, roomCode }) {
  const headers = await authHeaders();
  if (!headers) return { ok: false, guest: true, error: null };
  try {
    const res = await fetch('/api/raptor-rush/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ playerName, score, rabbits, mode, roomCode }),
    });
    const d = await res.json();
    if (d.missing) return { ok: false, missing: true, error: null };
    if (d.guest) return { ok: false, guest: true, error: null };
    if (!d.ok) return { ok: false, error: new Error(d.error || 'submit failed') };
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error };
  }
}
