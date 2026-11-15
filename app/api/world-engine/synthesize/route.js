// World Engine — AI synthesis API (server-side only).
//
// POST /api/world-engine/synthesize { prompt?, targetUrl?, category? }
//   -> { success, parameters, billing }
//
// Security / honesty properties:
// - All secrets (Gemini key, Supabase service role) stay on the server.
// - Caller must present a valid Supabase session (Bearer token).
// - Costs come from the server-side cost map; the client never picks a price.
// - The free monthly tier (20/month) is resolved server-side per user.
// - Credits are deducted only AFTER the AI generation succeeds.
// - AI output is clamped through the AestheticEngine before it reaches any
//   renderer, so hostile or malformed params cannot crash Three.js.
//
// Fixes vs the original:
// - Reads/writes the scoped `world_engine_credits` table instead of the
//   launcher's shared `profiles` table (never touch shared tables).
// - Lazy admin client (the original crashed at import when env was missing).
// - Input validation (prompt length cap, URL scheme check).
// - Model name overridable via WORLD_ENGINE_GEMINI_MODEL.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { applyAestheticEngine } from '@/lib/world-engine/aesthetic';
import { applyPromptKeywordNets } from '@/lib/world-engine/forge-agent';
import { costFor, computeBilling, FREE_GENERATIONS_PER_MONTH } from '@/lib/world-engine/economy';
import { validateSynthesizeInput, synthesizeWithGemini } from '@/lib/world-engine/gemini';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';
import { apiGuard } from '@/lib/api-guard';

async function getLedger(admin, userId) {
  const { data, error } = await admin
    .from('world_engine_credits')
    .select('tokens, free_used, free_reset_month')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no row yet
  return data || null;
}

export const POST = apiGuard(async function POST(request) {
  const auth = await getUserFromRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user } = auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const input = validateSynthesizeInput(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const category = (body?.category || 'object').toString().toLowerCase();
  const cost = costFor(category);

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  // 1. Resolve billing BEFORE calling the paid AI API.
  let ledger;
  try {
    ledger = await getLedger(admin, user.id);
  } catch (e) {
    console.error('World Engine ledger read failed:', e.message);
    return NextResponse.json({ error: 'Could not read your credit balance.' }, { status: 500 });
  }

  const billing = computeBilling(ledger, cost);
  if (!billing.ok) {
    return NextResponse.json(
      {
        error: `Not enough Aether. This costs ${billing.required} Aether and you have ${billing.available}. Your free monthly generations are used up — buy credits to keep generating.`,
        requiredAether: billing.required,
        currentAether: billing.available,
      },
      { status: 402 }
    );
  }

  // 2. Run the generation (this is the only step that spends real API money).
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'The synthesis service is not connected yet.' }, { status: 503 });
  }
  let rawParams;
  try {
    rawParams = await synthesizeWithGemini({
      apiKey: process.env.GEMINI_API_KEY,
      prompt: input.prompt,
      targetUrl: input.targetUrl,
      category,
    });
  } catch (e) {
    console.error('World Engine synthesis failed:', e.message);
    return NextResponse.json({ error: e.message || 'World generation failed.' }, { status: 502 });
  }

  // 3. Deduct only after generation succeeded.
  const { error: ledgerError } = await admin
    .from('world_engine_credits')
    .upsert({ user_id: user.id, ...billing.updates, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (ledgerError) {
    console.error('World Engine ledger write failed:', ledgerError.message);
    // The user still gets their generation; the charge is best-effort.
  }

  // 4. Clamp and return. The plain-words safety nets live in the
  // forge agent (lib/world-engine/forge-agent.js
  // applyPromptKeywordNets) — the one home for them: if the user
  // explicitly asked for an optic in plain words and the AI missed
  // it, the words win; same for weather words.
  const safeParams = applyPromptKeywordNets(applyAestheticEngine(rawParams, category), input.prompt, category);

  return NextResponse.json({
    success: true,
    parameters: safeParams,
    billing: {
      paymentType: billing.isFree ? 'free_tier' : 'aether_deducted',
      cost: billing.cost,
      freeGenerationsRemaining: billing.freeRemaining,
      tokensRemaining: billing.tokensRemaining,
      freeGenerationsPerMonth: FREE_GENERATIONS_PER_MONTH,
    },
  });
});
