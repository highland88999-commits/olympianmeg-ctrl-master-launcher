// app/api/redwater/claim/route.js
// POST -> claim one of the 3 gold bars at the Earth's core (Redwater journey).
//
// Merlin's rules (2026-10-17), enforced server-side:
//   * GLOBAL CAP: only 5 gold bar collects, ever, across all users.
//   * EXEMPT: olympiannexus@gmail.com and olympianmeg@gmail.com can never collect.
//   * Every completer earns the 'redwater-core-diver' achievement (server-granted,
//     like cloud-phone-pioneer — NOT in CLIENT_GRANTABLE).
//   * Every completer receives a diamond-crusted sniper (diamond bullets) as a
//     world_engine_assets weapon + backpack_items row.
//   * Idempotent: one collect per user (unique user_id).
//
// The atomic cap lives in the claim_redwater_core() Postgres function
// (supabase/redwater.sql) so concurrent claims can't overshoot 5.
// Response: { ok, collected, reason?, achievement?, sniper? }
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getAchievement } from '@/lib/achievements/catalog';

const ACHIEVEMENT_KEY = 'redwater-core-diver';

const SNIPER_ASSET = {
  name: 'Diamond-Crusted Sniper',
  category: 'weapon',
  asset_url: 'procedural_generation',
  generation_params: {
    weaponType: 'precision',
    finish: 'diamond_crusted',
    ammo: 'diamond_bullets',
    rarity: 'rare',
    source: 'redwater-core',
    description:
      'Rare diamond-crusted precision sniper with diamond bullets. Awarded for completing the Redwater journey to the center of the earth.',
  },
};

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The core service is not connected yet.');

  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to claim the core\u2019s gold.' }, { status: 401 });
  }
  const { user } = auth;
  const email = String(user.email || '').toLowerCase();

  // Atomic claim: exemptions, dedupe, and the global 5-cap inside Postgres.
  const { data: claimRows, error: claimErr } = await admin.rpc('claim_redwater_core', {
    p_user_id: user.id,
    p_user_email: email || null,
  });
  if (claimErr) throw claimErr;
  const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;
  if (!claim || !claim.success) {
    const reason = claim?.reason || 'denied';
    const status = reason === 'exhausted' ? 410 : 403;
    return Response.json({ ok: false, collected: false, reason }, { status });
  }

  // Achievement: server-granted, idempotent via unique(user_id, key).
  const def = getAchievement(ACHIEVEMENT_KEY);
  let achievement = null;
  if (def) {
    const { error: achErr } = await admin.from('user_achievements').insert({
      user_id: user.id,
      key: ACHIEVEMENT_KEY,
      title: def.title,
      metadata: { description: def.description, source: 'redwater-core' },
    });
    if (achErr && achErr.code !== '23505') throw achErr;
    achievement = { key: ACHIEVEMENT_KEY, title: def.title, awarded: !achErr };
  }

  // Diamond-crusted sniper: forge the asset, then call it into the backpack.
  let sniper = null;
  try {
    const { data: asset, error: assetErr } = await admin
      .from('world_engine_assets')
      .insert({
        user_id: user.id,
        name: SNIPER_ASSET.name,
        category: SNIPER_ASSET.category,
        asset_url: SNIPER_ASSET.asset_url,
        generation_params: SNIPER_ASSET.generation_params,
      })
      .select('id, name')
      .single();
    if (assetErr) throw assetErr;
    const { error: packErr } = await admin.from('backpack_items').insert({
      user_id: user.id,
      asset_id: asset.id,
      slot: 'primary',
      equipped: false,
    });
    if (packErr && packErr.code !== '23505') throw packErr;
    sniper = { asset_id: asset.id, name: asset.name, granted: true };
  } catch (err) {
    // The gold claim already succeeded atomically — never fail the whole
    // claim because the sniper grant hit a snag. Report it honestly.
    sniper = { granted: false, error: String((err && err.message) || err) };
  }

  return Response.json({
    ok: true,
    collected: true,
    portal: true,
    achievement,
    sniper,
  });
});
