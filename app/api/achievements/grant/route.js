// app/api/achievements/grant/route.js
// POST -> grant a CLIENT-TRIGGERABLE achievement to the signed-in user.
// Body: { key }
//
// Strictly whitelisted: only CLIENT_GRANTABLE keys from
// lib/achievements/catalog.js are accepted — clients can NEVER grant
// arbitrary keys.
//
// Server-side verification by key type:
//   * cloud-phone-pioneer — the requester must actually own a cloud phone
//     instance (the install route grants it directly; this path is a backstop).
//   * verify:'pvp' game keys (PvP-win trophies, e.g. chess-sector-champion) —
//     the requester must have a finished pvp_matches row as winner in that
//     game, against at least one human opponent.
//   * everything else (calendar/calculator/first-taste/skill/mastery game
//     keys) is client-triggered by definition — the state that earns them
//     lives in the client — and is recorded idempotently.
//
// Response: { ok, awarded, key, title } — awarded=false when already held.
// Requires the user_achievements.sql migration to be applied.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getAchievement, CLIENT_GRANTABLE } from '@/lib/achievements/catalog';

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The achievement service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to earn achievements.' }, { status: 401 });
  }

  let body = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const key = typeof body?.key === 'string' ? body.key : '';
  if (!CLIENT_GRANTABLE.includes(key)) {
    return Response.json({ ok: false, error: 'That achievement cannot be granted here.' }, { status: 403 });
  }
  const def = getAchievement(key);
  if (!def) {
    return Response.json({ ok: false, error: 'Unknown achievement.' }, { status: 400 });
  }

  // Server-side verification for the pioneer trophy: the requester must
  // actually own a cloud phone instance. (The install route grants it
  // directly; this path only exists as a backstop.)
  if (key === 'cloud-phone-pioneer') {
    try {
      const { count } = await admin
        .from('cloud_phone_instances')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', auth.user.id);
      if (!count || count < 1) {
        return Response.json({ ok: false, error: 'Install a cloud app first.' }, { status: 403 });
      }
    } catch {
      return Response.json({ ok: false, error: 'Could not verify your cloud apps.' }, { status: 500 });
    }
  }

  // Server-side verification for PvP-win trophies: the requester must have
  // a finished pvp_matches row as winner in this game, against at least one
  // human opponent. (pvp_matches is written on match finish — see
  // lib/pvp/match.js finishMatch.) This keeps PvP trophies honest: the
  // client can ask, but only a real recorded win earns the trophy.
  if (def.verify === 'pvp') {
    try {
      const { data: wins, error: winErr } = await admin
        .from('pvp_matches')
        .select('id, player_ids')
        .eq('game_slug', def.game)
        .eq('winner_id', auth.user.id)
        .limit(25);
      if (winErr) throw winErr;
      const honest = (wins || []).some((m) =>
        Array.isArray(m.player_ids) &&
        m.player_ids.some((pid) => pid && pid !== auth.user.id)
      );
      if (!honest) {
        return Response.json(
          { ok: false, error: 'No verified PvP win for that trophy yet.' },
          { status: 403 }
        );
      }
    } catch (err) {
      if (err && err.status === 403) throw err;
      return Response.json({ ok: false, error: 'Could not verify your PvP win.' }, { status: 500 });
    }
  }

  const { error } = await admin.from('user_achievements').insert({
    user_id: auth.user.id,
    key,
    title: def.title,
    metadata: { description: def.description },
  });
  if (error && error.code !== '23505') throw error;

  return Response.json({ ok: true, awarded: !error, key, title: def.title });
});
