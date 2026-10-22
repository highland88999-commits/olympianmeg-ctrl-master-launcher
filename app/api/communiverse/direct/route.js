// app/api/communiverse/direct/route.js
// POST /api/communiverse/direct  { asset_id, prompt }
//   "Direct it with Muse" (Merlin, 2026-10-22): a planet's owner describes
//   the change they want, and the World Engine synthesis AI re-forges that
//   world's generation_params from the words. The result is written back
//   onto the SAME asset row, so the planet in the Communiverse — and in
//   the owner's profile — becomes the directed version everywhere at once.
//
//   Owner-only: owning the planet is the right to direct it. When the
//   planet is sold in the Auction House, settleSale transfers the asset
//   row to the buyer, and this route's owner check follows the row — the
//   seller can no longer direct it and the buyer can.
//
//   Billing is the World Engine's own: same cost map, same free monthly
//   tier, credits deducted only after a successful generation — exactly
//   as POST /api/world-engine/synthesize, whose helpers this route reuses.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';
import { applyAestheticEngine } from '@/lib/world-engine/aesthetic';
import { costFor, computeBilling, FREE_GENERATIONS_PER_MONTH } from '@/lib/world-engine/economy';
import { validateSynthesizeInput, synthesizeWithGemini } from '@/lib/world-engine/gemini';
import { withCommuniverse, communiverseMarker } from '@/lib/communiverse';

async function getLedger(admin, userId) {
  const { data, error } = await admin
    .from('world_engine_credits')
    .select('tokens, free_used, free_reset_month')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no row yet
  return data || null;
}

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user } = auth;

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const assetId = String(body.asset_id || '').trim();
  if (!assetId) return NextResponse.json({ error: 'Choose a world (asset_id).' }, { status: 400 });
  const input = validateSynthesizeInput(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  const { data: asset, error: loadErr } = await admin
    .from('world_engine_assets')
    .select('id, user_id, category, generation_params')
    .eq('id', assetId)
    .maybeSingle();
  if (loadErr || !asset) return NextResponse.json({ error: 'World not found.' }, { status: 404 });
  if (String(asset.user_id) !== String(user.id)) {
    return NextResponse.json({ error: 'Only the owner of a world can direct it.' }, { status: 403 });
  }
  if (asset.category !== 'world') {
    return NextResponse.json({ error: 'Only worlds can be directed.' }, { status: 400 });
  }

  // 1. Billing first (server-side cost, free tier resolved per user).
  const cost = costFor('world');
  let ledger;
  try {
    ledger = await getLedger(admin, user.id);
  } catch {
    return NextResponse.json({ error: 'Could not read your credit balance.' }, { status: 500 });
  }
  const billing = computeBilling(ledger, cost);
  if (!billing.ok) {
    return NextResponse.json(
      {
        error: `Not enough Aether. Directing a world costs ${billing.required} Aether and you have ${billing.available}. Your free monthly generations are used up — buy credits to keep directing.`,
        requiredAether: billing.required,
        currentAether: billing.available,
      },
      { status: 402 }
    );
  }

  // 2. Generate the new world from the owner's direction.
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'The synthesis service is not connected yet.' }, { status: 503 });
  }
  let rawParams;
  try {
    rawParams = await synthesizeWithGemini({
      apiKey: process.env.GEMINI_API_KEY,
      prompt: input.prompt,
      targetUrl: input.targetUrl,
      category: 'world',
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'World generation failed.' }, { status: 502 });
  }

  // 3. Deduct only after the generation succeeded (best-effort, as in
  //    the synthesize route: the user still gets their generation).
  const { error: ledgerError } = await admin
    .from('world_engine_credits')
    .upsert({ user_id: user.id, ...billing.updates, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (ledgerError) console.error('Communiverse direct: ledger write failed:', ledgerError.message);

  // 4. Clamp through the AestheticEngine, keep the publish marker, and
  //    write the directed world back onto the same asset row.
  const safeParams = applyAestheticEngine(rawParams, 'world');
  const wasPublished = communiverseMarker(asset.generation_params).published;
  const nextParams = withCommuniverse(safeParams, wasPublished, new Date().toISOString());
  const { error: upErr } = await admin
    .from('world_engine_assets')
    .update({ generation_params: nextParams, prompt: input.prompt })
    .eq('id', assetId);
  if (upErr) return NextResponse.json({ error: 'Could not save the directed world.' }, { status: 500 });

  return NextResponse.json({
    ok: true,
    asset_id: assetId,
    parameters: nextParams,
    in_communiverse: wasPublished,
    billing: {
      paymentType: billing.isFree ? 'free_tier' : 'aether_deducted',
      cost: billing.cost,
      freeGenerationsRemaining: billing.freeRemaining,
      tokensRemaining: billing.tokensRemaining,
      freeGenerationsPerMonth: FREE_GENERATIONS_PER_MONTH,
    },
  });
});
