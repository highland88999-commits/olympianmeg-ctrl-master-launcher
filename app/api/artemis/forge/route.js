// app/api/artemis/forge/route.js
//
// POST /api/artemis/forge  { prompt, type }  (Bearer token required)
//   -> { ok, kind: 'image'|'html', url?, html?, type }
//
// The FORGE, ported from api/gateway.js in Merlin's Architect-Artemis repo.
// IMAGE goes straight to Pollinations (no key needed); 3D / VIDEO / AUDIO /
// CODE / SHADER go to Gemini, which returns a single self-contained HTML
// file — the client's holo panel renders it in a sandboxed iframe.
// GEMINI_API_KEY is read from the environment, server-side only.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { FORGE_TYPES } from '@/lib/artemis/personas';
import { getUserFromRequest, requireGeminiKey, geminiGenerate } from '@/lib/artemis/server';

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }

  const prompt = String(body.prompt || '').trim().slice(0, 4000);
  const type = String(body.type || 'image').toLowerCase();
  if (!prompt) return NextResponse.json({ ok: false, error: 'Describe what to forge.' }, { status: 400 });
  if (!FORGE_TYPES[type]) return NextResponse.json({ ok: false, error: 'Unknown forge type.' }, { status: 400 });

  // IMAGE — Merlin's original: direct Pollinations URL, no model call.
  if (type === 'image') {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
    return NextResponse.json({ ok: true, kind: 'image', url, type });
  }

  let apiKey;
  try {
    apiKey = requireGeminiKey();
  } catch {
    return NextResponse.json(
      { ok: false, offline: true, error: 'The forge is not connected yet.' },
      { status: 503 }
    );
  }

  let html;
  try {
    html = await geminiGenerate(apiKey, FORGE_TYPES[type].systemPrompt, prompt);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `The forge could not finish that: ${e.message || 'try again.'}` },
      { status: 502 }
    );
  }
  if (!html) {
    return NextResponse.json({ ok: false, error: 'The forge came back empty.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, kind: 'html', html, type });
});
