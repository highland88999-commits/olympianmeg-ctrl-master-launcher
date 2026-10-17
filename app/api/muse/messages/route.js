// app/api/muse/messages/route.js — the public Muse portal message API.
//
// PUBLIC by design (Merlin: the helper portal stays open to everyone,
// signed-in or not). Anonymous visitors can open the portal and send
// messages — no auth gate here, ever. Sensitive data is protected by the
// no-leak rule in lib/muse/responder.js, not by locking the portal.
//
// POST { thread_id?, message, page_url?, access_token? }
//   -> { ok, thread_id, reply, mode: 'ai'|'inbox'|'refusal' }
// GET ?thread_id= -> { ok, thread_id, status, messages: [...] }
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, notifyMerlin } from '@/lib/muse/server';
import { verifyOwnerSession } from '@/lib/owner';
import {
  decideReply,
  generateMuseReply,
  INBOX_AUTOREPLY,
} from '@/lib/muse/responder';

const MAX_MESSAGE = 4000;

async function loadHistory(admin, threadId) {
  const { data } = await admin
    .from('muse_messages')
    .select('sender, body')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(12);
  return data || [];
}

export const POST = apiGuard(async function POST(req) {
  let body = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return Response.json({ ok: false, error: 'Say something first.' }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE) {
    return Response.json({ ok: false, error: 'That message is too long — keep it under 4000 characters.' }, { status: 400 });
  }
  const pageUrl = typeof body?.page_url === 'string' ? body.page_url.slice(0, 512) : '';
  const threadHint = typeof body?.thread_id === 'string' ? body.thread_id : null;

  const admin = getAdminClient();

  // Optional identification: if the visitor is signed in as Merlin, the
  // responder may discuss sensitive topics with him. Everyone else — and
  // anonymous visitors — get the public experience. Missing/invalid tokens
  // are NOT an error here.
  let isMerlin = false;
  let userId = null;
  if (typeof body?.access_token === 'string' && body.access_token) {
    const { user } = await verifyOwnerSession(body.access_token);
    if (user) {
      isMerlin = true;
      userId = user.id;
    }
  }

  // Thread: resume or start.
  let threadId = threadHint;
  if (threadId) {
    const { data: existing } = await admin
      .from('muse_threads')
      .select('id, status')
      .eq('id', threadId)
      .maybeSingle();
    if (!existing) {
      return Response.json({ ok: false, error: 'Conversation not found — starting fresh is fine.' }, { status: 404 });
    }
    threadId = existing.id;
  } else {
    const { data: created, error } = await admin
      .from('muse_threads')
      .insert({ user_id: userId, page_url: pageUrl })
      .select('id')
      .single();
    if (error || !created) throw new Error('Could not start the conversation.');
    threadId = created.id;
  }

  await admin.from('muse_messages').insert({
    thread_id: threadId,
    sender: 'user',
    body: message,
  });
  await admin.from('muse_threads').update({ last_message_at: new Date().toISOString() }).eq('id', threadId);

  const decision = decideReply({
    message,
    isMerlin,
    hasAiKey: !!process.env.GEMINI_API_KEY,
  });

  let reply = decision.reply;
  let mode = decision.mode;

  if (mode === 'ai') {
    const history = await loadHistory(admin, threadId);
    const text = await generateMuseReply({ message, history });
    if (text) {
      reply = text;
    } else {
      // AI hiccup — fall back to the honest inbox path, never a fake answer.
      mode = 'inbox';
      reply = INBOX_AUTOREPLY;
    }
  }

  // The reply is delivered to the visitor instantly, so it is already read.
  // The visitor's own message stays unread until Merlin opens the thread.
  await admin.from('muse_messages').insert({
    thread_id: threadId,
    sender: 'muse',
    body: reply,
    is_read: true,
  });

  // Route EVERYTHING the portal agent does to Merlin (olympiannexus@gmail.com):
  // inbox-mode escalations and AI-handled replies alike land in his notifications.
  await notifyMerlin({
    title: mode === 'inbox' ? 'New portal message' : 'Muse AI replied',
    body: message.length > 140 ? message.slice(0, 140) + '…' : message,
    meta: { thread_id: threadId, page_url: pageUrl, mode },
  });

  return Response.json({ ok: true, thread_id: threadId, reply, mode });
});

export const GET = apiGuard(async function GET(req) {
  const url = new URL(req.url);
  const threadId = url.searchParams.get('thread_id');
  if (!threadId) {
    return Response.json({ ok: false, error: 'thread_id is required.' }, { status: 400 });
  }
  const admin = getAdminClient();
  const { data: thread } = await admin
    .from('muse_threads')
    .select('id, status')
    .eq('id', threadId)
    .maybeSingle();
  if (!thread) {
    return Response.json({ ok: false, error: 'Conversation not found.' }, { status: 404 });
  }
  const { data: messages } = await admin
    .from('muse_messages')
    .select('id, sender, body, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(100);
  return Response.json({ ok: true, thread_id: threadId, status: thread.status, messages: messages || [] });
});
