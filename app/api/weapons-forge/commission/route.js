// app/api/weapons-forge/commission/route.js
// PATRON COMMISSIONS (Merlin, 2026-10-24) — John Hammond, Dracula,
// the Dwarven Smith, and the Kyber Smith forge AI-created weapons
// at the Weapons Forge and distribute them to travellers. A
// separate route from the catalogue till (app/api/weapons-forge/
// route.js) on purpose:
// commissions debit NO bars and NO materials — the scarcity is
// the daily guard (one commission per patron per user per day),
// and the failure mode is the AI's health, not a price.
//
//   GET  -> { signedIn, commissions: { hammond, dracula } } —
//           whether today's commission is already spent.
//   POST { patron: 'hammond' | 'dracula', theme? } ->
//           { ok, weapon, backpack } — the patron's AI design,
//           validated hard and shelved in the account's pack.
//           The AI runs through the app's EXISTING Artemis
//           plumbing (lib/artemis/server.js — geminiGenerate +
//           requireGeminiKey); no new client, no key in code.
//           When the AI is down or the key is unhealthy, the
//           route answers plainly ("the forge's AI is unavailable
//           right now") and mints NOTHING — never a fake weapon,
//           never a silent catalogue fallback dressed as AI.
//           The bars-debit posture of the catalogue forge does
//           not apply here because no bars move at all.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import { sanitizeBackpackRecord } from '@/lib/backpack/backpack';
import {
  PATRON_IDS,
  buildPatronPrompt,
  validateAiWeaponSpec,
  shelveAiWeapon,
  hasCommissionedToday,
  sanitizeAiText,
} from '@/lib/backpack/patrons';
import { geminiGenerate, requireGeminiKey } from '@/lib/artemis/server';

/** The one honest message for every AI-down path. */
export const AI_UNAVAILABLE_MESSAGE = "The forge's AI is unavailable right now.";

async function loadRecord(userId, client) {
  const { data: stateRow, error: stateErr } = await client
    .from('account_state')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();
  if (stateErr) throw stateErr;
  return sanitizeBackpackRecord(
    stateRow && stateRow.preferences ? stateRow.preferences.backpack : null
  );
}

export const GET = noCache(
  apiGuard(async function GET(req) {
    const auth = await getUserFromRequest(req);
    if (auth.error) return NextResponse.json({ signedIn: false, commissions: null });
    const client = await getServiceClient();
    if (!client) return NextResponse.json({ signedIn: true, commissions: null, setupRequired: true });
    try {
      const record = await loadRecord(auth.user.id, client);
      const commissions = {};
      for (const patron of PATRON_IDS) commissions[patron] = hasCommissionedToday(record, patron);
      return NextResponse.json({ signedIn: true, commissions });
    } catch {
      return NextResponse.json({ signedIn: true, commissions: null });
    }
  })
);

export const POST = noCache(
  apiGuard(async function POST(req) {
    const auth = await getUserFromRequest(req);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const userId = auth.user.id;

    const client = await getServiceClient();
    if (!client) return NextResponse.json({ error: 'The forge is not connected yet.', setupRequired: true }, { status: 503 });

    const body = await req.json().catch(() => null);
    const patron = typeof (body && body.patron) === 'string' ? body.patron.trim().toLowerCase() : '';
    if (!PATRON_IDS.includes(patron)) {
      return NextResponse.json({ error: 'Unknown patron.' }, { status: 400 });
    }
    const theme = sanitizeAiText(body && body.theme, 120);

    let record;
    try {
      record = await loadRecord(userId, client);
    } catch {
      return NextResponse.json({ error: 'The forge could not read your pack.' }, { status: 503 });
    }

    // The daily guard fires before any AI spend.
    if (hasCommissionedToday(record, patron)) {
      return NextResponse.json(
        { error: 'That patron has already forged for you today. Come back tomorrow.', alreadyCommissioned: true, backpack: record },
        { status: 409 }
      );
    }

    // The AI call — Artemis plumbing, key from the environment.
    let apiKey;
    try {
      apiKey = requireGeminiKey();
    } catch {
      return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE, aiUnavailable: true }, { status: 503 });
    }
    const prompt = buildPatronPrompt(patron, theme);
    let rawText;
    try {
      rawText = await geminiGenerate(apiKey, prompt.system, prompt.user, {
        generationConfig: { response_mime_type: 'application/json', temperature: 0.9 },
      });
    } catch {
      return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE, aiUnavailable: true }, { status: 502 });
    }
    if (!rawText) {
      return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE, aiUnavailable: true }, { status: 502 });
    }

    // The model's text is data: strip fences, parse, validate hard.
    const jsonText = String(rawText).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    let parsed = null;
    try { parsed = JSON.parse(jsonText); } catch { parsed = null; }
    const validated = validateAiWeaponSpec(parsed, patron);
    if (!validated.ok) {
      return NextResponse.json(
        { error: 'The patron’s design did not pass the forge’s checks, so nothing was minted. Try again.', validationError: validated.error },
        { status: 502 }
      );
    }

    const shelved = shelveAiWeapon(record, validated.spec, patron);
    if (!shelved.ok) {
      return NextResponse.json(
        { error: 'That patron has already forged for you today. Come back tomorrow.', alreadyCommissioned: true, backpack: record },
        { status: 409 }
      );
    }

    const { data: merged, error: mergeErr } = await client.rpc('merge_account_preferences', {
      p_user_id: userId,
      p_patch: { backpack: shelved.record },
    });
    if (mergeErr) throw mergeErr;
    const savedRecord = sanitizeBackpackRecord(
      merged && merged.backpack ? merged.backpack : shelved.record
    );

    return NextResponse.json({
      ok: true,
      weapon: {
        name: validated.spec.name,
        weaponClass: validated.spec.weaponClass,
        damage: validated.spec.damage,
        rarity: validated.spec.rarity,
        description: validated.spec.description,
        forgedBy: patron,
      },
      backpack: savedRecord,
    });
  })
);
