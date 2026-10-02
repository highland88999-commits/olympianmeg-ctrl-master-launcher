// app/api/muse/console/route.js — the in-house console backend.
//
// MERLIN ONLY. Every action verifies the caller's Supabase session belongs to
// the owner (same gate as the Babel Keeper seal and the ARES lock). 401 for
// missing/invalid tokens, 403 for signed-in non-owners. No sensitive data ever
// leaves this route for anyone else.
//
// POST { access_token, action, ...params }
// Actions:
//   list_threads                       -> threads with unread counts
//   get_thread { thread_id }           -> messages (marks user msgs read)
//   reply { thread_id, body }          -> Merlin's reply, visible in the portal
//   close_thread { thread_id }
//   list_hermes_pending                -> hermes_links awaiting review
//   hermes_approve { id }              -> publish the listing (12-month term)
//   hermes_reject { id }               -> reject the listing
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getAdminClient } from '@/lib/muse/server';
import { verifyOwnerSession } from '@/lib/owner';
import { listingExpiryIso } from '@/lib/hermes/listings';

async function requireMerlin(accessToken) {
  const { user } = await verifyOwnerSession(accessToken);
  return user;
}

async function listThreads(admin) {
  const { data: threads } = await admin
    .from('muse_threads')
    .select('id, page_url, status, created_at, last_message_at')
    .order('last_message_at', { ascending: false })
    .limit(100);
  const out = [];
  for (const t of threads || []) {
    const { count } = await admin
      .from('muse_messages')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', t.id)
      .eq('sender', 'user')
      .eq('is_read', false);
    const { data: last } = await admin
      .from('muse_messages')
      .select('body, sender, created_at')
      .eq('thread_id', t.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    out.push({ ...t, unread: count || 0, preview: last?.body?.slice(0, 120) || '', preview_sender: last?.sender || null });
  }
  return out;
}

export const POST = apiGuard(async function POST(req) {
  let body = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const accessToken = typeof body?.access_token === 'string' ? body.access_token : null;
  if (!accessToken) {
    return Response.json({ ok: false, error: 'Sign in first.' }, { status: 401 });
  }
  const merlin = await requireMerlin(accessToken);
  if (!merlin) {
    return Response.json({ ok: false, error: 'This console is private.' }, { status: 403 });
  }

  const admin = getAdminClient();
  const action = body?.action;

  if (action === 'list_threads') {
    return Response.json({ ok: true, threads: await listThreads(admin) });
  }

  if (action === 'get_thread') {
    const threadId = body?.thread_id;
    if (!threadId) return Response.json({ ok: false, error: 'thread_id required.' }, { status: 400 });
    const { data: messages } = await admin
      .from('muse_messages')
      .select('id, sender, body, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(200);
    // Opening the thread marks the visitor's messages as read.
    await admin.from('muse_messages').update({ is_read: true }).eq('thread_id', threadId).eq('sender', 'user');
    return Response.json({ ok: true, messages: messages || [] });
  }

  if (action === 'reply') {
    const threadId = body?.thread_id;
    const text = typeof body?.body === 'string' ? body.body.trim() : '';
    if (!threadId || !text) {
      return Response.json({ ok: false, error: 'thread_id and body are required.' }, { status: 400 });
    }
    if (text.length > 4000) {
      return Response.json({ ok: false, error: 'Keep replies under 4000 characters.' }, { status: 400 });
    }
    const { error } = await admin.from('muse_messages').insert({
      thread_id: threadId,
      sender: 'merlin',
      body: text,
      is_read: true,
    });
    if (error) throw new Error('Could not send the reply.');
    await admin.from('muse_threads').update({ last_message_at: new Date().toISOString(), status: 'replied' }).eq('id', threadId);
    return Response.json({ ok: true });
  }

  if (action === 'close_thread') {
    const threadId = body?.thread_id;
    if (!threadId) return Response.json({ ok: false, error: 'thread_id required.' }, { status: 400 });
    await admin.from('muse_threads').update({ status: 'closed' }).eq('id', threadId);
    return Response.json({ ok: true });
  }

  if (action === 'list_hermes_pending') {
    const { data } = await admin
      .from('hermes_links')
      .select('id, name, url, root_domain, category, payment_status, created_at, approved_at, expires_at')
      .in('payment_status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
      .limit(100);
    return Response.json({ ok: true, listings: data || [] });
  }

  if (action === 'hermes_approve') {
    const id = body?.id;
    if (!id) return Response.json({ ok: false, error: 'id required.' }, { status: 400 });
    const { error } = await admin
      .from('hermes_links')
      .update({
        payment_status: 'approved',
        approved_at: new Date().toISOString(),
        expires_at: listingExpiryIso(),
      })
      .eq('id', id)
      .in('payment_status', ['pending', 'rejected', 'expired']);
    if (error) throw new Error('Could not approve the listing.');
    return Response.json({ ok: true });
  }

  if (action === 'hermes_reject') {
    const id = body?.id;
    if (!id) return Response.json({ ok: false, error: 'id required.' }, { status: 400 });
    const { error } = await admin
      .from('hermes_links')
      .update({ payment_status: 'rejected' })
      .eq('id', id)
      .in('payment_status', ['pending', 'approved']);
    if (error) throw new Error('Could not reject the listing.');
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false, error: 'Unknown action.' }, { status: 400 });
});
