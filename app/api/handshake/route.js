// app/api/handshake/route.js — Bridge between Olympus portals and Merlin's
// old (frozen) Muse account help agent.
//
// Purpose: the help agent on the old account can't reach this repo's admin
// UI, but it CAN call this endpoint with a shared secret. This creates a
// shared work queue: bug reports from the BugReportButton and help requests
// from the Muse portal are pullable from either account, and responses
// pushed back here land in the right thread/table.
//
// Auth: Authorization: Bearer <HANDSHAKE_SECRET> (env var, set identically
// on both sides). No secret, no access. The secret is never logged.
//
//   GET  ?type=bug-reports&since=<ISO>   -> new bug reports since timestamp
//   GET  ?type=help-requests&since=<ISO>  -> Muse portal threads needing help
//   POST { action: 'bug-status', id, status }
//   POST { action: 'help-reply', thread_id, reply }
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/wallet/server';
import { getAdminClient } from '@/lib/muse/server';

const BUG_STATUSES = new Set(['open', 'in-progress', 'fixed', 'wont-fix']);

function checkSecret(req) {
  const secret = process.env.HANDSHAKE_SECRET;
  if (!secret) {
    const e = new Error('Handshake not configured.');
    e.status = 503;
    throw e;
  }
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token !== secret) {
    const e = new Error('Invalid handshake credentials.');
    e.status = 401;
    throw e;
  }
}

function parseSince(url) {
  const raw = url.searchParams.get('since');
  if (!raw) return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // default: last 24h
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() : d.toISOString();
}

export const GET = apiGuard(async function GET(req) {
  checkSecret(req);
  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const since = parseSince(url);

  if (type === 'bug-reports') {
    const admin = await getServiceClient();
    if (!admin) throw new Error('Database not connected.');
    const { data, error } = await admin
      .from('bug_reports')
      .select('id, user_id, page_url, description, steps, user_agent, viewport, status, created_at, updated_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw new Error('Could not load bug reports.');
    return Response.json({ ok: true, type: 'bug-reports', since, count: (data || []).length, reports: data || [] });
  }

  if (type === 'help-requests') {
    const admin = getAdminClient();
    // Threads in inbox mode = the AI escalated to a human. Those are the
    // ones the old account's help agent should pick up.
    const { data: threads, error } = await admin
      .from('muse_threads')
      .select('id, user_id, page_url, status, created_at, last_message_at')
      .eq('status', 'inbox')
      .gte('last_message_at', since)
      .order('last_message_at', { ascending: true })
      .limit(100);
    if (error) throw new Error('Could not load help requests.');

    // Attach the latest user message for context.
    const out = [];
    for (const t of threads || []) {
      const { data: msgs } = await admin
        .from('muse_messages')
        .select('sender, body, created_at')
        .eq('thread_id', t.id)
        .order('created_at', { ascending: false })
        .limit(6);
      const ordered = (msgs || []).reverse();
      const lastUser = [...ordered].reverse().find((m) => m.sender === 'user');
      out.push({ ...t, recent_messages: ordered, last_user_message: lastUser?.body || '' });
    }
    return Response.json({ ok: true, type: 'help-requests', since, count: out.length, threads: out });
  }

  const e = new Error("type must be 'bug-reports' or 'help-requests'.");
  e.status = 400;
  throw e;
});

export const POST = apiGuard(async function POST(req) {
  checkSecret(req);
  let body = {};
  try { body = await req.json(); } catch { /* validated below */ }

  const action = body.action;

  if (action === 'bug-status') {
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const status = typeof body.status === 'string' ? body.status.trim() : '';
    if (!id || !BUG_STATUSES.has(status)) {
      const e = new Error('Valid id and status (open|in-progress|fixed|wont-fix) required.');
      e.status = 400;
      throw e;
    }
    const admin = await getServiceClient();
    if (!admin) throw new Error('Database not connected.');
    const { error } = await admin.from('bug_reports').update({ status }).eq('id', id);
    if (error) throw new Error('Could not update bug report.');
    return Response.json({ ok: true, id, status });
  }

  if (action === 'help-reply') {
    const threadId = typeof body.thread_id === 'string' ? body.thread_id.trim() : '';
    const reply = typeof body.reply === 'string' ? body.reply.trim() : '';
    if (!threadId || !reply) {
      const e = new Error('thread_id and reply are required.');
      e.status = 400;
      throw e;
    }
    if (reply.length > 4000) {
      const e = new Error('Reply too long (max 4000 characters).');
      e.status = 400;
      throw e;
    }
    const admin = getAdminClient();
    const { data: thread } = await admin.from('muse_threads').select('id').eq('id', threadId).maybeSingle();
    if (!thread) {
      const e = new Error('Thread not found.');
      e.status = 404;
      throw e;
    }
    await admin.from('muse_messages').insert({
      thread_id: threadId,
      sender: 'muse',
      body: reply,
      is_read: true,
    });
    await admin.from('muse_threads').update({ last_message_at: new Date().toISOString() }).eq('id', threadId);
    return Response.json({ ok: true, thread_id: threadId });
  }

  const e = new Error("action must be 'bug-status' or 'help-reply'.");
  e.status = 400;
  throw e;
});
