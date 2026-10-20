// app/api/dream-engine/interpret/route.js
// THE INTERPRETER — stage 1 of the Dream Engine.
// Takes a dream description (and optionally the current scene + a directing
// instruction) and returns a complete, validated scene JSON for the Builder.
// Gemini call follows the house pattern (lib/muse/responder.js): model
// gemini-3.8-flash, v1beta generateContent, x-goog-api-key header,
// GEMINI_API_KEY env. First attempt asks for JSON via responseMimeType; if
// that errors or comes back unparseable, ONE retry goes out without
// responseMimeType (extractJson tolerates fences/prose). The model's raw
// output is NEVER trusted — normalizeScene() coerces it into renderer-safe
// values, and any failure falls back to the default scene with a note.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import {
  normalizeScene,
  DEFAULT_SCENE,
  OBJECT_TYPES,
  GROUND_TYPES,
  PARTICLE_TYPES,
} from '@/lib/dream-engine/schema';

const GEMINI_MODEL = 'gemini-3.8-flash';
const MAX_PROMPT_CHARS = 1200;
const MAX_INSTRUCTION_CHARS = 600;

const SYSTEM_PROMPT = `You are the Interpreter of the Dream Engine. You translate a person's dream description into a 3D scene described ONLY as JSON. Dreams are illogical: embrace impossible scale, floating objects, melting architecture, endless hallways, skies of liquid metal. Never make it ordinary.

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{
  "environment": {
    "skyColor": "#rrggbb", "fogColor": "#rrggbb", "fogDensity": 0.0-0.06,
    "groundColor": "#rrggbb", "groundType": "flat|water|void|dunes",
    "lightColor": "#rrggbb", "lightIntensity": 0-2.5, "ambient": 0-1.2,
    "timeOfDay": "short label e.g. 'liquid dawn'",
    "particles": "none|stars|dust|sparks|petals|snow", "particleColor": "#rrggbb"
  },
  "objects": [
    { "type": "one of the allowed types", "position": [x, y, z], "scale": [x, y, z],
      "rotationY": 0, "color": "#rrggbb", "roughness": 0-1, "metalness": 0-1,
      "emissive": "#rrggbb", "emissiveIntensity": 0-3, "float": true/false,
      "spin": "slow|none", "cluster": { "count": 1-12, "spread": 1-30 } }
  ],
  "mood": { "label": "2-4 word mood title", "reading": "one evocative sentence interpreting the dream" }
}

Allowed object types ONLY: ${OBJECT_TYPES.join(', ')}.
Ground types ONLY: ${GROUND_TYPES.join(', ')}. Particles ONLY: ${PARTICLE_TYPES.join(', ')}.

Composition rules:
- 8 to 16 objects. Spread them around the origin (the dreamer starts at 0,0,0 looking toward -z). Keep x,z within -45..45, y within 0..35.
- A "liquid silver sky" means skyColor near-white grey with high light; translate material words into roughness/metalness (liquid metal: roughness 0.05, metalness 1; wax: roughness 0.35, metalness 0; stone: roughness 0.95).
- Use emissive sparingly for things that glow in the dream.
- Use "float": true for anything weightless, hovering, or falling slowly; floating objects bob in the renderer.
- Use cluster for repeated things (a forest, a field of candles, falling petals as geometry) instead of listing each one.
- Fog is the dream's breath: almost every dream wants fogDensity 0.008-0.035.

When given a CURRENT SCENE and a DIRECTING INSTRUCTION, return the FULL updated scene: keep everything the instruction does not mention, change only what it asks, and update the mood reading to acknowledge the change.`;

function extractJson(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim();
  // Strip markdown fences if the model added them anyway.
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

// One Gemini attempt. Returns { scene } on success, otherwise
// { scene: null, error, status?, detail? } where detail is a short snippet of
// what Gemini actually said — logged server-side, never sent to the client.
// Hardened after production failures (Oct 20): thinking disabled (thinking
// tokens were eating the output budget and truncating the scene JSON),
// compact token budget, and a hard per-attempt timeout so a slow generation
// can never hang the function past the client's patience.
async function attemptInterpret({ key, parts, model, jsonMime, thinking, timeoutMs = 28000 }) {
  const generationConfig = {
    temperature: 0.9,
    maxOutputTokens: 2000,
  };
  if (jsonMime) generationConfig.responseMimeType = 'application/json';
  if (thinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts }],
          generationConfig,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
  } catch (e) {
    const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return { scene: null, error: timedOut ? 'gemini_timeout' : 'network', detail: String((e && e.message) || e).slice(0, 300) };
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    return { scene: null, error: `gemini_${res.status}`, status: res.status, detail: bodyText.slice(0, 300) };
  }

  const data = await res.json().catch(() => null);
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';
  const parsed = extractJson(text);
  if (!parsed) {
    return {
      scene: null,
      error: 'unparseable',
      detail: `finishReason=${candidate?.finishReason || '?'} textLen=${text.length} :: ${text.slice(0, 200)}`,
    };
  }
  return { scene: normalizeScene(parsed), error: null };
}

async function callInterpreter({ prompt, instruction, currentScene }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { scene: null, error: 'no_key' };

  const parts = [];
  if (currentScene && instruction) {
    parts.push({
      text: `CURRENT SCENE (JSON):\n${JSON.stringify(currentScene)}\n\nDIRECTING INSTRUCTION: "${instruction}"\n\nReturn the full updated scene JSON.`,
    });
  } else {
    parts.push({ text: `DREAM DESCRIPTION: "${prompt}"\n\nReturn the scene JSON.` });
  }

  // Model fallback chain (added Oct 20 after production gemini_503s):
  // gemini-3.8-flash returned 503 UNAVAILABLE on every call while the route
  // was otherwise healthy. The Interpreter now walks the chain — first model
  // that answers wins. An 'unparseable' result earns one plain-text retry on
  // the same model before moving on.
  // Attempt plan (Oct 20, after live diagnosis): the nexus GEMINI_API_KEY
  // only unlocks gemini-3.8-flash — gemini-2.5-flash and 2.5-flash-lite both
  // return 404 for this key, and the launcher project has no key at all.
  // 3.8-flash itself is capacity-sick: alternating 503s and >20s hangs.
  // So: two shots at 3.8 (the retry only on transient timeout/503), then one
  // fast shot at 2.5-flash in case key entitlements change. All inside the
  // 60s function budget. First success wins; every failure is reported in
  // `attempts` so the fallback banner names exactly what happened.
  const PLAN = [
    { model: GEMINI_MODEL, timeoutMs: 28000 },
    { model: GEMINI_MODEL, timeoutMs: 25000, onlyIfTransient: true },
    { model: 'gemini-2.5-flash', timeoutMs: 10000 },
  ];
  let lastResult = null;
  const attempts = [];
  for (const step of PLAN) {
    if (step.onlyIfTransient) {
      const prev = lastResult && lastResult.error;
      if (prev !== 'gemini_timeout' && prev !== 'gemini_503') continue;
      await new Promise((r) => setTimeout(r, 2000));
    }
    let result = await attemptInterpret({
      key, parts, model: step.model, jsonMime: true, thinking: true, timeoutMs: step.timeoutMs,
    });
    if (result.scene) return result;
    console.error(
      `[dream-engine] interpreter (${step.model}, json mime) failed: ${result.error}` +
        `${result.status ? ` HTTP ${result.status}` : ''} :: ${result.detail || '(no detail)'}`
    );
    attempts.push(`${step.model.replace('gemini-', '')}:${result.error}`);
    lastResult = result;
    if (result.error === 'unparseable') {
      result = await attemptInterpret({
        key, parts, model: step.model, jsonMime: false, thinking: false, timeoutMs: step.timeoutMs,
      });
      if (result.scene) return result;
      console.error(
        `[dream-engine] interpreter (${step.model}, plain) failed: ${result.error}` +
          `${result.status ? ` HTTP ${result.status}` : ''} :: ${result.detail || '(no detail)'}`
      );
      attempts.push(`${step.model.replace('gemini-', '')}/plain:${result.error}`);
      lastResult = result;
      break; // unparseable twice-ish: model answered but gibberish — stop burning budget
    }
  }
  return { ...lastResult, attempts };
}

// POST { prompt }                      -> interpret a fresh dream
// POST { instruction, currentScene }   -> direct changes to the live scene
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : '';
  const instruction = typeof body?.instruction === 'string' ? body.instruction.trim().slice(0, MAX_INSTRUCTION_CHARS) : '';
  const currentScene = body?.currentScene && typeof body.currentScene === 'object' ? normalizeScene(body.currentScene) : null;

  if (!prompt && !instruction) {
    return NextResponse.json({ error: 'Describe a dream, or give a directing instruction.' }, { status: 400 });
  }
  if (instruction && !currentScene) {
    return NextResponse.json({ error: 'Directing needs the current scene.' }, { status: 400 });
  }

  const { scene, error, attempts } = await callInterpreter({ prompt, instruction, currentScene });

  if (!scene) {
    // Graceful degradation: the sandbox still opens on the default dreamscape,
    // and the UI tells the dreamer the Interpreter is unavailable.
    return NextResponse.json({
      scene: normalizeScene(DEFAULT_SCENE),
      fallback: true,
      error,
      message:
        error === 'no_key'
          ? 'The Interpreter is asleep (no Gemini key on the server). Showing the threshold dreamscape.'
          : `The Interpreter could not shape that dream [${(attempts && attempts.length ? attempts.join(' > ') : error) || 'unknown'}]. Showing the threshold dreamscape — try again.`,
    });
  }

  return NextResponse.json({ scene, fallback: false });
}
