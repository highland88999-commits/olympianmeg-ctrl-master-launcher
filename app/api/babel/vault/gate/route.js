import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Keeper gate for Miles' vault (Babel module).
//
// The browser posts its Supabase access token here; this route validates the
// token server-side against the Supabase Auth API and only passes when the
// session belongs to the vault owner. The vault page renders nothing until
// this gate answers 200. The data itself is sealed independently by RLS
// (supabase/babel-vault-seal.sql), so this gate is the UX lock and RLS is
// the universal lock — both keyed to the same owner email.
//
// Nothing credential-like is ever logged or stored here.

const OWNER_EMAIL = 'olympiannexus@gmail.com';

export async function POST(req) {
  try {
    let body = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const accessToken =
      body && typeof body.access_token === 'string' ? body.access_token : '';
    if (!accessToken) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return NextResponse.json({ ok: false }, { status: 503 });
    }

    // getUser(token) asks the Supabase Auth server to validate the JWT —
    // a forged, expired, or otherwise invalid token fails here. The email
    // comparison happens on the server, never in the browser.
    const sb = createClient(url, key);
    const { data, error } = await sb.auth.getUser(accessToken);
    if (error || !data || !data.user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const email = String(data.user.email || '').toLowerCase();
    if (email !== OWNER_EMAIL) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
