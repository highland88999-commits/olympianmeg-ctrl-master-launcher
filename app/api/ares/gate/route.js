import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ARES_OWNER_EMAIL, isOwnerEmail } from '@/lib/ares/server';

// Keeper-style gate for the ARES console.
//
// The browser posts its Supabase access token here; this route validates the
// token server-side against the Supabase Auth API and only passes when the
// session belongs to the console owner (same email as the Babel Keeper
// seal). The ARES page renders nothing until this gate answers 200, and
// every dashboard data route enforces the same owner check independently —
// so this gate is the UX lock and the route checks are the universal lock.
//
// Nothing credential-like is ever logged or stored here.

export async function POST(req) {
  try {
    let body = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const accessToken =
      body && typeof body.access_token === 'string' ? body.access_token : null;
    if (!accessToken) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      // Uniformity (Phase 1 audit): an unconfigured backend answers
      // exactly like a bad token — 401, same body. A 503 here would
      // tell a prober the service state; nobody outside needs to know.
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // getUser(token) asks the Supabase Auth server to validate the JWT —
    // a forged, expired, or otherwise invalid token fails here. The email
    // comparison happens on the server, never in the browser.
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.getUser(accessToken);
    if (error || !data || !data.user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // Uniformity (Phase 1 audit): a valid token that is not the owner's
    // answers 403, exactly as every other dashboard data route does.
    // The distinction is standard HTTP semantics, pinned by
    // tests/ares-lock.test.mjs, and it reveals nothing about the owner
    // account — a non-owner already knows they are not the owner. The
    // one leak fixed here is the 503 below: an unconfigured backend
    // used to announce its own state to any prober.
    if (!isOwnerEmail(data.user)) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }

    return NextResponse.json({ ok: true, owner: ARES_OWNER_EMAIL });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
