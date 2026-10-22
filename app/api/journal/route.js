// app/api/journal/route.js — the Journal API (Merlin, 2026-10-22).
//   GET    /api/journal?q=&order=desc|asc  -> { ok: true, entries, order }
//   POST   /api/journal { title?, body }   -> { ok: true, entry }   (201)
//   PATCH  /api/journal { id, title?, body? } -> { ok: true, entry }
//   DELETE /api/journal?id=<uuid>          -> { ok: true }
//
// Mirrors the per-user pattern of app/api/ui-state/route.js: the caller
// is resolved from the Supabase bearer token (getUserFromRequest) and
// every query is explicitly scoped to that user_id — users can only
// ever see or touch their own entries (RLS in supabase/journal.sql is
// the second lock; the service client bypasses RLS, this scoping does
// not). Timestamps are the database's job: created_at comes from the
// column default now() and is NEVER read from the request; updated_at
// is bumped here on edit.
//
// Honest degradation: until supabase/journal.sql is run (Merlin's
// green light), the table is absent and every method answers
// 503 { ok: false, setupRequired: true } — the page shows its
// setup-pending state and nothing is ever fake-saved.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import {
  normalizeOrder,
  buildSearchOrFilter,
  sanitizeEntryInput,
  isMissingTableError,
} from '@/lib/journal/entries';

const TABLE = 'journal_entries';
const COLUMNS = 'id, title, body, created_at, updated_at';
const LIST_LIMIT = 500;

function setupPending() {
  return NextResponse.json(
    { ok: false, setupRequired: true, error: 'Journal storage is still being set up.' },
    { status: 503 }
  );
}

async function requireUserAndDb(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }
  const admin = await getServiceClient();
  if (!admin) return { response: setupPending() };
  return { user: auth.user, admin };
}

export const GET = noCache(
  apiGuard(async function GET(req) {
    const ctx = await requireUserAndDb(req);
    if (ctx.response) return ctx.response;
    const { user, admin } = ctx;

    const params = new URL(req.url).searchParams;
    const order = normalizeOrder(params.get('order'));
    const orFilter = buildSearchOrFilter(params.get('q'));

    let query = admin
      .from(TABLE)
      .select(COLUMNS)
      .eq('user_id', user.id)
      .order('created_at', { ascending: order === 'asc' })
      .limit(LIST_LIMIT);
    if (orFilter) query = query.or(orFilter);

    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error)) return setupPending();
      throw error;
    }
    return NextResponse.json({ ok: true, entries: data || [], order });
  })
);

export const POST = noCache(
  apiGuard(async function POST(req) {
    const ctx = await requireUserAndDb(req);
    if (ctx.response) return ctx.response;
    const { user, admin } = ctx;

    const payload = await req.json().catch(() => null);
    const clean = sanitizeEntryInput(payload);
    if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });

    // Only the sanitised title/body plus the caller's own id are
    // inserted — created_at/updated_at come from the DB defaults.
    const { data, error } = await admin
      .from(TABLE)
      .insert({ user_id: user.id, title: clean.value.title, body: clean.value.body })
      .select(COLUMNS)
      .single();
    if (error) {
      if (isMissingTableError(error)) return setupPending();
      throw error;
    }
    return NextResponse.json({ ok: true, entry: data }, { status: 201 });
  })
);

export const PATCH = noCache(
  apiGuard(async function PATCH(req) {
    const ctx = await requireUserAndDb(req);
    if (ctx.response) return ctx.response;
    const { user, admin } = ctx;

    const payload = await req.json().catch(() => null);
    const id = payload && typeof payload.id === 'string' ? payload.id : '';
    if (!id) return NextResponse.json({ error: 'An entry id is required.' }, { status: 400 });

    const clean = sanitizeEntryInput(payload, { partial: true });
    if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });

    const patch = { ...clean.value, updated_at: new Date().toISOString() };
    const { data, error } = await admin
      .from(TABLE)
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) return setupPending();
      throw error;
    }
    if (!data) return NextResponse.json({ error: 'That entry is not yours to edit.' }, { status: 404 });
    return NextResponse.json({ ok: true, entry: data });
  })
);

export const DELETE = noCache(
  apiGuard(async function DELETE(req) {
    const ctx = await requireUserAndDb(req);
    if (ctx.response) return ctx.response;
    const { user, admin } = ctx;

    const id = new URL(req.url).searchParams.get('id') || '';
    if (!id) return NextResponse.json({ error: 'An entry id is required.' }, { status: 400 });

    const { error } = await admin
      .from(TABLE)
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) {
      if (isMissingTableError(error)) return setupPending();
      throw error;
    }
    return NextResponse.json({ ok: true });
  })
);
