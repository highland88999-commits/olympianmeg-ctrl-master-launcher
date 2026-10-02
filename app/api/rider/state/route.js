// app/api/rider/state/route.js
// Per-account rider persistence for the hub TRON bike.
//
// GET  -> the caller's rider_state row (or { ok: true, state: null }).
// POST -> upsert { x, y, z, realm } for the caller.
//
// Auth: the Supabase access token rides in the Authorization header and the
// user_id is derived server-side from it (requireUser below) — the client
// NEVER asserts identity. Writes use the service-role key: the rider_state
// table carries NO client write policies (owner-read only), so the only
// write path is this route. Server-only: never import into client code.

import { createClient } from '@supabase/supabase-js';
import { getRiderState, saveRiderState } from '@/lib/rider-state-server';

let _anon = null;
let _service = null;

function anonClient() {
  if (!_anon) {
    _anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    );
  }
  return _anon;
}

function serviceClient() {
  if (!_service) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('rider/state: Supabase service role is not configured.');
    }
    _service = createClient(url, key, { auth: { persistSession: false } });
  }
  return _service;
}

/** The caller, from their own access token — or null when unsigned. */
async function requireUser(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const {
      data: { user },
    } = await anonClient().auth.getUser(token);
    return user || null;
  } catch {
    return null;
  }
}

function cloudReady() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(request) {
  if (!cloudReady()) {
    return Response.json(
      { ok: false, error: 'Cloud backend is not configured.' },
      { status: 503 }
    );
  }
  try {
    const user = await requireUser(request);
    const { status, body } = await getRiderState({ db: serviceClient(), user });
    return Response.json(body, { status });
  } catch {
    return Response.json(
      { ok: false, error: 'Could not load your rider state.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  if (!cloudReady()) {
    return Response.json(
      { ok: false, error: 'Cloud backend is not configured.' },
      { status: 503 }
    );
  }
  try {
    const user = await requireUser(request);
    let payload = null;
    try {
      payload = await request.json();
    } catch {
      payload = null; // validateRiderPayload answers with a clean 400
    }
    const { status, body } = await saveRiderState({ db: serviceClient(), user }, payload);
    return Response.json(body, { status });
  } catch {
    return Response.json(
      { ok: false, error: 'Could not save your rider state.' },
      { status: 500 }
    );
  }
}
