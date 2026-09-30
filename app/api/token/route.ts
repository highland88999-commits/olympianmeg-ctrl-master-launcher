export const dynamic = 'force-dynamic';

import twilio from 'twilio';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { apiGuard } from '@/lib/api-guard';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const e = new Error('Supabase is not configured.');
    (e as any).status = 503;
    throw e;
  }
  return createClient(url, key);
}

export const GET = apiGuard(async function GET(request: Request) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const appSid = process.env.TWILIO_TWIML_APP_SID;

  if (!accountSid || !apiKey || !apiSecret || !appSid) {
    return NextResponse.json({ error: 'Calling is not set up yet.' }, { status: 503 });
  }

  // A calling token is calling power, so it is never anonymous: one token
  // per signed-in user, minted under their own identity.
  const header = request.headers.get('authorization') || '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7) : null;
  if (!bearer) return NextResponse.json({ error: 'Sign in to call.' }, { status: 401 });
  const { data, error } = await serviceClient().auth.getUser(bearer);
  const user = !error ? data?.user : null;
  if (!user) return NextResponse.json({ error: 'Sign in to call.' }, { status: 401 });

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const grant = new VoiceGrant({
    outgoingApplicationSid: appSid,
    incomingAllow: false,
  });

  const token = new AccessToken(accountSid, apiKey, apiSecret, { identity: user.id });
  token.addGrant(grant);

  return NextResponse.json({ token: token.toJwt() });
});
