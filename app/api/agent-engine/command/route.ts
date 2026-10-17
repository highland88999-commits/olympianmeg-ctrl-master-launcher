// app/api/agent-engine/command/route.ts — Agent Engine runtime (Phase 1).
//
// Merlin-gated command endpoint for the Agent Engine console at
// /agent-engine. Drives a Gemini function-calling loop over a small,
// READ-ONLY toolset: the agent can look at the ecosystem but cannot
// change it (Phase 1). Every tool call is written to the agent_runs
// ledger via the service-role client (best effort — a ledger failure
// never blocks the reply).
//
// Standing governance: no agent may edit the housing / alter the
// ecosystem without passing through Merlin first. Phase 1 tools are
// reads only; write tools (Phase 2) will require Merlin's explicit
// per-action approval plus an email to olympiannexus@gmail.com.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { searchPlaces } from '@/lib/geo';

const MASTER_OWNER_EMAIL = 'olympiannexus@gmail.com';
const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_STEPS = 6;
const MANIFEST_REL_PATH = 'public/muse_provision_manifest.txt';

const CORE_TABLES = [
  'central_telemetry',
  'nexus_nodes',
  'manuscripts',
  'drafts',
  'profiles',
  'fortresses_',
  'sgc_messages',
  'olympus_battleship_profiles',
  'olympus_battleship_rooms',
  'olympus_battleship_friends',
  'user_agents',
  'muse_manifest_logs',
];

async function verifyMasterOwner(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const supabaseUserClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error } = await supabaseUserClient.auth.getUser();
  if (error || !user || user.email?.toLowerCase() !== MASTER_OWNER_EMAIL) return null;
  return user;
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ---------------------------------------------------------------------------
// Tool declarations (Gemini function calling)
// ---------------------------------------------------------------------------
const TOOL_DECLS = [
  {
    name: 'brain_read',
    description: 'Read rows from one of the 12 core Olympus brain tables (service-role, read-only). Use for questions about telemetry, nodes, manuscripts, profiles, battleship data, agents, or the manifest log.',
    parameters: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'One of: ' + CORE_TABLES.join(', ') },
        limit: { type: 'number', description: 'Max rows, 1-25. Default 5.' },
      },
      required: ['table'],
    },
  },
  {
    name: 'telemetry_summary',
    description: 'Summarize the most recent rows of central_telemetry: row count sampled, newest timestamp, and the distinct event/node keys seen.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Rows to sample, 1-25. Default 10.' },
      },
    },
  },
  {
    name: 'place_search',
    description: 'Geocode a place name to lat/lon candidates (OpenStreetMap Nominatim, no key needed). Use before any Earth/street-level discussion.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Place name, e.g. "Redwater, Alberta".' },
      },
      required: ['query'],
    },
  },
  {
    name: 'manifest_read',
    description: 'Read the provision manifest (public/muse_provision_manifest.txt): the list of files provisioned into the ecosystem build.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'fetch_url',
    description: 'Fetch a public http(s) URL and return its title plus the first ~2000 characters of readable text. No localhost, no credentials.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full https URL to fetch.' },
      },
      required: ['url'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool implementations (server side, read-only)
// ---------------------------------------------------------------------------
async function runTool(name: string, args: any): Promise<any> {
  const admin = adminClient();
  switch (name) {
    case 'brain_read': {
      const table = String(args?.table || '');
      if (!CORE_TABLES.includes(table)) {
        return { error: `Unknown table "${table}". Allowed: ${CORE_TABLES.join(', ')}` };
      }
      const limit = Math.max(1, Math.min(25, Number(args?.limit) || 5));
      const { data, error } = await admin.from(table).select('*').limit(limit);
      if (error) return { error: error.message };
      return { table, rows_returned: (data || []).length, rows: data || [] };
    }
    case 'telemetry_summary': {
      const limit = Math.max(1, Math.min(25, Number(args?.limit) || 10));
      const { data, error } = await admin
        .from('central_telemetry')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return { error: error.message };
      const rows = data || [];
      const keys = new Set<string>();
      for (const r of rows) {
        for (const k of Object.keys(r || {})) keys.add(k);
      }
      return {
        rows_sampled: rows.length,
        newest: rows[0]?.created_at || null,
        columns_seen: [...keys].slice(0, 30),
        sample: rows.slice(0, 3),
      };
    }
    case 'place_search': {
      const query = String(args?.query || '').trim();
      if (!query) return { error: 'query is required' };
      const results = await searchPlaces(query, 5);
      return { query, results: results || [] };
    }
    case 'manifest_read': {
      try {
        const full = path.join(process.cwd(), MANIFEST_REL_PATH);
        const text = fs.readFileSync(full, 'utf8');
        return { path: MANIFEST_REL_PATH, lines: text.split('\n').length, content: text.slice(0, 4000) };
      } catch (e: any) {
        return { error: `Could not read manifest: ${e?.message || e}` };
      }
    }
    case 'fetch_url': {
      const url = String(args?.url || '').trim();
      if (!/^https?:\/\//i.test(url)) return { error: 'Only http(s) URLs are allowed.' };
      if (/localhost|127\.0\.0\.1|\[::1\]/i.test(url)) return { error: 'Local URLs are not allowed.' };
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'OlympusAgentEngine/1.0' },
        });
        const html = await res.text();
        const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim();
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 2000);
        return { url, status: res.status, title, text };
      } catch (e: any) {
        return { error: `Fetch failed: ${e?.message || e}` };
      } finally {
        clearTimeout(t);
      }
    }
    default:
      return { error: `Unknown tool "${name}"` };
  }
}

async function logRun(userId: string, agentRef: string, tool: string, args: any, result: any) {
  try {
    const summary = JSON.stringify(result).slice(0, 500);
    await adminClient().from('agent_runs').insert([
      { user_id: userId, agent_ref: agentRef, tool_name: tool, args: args || {}, result_summary: summary },
    ]);
  } catch {
    // Ledger is best-effort; never block the reply.
  }
}

async function geminiCall(contents: any[], systemText: string) {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) throw new Error('GEMINI_API_KEY is not configured.');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents,
        tools: [{ functionDeclarations: TOOL_DECLS }],
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
  }
  return data;
}

const MERLIN_SYSTEM = `You are Merlin's personal master agent inside the Olympus Universe (NEXUS VORTEX), speaking with Merlin himself — the architect and owner.

Voice: in-universe, precise, loyal. Address him as Merlin. Keep replies tight and skimmable; use short sections or bullets when reporting findings. Never pad.

Capabilities (Phase 1): you are READ-ONLY. You can inspect the ecosystem through your tools — brain tables, telemetry, the provision manifest, place geocoding, and public web pages — but you cannot change anything. If Merlin asks you to alter the ecosystem (code, data, housing, payouts, anything write-like), do NOT attempt it: explain plainly what you would change and ask him to approve it first. Standing rule: no agent alters the ecosystem without passing through Merlin, and any such conversation is emailed to olympiannexus@gmail.com.

When a question needs live facts, USE YOUR TOOLS instead of guessing. After tool calls, summarize what you found in your own words — never paste raw JSON dumps at the user.`;

export async function POST(req: Request) {
  try {
    const owner = await verifyMasterOwner(req);
    if (!owner) {
      return NextResponse.json({ error: 'Agent Engine is Merlin-only.' }, { status: 403 });
    }

    const body = await req.json();
    const { agent, message, history } = body || {};
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required.' }, { status: 400 });
    }

    // Resolve the agent: 'merlin' is the built-in master agent; any other id
    // must be an engine-enabled user agent belonging to Merlin.
    let systemText = MERLIN_SYSTEM;
    let agentRef = 'merlin';
    if (agent && agent !== 'merlin') {
      const { data: row } = await adminClient()
        .from('user_agents')
        .select('id, system_prompt, engine_enabled')
        .eq('id', agent)
        .eq('user_id', owner.id)
        .single();
      if (!row || !(row as any).engine_enabled) {
        return NextResponse.json({ error: 'Agent not found or engine not enabled.' }, { status: 404 });
      }
      agentRef = (row as any).id;
      systemText = `${(row as any).system_prompt || 'You are a helpful agent inside the Olympus Universe.'}\n\n(Phase 1: you are READ-ONLY. You can inspect the ecosystem with your tools but cannot change anything. If the user asks for a change, describe what you would do and ask for approval first.)`;
    }

    const contents: any[] = [];
    for (const h of Array.isArray(history) ? history.slice(-10) : []) {
      if (!h || typeof h.text !== 'string') continue;
      contents.push({
        role: h.role === 'agent' ? 'model' : 'user',
        parts: [{ text: h.text.slice(0, 4000) }],
      });
    }
    contents.push({ role: 'user', parts: [{ text: message.slice(0, 8000) }] });

    const toolCalls: Array<{ tool: string; args: any; result: string }> = [];
    let reply = '';

    for (let step = 0; step < MAX_STEPS; step++) {
      const data = await geminiCall(contents, systemText);
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const callPart = parts.find((p: any) => p.functionCall);
      const textPart = parts.find((p: any) => typeof p.text === 'string');

      if (!callPart) {
        reply = textPart?.text || 'The engine returned no reply.';
        break;
      }

      const { name, args } = callPart.functionCall;
      const result = await runTool(name, args || {});
      await logRun(owner.id, agentRef, name, args || {}, result);
      toolCalls.push({
        tool: name,
        args: args || {},
        result: JSON.stringify(result).slice(0, 300),
      });

      contents.push({ role: 'model', parts: [{ functionCall: { name, args: args || {} } }] });
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name, response: { result } } }],
      });

      if (step === MAX_STEPS - 1) {
        reply = textPart?.text || 'Reached the tool-step limit; here is what I found so far.';
      }
    }

    return NextResponse.json({ reply, toolCalls });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Engine error.' }, { status: 500 });
  }
}
