// app/api/billboards/queue/route.js
// Billboard Manager queue — staged queue + Send (Portal Menu Graphics
// pattern). MERLIN ONLY for writes; reads split by caller:
//   GET without auth  -> sent batches only (the builder's read path;
//                        ad content is destined for public display)
//   GET with owner auth -> every row (staged + sent, the manager view)
//   POST (owner only) -> stage / unstage / clear-staged / send /
//                        clear-live
// The manager NEVER writes live billboards: staging here only flips
// rows between staged and sent. Live = the repo manifest
// (public/billboards/manifest.json), written by the builder via the
// push path. Until that push lands, the hub keeps showing its
// previous creative — never half-live.
//
// A missing billboard_queue table (migration not run yet) answers
// { ok: false, error: 'not_ready' } — the manager shows its honest
// not-set-up state instead of erroring.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { isOwnerEmail } from '@/lib/owner';
import {
  isValidBillboardNumber,
  validateAdEntry,
  validateRemovalRow,
  normalizeRotationSeconds,
} from '@/lib/billboards/validate';

const TABLE = 'billboard_queue';

function notFound() {
  return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
}

function storagePublicPrefix() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/billboard-creatives/`;
}

async function requireOwner(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return { error: NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 }) };
  if (!isOwnerEmail(auth.user?.email)) return { error: notFound() };
  return { user: auth.user };
}

async function requireAdmin() {
  const admin = await getServiceClient();
  if (!admin) return { error: NextResponse.json({ ok: false, error: 'The billboard service is not connected yet.' }, { status: 503 }) };
  return { admin };
}

function publicRow(r) {
  return {
    id: r.id,
    kind: r.kind,
    billboardNumber: r.billboard_number,
    companyName: r.company_name,
    linkUrl: r.link_url,
    creativeType: r.creative_type,
    creativeUrl: r.creative_url,
    rotationIntervalSeconds: r.rotation_interval_seconds,
    status: r.status,
    batchId: r.batch_id,
    createdAt: r.created_at,
    sentAt: r.sent_at,
  };
}

export async function GET(req) {
  const { admin, error: adminError } = await requireAdmin();
  if (adminError) return adminError;
  // Owner view when a token is presented and proves ownership;
  // anyone else gets the sent-only builder view.
  const authHeader = req.headers.get('authorization') || '';
  let owner = false;
  if (authHeader.startsWith('Bearer ')) {
    const auth = await getUserFromRequest(req);
    owner = !auth.error && isOwnerEmail(auth.user?.email);
  }
  let query = admin.from(TABLE).select('*').order('created_at', { ascending: true });
  if (!owner) query = query.eq('status', 'sent');
  const { data, error } = await query;
  if (error) {
    // Missing table (migration not run) is the honest not-ready state.
    if (/does not exist|relation .* does not exist/i.test(error.message || '')) {
      return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: 'Could not read the queue.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, owner, rows: (data || []).map(publicRow) });
}

export async function POST(req) {
  const { error: ownerError } = await requireOwner(req);
  if (ownerError) return ownerError;
  const { admin, error: adminError } = await requireAdmin();
  if (adminError) return adminError;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }
  const action = body?.action;

  if (action === 'stage') {
    const prefix = storagePublicPrefix();
    if (!prefix) {
      return NextResponse.json({ ok: false, error: 'Creative storage is not configured yet.' }, { status: 503 });
    }
    const number = Number(body?.billboardNumber);
    const interval = normalizeRotationSeconds(body?.rotationIntervalSeconds);
    if (!isValidBillboardNumber(number)) {
      return NextResponse.json({ ok: false, error: 'Pick a billboard number from 1 to 44.' }, { status: 400 });
    }
    if (interval === null) {
      return NextResponse.json({ ok: false, error: 'Rotation is 5 to 60 seconds per face.' }, { status: 400 });
    }
    if (body?.kind === 'remove') {
      const reasons = validateRemovalRow({ billboardNumber: number, companyName: body?.companyName, linkUrl: body?.linkUrl });
      if (reasons.length) return NextResponse.json({ ok: false, error: reasons[0] }, { status: 400 });
      const { data, error } = await admin.from(TABLE).insert({
        kind: 'remove',
        billboard_number: number,
        company_name: String(body.companyName).trim(),
        link_url: String(body.linkUrl).trim(),
        creative_type: null,
        creative_url: null,
        rotation_interval_seconds: interval,
        status: 'staged',
      }).select('*').single();
      if (error) return NextResponse.json({ ok: false, error: 'Could not stage that removal.' }, { status: 502 });
      return NextResponse.json({ ok: true, row: publicRow(data) });
    }
    const entry = {
      companyName: body?.companyName,
      linkUrl: body?.linkUrl,
      creativeType: body?.creativeType,
      creativeUrl: body?.creativeUrl,
    };
    const reasons = validateAdEntry(entry, prefix);
    if (reasons.length) return NextResponse.json({ ok: false, error: reasons[0] }, { status: 400 });
    const { data, error } = await admin.from(TABLE).insert({
      kind: 'ad',
      billboard_number: number,
      company_name: String(entry.companyName).trim(),
      link_url: String(entry.linkUrl).trim(),
      creative_type: entry.creativeType,
      creative_url: entry.creativeUrl,
      rotation_interval_seconds: interval,
      status: 'staged',
    }).select('*').single();
    if (error) return NextResponse.json({ ok: false, error: 'Could not stage that ad.' }, { status: 502 });
    return NextResponse.json({ ok: true, row: publicRow(data) });
  }

  if (action === 'unstage') {
    if (!body?.id) return NextResponse.json({ ok: false, error: 'Missing queue entry.' }, { status: 400 });
    const { error } = await admin.from(TABLE).delete().eq('id', body.id).eq('status', 'staged');
    if (error) return NextResponse.json({ ok: false, error: 'Could not remove that entry.' }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'clear-staged') {
    const { error } = await admin.from(TABLE).delete().eq('status', 'staged');
    if (error) return NextResponse.json({ ok: false, error: 'Could not clear the queue.' }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'send') {
    const batchId = crypto.randomUUID();
    const { data, error } = await admin.from(TABLE)
      .update({ status: 'sent', batch_id: batchId, sent_at: new Date().toISOString() })
      .eq('status', 'staged')
      .select('id');
    if (error) return NextResponse.json({ ok: false, error: 'Could not send the queue.' }, { status: 502 });
    if (!data || data.length === 0) {
      return NextResponse.json({ ok: false, error: 'Nothing is staged to send.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, batchId, count: data.length });
  }

  if (action === 'clear-live') {
    const ids = Array.isArray(body?.ids) ? body.ids.filter((v) => typeof v === 'string') : [];
    if (ids.length === 0) return NextResponse.json({ ok: false, error: 'Nothing to clear.' }, { status: 400 });
    const { error } = await admin.from(TABLE).delete().in('id', ids).eq('status', 'sent');
    if (error) return NextResponse.json({ ok: false, error: 'Could not clear those entries.' }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 400 });
}
