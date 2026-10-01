// app/api/artemis/transmit/route.js
//
// POST /api/artemis/transmit  { prompt, persona?, repo? }  (Bearer token required)
//   -> { ok, reply, persona, functionsCalled }
//
// The ORACLE brain, ported from api/transmit.js in Merlin's Architect-Artemis
// repo: persona system prompts (the Council) sent to Gemini, plus a
// function-calling loop that lets the architect read and commit files to his
// GitHub repos through GITHUB_PAT (server-side only, never in the bundle).
//
// STRIPPED from the original (never ported):
//   - the OMEGA_DATABASE_URL pg Pool and the INSERT INTO central_telemetry
//     phone-home on every call. The new build has zero Render/OMEGA reliance;
//     per-user history lives in Supabase (supabase/artemis.sql).
//   - the Firebase handshake ('CONNECTED' string); auth is the launcher's
//     Supabase Bearer token instead.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { PERSONAS, parsePersonaPrefix } from '@/lib/artemis/personas';
import { getUserFromRequest, requireGeminiKey, GEMINI_MODEL } from '@/lib/artemis/server';

const GH_API = 'https://api.github.com';
const GH_OWNER = 'highland88999-commits';

async function gh(path, pat, method = 'GET', body) {
  const res = await fetch(GH_API + path, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'olympus-artemis',
      Authorization: `Bearer ${pat}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `GitHub HTTP ${res.status}`);
  return data;
}

const FUNCTION_DECLARATIONS = [
  {
    name: 'scanRepo',
    description: 'List files and directories at a path inside one of Merlin\'s GitHub repos.',
    parameters: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name, e.g. Architect-Artemis' },
        path: { type: 'string', description: 'Directory path, default empty (repo root)' },
      },
      required: ['repo'],
    },
  },
  {
    name: 'readFile',
    description: 'Read a text file from one of Merlin\'s GitHub repos.',
    parameters: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File path in the repo' },
      },
      required: ['repo', 'path'],
    },
  },
  {
    name: 'commitFile',
    description: 'Create or update a text file in one of Merlin\'s GitHub repos (commits to main).',
    parameters: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File path in the repo' },
        content: { type: 'string', description: 'Full new file content' },
        message: { type: 'string', description: 'Commit message' },
      },
      required: ['repo', 'path', 'content', 'message'],
    },
  },
];

async function runFunctionCall(name, args, pat) {
  const repo = String(args?.repo || 'Architect-Artemis').trim();
  const path = String(args?.path || '').replace(/^\/+/, '');
  if (name === 'scanRepo') {
    const items = await gh(`/repos/${GH_OWNER}/${repo}/contents/${path}`, pat);
    const list = Array.isArray(items) ? items : [items];
    return { result: list.map((i) => `${i.type}: ${i.path}`).slice(0, 200).join('\n') };
  }
  if (name === 'readFile') {
    const file = await gh(`/repos/${GH_OWNER}/${repo}/contents/${path}`, pat);
    const text = Buffer.from(file.content || '', 'base64').toString('utf8');
    return { result: text.slice(0, 60000) };
  }
  if (name === 'commitFile') {
    let sha;
    try {
      const existing = await gh(`/repos/${GH_OWNER}/${repo}/contents/${path}`, pat);
      sha = existing.sha;
    } catch {
      sha = undefined; // new file
    }
    const done = await gh(`/repos/${GH_OWNER}/${repo}/contents/${path}`, pat, 'PUT', {
      message: String(args.message || 'Artemis commit'),
      content: Buffer.from(String(args.content || ''), 'utf8').toString('base64'),
      ...(sha ? { sha } : {}),
    });
    return { result: `Committed: ${done?.commit?.html_url || path}` };
  }
  return { result: 'Unknown function.' };
}

async function geminiWithTools(apiKey, systemPrompt, userText, pat) {
  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  let contents = [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userText}` }] }];
  const tools = pat ? [{ function_declarations: FUNCTION_DECLARATIONS }] : undefined;
  const functionsCalled = [];

  for (let round = 0; round < 5; round += 1) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, ...(tools ? { tools } : {}) }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const call = parts.find((p) => p.functionCall)?.functionCall;
    if (!call) {
      return { text: parts.map((p) => p.text || '').join(''), functionsCalled };
    }
    functionsCalled.push(call.name);
    const fnResult = await runFunctionCall(call.name, call.args || {}, pat);
    contents = [
      ...contents,
      { role: 'model', parts: [{ functionCall: call }] },
      { role: 'function', parts: [{ functionResponse: { name: call.name, response: fnResult } }] },
    ];
  }
  return { text: '', functionsCalled };
}

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }

  const raw = String(body.prompt || '').trim().slice(0, 8000);
  if (!raw) return NextResponse.json({ ok: false, error: 'Say something first.' }, { status: 400 });

  // Merlin's /persona prefix syntax ("… /oracle …") still works.
  const parsed = parsePersonaPrefix(raw);
  const personaKey = PERSONAS[body.persona] ? body.persona : parsed.persona;
  const prompt = PERSONAS[body.persona] ? raw : parsed.prompt;
  if (!prompt) return NextResponse.json({ ok: false, error: 'Say something first.' }, { status: 400 });

  let apiKey;
  try {
    apiKey = requireGeminiKey();
  } catch {
    return NextResponse.json(
      { ok: false, offline: true, error: 'The oracle is not connected yet.' },
      { status: 503 }
    );
  }

  const pat = process.env.GITHUB_PAT || '';
  let result;
  try {
    result = await geminiWithTools(apiKey, PERSONAS[personaKey].systemPrompt, prompt, pat);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `The oracle could not answer: ${e.message || 'try again.'}` },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    reply: result.text,
    persona: personaKey,
    functionsCalled: result.functionsCalled,
    githubWired: Boolean(pat),
  });
});
