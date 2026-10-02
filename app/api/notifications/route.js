// app/api/notifications/route.js — the signed-in user's notification inbox.
//   GET   /api/notifications -> { items, unread }
//   POST  /api/notifications -> send a friend_request / group_invite to another user
//   PATCH /api/notifications -> read | read_all | accept | decline (own rows only)
//
// 'system' and 'achievement' rows are server-issued only: this route rejects
// them from user tokens. Server code with the service-role client inserts them
// directly (see lib/notifications.js USER_SENDABLE_TYPES).
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import {
  validateNotificationCreate,
  validateNotificationPatch,
} from '@/lib/notifications';
import { answerFriendRequest } from '@/lib/friends';

export const GET = apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Notifications are not connected yet.' }, { status: 503 });

  const { data, error } = await admin
    .from('notifications')
    .select('id, type, title, body, actor_id, meta, read, created_at')
    .eq('recipient_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw error;

  const items = data || [];
  return NextResponse.json({
    ok: true,
    items,
    unread: items.filter((n) => !n.read).length,
  });
});

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const v = validateNotificationCreate(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  if (v.value.recipient_id === auth.user.id) {
    return NextResponse.json({ error: 'You cannot notify yourself.' }, { status: 400 });
  }

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Notifications are not connected yet.' }, { status: 503 });

  const { data, error } = await admin
    .from('notifications')
    .insert({
      recipient_id: v.value.recipient_id,
      type: v.value.type,
      title: v.value.title,
      body: v.value.body,
      actor_id: auth.user.id,
      meta: v.value.meta,
    })
    .select('id, type, title, body, actor_id, meta, read, created_at')
    .single();
  if (error) throw error;
  return NextResponse.json({ ok: true, notification: data });
});

export const PATCH = apiGuard(async function PATCH(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const v = validateNotificationPatch(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const admin = await getServiceClient();
  if (!admin) return NextResponse.json({ error: 'Notifications are not connected yet.' }, { status: 503 });

  const { action, ids } = v.value;

  if (action === 'read_all') {
    const { error } = await admin
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', auth.user.id)
      .eq('read', false);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  }

  if (action === 'read') {
    const { error } = await admin
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', auth.user.id)
      .in('id', ids);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  }

  // accept / decline: mark read, stamp the decision in meta.handled.
  // Friend requests carrying meta.friendship_id write the real friendship
  // row here (via the same answer flow as POST /api/friends/respond);
  // legacy metadata-only rows keep the stamp below.
  const { data: rows, error: readErr } = await admin
    .from('notifications')
    .select('id, type, meta')
    .eq('recipient_id', auth.user.id)
    .in('id', ids);
  if (readErr) throw readErr;

  for (const row of rows || []) {
    if (row.type === 'friend_request' && row.meta && row.meta.friendship_id) {
      try {
        await answerFriendRequest(admin, {
          userId: auth.user.id,
          friendshipId: row.meta.friendship_id,
          action,
        });
      } catch {
        // fall through to the metadata stamp (already handled / gone)
      }
    }
    const meta = { ...(row.meta || {}), handled: true, decision: action };
    const { error } = await admin
      .from('notifications')
      .update({ meta, read: true })
      .eq('id', row.id)
      .eq('recipient_id', auth.user.id);
    if (error) throw error;
  }
  return NextResponse.json({ ok: true, handled: (rows || []).map((r) => r.id) });
});

