// app/api/agent-engine/command/route.ts — Agent Engine runtime (Phase 1).
//
// Merlin-gated command endpoint for the Agent Engine console at
// /agent-engine. Drives a Gemini function-calling loop over the engine
// toolset: read tools run free (brain, telemetry, places, manifest, web,
// store catalog); WRITE tools (store_create_product, store_buy_link) NEVER
// execute without the user's explicit per-action approval — the runtime
// returns a confirmation request, the console renders APPROVE/DECLINE,
// and execution also notifies Merlin (in-app + email). Every tool call
// is written to the agent_runs ledger via the service-role client
// (best effort — a ledger failure never blocks the reply).
//
// Standing governance: no agent may edit the housing / alter the
// ecosystem without passing through Merlin first. Store writes follow
// the same law: explicit approval per action + email to
// olympiannexus@gmail.com on execution.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { searchPlaces } from '@/lib/geo';
import { CUSTOM_PRODUCTS, placementsFor } from '@/lib/store/custom-products';
import { listCreationRecords, getCreationRecord } from '@/lib/store/custom-creations';
import { notifyMerlin } from '@/lib/muse/server';

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
  {
    name: 'store_list_templates',
    description: 'List the custom-product templates (hoodie, tee, mug, …) with CAD prices, print dimensions, placements, and sizes. Call this before quoting any price or print spec for a user creation.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'store_list_creations',
    description: 'List published creator-marketplace creations (newest first). Optionally filter by creator user id.',
    parameters: {
      type: 'object',
      properties: {
        creator: { type: 'string', description: 'Supabase user id to filter by. Omit for all.' },
        limit: { type: 'number', description: 'Max records, 1-50. Default 20.' },
      },
    },
  },
  {
    name: 'store_get_creation',
    description: 'Get one creation record by its Printful sync product id or Stripe product id: pricing, mockup, template, share info.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Printful sync id (bare or pf_<id>) or Stripe product id.' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'store_create_product',
    description: 'CREATE A REAL PRODUCT: uploads the art to Printful Files, mints a real Printful sync product in the Omega store and a real Stripe product, and publishes it to the creator marketplace. IRREVERSIBLE. You MUST present the exact design, template, and final price to the user and get explicit approval BEFORE calling — the call only executes when the user has approved it in this conversation.',
    parameters: {
      type: 'object',
      properties: {
        productKey: { type: 'string', description: 'Template key from store_list_templates, e.g. "hoodie".' },
        designName: { type: 'string', description: 'Name for the design (max 80 chars).' },
        markup: { type: 'string', description: 'Creator markup in CAD dollars, e.g. "20". Max 4x the baseline.' },
        images: {
          type: 'array',
          description: 'One entry per placement: {key, imageBase64|storagePath|sameAs}. imageBase64 is a PNG at the template print size; storagePath is a staged upload path; sameAs names another placement key to reuse.',
          items: { type: 'object' },
        },
      },
      required: ['productKey', 'designName', 'images'],
    },
  },
  {
    name: 'store_buy_link',
    description: 'Mint a Stripe Checkout URL for a creation so the user can buy it. MOVES MONEY — only call with the user\'s explicit approval of the exact product, size, and price.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Creation product id (pf_<id>, bare id, or Stripe product id).' },
        size: { type: 'string', description: 'Size for multi-variant products, e.g. "L".' },
      },
      required: ['productId'],
    },
  },
];

// Tools that perform real, irreversible writes. They NEVER execute on a
// model's first call: the runtime returns a confirmation request instead,
// and only runs the tool when the UI sends back the user's explicit
// approval (confirmed[] entries matched by confirmKey).
const WRITE_TOOLS = new Set(['store_create_product', 'store_buy_link']);

function stableStringify(v: any): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

function confirmKeyFor(tool: string, args: any): string {
  return crypto.createHash('sha256').update(tool + ':' + stableStringify(args || {})).digest('hex').slice(0, 24);
}

// ---------------------------------------------------------------------------
// Tool implementations (server side). Reads run free; WRITE_TOOLS only run
// when ctx.confirmedKeys contains the call's confirmKey (the UI sends the
// user's explicit approval). Otherwise a confirmation request is returned.
// ---------------------------------------------------------------------------
type ToolCtx = {
  origin: string;
  authHeader: string | null;
  confirmedKeys: Set<string>;
  confirmationRequests: Array<{ tool: string; args: any; confirmKey: string; summary: string }>;
};

function summarizeWriteCall(tool: string, args: any): string {
  if (tool === 'store_create_product') {
    const tpl = CUSTOM_PRODUCTS.find((p: any) => p.key === args?.productKey);
    const base = tpl ? Number((tpl as any).priceCents || 0) : 0;
    const mk = Math.round(Number(args?.markup || 0) * 100);
    const finalCad = ((base + mk) / 100).toFixed(2);
    const placements = Array.isArray(args?.images) ? args.images.map((i: any) => i.key).join(', ') : '';
    return `Create "${String(args?.designName || 'Untitled').slice(0, 60)}" on ${tpl ? (tpl as any).name : args?.productKey} — placements: ${placements} — final price CAD $${finalCad} (baseline $${(base / 100).toFixed(2)} + markup $${(mk / 100).toFixed(2)}). This mints a REAL Printful product and a REAL Stripe product.`;
  }
  if (tool === 'store_buy_link') {
    return `Mint a Stripe Checkout link for product ${args?.productId}${args?.size ? ` (size ${args.size})` : ''}. This moves real money.`;
  }
  return `Execute ${tool}.`;
}

async function emailMerlin(subject: string, html: string) {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return;
    const from = process.env.RESEND_FROM || 'Artemis <onboarding@resend.dev>';
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [MASTER_OWNER_EMAIL], subject, html }),
    });
  } catch {
    // Email is best-effort; the in-app notification below is the primary channel.
  }
}

async function runTool(name: string, args: any, ctx: ToolCtx): Promise<any> {
  const admin = adminClient();

  // --- Write gate: no approval, no execution ---
  if (WRITE_TOOLS.has(name)) {
    const key = confirmKeyFor(name, args);
    if (!ctx.confirmedKeys.has(key)) {
      const summary = summarizeWriteCall(name, args);
      ctx.confirmationRequests.push({ tool: name, args: args || {}, confirmKey: key, summary });
      return {
        confirmation_required: true,
        summary,
        confirmKey: key,
        note: 'This action was NOT executed. Present the summary to the user and ask for explicit approval. When they approve, call the tool again with identical arguments.',
      };
    }
  }

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
        columns_seen: Array.from(keys).slice(0, 30),
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
    case 'store_list_templates': {
      return {
        templates: CUSTOM_PRODUCTS.map((p: any) => ({
          key: p.key,
          name: p.name,
          pickerLabel: p.pickerLabel,
          priceCad: p.priceCad,
          priceCents: p.priceCents,
          variantNote: p.variantNote,
          stageHint: p.stageHint,
          print: p.print,
          placements: placementsFor(p).map((pl: any) => ({ key: pl.key, label: pl.label })),
          sizes: (p.variants || []).map((v: any) => v.size),
          defaultSize: p.defaultSize || null,
        })),
      };
    }
    case 'store_list_creations': {
      const limit = Math.max(1, Math.min(50, Number(args?.limit) || 20));
      const { records } = await listCreationRecords({
        creatorUserId: args?.creator ? String(args.creator) : null,
        limit,
      });
      return {
        count: (records || []).length,
        creations: (records || []).map((r: any) => ({
          printfulProductId: r.printfulProductId,
          stripeProductId: r.stripeProductId,
          name: r.name || r.designName,
          productKey: r.productKey || r.templateKey,
          priceCents: r.finalCents ?? r.priceCents,
          mockupUrl: r.mockupUrl,
          shareUrl: r.printfulProductId ? `https://olympusverse.com/store?product=pf_${r.printfulProductId}` : null,
        })),
      };
    }
    case 'store_get_creation': {
      const raw = String(args?.productId || '').trim().replace(/^pf_/, '');
      if (!raw) return { error: 'productId is required' };
      const looksStripe = raw.startsWith('prod_');
      const rec: any = await getCreationRecord(
        looksStripe ? { stripeProductId: raw } : { printfulId: raw }
      );
      if (!rec) return { error: 'Creation not found.' };
      return {
        printfulProductId: rec.printfulProductId,
        stripeProductId: rec.stripeProductId,
        name: rec.name || rec.designName,
        productKey: rec.productKey || rec.templateKey,
        priceCents: rec.finalCents ?? rec.priceCents,
        mockupUrl: rec.mockupUrl,
        shareUrl: rec.printfulProductId ? `https://olympusverse.com/store?product=pf_${rec.printfulProductId}` : null,
      };
    }
    case 'store_create_product': {
      // Approved write: proxy to the canonical create route (server-authoritative
      // pricing, PNG validation, Printful + Stripe minting). Forward Merlin's
      // auth header so creator attribution attaches to him.
      const res = await fetch(new URL('/api/store/custom/create', ctx.origin), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ctx.authHeader ? { Authorization: ctx.authHeader } : {}),
        },
        body: JSON.stringify({
          productKey: args?.productKey,
          designName: args?.designName,
          markup: args?.markup,
          images: args?.images,
          fileName: args?.fileName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        return { error: data?.error || `Create failed (HTTP ${res.status}).` };
      }
      const summary = summarizeWriteCall(name, args);
      await notifyMerlin({
        title: 'Agent created a store product',
        body: summary.slice(0, 140),
        meta: { tool: name, productId: data.productId },
      });
      await emailMerlin(
        'Agent Engine: store product created',
        `<p>${summary}</p><p>Product id: ${data.productId || 'n/a'}</p><p>Mockup: ${data.mockupUrl || 'n/a'}</p>`
      );
      return {
        ok: true,
        productId: data.productId,
        productName: data.productName,
        mockupUrl: data.mockupUrl,
        finalCents: data.finalCents,
        stripeProductId: data.stripeProductId,
      };
    }
    case 'store_buy_link': {
      const res = await fetch(new URL('/api/store/custom/buy', ctx.origin), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ctx.authHeader ? { Authorization: ctx.authHeader } : {}),
        },
        body: JSON.stringify({ productId: args?.productId, size: args?.size }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false || !data?.url) {
        return { error: data?.error || `Buy link failed (HTTP ${res.status}).` };
      }
      const summary = summarizeWriteCall(name, args);
      await notifyMerlin({
        title: 'Agent minted a checkout link',
        body: summary.slice(0, 140),
        meta: { tool: name, productId: args?.productId },
      });
      await emailMerlin('Agent Engine: checkout link minted', `<p>${summary}</p>`);
      return { ok: true, checkoutUrl: data.url, type: data.type || 'stripe' };
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

When a question needs live facts, USE YOUR TOOLS instead of guessing. After tool calls, summarize what you found in your own words — never paste raw JSON dumps at the user.

STORE TOOLS (user creations pipeline): store_list_templates quotes real CAD prices and print specs; store_list_creations / store_get_creation inspect published creations; store_create_product mints a REAL Printful + Stripe product (irreversible); store_buy_link mints a real checkout (moves money). The two write tools NEVER execute on first call — you will receive a confirmation request instead. Your job: present the summary (exact design, template, final price) to the user in plain words and ask for explicit approval. Only when they approve, call the tool again with IDENTICAL arguments — the approval is attached and it will execute. Never reword, shave, or "improve" the arguments between the ask and the call.`;

export async function POST(req: Request) {
  try {
    const owner = await verifyMasterOwner(req);
    if (!owner) {
      return NextResponse.json({ error: 'Agent Engine is Merlin-only.' }, { status: 403 });
    }

    const body = await req.json();
    const { agent, message, history, confirmed } = body || {};
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required.' }, { status: 400 });
    }

    // Explicit user approvals for write tools, matched by confirmKey.
    const confirmedKeys = new Set<string>();
    for (const c of Array.isArray(confirmed) ? confirmed : []) {
      if (c && typeof c.confirmKey === 'string') confirmedKeys.add(c.confirmKey);
    }
    const ctx: ToolCtx = {
      origin: new URL(req.url).origin,
      authHeader: req.headers.get('Authorization'),
      confirmedKeys,
      confirmationRequests: [],
    };

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
      const result = await runTool(name, args || {}, ctx);
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

    return NextResponse.json({ reply, toolCalls, confirmationRequests: ctx.confirmationRequests });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Engine error.' }, { status: 500 });
  }
}
