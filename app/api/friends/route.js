// app/api/friends/route.js — Unified friends API.
// Single source of truth for friend states across the board (Order 67,
// profiles, and every other surface). States: 'pending' | 'accepted' | 'blocked'.
// Friend states NEVER gate calls — anyone with a room code/link can join.
// They are remembered here so every surface shows the same truth.
//
// GET    ?user_id= — list all friendships for a user (both directions)
// POST   { addressee_id } — send a friend request (creates 'pending')
// PATCH  { friendship_id, status } — accept/block (addressee only)
// DELETE ?friendship_id= — remove (either party)

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/trifold/server';
import { apiGuard } from '@/lib/api-guard';

const VALID_STATUSES = ['pending', 'accepted', 'blocked'];

async function getUser(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const admin = await getServiceClient();
  const { data: { user } } = await admin.auth.getUser(token);
  return user || null;
}

export const GET = apiGuard(async function GET(req) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const admin = await getServiceClient();
  const { data, error } = await admin
    .from('friendships')
    .select('id, requester_id, addressee_id, status, created_at, updated_at')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Could not load friends.' }, { status: 500 });
  return NextResponse.json({ ok: true, friendships: data || [] });
});

export const POST = apiGuard(async function POST(req) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const addressee_id = String(body.addressee_id || '').trim();
  if (!addressee_id) return NextResponse.json({ error: 'Who is this for?' }, { status: 400 });
  if (addressee_id === user.id) return NextResponse.json({ error: 'That is you.' }, { status: 400 });
  const admin = await getServiceClient();
  // idempotent: return existing if already there (either direction)
  const { data: existing } = await admin
    .from('friendships')
    .select('id, status')
    .or(`and(requester_id.eq.${user.id},addressee_id.eq.${addressee_id}),and(requester_id.eq.${addressee_id},addressee_id.eq.${user.id})`)
    .limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json({ ok: true, friendship: existing[0], duplicate: true });
  }
  const { data, error } = await admin
    .from('friendships')
    .insert({ requester_id: user.id, addressee_id, status: 'pending' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: 'Could not send the request.' }, { status: 500 });
  return NextResponse.json({ ok: true, friendship: data });
});

export const PATCH = apiGuard(async function PATCH(req) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const friendship_id = String(body.friendship_id || '').trim();
  const status = String(body.status || '').trim().toLowerCase();
  if (!friendship_id || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const admin = await getServiceClient();
  // only the addressee can accept/block; requester can cancel (delete instead)
  const { data: row } = await admin
    .from('friendships')
    .select('id, addressee_id')
    .eq('id', friendship_id)
    .single();
  if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (row.addressee_id !== user.id) {
    return NextResponse.json({ error: 'Only they can answer this one.' }, { status: 403 });
  }
  const { data, error } = await admin
    .from('friendships')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', friendship_id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: 'Could not update.' }, { status: 500 });
  return NextResponse.json({ ok: true, friendship: data });
});

export const DELETE = apiGuard(async function DELETE(req) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const friendship_id = String(searchParams.get('friendship_id') || '').trim();
  if (!friendship_id) return NextResponse.json({ error: 'Which one?' }, { status: 400 });
  const admin = await getServiceClient();
  const { data: row } = await admin
    .from('friendships')
    .select('id, requester_id, addressee_id')
    .eq('id', friendship_id)
    .single();
  if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (row.requester_id !== user.id && row.addressee_id !== user.id) {
    return NextResponse.json({ error: 'Not yours.' }, { status: 403 });
  }
  const { error } = await admin.from('friendships').delete().eq('id', friendship_id);
  if (error) return NextResponse.json({ error: 'Could not remove.' }, { status: 500 });
  return NextResponse.json({ ok: true });
});
